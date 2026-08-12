import type { ChannelIdentifier } from "./channel.js";

const TELEGRAM_ID_RE = /^-?\d+$/;

export function parseChannelIdentifier(raw: string): ChannelIdentifier {
  if (TELEGRAM_ID_RE.test(raw)) return { type: "telegram_id", value: raw };
  return { type: "username", value: raw.startsWith("@") ? raw.slice(1) : raw };
}
