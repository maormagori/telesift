import { describe, expect, it } from "vitest";
import { mapDialogToChatSummary, mapDocumentToMediaDescriptor, mapMessageToSummary } from "./mappers.js";

describe("mapDialogToChatSummary", () => {
  it("maps a channel dialog", () => {
    const result = mapDialogToChatSummary({
      id: { toString: () => "channel-123" },
      title: "ערוץ הבדיקות",
      isChannel: true,
      isGroup: false,
      isUser: false,
      entity: { username: "test_channel_he" },
    });

    expect(result).toEqual({
      id: "channel-123",
      title: "ערוץ הבדיקות",
      type: "channel",
      username: "test_channel_he",
    });
  });

  it("maps a group dialog without a username, falling back to name", () => {
    const result = mapDialogToChatSummary({
      id: { toString: () => "group-9" },
      name: "TV Releases Discussion",
      isChannel: false,
      isGroup: true,
      isUser: false,
      entity: null,
    });

    expect(result).toEqual({
      id: "group-9",
      title: "TV Releases Discussion",
      type: "group",
      username: null,
    });
  });

  it("maps a user (DM) dialog", () => {
    const result = mapDialogToChatSummary({
      id: { toString: () => "user-1" },
      title: "Some User",
      isChannel: false,
      isGroup: false,
      isUser: true,
    });

    expect(result.type).toBe("user");
  });
});

describe("mapDocumentToMediaDescriptor", () => {
  it("returns null when there is no document", () => {
    expect(mapDocumentToMediaDescriptor(null)).toBeNull();
    expect(mapDocumentToMediaDescriptor(undefined)).toBeNull();
  });

  it("extracts filename, mime type, size, and video attributes", () => {
    const result = mapDocumentToMediaDescriptor({
      mimeType: "video/x-matroska",
      size: { toString: () => "734003200" },
      attributes: [
        { className: "DocumentAttributeFilename", fileName: "Fauda.S04E03.1080p.WEB-DL.mkv" },
        { className: "DocumentAttributeVideo", duration: 2640, w: 1920, h: 1080 },
      ],
    });

    expect(result).toEqual({
      fileName: "Fauda.S04E03.1080p.WEB-DL.mkv",
      mimeType: "video/x-matroska",
      sizeBytes: 734_003_200,
      durationSeconds: 2640,
      width: 1920,
      height: 1080,
    });
  });

  it("handles a document with no filename or video attributes", () => {
    const result = mapDocumentToMediaDescriptor({
      mimeType: "application/octet-stream",
      size: { toString: () => "1024" },
      attributes: [],
    });

    expect(result).toEqual({
      fileName: null,
      mimeType: "application/octet-stream",
      sizeBytes: 1024,
      durationSeconds: null,
      width: null,
      height: null,
    });
  });
});

describe("mapMessageToSummary", () => {
  it("maps a plain text message", () => {
    const result = mapMessageToSummary("channel-1", {
      id: 101,
      date: 1_700_000_000,
      text: "פרק חדש עולה בקרוב!",
      replyTo: null,
      groupedId: null,
      document: null,
    });

    expect(result).toEqual({
      chatId: "channel-1",
      messageId: 101,
      date: 1_700_000_000,
      text: "פרק חדש עולה בקרוב!",
      replyToMessageId: null,
      mediaGroupId: null,
      media: null,
    });
  });

  it("treats an empty text field as no text", () => {
    const result = mapMessageToSummary("channel-1", {
      id: 102,
      date: 1_700_000_100,
      text: "",
      document: null,
    });

    expect(result.text).toBeNull();
  });

  it("maps reply target and media group id", () => {
    const result = mapMessageToSummary("group-2", {
      id: 202,
      date: 1_700_100_200,
      text: "The.Show.S01E05.720p.mp4",
      replyTo: { replyToMsgId: 201 },
      groupedId: { toString: () => "998877" },
      document: {
        mimeType: "video/mp4",
        size: { toString: () => "412500000" },
        attributes: [{ className: "DocumentAttributeFilename", fileName: "The.Show.S01E05.720p.mp4" }],
      },
    });

    expect(result.replyToMessageId).toBe(201);
    expect(result.mediaGroupId).toBe("998877");
    expect(result.media?.fileName).toBe("The.Show.S01E05.720p.mp4");
  });
});
