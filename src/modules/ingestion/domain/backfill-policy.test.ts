import { describe, expect, it } from "vitest";
import { backfillStartCursor, resolveBackfillLimit } from "./backfill-policy.js";

describe("resolveBackfillLimit", () => {
  it("returns 0 when backfill is disabled, whatever the limits", () => {
    expect(resolveBackfillLimit({ enabled: false, maxMessages: 50 }, 100)).toBe(0);
    expect(resolveBackfillLimit({ enabled: false, maxMessages: null }, null)).toBe(0);
  });

  it("prefers the channel's own limit over the default", () => {
    expect(resolveBackfillLimit({ enabled: true, maxMessages: 50 }, 100)).toBe(50);
  });

  it("falls back to the default when the channel has no limit", () => {
    expect(resolveBackfillLimit({ enabled: true, maxMessages: null }, 100)).toBe(100);
  });

  it("returns null (all history) when neither the channel nor the default sets a limit", () => {
    expect(resolveBackfillLimit({ enabled: true, maxMessages: null }, null)).toBeNull();
  });
});

describe("backfillStartCursor", () => {
  it("starts just below the newest `limit` messages", () => {
    expect(backfillStartCursor(500, 100)).toBe(400);
  });

  it("starts at the newest message when the limit is 0, so only new messages are ingested", () => {
    expect(backfillStartCursor(500, 0)).toBe(500);
  });

  it("starts from the beginning when the limit exceeds the chat's history", () => {
    expect(backfillStartCursor(30, 100)).toBe(0);
  });
});
