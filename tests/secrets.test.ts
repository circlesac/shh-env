import { describe, test, expect, beforeEach, spyOn, mock } from "bun:test";
import {
  validateService,
  validateEnv,
  validateKey,
  buildServiceName,
  parseServiceName,
  setSecret,
  getSecret,
  deleteSecret,
  getSecretsForService,
} from "../src/lib/secrets";

// --- Validation ---

describe("validateService", () => {
  test("accepts valid service names", () => {
    expect(() => validateService("my-app")).not.toThrow();
    expect(() => validateService("my_app")).not.toThrow();
    expect(() => validateService("my.app")).not.toThrow();
    expect(() => validateService("MyApp123")).not.toThrow();
    expect(() => validateService("a")).not.toThrow();
  });

  test("accepts _ (default service)", () => {
    expect(() => validateService("_")).not.toThrow();
  });

  test("rejects service names with colons", () => {
    expect(() => validateService("my:app")).toThrow("Invalid service name");
  });

  test("rejects service names with spaces", () => {
    expect(() => validateService("my app")).toThrow("Invalid service name");
  });

  test("rejects empty string", () => {
    expect(() => validateService("")).toThrow("Invalid service name");
  });

  test("rejects service names with special characters", () => {
    expect(() => validateService("my@app")).toThrow("Invalid service name");
    expect(() => validateService("my/app")).toThrow("Invalid service name");
    expect(() => validateService("my+app")).toThrow("Invalid service name");
  });
});

describe("validateEnv", () => {
  test("accepts valid env names", () => {
    expect(() => validateEnv("dev")).not.toThrow();
    expect(() => validateEnv("production")).not.toThrow();
    expect(() => validateEnv("staging-1")).not.toThrow();
    expect(() => validateEnv("test_env")).not.toThrow();
    expect(() => validateEnv("Dev123")).not.toThrow();
  });

  test("rejects env names with colons", () => {
    expect(() => validateEnv("dev:1")).toThrow("Invalid env name");
  });

  test("rejects env names with dots", () => {
    expect(() => validateEnv("dev.1")).toThrow("Invalid env name");
  });

  test("rejects env names with spaces", () => {
    expect(() => validateEnv("dev 1")).toThrow("Invalid env name");
  });

  test("rejects empty string", () => {
    expect(() => validateEnv("")).toThrow("Invalid env name");
  });
});

describe("validateKey", () => {
  test("accepts valid key names", () => {
    expect(() => validateKey("API_KEY")).not.toThrow();
    expect(() => validateKey("DATABASE_URL")).not.toThrow();
    expect(() => validateKey("A")).not.toThrow();
    expect(() => validateKey("X1")).not.toThrow();
    expect(() => validateKey("MY_VAR_123")).not.toThrow();
  });

  test("rejects lowercase keys", () => {
    expect(() => validateKey("api_key")).toThrow("Invalid key name");
    expect(() => validateKey("Api_Key")).toThrow("Invalid key name");
  });

  test("rejects keys starting with a number", () => {
    expect(() => validateKey("1KEY")).toThrow("Invalid key name");
  });

  test("rejects keys starting with underscore", () => {
    expect(() => validateKey("_KEY")).toThrow("Invalid key name");
  });

  test("rejects keys with special characters", () => {
    expect(() => validateKey("API-KEY")).toThrow("Invalid key name");
    expect(() => validateKey("API.KEY")).toThrow("Invalid key name");
    expect(() => validateKey("API KEY")).toThrow("Invalid key name");
  });

  test("rejects empty string", () => {
    expect(() => validateKey("")).toThrow("Invalid key name");
  });
});

// --- buildServiceName ---

describe("buildServiceName", () => {
  test("returns _ when no service or env", () => {
    expect(buildServiceName()).toBe("_");
    expect(buildServiceName(undefined, undefined)).toBe("_");
  });

  test("returns service name when only service provided", () => {
    expect(buildServiceName("my-app")).toBe("my-app");
  });

  test("returns service::env when both provided", () => {
    expect(buildServiceName("my-app", "dev")).toBe("my-app::dev");
    expect(buildServiceName("my-app", "production")).toBe(
      "my-app::production"
    );
  });

  test("throws when env provided without service", () => {
    expect(() => buildServiceName(undefined, "dev")).toThrow(
      "--env requires --service"
    );
  });

  test("validates service name", () => {
    expect(() => buildServiceName("invalid service")).toThrow(
      "Invalid service name"
    );
  });

  test("validates env name", () => {
    expect(() => buildServiceName("my-app", "bad:env")).toThrow(
      "Invalid env name"
    );
  });
});

