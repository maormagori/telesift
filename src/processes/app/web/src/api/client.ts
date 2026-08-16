export type ChannelIdentifier = { type: "telegram_id"; value: string } | { type: "username"; value: string };

export interface Channel {
  id: number;
  identifier: ChannelIdentifier;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TelegramChat {
  telegramId: string;
  title: string;
  type: "channel" | "group" | "user";
  username: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatSyncState {
  chatId: string;
  newestSeenMessageId: number | null;
  oldestBackfilledMessageId: number | null;
  backfillCompletedAt: number | null;
  lastRescannedAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChannelWithStatus {
  channel: Channel;
  chat: TelegramChat | null;
  syncState: ChatSyncState | null;
}

export type ChannelResolutionResult = { status: "resolved"; chat: TelegramChat } | { status: "unresolved" };

export interface AddChannelResponse {
  channel: Channel;
  resolution: ChannelResolutionResult;
}

export interface ConnectionStatus {
  connected: boolean;
  account: { id: string; username: string | null; firstName: string | null } | null;
}

export interface TelegramMessage {
  id: number;
  chatId: string;
  telegramMessageId: number;
  text: string | null;
  replyToMessageId: number | null;
  mediaGroupId: string | null;
  sourceDate: number;
  sourceEditedAt: number | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MediaAsset {
  id: number;
  messageId: number;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  availability: "available" | "unknown" | "unavailable";
  lastVerifiedAt: number | null;
  unavailableAt: number | null;
}

export interface MessageWithMedia {
  message: TelegramMessage;
  media: MediaAsset | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, typeof body.error === "string" ? body.error : res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ username: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  getSession: async (): Promise<{ username: string } | null> => {
    try {
      return await request<{ username: string }>("/auth/session");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  getTelegramStatus: () => request<ConnectionStatus>("/telegram/status"),

  listChannels: () => request<ChannelWithStatus[]>("/channels"),

  addChannel: (identifier: string) =>
    request<AddChannelResponse>("/channels", { method: "POST", body: JSON.stringify({ identifier }) }),

  enableChannel: (identifier: ChannelIdentifier) =>
    request<Channel>("/channels/enable", { method: "POST", body: JSON.stringify({ identifier }) }),

  disableChannel: (identifier: ChannelIdentifier) =>
    request<Channel>("/channels/disable", { method: "POST", body: JSON.stringify({ identifier }) }),

  listMessages: (chatId: string, options: { before?: number; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.before !== undefined) params.set("before", String(options.before));
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    const query = params.toString();
    return request<MessageWithMedia[]>(`/chats/${encodeURIComponent(chatId)}/messages${query ? `?${query}` : ""}`);
  },

  mediaUrl: (chatId: string, messageId: number) =>
    `/api/chats/${encodeURIComponent(chatId)}/messages/${messageId}/media`,
};
