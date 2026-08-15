import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmExtractionInput } from "../../modules/extraction/ports/llm-extractor.js";
import { createOpenAiCompatibleLlmExtractor } from "./openai-compatible-llm-extractor.js";

const INPUT: LlmExtractionInput = {
  channelTitle: "Some Channel",
  channelUsername: null,
  targetMessageId: 1,
  fileName: "Fauda.S04E03.1080p.mkv",
  mimeType: "video/mp4",
  sizeBytes: 100,
  durationSeconds: 60,
  width: 1920,
  height: 1080,
  contextMessages: [{ messageId: 1, role: "target", relativeOrder: 0, text: null }],
  deterministicHints: { season: 4, episode: 3, resolution: "1080p", source: null, codec: null },
  knownSeriesCandidates: [],
};

describe("openai-compatible LLM extractor", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts to <endpoint>/chat/completions with the model, json response format, and input as the user message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ isTvEpisode: true }) } }] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const extractor = createOpenAiCompatibleLlmExtractor({ endpointUrl: "http://localhost:11434/v1", model: "qwen3", apiKey: null, requestTimeoutMs: 30_000 });
    const result = await extractor.extract(INPUT);

    expect(result).toEqual({ isTvEpisode: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    const requestInit = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(requestInit.body as string);
    expect(body.model).toBe("qwen3");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(JSON.parse(body.messages[1].content)).toEqual(INPUT);
    expect(requestInit.headers).not.toHaveProperty("authorization");
  });

  it("sends a bearer authorization header when an api key is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "{}" } }] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const extractor = createOpenAiCompatibleLlmExtractor({
      endpointUrl: "http://localhost:11434/v1",
      model: "qwen3",
      apiKey: "secret",
      requestTimeoutMs: 30_000,
    });
    await extractor.extract(INPUT);

    const requestInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((requestInit.headers as Record<string, string>).authorization).toBe("Bearer secret");
  });

  it("throws when the HTTP response is not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }) as unknown as typeof fetch;
    const extractor = createOpenAiCompatibleLlmExtractor({ endpointUrl: "http://localhost:11434/v1", model: "qwen3", apiKey: null, requestTimeoutMs: 30_000 });

    await expect(extractor.extract(INPUT)).rejects.toThrow(/500/);
  });

  it("throws when the response has no message content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) }) as unknown as typeof fetch;
    const extractor = createOpenAiCompatibleLlmExtractor({ endpointUrl: "http://localhost:11434/v1", model: "qwen3", apiKey: null, requestTimeoutMs: 30_000 });

    await expect(extractor.extract(INPUT)).rejects.toThrow(/no message content/);
  });

  it("passes an AbortSignal that fires after requestTimeoutMs, and throws a clear timeout error", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal!;
        signal.addEventListener("abort", () => {
          const error = new Error("This operation was aborted");
          error.name = "TimeoutError";
          reject(error);
        });
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const extractor = createOpenAiCompatibleLlmExtractor({
      endpointUrl: "http://localhost:11434/v1",
      model: "qwen3",
      apiKey: null,
      requestTimeoutMs: 10,
    });

    await expect(extractor.extract(INPUT)).rejects.toThrow(/timed out after 10ms/);
  });

  it("propagates a non-timeout fetch failure unchanged", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND")) as unknown as typeof fetch;
    const extractor = createOpenAiCompatibleLlmExtractor({
      endpointUrl: "http://localhost:11434/v1",
      model: "qwen3",
      apiKey: null,
      requestTimeoutMs: 30_000,
    });

    await expect(extractor.extract(INPUT)).rejects.toThrow(/ENOTFOUND/);
  });
});
