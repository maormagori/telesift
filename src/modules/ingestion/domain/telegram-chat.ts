export type TelegramChatType = "channel" | "group" | "user";

/** Ingestion targets channels and groups; private chats with users are never offered as sources. */
export function isIngestibleChatType(type: TelegramChatType): boolean {
  return type === "channel" || type === "group";
}

export interface TelegramChat {
  telegramId: string;
  title: string;
  type: TelegramChatType;
  username: string | null;
  createdAt: number;
  updatedAt: number;
}
