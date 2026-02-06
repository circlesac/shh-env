import { describe, test, expect } from "bun:test";
import { spawnWithEnv } from "../src/lib/spawn";

describe("spawnWithEnv", () => {
  test("runs a command and returns exit code 0", async () => {
    const exitCode = await spawnWithEnv("true", [], {});
    expect(exitCode).toBe(0);
  });

  test("returns non-zero exit code on failure", async () => {
    const exitCode = await spawnWithEnv("false", [], {});
    expect(exitCode).toBe(1);
  });

  test("injects environment variables into child process", async () => {
    const exitCode = await spawnWithEnv(
      "sh",
      ["-c", 'test "$MY_TEST_VAR" = "hello123"'],
      { MY_TEST_VAR: "hello123" }
    );
    expect(exitCode).toBe(0);
  });

  test("extra env overrides existing env vars", async () => {
    // HOME is always set; override it and check
    const exitCode = await spawnWithEnv(
      "sh",
      ["-c", 'test "$HOME" = "/tmp/override"'],
      { HOME: "/tmp/override" }
    );
    expect(exitCode).toBe(0);
  });

  test("passes arguments to child command", async () => {
    const exitCode = await spawnWithEnv(
      "sh",
      ["-c", 'echo "$1 $2"', "--", "foo", "bar"],
      {}
    );
    expect(exitCode).toBe(0);
  });

  test("throws for non-existent command", async () => {
    expect(
      spawnWithEnv("nonexistent-command-xyz", [], {})
    ).rejects.toThrow();
  });
});
