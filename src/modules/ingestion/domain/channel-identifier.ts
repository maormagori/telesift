import type { ChannelIdentifier } from "./channel.js";

const TELEGRAM_ID_RE = /^-?\d+$/;

export function parseChannelIdentifier(raw: string): ChannelIdentifier {
  if (TELEGRAM_ID_RE.test(raw)) return { type: "telegram_id", value: raw };
  return { type: "username", value: raw.startsWith("@") ? raw.slice(1) : raw };
}

/** Whether a Telegram chat with this id/username is the one a configured channel identifier points at. */
export function matchesChannelIdentifier(id: string, username: string | null, identifier: ChannelIdentifier): boolean {
  return identifier.type === "telegram_id" ? id === identifier.value : username === identifier.value;
}
