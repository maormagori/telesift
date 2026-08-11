import type { ChatSummary, MediaDescriptor, MessageSummary } from "../../modules/telegram-access/ports/models.js";

export interface TeleprotoDialogLike {
  id?: { toString(): string };
  title?: string;
  name?: string;
  isChannel: boolean;
  isGroup: boolean;
  isUser: boolean;
  // Not every dialog entity type carries a username (basic groups don't),
  // so this stays unknown and is narrowed by hasUsername() below.
  entity?: unknown;
}

function hasUsername(entity: unknown): entity is { username?: string | null } {
  return typeof entity === "object" && entity !== null && "username" in entity;
}

export interface TeleprotoDocumentAttributeLike {
  className: string;
  fileName?: string;
  duration?: number;
  w?: number;
  h?: number;
}

export interface TeleprotoDocumentLike {
  mimeType?: string;
  size?: { toString(): string } | number;
  attributes?: TeleprotoDocumentAttributeLike[];
}

export interface TeleprotoMessageLike {
  id: number;
  date: number;
  text?: string;
  replyTo?: { replyToMsgId?: number } | null;
  groupedId?: { toString(): string } | null;
  document?: TeleprotoDocumentLike | null;
}

export function mapDialogToChatSummary(dialog: TeleprotoDialogLike): ChatSummary {
  return {
    id: dialog.id?.toString() ?? "",
    title: dialog.title ?? dialog.name ?? "",
    type: dialog.isChannel ? "channel" : dialog.isGroup ? "group" : "user",
    username: (hasUsername(dialog.entity) ? dialog.entity.username : null) ?? null,
  };
}

export function mapDocumentToMediaDescriptor(document: TeleprotoDocumentLike | null | undefined): MediaDescriptor | null {
  if (!document) return null;

  const attributes = document.attributes ?? [];
  const filenameAttr = attributes.find(
    (attribute): attribute is TeleprotoDocumentAttributeLike & { fileName: string } =>
      attribute.className === "DocumentAttributeFilename" && typeof attribute.fileName === "string",
  );
  const videoAttr = attributes.find((attribute) => attribute.className === "DocumentAttributeVideo");

  return {
    fileName: filenameAttr?.fileName ?? null,
    mimeType: document.mimeType ?? null,
    sizeBytes: document.size !== undefined ? Number(document.size.toString()) : null,
    durationSeconds: videoAttr?.duration ?? null,
    width: videoAttr?.w ?? null,
    height: videoAttr?.h ?? null,
  };
}

export function mapMessageToSummary(chatId: string, message: TeleprotoMessageLike): MessageSummary {
  return {
    chatId,
    messageId: message.id,
    date: message.date,
    text: message.text && message.text.length > 0 ? message.text : null,
    replyToMessageId: message.replyTo?.replyToMsgId ?? null,
    mediaGroupId: message.groupedId?.toString() ?? null,
    media: mapDocumentToMediaDescriptor(message.document),
  };
}
