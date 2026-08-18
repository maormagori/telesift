import { describe, expect, it } from "vitest";
import { loadAppConfig } from "./app-env.js";

function baseEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    APP_ADMIN_USERNAME: "admin",
    APP_ADMIN_PASSWORD_HASH: "scrypt$salt$hash",
    APP_SESSION_SECRET: "secret",
    ...overrides,
  };
}

describe("loadAppConfig", () => {
  it("treats a genuinely unset TORZNAB_API_KEY as null (unauthenticated Torznab)", () => {
    expect(loadAppConfig(baseEnv()).torznabApiKey).toBeNull();
  });

  it("treats a blank TORZNAB_API_KEY= as null too — the natural way to leave a var unset in a .env file", () => {
    expect(loadAppConfig(baseEnv({ TORZNAB_API_KEY: "" })).torznabApiKey).toBeNull();
  });

  it("keeps a non-blank TORZNAB_API_KEY", () => {
    expect(loadAppConfig(baseEnv({ TORZNAB_API_KEY: "secret-key" })).torznabApiKey).toBe("secret-key");
  });

  it("defaults TORZNAB_SERIES_MATCH_THRESHOLD to 0.85", () => {
    expect(loadAppConfig(baseEnv()).torznabSeriesMatchThreshold).toBe(0.85);
  });
});
