/**
 * run command: Spawn a command with secrets injected as environment variables
 *
 * This is the default command when no subcommand is specified.
 *
 * Usage: shh-env [options] [--] <command> [args...]
 *        shh-env run [options] [--] <command> [args...]
 */

import { defineCommand } from "citty";
import {
  enumerateSecrets,
  filterShhEnvEntries,
  groupByService,
} from "../lib/enumerate";
import { getSecretsForService } from "../lib/secrets";
import { spawnWithEnv } from "../lib/spawn";

export default defineCommand({
  meta: {
    name: "run",
    description: "Run a command with secrets as environment variables",
  },
  args: {
    service: {
      type: "string",
      description: "Service namespace",
    },
    env: {
      type: "string",
      description: "Environment layer (requires --service)",
    },
    _: {
      type: "positional",
      description: "Command and arguments to run",
      required: true,
    },
  },
  async run({ args, rawArgs }) {
    const { service, env } = args;

    // Find command and args after -- or after options
    let commandAndArgs: string[] = [];

    if (rawArgs && rawArgs.length > 0) {
      const dashDashIndex = rawArgs.indexOf("--");
      if (dashDashIndex !== -1) {
        // Everything after -- is the command
        commandAndArgs = rawArgs.slice(dashDashIndex + 1);
      } else {
        // Find first non-option argument
        let i = 0;
        while (i < rawArgs.length) {
          const arg = rawArgs[i];
          if (!arg) {
            i++;
            continue;
          }
          if (arg === "--service" || arg === "--env") {
            i += 2;
          } else if (arg.startsWith("--service=") || arg.startsWith("--env=")) {
            i++;
          } else if (arg.startsWith("-")) {
            i++;
          } else {
            commandAndArgs = rawArgs.slice(i);
            break;
          }
        }
      }
    }

    if (commandAndArgs.length === 0) {
      console.error("Error: No command specified");
      console.error("Usage: shh-env run [--service <name>] [--env <env>] -- <command> [args...]");
      process.exit(1);
    }

    const [command, ...restArgs] = commandAndArgs;

    if (!command) {
      console.error("Error: No command specified");
      process.exit(1);
    }

    try {
      // Get secrets according to layer order
      const mergedSecrets = await getMergedSecrets(service, env);

      // Spawn the command with merged secrets
      const exitCode = await spawnWithEnv(command, restArgs, mergedSecrets);
      process.exit(exitCode);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      process.exit(1);
    }
  },
});

/**
 * Get merged secrets according to layer order:
 * _ → service → service::env
 */
async function getMergedSecrets(
  service?: string,
  env?: string
): Promise<Record<string, string>> {
  // Get all secrets from keychain
  const allEntries = await enumerateSecrets();
  const entries = filterShhEnvEntries(allEntries);
  const groups = groupByService(entries);

  // Determine layers to merge
  const layers: string[] = ["_"];
  if (service) {
    layers.push(service);
    if (env) {
      layers.push(`${service}::${env}`);
    }
  }

  // Merge secrets from each layer (later layers override earlier)
  const merged: Record<string, string> = {};

  for (const layer of layers) {
    const keys = groups.get(layer) || [];
    if (keys.length > 0) {
      const secrets = await getSecretsForService(layer, keys);
      Object.assign(merged, secrets);
    }
  }

  return merged;
}
