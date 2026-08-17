import type { TelegramAccessPort } from "../../telegram-access/ports/telegram-access-port.js";
import type { Channel, ChannelIdentifier } from "../domain/channel.js";
import type { TelegramChat } from "../domain/telegram-chat.js";
import type { TelegramChatRepository } from "../ports/telegram-chat-repository.js";

function matchesIdentifier(id: string, username: string | null, identifier: ChannelIdentifier): boolean {
  return identifier.type === "telegram_id" ? id === identifier.value : username === identifier.value;
}

export interface ChannelResolverDeps {
  telegramAccess: TelegramAccessPort;
  telegramChatRepo: TelegramChatRepository;
}

export interface ChannelResolver {
  /** Local-only lookup: is a Telegram chat already known for this configured channel? No remote calls. */
  resolveExisting(channel: Channel): Promise<TelegramChat | null>;
  /** Resolves and persists the channel's Telegram chat, discovering it via telegram-service when not already known locally. */
  resolveOrDiscover(channel: Channel, now: number): Promise<TelegramChat | null>;
}

export function createChannelResolver(deps: ChannelResolverDeps): ChannelResolver {
  const { telegramAccess, telegramChatRepo } = deps;

  async function resolveExisting(channel: Channel): Promise<TelegramChat | null> {
    if (channel.identifier.type === "telegram_id") {
      return telegramChatRepo.findByTelegramId(channel.identifier.value);
    }
    const chats = await telegramChatRepo.list();
    return chats.find((entry) => matchesIdentifier(entry.telegramId, entry.username, channel.identifier)) ?? null;
  }

  async function resolveOrDiscover(channel: Channel, now: number): Promise<TelegramChat | null> {
    const existing = await resolveExisting(channel);
    if (existing) return existing;

    const remoteChats = await telegramAccess.listChats();
    const match = remoteChats.find((chat) => matchesIdentifier(chat.id, chat.username, channel.identifier));
    if (!match) return null;

    return telegramChatRepo.upsert({
      telegramId: match.id,
      title: match.title,
      type: match.type,
      username: match.username,
      now,
    });
  }

  return { resolveExisting, resolveOrDiscover };
}
