import { describe, expect, it } from "vitest";
import type { ContextGroupMember } from "./context-group.js";
import { computeContextInputFingerprint } from "./context-fingerprint.js";

const MEMBERS: ContextGroupMember[] = [
  { messageId: 10, role: "target", relativeOrder: 0 },
  { messageId: 9, role: "preceding", relativeOrder: -100 },
];

describe("computeContextInputFingerprint", () => {
  it("is deterministic for the same members and fingerprints", () => {
    const fingerprints = new Map([
      [10, "fp-10"],
      [9, "fp-9"],
    ]);
    expect(computeContextInputFingerprint(MEMBERS, fingerprints)).toBe(computeContextInputFingerprint(MEMBERS, fingerprints));
  });

  it("is independent of member array order", () => {
    const fingerprints = new Map([
      [10, "fp-10"],
      [9, "fp-9"],
    ]);
    expect(computeContextInputFingerprint(MEMBERS, fingerprints)).toBe(
      computeContextInputFingerprint([...MEMBERS].reverse(), fingerprints),
    );
  });

  it("changes when a member's content fingerprint changes", () => {
    const before = computeContextInputFingerprint(
      MEMBERS,
      new Map([
        [10, "fp-10"],
        [9, "fp-9"],
      ]),
    );
    const after = computeContextInputFingerprint(
      MEMBERS,
      new Map([
        [10, "fp-10-edited"],
        [9, "fp-9"],
      ]),
    );
    expect(before).not.toBe(after);
  });

  it("changes when membership changes", () => {
    const fingerprints = new Map([
      [10, "fp-10"],
      [9, "fp-9"],
      [8, "fp-8"],
    ]);
    const before = computeContextInputFingerprint(MEMBERS, fingerprints);
    const after = computeContextInputFingerprint([...MEMBERS, { messageId: 8, role: "preceding", relativeOrder: -101 }], fingerprints);
    expect(before).not.toBe(after);
  });
});
