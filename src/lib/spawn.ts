/**
 * Process spawning with signal forwarding
 *
 * Based on env-cmd pattern for running child processes with injected env vars
 */

import type { Subprocess } from "bun";

/**
 * Spawn a command with merged environment variables
 */
export async function spawnWithEnv(
  command: string,
  args: string[],
  extraEnv: Record<string, string>
): Promise<number> {
  const proc = Bun.spawn([command, ...args], {
    env: { ...process.env, ...extraEnv },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  // Forward signals to child process
  setupSignalForwarding(proc);

  // Wait for child to exit and return its exit code
  const exitCode = await proc.exited;
  return exitCode;
}

/**
 * Set up signal forwarding from parent to child
 */
function setupSignalForwarding(proc: Subprocess): void {
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

  for (const sig of signals) {
    process.on(sig, () => {
      proc.kill(sig);
    });
  }
}
