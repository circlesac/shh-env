/**
 * get command: Retrieve a secret from the keychain
 *
 * Usage: shh-env get <KEY> [--service <name>] [--env <env>]
 */

import { defineCommand } from "citty";
import { getSecret } from "../lib/secrets";

export default defineCommand({
  meta: {
    name: "get",
    description: "Retrieve a secret from the keychain",
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
      const value = await getSecret(key, service, env);

      if (value === null) {
        const target = env ? `${service}::${env}` : service || "_";
        console.error(`Error: ${key} not found in ${target}`);
        process.exit(1);
      }

      // Output value directly (for use in scripts)
      console.log(value);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      process.exit(1);
    }
  },
});
