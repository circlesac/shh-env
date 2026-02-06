/**
 * Bun.secrets wrapper for keychain operations
 */

const DEFAULT_SERVICE = "_";

// Validation patterns from PLAN.md
const SERVICE_PATTERN = /^[a-zA-Z0-9._-]+$/;
const ENV_PATTERN = /^[a-zA-Z0-9_-]+$/;
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function validateService(service: string): void {
  if (service !== DEFAULT_SERVICE && !SERVICE_PATTERN.test(service)) {
    throw new Error(
      `Invalid service name: "${service}". Allowed: a-z, A-Z, 0-9, -, _, . (no colons)`
    );
  }
}

export function validateEnv(env: string): void {
  if (!ENV_PATTERN.test(env)) {
    throw new Error(
      `Invalid env name: "${env}". Allowed: a-z, A-Z, 0-9, -, _`
    );
  }
}

export function validateKey(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new Error(
      `Invalid key name: "${key}". Must start with uppercase letter, allowed: A-Z, 0-9, _`
    );
  }
}

/**
 * Build the keychain service name from service and env options
 */
export function buildServiceName(
  service?: string,
  env?: string
): string {
  const svc = service || DEFAULT_SERVICE;

  if (env) {
    if (!service) {
      throw new Error("--env requires --service to be specified");
    }
    validateService(service);
    validateEnv(env);
    return `${service}::${env}`;
  }

  validateService(svc);
  return svc;
}

/**
 * Parse a stored service name back to service and env
 */
export function parseServiceName(
  serviceName: string
): { service: string; env?: string } {
  const parts = serviceName.split("::");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { service: parts[0], env: parts[1] };
  }
  return { service: serviceName };
}

/**
 * Set a secret in the keychain
 */
export async function setSecret(
  key: string,
  value: string,
  service?: string,
  env?: string
): Promise<void> {
  validateKey(key);
  const serviceName = buildServiceName(service, env);

  await Bun.secrets.set({
    service: serviceName,
    name: key,
    value,
  });
}

/**
 * Get a secret from the keychain
 */
export async function getSecret(
  key: string,
  service?: string,
  env?: string
): Promise<string | null> {
  validateKey(key);
  const serviceName = buildServiceName(service, env);

  return await Bun.secrets.get({
    service: serviceName,
    name: key,
  });
}

/**
 * Delete a secret from the keychain
 */
export async function deleteSecret(
  key: string,
  service?: string,
  env?: string
): Promise<void> {
  validateKey(key);
  const serviceName = buildServiceName(service, env);

  await Bun.secrets.delete({
    service: serviceName,
    name: key,
  });
}

/**
 * Get all secrets for a service as a key-value map
 */
export async function getSecretsForService(
  serviceName: string,
  keys: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const key of keys) {
    const value = await Bun.secrets.get({
      service: serviceName,
      name: key,
    });
    if (value !== null) {
      result[key] = value;
    }
  }

  return result;
}
