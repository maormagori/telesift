import { describe, expect, it } from "vitest";
import type { TelegramAccessPort } from "../../modules/telegram-access/ports/telegram-access-port.js";
import type { Clock } from "../time/clock.js";
import { waitForTelegramConnection } from "./wait-for-telegram-connection.js";

function fakeClock(startAt: number): Clock & { advance(ms: number): void } {
  let current = startAt;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}

function fakeTelegramAccess(getStatus: TelegramAccessPort["getStatus"]): Pick<TelegramAccessPort, "getStatus"> {
  return { getStatus };
}

describe("waitForTelegramConnection", () => {
  it("returns true immediately when already connected", async () => {
    const telegramAccess = fakeTelegramAccess(async () => ({ connected: true, account: null }));

    expect(await waitForTelegramConnection(telegramAccess, { clock: fakeClock(0) })).toBe(true);
  });

  it("retries until connected, then returns true", async () => {
    let calls = 0;
    const telegramAccess = fakeTelegramAccess(async () => {
      calls += 1;
      return { connected: calls >= 3, account: null };
    });
    const clock = fakeClock(0);

    const result = await waitForTelegramConnection(telegramAccess, {
      clock,
      sleep: async (ms) => clock.advance(ms),
      pollIntervalMs: 1000,
      timeoutMs: 30_000,
    });

    expect(result).toBe(true);
    expect(calls).toBe(3);
  });

  it("treats a request failure as not-yet-connected and keeps retrying", async () => {
    let calls = 0;
    const telegramAccess = fakeTelegramAccess(async () => {
      calls += 1;
      if (calls === 1) throw new Error("connection refused");
      return { connected: true, account: null };
    });
    const clock = fakeClock(0);

    const result = await waitForTelegramConnection(telegramAccess, {
      clock,
      sleep: async (ms) => clock.advance(ms),
      pollIntervalMs: 1000,
      timeoutMs: 30_000,
    });

    expect(result).toBe(true);
    expect(calls).toBe(2);
  });

  it("returns false once the timeout elapses without connecting", async () => {
    const telegramAccess = fakeTelegramAccess(async () => ({ connected: false, account: null }));
    const clock = fakeClock(0);

    const result = await waitForTelegramConnection(telegramAccess, {
      clock,
      sleep: async (ms) => clock.advance(ms),
      pollIntervalMs: 1000,
      timeoutMs: 5000,
    });

    expect(result).toBe(false);
  });
});