// --- parseServiceName ---

describe("parseServiceName", () => {
  test("parses simple service name", () => {
    expect(parseServiceName("my-app")).toEqual({ service: "my-app" });
  });

  test("parses default service", () => {
    expect(parseServiceName("_")).toEqual({ service: "_" });
  });

  test("parses service::env format", () => {
    expect(parseServiceName("my-app::dev")).toEqual({
      service: "my-app",
      env: "dev",
    });
  });

  test("parses service::env with complex names", () => {
    expect(parseServiceName("my-app.v2::staging-1")).toEqual({
      service: "my-app.v2",
      env: "staging-1",
    });
  });

  test("handles triple colon gracefully", () => {
    // "a::b::c" splits into ["a", "b", "c"] which has length 3, not 2
    const result = parseServiceName("a::b::c");
    expect(result).toEqual({ service: "a::b::c" });
  });
});

// --- Bun.secrets wrappers ---

describe("setSecret", () => {
  let setSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setSpy = spyOn(Bun.secrets, "set").mockResolvedValue(undefined);
  });

  test("calls Bun.secrets.set with default service", async () => {
    await setSecret("API_KEY", "secret123");
    expect(setSpy).toHaveBeenCalledWith({
      service: "_",
      name: "API_KEY",
      value: "secret123",
    });
  });

  test("calls Bun.secrets.set with custom service", async () => {
    await setSecret("API_KEY", "secret123", "my-app");
    expect(setSpy).toHaveBeenCalledWith({
      service: "my-app",
      name: "API_KEY",
      value: "secret123",
    });
  });

  test("calls Bun.secrets.set with service::env", async () => {
    await setSecret("DB_URL", "postgres://...", "my-app", "dev");
    expect(setSpy).toHaveBeenCalledWith({
      service: "my-app::dev",
      name: "DB_URL",
      value: "postgres://...",
    });
  });

  test("throws on invalid key", async () => {
    expect(setSecret("bad_key", "val")).rejects.toThrow("Invalid key name");
  });

  test("throws on invalid service", async () => {
    expect(setSecret("KEY", "val", "bad service")).rejects.toThrow(
      "Invalid service name"
    );
  });
});

describe("getSecret", () => {
  let getSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getSpy = spyOn(Bun.secrets, "get").mockResolvedValue("the-secret");
  });

  test("calls Bun.secrets.get with default service", async () => {
    const val = await getSecret("API_KEY");
    expect(getSpy).toHaveBeenCalledWith({ service: "_", name: "API_KEY" });
    expect(val).toBe("the-secret");
  });

  test("calls Bun.secrets.get with custom service", async () => {
    await getSecret("API_KEY", "my-app");
    expect(getSpy).toHaveBeenCalledWith({
      service: "my-app",
      name: "API_KEY",
    });
  });

  test("returns null when secret not found", async () => {
    getSpy.mockResolvedValue(null);
    const val = await getSecret("MISSING");
    expect(val).toBeNull();
  });
});

describe("deleteSecret", () => {
  let deleteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    deleteSpy = spyOn(Bun.secrets, "delete").mockResolvedValue(true);
  });

  test("calls Bun.secrets.delete with default service", async () => {
    await deleteSecret("API_KEY");
    expect(deleteSpy).toHaveBeenCalledWith({
      service: "_",
      name: "API_KEY",
    });
  });

  test("calls Bun.secrets.delete with service::env", async () => {
    await deleteSecret("DB_URL", "my-app", "dev");
    expect(deleteSpy).toHaveBeenCalledWith({
      service: "my-app::dev",
      name: "DB_URL",
    });
  });
});

describe("getSecretsForService", () => {
  let getSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getSpy = spyOn(Bun.secrets, "get");
  });

  test("returns all secrets for a service", async () => {
    getSpy
      .mockResolvedValueOnce("val1")
      .mockResolvedValueOnce("val2");

    const result = await getSecretsForService("my-app", ["KEY1", "KEY2"]);
    expect(result).toEqual({ KEY1: "val1", KEY2: "val2" });
  });

  test("skips null values", async () => {
    getSpy
      .mockResolvedValueOnce("val1")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("val3");

    const result = await getSecretsForService("_", [
      "KEY1",
      "KEY2",
      "KEY3",
    ]);
    expect(result).toEqual({ KEY1: "val1", KEY3: "val3" });
  });

  test("returns empty object for empty keys", async () => {
    getSpy.mockClear();
    const result = await getSecretsForService("_", []);
    expect(result).toEqual({});
    expect(getSpy).not.toHaveBeenCalled();
  });
});
