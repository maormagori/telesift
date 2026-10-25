import type { ChatSummary } from "../../telegram-access/ports/models.js";
import type { TelegramAccessPort } from "../../telegram-access/ports/telegram-access-port.js";
import type { BackfillPolicy, Channel, ChannelIdentifier } from "../domain/channel.js";
import { matchesChannelIdentifier } from "../domain/channel-identifier.js";
import { isIngestibleChatType, type TelegramChat } from "../domain/telegram-chat.js";
import type { ChannelRepository } from "../ports/channel-repository.js";
import type { ChatSyncState } from "../domain/chat-sync-state.js";
import type { ChatSyncStateRepository } from "../ports/chat-sync-state-repository.js";
import type { ChannelResolver } from "./channel-resolution.js";

export interface IngestionUseCases {
  addChannel(identifier: ChannelIdentifier, backfillPolicy: BackfillPolicy): Promise<Channel>;
  enableChannel(identifier: ChannelIdentifier): Promise<Channel>;
  disableChannel(identifier: ChannelIdentifier): Promise<Channel>;
  listChannels(): Promise<Channel[]>;
}

export function createIngestionUseCases(repo: ChannelRepository): IngestionUseCases {
  return {
    addChannel: (identifier, backfillPolicy) => repo.add(identifier, backfillPolicy),
    enableChannel: (identifier) => repo.setEnabled(identifier, true),
    disableChannel: (identifier) => repo.setEnabled(identifier, false),
    listChannels: () => repo.list(),
  };
}

export type ChannelResolutionResult =
  | { status: "resolved"; chat: TelegramChat }
  | { status: "unresolved" };

export interface ChannelWithStatus {
  channel: Channel;
  chat: TelegramChat | null;
  syncState: ChatSyncState | null;
}

export interface VisibleChat {
  chat: ChatSummary;
  /** The configured channel already pointing at this chat, if any. */
  channel: Channel | null;
}

export interface ChannelStatusUseCases {
  /** Persists the channel, then attempts a one-time synchronous resolution against telegram-service. Never fails the add on an unresolved lookup — ingestion-worker keeps retrying regardless. */
  addChannelResolved(
    identifier: ChannelIdentifier,
    backfillPolicy: BackfillPolicy,
    now: number,
  ): Promise<{ channel: Channel; resolution: ChannelResolutionResult }>;
  /** Combines every configured channel with its locally-known resolved chat (if any) and sync progress/errors. Local-only lookups, no remote calls. */
  listChannelsWithStatus(): Promise<ChannelWithStatus[]>;
  /** Channels and groups currently visible to the Telegram account, each marked with the configured channel already tracking it. */
  listVisibleChats(): Promise<VisibleChat[]>;
}

export interface ChannelStatusDeps {
  channelRepo: ChannelRepository;
  chatSyncStateRepo: ChatSyncStateRepository;
  resolver: ChannelResolver;
  telegramAccess: TelegramAccessPort;
}

export function createChannelStatusUseCases(deps: ChannelStatusDeps): ChannelStatusUseCases {
  const { channelRepo, chatSyncStateRepo, resolver, telegramAccess } = deps;

  return {
    async addChannelResolved(identifier, backfillPolicy, now) {
      const channel = await channelRepo.add(identifier, backfillPolicy);
      const chat = await resolver.resolveOrDiscover(channel, now);
      return { channel, resolution: chat ? { status: "resolved", chat } : { status: "unresolved" } };
    },

    async listChannelsWithStatus() {
      const channels = await channelRepo.list();
      return Promise.all(
        channels.map(async (channel) => {
          const chat = await resolver.resolveExisting(channel);
          const syncState = chat ? await chatSyncStateRepo.get(chat.telegramId) : null;
          return { channel, chat, syncState };
        }),
      );
    },

    async listVisibleChats() {
      const [chats, channels] = await Promise.all([telegramAccess.listChats(), channelRepo.list()]);
      return chats
        .filter((chat) => isIngestibleChatType(chat.type))
        .map((chat) => ({
          chat,
          channel: channels.find((channel) => matchesChannelIdentifier(chat.id, chat.username, channel.identifier)) ?? null,
        }));
    },
  };
}
