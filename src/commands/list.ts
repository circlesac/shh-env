/**
 * list command: List secrets in tree format
 *
 * Usage: shh-env list [--service <name>] [--env <env>]
 */

import { defineCommand } from "citty";
import {
  enumerateSecrets,
  filterShhEnvEntries,
  groupByService,
} from "../lib/enumerate";

// ANSI codes for strikethrough
const STRIKETHROUGH_START = "\x1b[9m";
const STRIKETHROUGH_END = "\x1b[0m";

export default defineCommand({
  meta: {
    name: "list",
    description: "List secrets in tree format",
  },
  args: {
    service: {
      type: "string",
      description: "Service namespace (shows merged view)",
    },
    env: {
      type: "string",
      description: "Environment layer (requires --service)",
    },
  },
  async run({ args }) {
    const { service, env } = args;

    try {
      // Get all secrets from keychain
      const allEntries = await enumerateSecrets();
      const entries = filterShhEnvEntries(allEntries);
      const groups = groupByService(entries);

      if (groups.size === 0) {
        console.log("No secrets found");
        return;
      }

      if (!service) {
        // Show all services/envs without merging
        printAllServices(groups);
      } else if (env) {
        // Show merged view: _ + service + service::env
        printMergedView(groups, service, env);
      } else {
        // Show merged view: _ + service
        printMergedView(groups, service);
      }
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      process.exit(1);
    }
  },
});

/**
 * Print all services and their keys in tree format
 */
function printAllServices(groups: Map<string, string[]>): void {
  // Sort services: _ first, then alphabetically
  const sortedServices = Array.from(groups.keys()).sort((a, b) => {
    if (a === "_") return -1;
    if (b === "_") return 1;
    return a.localeCompare(b);
  });

  for (let i = 0; i < sortedServices.length; i++) {
    const svc = sortedServices[i];
    if (!svc) continue;
    const keys = groups.get(svc) || [];

    if (i > 0) console.log(); // Blank line between services

    console.log(svc);
    printTree(keys);
  }
}

/**
 * Print merged view showing which keys are overridden
 */
function printMergedView(
  groups: Map<string, string[]>,
  service: string,
  env?: string
): void {
  // Determine which layers to show
  const layers: string[] = ["_", service];
  if (env) {
    layers.push(`${service}::${env}`);
  }

  // Collect all keys that will be in the final merged result
  // Keys from later layers override earlier ones
  const overriddenKeys = new Set<string>();

  // Build a map of which layer has the "winning" key
  const winningLayer = new Map<string, string>();

  for (const layer of layers) {
    const keys = groups.get(layer) || [];
    for (const key of keys) {
      winningLayer.set(key, layer);
    }
  }

  // Find which keys in each layer are overridden
  for (let i = 0; i < layers.length - 1; i++) {
    const layer = layers[i];
    if (!layer) continue;
    const keys = groups.get(layer) || [];

    for (const key of keys) {
      if (winningLayer.get(key) !== layer) {
        overriddenKeys.add(`${layer}:${key}`);
      }
    }
  }

  // Print each layer
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!layer) continue;
    const keys = groups.get(layer) || [];

    if (i > 0) console.log(); // Blank line between layers

    // Only print if the layer exists
    if (keys.length === 0 && layer !== "_") continue;

    console.log(layer);

    if (keys.length === 0) {
      continue;
    }

    // Print tree with strikethrough for overridden keys
    printTreeWithOverrides(keys, layer, overriddenKeys);
  }
}

/**
 * Print keys in tree format
 */
function printTree(keys: string[]): void {
  for (let i = 0; i < keys.length; i++) {
    const isLast = i === keys.length - 1;
    const prefix = isLast ? "└── " : "├── ";
    console.log(`${prefix}${keys[i]}`);
  }
}

/**
 * Print keys in tree format with strikethrough for overridden keys
 */
function printTreeWithOverrides(
  keys: string[],
  layer: string,
  overriddenKeys: Set<string>
): void {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const isLast = i === keys.length - 1;
    const prefix = isLast ? "└── " : "├── ";

    if (overriddenKeys.has(`${layer}:${key}`)) {
      // Apply strikethrough
      console.log(`${prefix}${STRIKETHROUGH_START}${key}${STRIKETHROUGH_END}`);
    } else {
      console.log(`${prefix}${key}`);
    }
  }
}
