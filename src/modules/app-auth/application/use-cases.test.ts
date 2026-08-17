import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAppAuthUseCases } from "./use-cases.js";

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

describe("app-auth use-cases", () => {
  it("verifies the correct username/password pair", () => {
    const useCases = createAppAuthUseCases({ username: "operator", passwordHash: hashPassword("correct horse") });

    expect(useCases.verifyCredentials("operator", "correct horse")).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const useCases = createAppAuthUseCases({ username: "operator", passwordHash: hashPassword("correct horse") });

    expect(useCases.verifyCredentials("operator", "wrong")).toBe(false);
  });

  it("rejects an incorrect username", () => {
    const useCases = createAppAuthUseCases({ username: "operator", passwordHash: hashPassword("correct horse") });

    expect(useCases.verifyCredentials("someone-else", "correct horse")).toBe(false);
  });

  it("throws when the configured hash isn't in scrypt$salt$hash form", () => {
    expect(() => createAppAuthUseCases({ username: "operator", passwordHash: "not-a-valid-hash" })).toThrow();
  });
});
