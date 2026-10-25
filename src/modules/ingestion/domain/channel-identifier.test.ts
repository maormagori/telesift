import { describe, expect, it } from "vitest";
import { matchesChannelIdentifier, parseChannelIdentifier } from "./channel-identifier.js";

describe("parseChannelIdentifier", () => {
  it("parses a positive numeric string as a telegram_id", () => {
    expect(parseChannelIdentifier("123456789")).toEqual({ type: "telegram_id", value: "123456789" });
  });

  it("parses a negative numeric string (Telegram channel id) as a telegram_id", () => {
    expect(parseChannelIdentifier("-1001234567890")).toEqual({
      type: "telegram_id",
      value: "-1001234567890",
    });
  });

  it("parses a bare username as a username", () => {
    expect(parseChannelIdentifier("somechannel")).toEqual({ type: "username", value: "somechannel" });
  });

  it("strips a leading @ from a username", () => {
    expect(parseChannelIdentifier("@somechannel")).toEqual({ type: "username", value: "somechannel" });
  });
});

describe("matchesChannelIdentifier", () => {
  it("matches a telegram_id identifier against the chat id only", () => {
    expect(matchesChannelIdentifier("123", "somechannel", { type: "telegram_id", value: "123" })).toBe(true);
    expect(matchesChannelIdentifier("456", "123", { type: "telegram_id", value: "123" })).toBe(false);
  });

  it("matches a username identifier against the chat username only", () => {
    expect(matchesChannelIdentifier("123", "somechannel", { type: "username", value: "somechannel" })).toBe(true);
    expect(matchesChannelIdentifier("somechannel", null, { type: "username", value: "somechannel" })).toBe(false);
  });
});
