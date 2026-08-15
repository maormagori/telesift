import type { MediaAssetRepository } from "../../ingestion/ports/media-asset-repository.js";
import type { MessageRepository } from "../../ingestion/ports/message-repository.js";
import { buildContextGroup } from "../domain/build-context-group.js";
import { computeContextInputFingerprint } from "../domain/context-fingerprint.js";
import type { ContextGroupWithMembers } from "../ports/context-group-repository.js";
import type { ContextGroupRepository } from "../ports/context-group-repository.js";

export interface BuildOrRefreshContextGroupDeps {
  mediaAssetRepo: MediaAssetRepository;
  messageRepo: MessageRepository;
  contextGroupRepo: ContextGroupRepository;
  precedingWindowSize: number;
  quietPeriodMs: number;
}

export interface BuildOrRefreshContextGroupResult {
  contextGroup: ContextGroupWithMembers;
  ready: boolean;
}

export class MediaAssetNotFoundError extends Error {
  constructor(public readonly mediaAssetId: number) {
    super(`Media asset not found: ${mediaAssetId}`);
    this.name = "MediaAssetNotFoundError";
  }
}

export function createBuildOrRefreshContextGroup(deps: BuildOrRefreshContextGroupDeps) {
  return async function buildOrRefreshContextGroup(
    mediaAssetId: number,
    now: number,
  ): Promise<BuildOrRefreshContextGroupResult> {
    const mediaAsset = await deps.mediaAssetRepo.findById(mediaAssetId);
    if (!mediaAsset) throw new MediaAssetNotFoundError(mediaAssetId);

    const targetMessage = await deps.messageRepo.findById(mediaAsset.messageId);
    if (!targetMessage) throw new MediaAssetNotFoundError(mediaAssetId);

    const [replyTarget, mediaGroupSiblings, precedingMessages] = await Promise.all([
      targetMessage.replyToMessageId
        ? deps.messageRepo.findByChatAndTelegramId(targetMessage.chatId, targetMessage.replyToMessageId)
        : Promise.resolve(null),
      targetMessage.mediaGroupId
        ? deps.messageRepo.listByMediaGroup(targetMessage.chatId, targetMessage.mediaGroupId)
        : Promise.resolve([]),
      deps.messageRepo.listPrecedingMessages(targetMessage.chatId, targetMessage.telegramMessageId, deps.precedingWindowSize),
    ]);

    const newestSiblingCreatedAt = mediaGroupSiblings.reduce((max, message) => Math.max(max, message.createdAt), targetMessage.createdAt);
    const mediaGroupStillOpen = now - newestSiblingCreatedAt < deps.quietPeriodMs;

    const built = buildContextGroup({
      target: targetMessage,
      replyTarget,
      mediaGroupSiblings,
      precedingMessages,
      mediaGroupStillOpen,
    });

    const messageFingerprints = new Map<number, string>();
    for (const message of [targetMessage, replyTarget, ...mediaGroupSiblings, ...precedingMessages]) {
      if (message) messageFingerprints.set(message.id, message.fingerprint);
    }
    const inputFingerprint = computeContextInputFingerprint(built.members, messageFingerprints);

    const contextGroup = await deps.contextGroupRepo.upsert({
      mediaAssetId,
      status: built.stillOpen ? "open" : "closed",
      inputFingerprint,
      quietPeriodDeadline: built.stillOpen ? newestSiblingCreatedAt + deps.quietPeriodMs : null,
      members: built.members,
      now,
    });

    return { contextGroup, ready: !built.stillOpen };
  };
}
