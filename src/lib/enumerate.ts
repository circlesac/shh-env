/**
 * Native keychain enumeration
 *
 * Since Bun.secrets doesn't have a list API, we use platform-specific commands
 * to enumerate stored secrets.
 */

import { $ } from "bun";

export interface SecretEntry {
  service: string;
  key: string;
}

/**
 * Enumerate all secrets from the keychain (platform-specific)
 */
export async function enumerateSecrets(): Promise<SecretEntry[]> {
  const platform = process.platform;

  switch (platform) {
    case "darwin":
      return enumerateMacOS();
    case "linux":
      return enumerateLinux();
    case "win32":
      return enumerateWindows();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * macOS: Parse keychain using security command
 */
async function enumerateMacOS(): Promise<SecretEntry[]> {
  const entries: SecretEntry[] = [];

  try {
    // Use security dump-keychain to get all generic passwords
    const result =
      await $`security dump-keychain 2>/dev/null || true`.text();

    // Parse the output for generic password entries (genp class)
    // Format looks like:
    // keychain: "/Users/xxx/Library/Keychains/login.keychain-db"
    // class: "genp"
    //     ...
    //     "svce"<blob>="service_name"
    //     "acct"<blob>="account_name"

    let currentClass = "";
    let currentService = "";
    let currentAccount = "";

    for (const line of result.split("\n")) {
      const trimmed = line.trim();

      if (trimmed.startsWith('class:')) {
        // Save previous entry if valid
        if (currentClass === '"genp"' && currentService && currentAccount) {
          entries.push({
            service: currentService,
            key: currentAccount,
          });
        }
        currentClass = trimmed.split(":")[1]?.trim() || "";
        currentService = "";
        currentAccount = "";
      } else if (trimmed.startsWith('"svce"')) {
        // Extract service name
        const match = trimmed.match(/"svce"<blob>="([^"]+)"/);
        if (match && match[1]) {
          currentService = match[1];
        }
      } else if (trimmed.startsWith('"acct"')) {
        // Extract account name (this is our key)
        const match = trimmed.match(/"acct"<blob>="([^"]+)"/);
        if (match && match[1]) {
          currentAccount = match[1];
        }
      }
    }

    // Don't forget the last entry
    if (currentClass === '"genp"' && currentService && currentAccount) {
      entries.push({
        service: currentService,
        key: currentAccount,
      });
    }
  } catch {
    // If security command fails, return empty list
  }

  return entries;
}

/**
 * Linux: Parse secrets using secret-tool
 */
async function enumerateLinux(): Promise<SecretEntry[]> {
  const entries: SecretEntry[] = [];

  try {
    // Search for all Bun secrets using the schema
    const result =
      await $`secret-tool search --all xdg:schema com.oven-sh.bun.Secret 2>/dev/null || true`.text();

    // Parse the output
    // Format looks like:
    // [/org/freedesktop/secrets/collection/login/xxx]
    // label = xxx
    // secret = xxx
    // attribute.service = service_name
    // attribute.account = account_name

    let currentService = "";
    let currentAccount = "";

    for (const line of result.split("\n")) {
      const trimmed = line.trim();

      if (trimmed.startsWith("[")) {
        // Save previous entry if valid
        if (currentService && currentAccount) {
          entries.push({
            service: currentService,
            key: currentAccount,
          });
        }
        currentService = "";
        currentAccount = "";
      } else if (trimmed.startsWith("attribute.service = ")) {
        currentService = trimmed.replace("attribute.service = ", "");
      } else if (trimmed.startsWith("attribute.account = ")) {
        currentAccount = trimmed.replace("attribute.account = ", "");
      }
    }

    // Don't forget the last entry
    if (currentService && currentAccount) {
      entries.push({
        service: currentService,
        key: currentAccount,
      });
    }
  } catch {
    // If secret-tool fails, return empty list
  }

  return entries;
}

/**
 * Windows: Parse credentials using cmdkey
 */
async function enumerateWindows(): Promise<SecretEntry[]> {
  const entries: SecretEntry[] = [];

  try {
    const result = await $`cmdkey /list 2>nul`.text();

    // Parse the output
    // Format looks like:
    // Target: LegacyGeneric:target=service/account
    // Type: Generic
    // User: username

    for (const line of result.split("\n")) {
      const trimmed = line.trim();

      if (trimmed.startsWith("Target:")) {
        // Extract service and account from target
        // Bun might use a format like: service/account or similar
        const match = trimmed.match(
          /Target:\s*(?:LegacyGeneric:target=)?([^/]+)\/(.+)/i
        );
        if (match && match[1] && match[2]) {
          entries.push({
            service: match[1],
            key: match[2],
          });
        }
      }
    }
  } catch {
    // If cmdkey fails, return empty list
  }

  return entries;
}

/**
 * Group secrets by service
 */
export function groupByService(
  entries: SecretEntry[]
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const entry of entries) {
    const existing = groups.get(entry.service) || [];
    existing.push(entry.key);
    groups.set(entry.service, existing);
  }

  // Sort keys within each service
  for (const [service, keys] of groups) {
    groups.set(service, keys.sort());
  }

  return groups;
}

/**
 * Get list of services that match our shh-env patterns
 * (filters out unrelated keychain entries)
 */
export function filterShhEnvEntries(
  entries: SecretEntry[]
): SecretEntry[] {
  // Filter to only include entries that look like shh-env entries
  // Service must match: _ or alphanumeric with dots, dashes, underscores (possibly with ::env)
  // Key must match: uppercase letter followed by uppercase letters, digits, underscores
  const servicePattern = /^(_|[a-zA-Z0-9._-]+(::[a-zA-Z0-9_-]+)?)$/;
  const keyPattern = /^[A-Z][A-Z0-9_]*$/;

  return entries.filter(
    (entry) =>
      servicePattern.test(entry.service) && keyPattern.test(entry.key)
  );
}
