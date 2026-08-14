export type ContextGroupStatus = "open" | "closed";

export type ContextGroupMessageRole = "target" | "preceding" | "reply" | "album_sibling";

export interface ContextGroup {
  id: number;
  mediaAssetId: number;
  status: ContextGroupStatus;
  inputFingerprint: string;
  quietPeriodDeadline: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ContextGroupMember {
  messageId: number;
  role: ContextGroupMessageRole;
  relativeOrder: number;
}

export interface ContextGroupMessage extends ContextGroupMember {
  id: number;
  contextGroupId: number;
  createdAt: number;
}
