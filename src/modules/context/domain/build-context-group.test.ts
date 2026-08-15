import { describe, expect, it } from "vitest";
import { buildContextGroup } from "./build-context-group.js";

describe("buildContextGroup", () => {
  it("includes only the target when there is no reply/media-group/preceding context", () => {
    const result = buildContextGroup({
      target: { id: 10, mediaGroupId: null },
      replyTarget: null,
      mediaGroupSiblings: [],
      precedingMessages: [],
      mediaGroupStillOpen: false,
    });

    expect(result.members).toEqual([{ messageId: 10, role: "target", relativeOrder: 0 }]);
    expect(result.stillOpen).toBe(false);
  });

  it("includes the reply target with the reply role", () => {
    const result = buildContextGroup({
      target: { id: 10, mediaGroupId: null },
      replyTarget: { id: 9 },
      mediaGroupSiblings: [],
      precedingMessages: [],
      mediaGroupStillOpen: false,
    });

    expect(result.members).toContainEqual({ messageId: 9, role: "reply", relativeOrder: -1 });
  });

  it("includes media-group siblings excluding the target itself", () => {
    const result = buildContextGroup({
      target: { id: 10, mediaGroupId: "album-1" },
      replyTarget: null,
      mediaGroupSiblings: [{ id: 10 }, { id: 11 }, { id: 12 }],
      precedingMessages: [],
      mediaGroupStillOpen: false,
    });

    const siblingIds = result.members.filter((m) => m.role === "album_sibling").map((m) => m.messageId);
    expect(siblingIds.sort()).toEqual([11, 12]);
  });

  it("includes preceding messages with the preceding role", () => {
    const result = buildContextGroup({
      target: { id: 10, mediaGroupId: null },
      replyTarget: null,
      mediaGroupSiblings: [],
      precedingMessages: [{ id: 8 }, { id: 9 }],
      mediaGroupStillOpen: false,
    });

    const precedingIds = result.members.filter((m) => m.role === "preceding").map((m) => m.messageId);
    expect(precedingIds).toEqual([8, 9]);
  });

  it("is still open only when the target belongs to a media group that might receive more siblings soon", () => {
    const openResult = buildContextGroup({
      target: { id: 10, mediaGroupId: "album-1" },
      replyTarget: null,
      mediaGroupSiblings: [],
      precedingMessages: [],
      mediaGroupStillOpen: true,
    });
    expect(openResult.stillOpen).toBe(true);

    const closedResult = buildContextGroup({
      target: { id: 10, mediaGroupId: "album-1" },
      replyTarget: null,
      mediaGroupSiblings: [],
      precedingMessages: [],
      mediaGroupStillOpen: false,
    });
    expect(closedResult.stillOpen).toBe(false);
  });

  it("is never open when the target has no media group, regardless of the caller's flag", () => {
    const result = buildContextGroup({
      target: { id: 10, mediaGroupId: null },
      replyTarget: null,
      mediaGroupSiblings: [],
      precedingMessages: [],
      mediaGroupStillOpen: true,
    });
    expect(result.stillOpen).toBe(false);
  });
});
