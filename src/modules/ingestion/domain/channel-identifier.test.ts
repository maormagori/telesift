import { describe, expect, it } from "vitest";
import { parseChannelIdentifier } from "./channel-identifier.js";

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
