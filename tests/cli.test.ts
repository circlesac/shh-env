import { describe, test, expect, beforeAll, afterAll } from "bun:test";

const TEST_SERVICE = "shh-env-test";
const TEST_ENV = "testenv";

/**
 * Run the CLI and return { stdout, stderr, exitCode }
 */
async function cli(
  ...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", "src/index.ts", ...args], {
    cwd: import.meta.dir + "/..",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

/**
 * Integration tests that exercise the CLI end-to-end.
 * These interact with the real OS keychain.
 */
describe.skipIf(!!process.env.CI)("CLI integration", () => {
  async function cleanup() {
    await cli("delete", "TEST_A", "--service", TEST_SERVICE).catch(() => {});
    await cli("delete", "TEST_B", "--service", TEST_SERVICE).catch(() => {});
    await cli(
      "delete",
      "TEST_A",
      "--service",
      TEST_SERVICE,
      "--env",
      TEST_ENV
    ).catch(() => {});
    await cli("delete", "SHH_CLI_TEST").catch(() => {});
  }

  beforeAll(cleanup);
  afterAll(cleanup);

  // --- Help ---

  test("--help shows usage", async () => {
    const { stdout } = await cli("--help");
    expect(stdout).toContain("shh-env");
    expect(stdout).toContain("set");
    expect(stdout).toContain("get");
    expect(stdout).toContain("delete");
    expect(stdout).toContain("list");
    expect(stdout).toContain("run");
  });

  test("set --help shows usage", async () => {
    const { stdout } = await cli("set", "--help");
    expect(stdout).toContain("KEY");
    expect(stdout).toContain("--service");
    expect(stdout).toContain("--value");
  });

  // --- Set / Get / Delete ---

  test("set and get a secret in default service", async () => {
    const setResult = await cli("set", "SHH_CLI_TEST", "--value", "test-value-123");
    expect(setResult.exitCode).toBe(0);

    const getResult = await cli("get", "SHH_CLI_TEST");
    expect(getResult.stdout.trim()).toBe("test-value-123");

    // Clean up
    await cli("delete", "SHH_CLI_TEST");
  });

  test("set and get a secret in a custom service", async () => {
    await cli("set", "TEST_A", "--service", TEST_SERVICE, "--value", "svc-val");

    const { stdout } = await cli("get", "TEST_A", "--service", TEST_SERVICE);
    expect(stdout.trim()).toBe("svc-val");
  });

  test("set and get a secret in service::env", async () => {
    await cli(
      "set",
      "TEST_A",
      "--service",
      TEST_SERVICE,
      "--env",
      TEST_ENV,
      "--value",
      "env-val"
    );

    const { stdout } = await cli(
      "get",
      "TEST_A",
      "--service",
      TEST_SERVICE,
      "--env",
      TEST_ENV
    );
    expect(stdout.trim()).toBe("env-val");
  });

  test("get returns error for missing secret", async () => {
    const { stderr, exitCode } = await cli(
      "get",
      "NONEXISTENT_KEY_XYZ",
      "--service",
      TEST_SERVICE
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("not found");
  });

  test("delete removes a secret", async () => {
    await cli("set", "TEST_B", "--service", TEST_SERVICE, "--value", "temp");

    // Verify it exists
    const before = await cli("get", "TEST_B", "--service", TEST_SERVICE);
    expect(before.stdout.trim()).toBe("temp");

    // Delete
    const delResult = await cli(
      "delete",
      "TEST_B",
      "--service",
      TEST_SERVICE
    );
    expect(delResult.stdout).toContain("Deleted");

    // Verify gone
    const after = await cli("get", "TEST_B", "--service", TEST_SERVICE);
    expect(after.exitCode).not.toBe(0);
    expect(after.stderr).toContain("not found");
  });

  // --- Validation ---

  test("rejects invalid key name", async () => {
    const { stderr, exitCode } = await cli(
      "set",
      "invalid_key",
      "--value",
      "x"
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Invalid key name");
  });

  test("rejects --env without --service", async () => {
    const { stderr, exitCode } = await cli(
      "set",
      "KEY",
      "--env",
      "dev",
      "--value",
      "x"
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("--env requires --service");
  });

  // --- Run command ---

  test("run injects secrets into child process", async () => {
    await cli(
      "set",
      "TEST_A",
      "--service",
      TEST_SERVICE,
      "--value",
      "injected"
    );

    const { stdout } = await cli(
      "run",
      "--service",
      TEST_SERVICE,
      "--",
      "printenv",
      "TEST_A"
    );
    expect(stdout.trim()).toBe("injected");
  });

  test("run merges layers correctly", async () => {
    // TEST_A is set in service (value "injected" from above)
    // TEST_A is also set in service::env (value "env-val" from earlier)
    // The env layer should win

    const { stdout } = await cli(
      "run",
      "--service",
      TEST_SERVICE,
      "--env",
      TEST_ENV,
      "--",
      "printenv",
      "TEST_A"
    );
    expect(stdout.trim()).toBe("env-val");
  });

  test("run returns child exit code", async () => {
    const { exitCode } = await cli("run", "--", "false");
    expect(exitCode).not.toBe(0);
  });

  // --- List command ---

  test("list shows secrets in tree format", async () => {
    const { stdout } = await cli("list", "--service", TEST_SERVICE);
    expect(stdout).toContain(TEST_SERVICE);
    expect(stdout).toContain("TEST_A");
  });
});
