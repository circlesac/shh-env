/**
 * set command: Store a secret in the keychain
 *
 * Usage: shh-env set <KEY> [--service <name>] [--env <env>]
 */

import { defineCommand } from "citty";
import { setSecret } from "../lib/secrets";

export default defineCommand({
  meta: {
    name: "set",
    description: "Store a secret in the keychain",
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
    value: {
      type: "string",
      description: "Secret value (if not provided, will prompt)",
    },
  },
  async run({ args }) {
    const { key, service, env, value } = args;

    let secretValue = value;

    if (!secretValue) {
      // Prompt for value securely
      process.stdout.write(`Enter value for ${key}: `);
      secretValue = await readSecretFromStdin();
    }

    if (!secretValue) {
      console.error("Error: No value provided");
      process.exit(1);
    }

    try {
      await setSecret(key, secretValue, service, env);
      const target = env ? `${service}::${env}` : service || "_";
      console.log(`✓ Set ${key} in ${target}`);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      process.exit(1);
    }
  },
});

/**
 * Read a line from stdin (for secret input)
 */
async function readSecretFromStdin(): Promise<string> {
  // Use Bun's built-in stdin reading
  const reader = Bun.stdin.stream().getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Check for newline
    const newlineIndex = value.indexOf(10); // \n
    if (newlineIndex !== -1) {
      chunks.push(value.slice(0, newlineIndex));
      break;
    }
    chunks.push(value);
  }

  reader.releaseLock();

  const combined = new Uint8Array(
    chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(combined).trim();
}
