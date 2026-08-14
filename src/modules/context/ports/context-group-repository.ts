import type { ContextGroup, ContextGroupMember, ContextGroupStatus } from "../domain/context-group.js";

export interface UpsertContextGroupInput {
  mediaAssetId: number;
  status: ContextGroupStatus;
  inputFingerprint: string;
  quietPeriodDeadline: number | null;
  members: ContextGroupMember[];
  now: number;
}

export interface ContextGroupWithMembers {
  group: ContextGroup;
  members: ContextGroupMember[];
}

export interface ContextGroupRepository {
  /** Creates or replaces the context group and its member rows for the media asset (one group per asset in v1). */
  upsert(input: UpsertContextGroupInput): Promise<ContextGroupWithMembers>;
  getByMediaAssetId(mediaAssetId: number): Promise<ContextGroupWithMembers | null>;
}
