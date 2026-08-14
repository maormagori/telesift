import type { ContextGroupMember } from "./context-group.js";

export interface ContextTargetMessage {
  id: number;
  mediaGroupId: string | null;
}

export interface ContextRelatedMessage {
  id: number;
}

export interface BuildContextGroupInput {
  target: ContextTargetMessage;
  replyTarget: ContextRelatedMessage | null;
  mediaGroupSiblings: ContextRelatedMessage[];
  precedingMessages: ContextRelatedMessage[];
  /** Whether the target's media group might still receive more siblings soon (time-based, decided by the caller). */
  mediaGroupStillOpen: boolean;
}

export interface BuildContextGroupResult {
  members: ContextGroupMember[];
  stillOpen: boolean;
}

/**
 * Candidate context, per AGENTS.md: reply target + media-group siblings + a fixed window of
 * preceding messages. Only an open media group defers readiness; a self-contained video with no
 * reply/media-group link is ready immediately, and preceding messages never gate readiness.
 */
export function buildContextGroup(input: BuildContextGroupInput): BuildContextGroupResult {
  const members: ContextGroupMember[] = [{ messageId: input.target.id, role: "target", relativeOrder: 0 }];

  if (input.replyTarget) {
    members.push({ messageId: input.replyTarget.id, role: "reply", relativeOrder: -1 });
  }

  input.mediaGroupSiblings
    .filter((sibling) => sibling.id !== input.target.id)
    .forEach((sibling, index) => {
      members.push({ messageId: sibling.id, role: "album_sibling", relativeOrder: -(2 + index) });
    });

  input.precedingMessages.forEach((message, index) => {
    members.push({ messageId: message.id, role: "preceding", relativeOrder: -(100 + index) });
  });

  return {
    members,
    stillOpen: input.target.mediaGroupId !== null && input.mediaGroupStillOpen,
  };
}
