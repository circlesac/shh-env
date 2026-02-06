import { describe, test, expect } from "bun:test";
import {
  groupByService,
  filterShhEnvEntries,
  type SecretEntry,
} from "../src/lib/enumerate";

// --- groupByService ---

describe("groupByService", () => {
  test("groups entries by service", () => {
    const entries: SecretEntry[] = [
      { service: "_", key: "A" },
      { service: "_", key: "B" },
      { service: "my-app", key: "C" },
    ];

    const groups = groupByService(entries);

    expect(groups.get("_")).toEqual(["A", "B"]);
    expect(groups.get("my-app")).toEqual(["C"]);
  });

  test("sorts keys alphabetically within each service", () => {
    const entries: SecretEntry[] = [
      { service: "_", key: "ZEBRA" },
      { service: "_", key: "ALPHA" },
      { service: "_", key: "MIDDLE" },
    ];

    const groups = groupByService(entries);

    expect(groups.get("_")).toEqual(["ALPHA", "MIDDLE", "ZEBRA"]);
  });

  test("returns empty map for empty input", () => {
    const groups = groupByService([]);
    expect(groups.size).toBe(0);
  });

  test("handles service::env entries", () => {
    const entries: SecretEntry[] = [
      { service: "my-app", key: "API_KEY" },
      { service: "my-app::dev", key: "DEBUG" },
      { service: "my-app::dev", key: "DB_URL" },
    ];

    const groups = groupByService(entries);

    expect(groups.get("my-app")).toEqual(["API_KEY"]);
    expect(groups.get("my-app::dev")).toEqual(["DB_URL", "DEBUG"]);
  });

  test("single entry per service", () => {
    const entries: SecretEntry[] = [
      { service: "a", key: "X" },
      { service: "b", key: "Y" },
      { service: "c", key: "Z" },
    ];

    const groups = groupByService(entries);

    expect(groups.size).toBe(3);
    expect(groups.get("a")).toEqual(["X"]);
    expect(groups.get("b")).toEqual(["Y"]);
    expect(groups.get("c")).toEqual(["Z"]);
  });
});

// --- filterShhEnvEntries ---

describe("filterShhEnvEntries", () => {
  test("keeps entries with valid service and key patterns", () => {
    const entries: SecretEntry[] = [
      { service: "_", key: "API_KEY" },
      { service: "my-app", key: "DATABASE_URL" },
      { service: "my-app::dev", key: "DEBUG" },
    ];

    const filtered = filterShhEnvEntries(entries);
    expect(filtered).toEqual(entries);
  });

  test("filters out entries with spaces in service name", () => {
    const entries: SecretEntry[] = [
      { service: "_", key: "API_KEY" },
      { service: "AirPort", key: "WIFI_NAME" },
      { service: "Soduto Host", key: "SOME_KEY" },
    ];

    const filtered = filterShhEnvEntries(entries);
    expect(filtered).toEqual([
      { service: "_", key: "API_KEY" },
      { service: "AirPort", key: "WIFI_NAME" },
    ]);
  });

  test("filters out entries with lowercase keys", () => {
    const entries: SecretEntry[] = [
      { service: "_", key: "VALID_KEY" },
      { service: "_", key: "invalid_key" },
      { service: "_", key: "MixedCase" },
    ];

    const filtered = filterShhEnvEntries(entries);
    expect(filtered).toEqual([{ service: "_", key: "VALID_KEY" }]);
  });

  test("filters out keys starting with numbers", () => {
    const entries: SecretEntry[] = [
      { service: "_", key: "GOOD" },
      { service: "_", key: "1BAD" },
    ];

    const filtered = filterShhEnvEntries(entries);
    expect(filtered).toEqual([{ service: "_", key: "GOOD" }]);
  });

  test("filters out entries with special chars in service", () => {
    const entries: SecretEntry[] = [
      { service: "valid-svc", key: "KEY" },
      { service: "bad svc", key: "KEY" },
      { service: "bad/svc", key: "KEY" },
      { service: "bad@svc", key: "KEY" },
    ];

    const filtered = filterShhEnvEntries(entries);
    expect(filtered).toEqual([{ service: "valid-svc", key: "KEY" }]);
  });

  test("accepts service names with dots and dashes", () => {
    const entries: SecretEntry[] = [
      { service: "my.app", key: "KEY" },
      { service: "my-app", key: "KEY" },
      { service: "my_app", key: "KEY" },
      { service: "app.v2.3", key: "KEY" },
    ];

    const filtered = filterShhEnvEntries(entries);
    expect(filtered).toEqual(entries);
  });

  test("accepts service::env format", () => {
    const entries: SecretEntry[] = [
      { service: "my-app::dev", key: "KEY" },
      { service: "my-app::staging-1", key: "KEY" },
      { service: "app::prod_v2", key: "KEY" },
    ];

    const filtered = filterShhEnvEntries(entries);
    expect(filtered).toEqual(entries);
  });

  test("rejects malformed service::env patterns", () => {
    const entries: SecretEntry[] = [
      { service: "::dev", key: "KEY" },
      { service: "app::", key: "KEY" },
      { service: "app::dev::extra", key: "KEY" },
    ];

    const filtered = filterShhEnvEntries(entries);
    expect(filtered).toEqual([]);
  });

  test("returns empty array for empty input", () => {
    expect(filterShhEnvEntries([])).toEqual([]);
  });

  test("filters out keys with dashes or dots", () => {
    const entries: SecretEntry[] = [
      { service: "_", key: "API-KEY" },
      { service: "_", key: "API.KEY" },
      { service: "_", key: "API_KEY" },
    ];

    const filtered = filterShhEnvEntries(entries);
    expect(filtered).toEqual([{ service: "_", key: "API_KEY" }]);
  });
});
