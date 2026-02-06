/**
 * delete command: Remove a secret from the keychain
 *
 * Usage: shh-env delete <KEY> [--service <name>] [--env <env>]
 */

import { defineCommand } from "citty";
import { deleteSecret } from "../lib/secrets";

export default defineCommand({
  meta: {
    name: "delete",
    description: "Remove a secret from the keychain",
  },
  args: {
    key: {
      type: "positional",
      description: "Environment variable name (e.g., API_KEY)",
      required: true,
    },
    service: {
      type: "string",
      description: "Service namespace",
    },
    env: {
      type: "string",
      description: "Environment layer (requires --service)",
    },
  },
  async run({ args }) {
    const { key, service, env } = args;

    try {
      await deleteSecret(key, service, env);
      const target = env ? `${service}::${env}` : service || "_";
      console.log(`✓ Deleted ${key} from ${target}`);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      process.exit(1);
    }
  },
});
