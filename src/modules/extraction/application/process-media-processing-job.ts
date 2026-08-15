import type { MaterializeReleaseResult } from "../../catalog/application/materialize-release.js";
import type { Release } from "../../catalog/domain/release.js";
import type { SeriesAliasRepository } from "../../catalog/ports/series-alias-repository.js";
import type { SeriesRepository } from "../../catalog/ports/series-repository.js";
import type { BuildOrRefreshContextGroupResult } from "../../context/application/build-or-refresh-context-group.js";
import type { MediaAssetRepository } from "../../ingestion/ports/media-asset-repository.js";
import type { MessageRepository } from "../../ingestion/ports/message-repository.js";
import type { TelegramChatRepository } from "../../ingestion/ports/telegram-chat-repository.js";
import { deterministicParse } from "../domain/deterministic-parse.js";
import { extractionResultSchema, type ExtractionResult } from "../domain/extraction-result-schema.js";
import type { ExtractionRun, ExtractionVersions } from "../domain/extraction-run.js";
import type { ExtractionRunRepository } from "../ports/extraction-run-repository.js";
import type { LlmContextMessage, LlmExtractor, LlmSeriesCandidate } from "../ports/llm-extractor.js";

const KNOWN_SERIES_CANDIDATE_LIMIT = 50;
const LLM_VALIDATION_ATTEMPTS = 2;

export interface ProcessMediaProcessingJobDeps {
  mediaAssetRepo: MediaAssetRepository;
  messageRepo: MessageRepository;
  telegramChatRepo: TelegramChatRepository;
  buildOrRefreshContextGroup: (mediaAssetId: number, now: number) => Promise<BuildOrRefreshContextGroupResult>;
  extractionRunRepo: ExtractionRunRepository;
  llmExtractor: LlmExtractor;
  seriesRepo: SeriesRepository;
  seriesAliasRepo: SeriesAliasRepository;
  materializeRelease: (input: {
    mediaAssetId: number;
    extractionRunId: number;
    extraction: ExtractionResult;
    fileName: string | null;
    assetHeight: number | null;
    deterministicSeason: number | null;
    deterministicEpisode: number | null;
    now: number;
  }) => Promise<MaterializeReleaseResult>;
  versions: ExtractionVersions;
}

export type ProcessMediaProcessingJobOutcome =
  | { kind: "pending_context"; retryAt: number }
  | { kind: "processed"; extractionRun: ExtractionRun; release: Release | null; llmCalled: boolean };

export function createProcessMediaProcessingJob(deps: ProcessMediaProcessingJobDeps) {
  return async function processMediaProcessingJob(mediaAssetId: number, now: number): Promise<ProcessMediaProcessingJobOutcome> {
    const { contextGroup, ready } = await deps.buildOrRefreshContextGroup(mediaAssetId, now);
    if (!ready) {
      return { kind: "pending_context", retryAt: contextGroup.group.quietPeriodDeadline ?? now };
    }

    const mediaAsset = await deps.mediaAssetRepo.findById(mediaAssetId);
    if (!mediaAsset) throw new Error(`Media asset not found: ${mediaAssetId}`);
    const targetMessage = await deps.messageRepo.findById(mediaAsset.messageId);
    if (!targetMessage) throw new Error(`Target message not found for media asset: ${mediaAssetId}`);
    const chat = await deps.telegramChatRepo.findByTelegramId(targetMessage.chatId);

    const deterministicHints = deterministicParse({ text: targetMessage.text, fileName: mediaAsset.fileName });

    const existingRun = await deps.extractionRunRepo.findByKey({
      contextGroupId: contextGroup.group.id,
      inputFingerprint: contextGroup.group.inputFingerprint,
      ...deps.versions,
    });

    let extractionRun: ExtractionRun;
    let llmCalled = false;

    if (existingRun) {
      extractionRun = existingRun;
    } else {
      const memberMessages = await Promise.all(contextGroup.members.map((member) => deps.messageRepo.findById(member.messageId)));
      const contextMessages: LlmContextMessage[] = contextGroup.members.map((member, index) => ({
        messageId: member.messageId,
        role: member.role,
        relativeOrder: member.relativeOrder,
        text: memberMessages[index]?.text ?? null,
      }));

      const aliases = await deps.seriesAliasRepo.listAll();
      const seriesIds = [...new Set(aliases.map((alias) => alias.seriesId))].slice(0, KNOWN_SERIES_CANDIDATE_LIMIT);
      const knownSeriesCandidates: LlmSeriesCandidate[] = [];
      for (const seriesId of seriesIds) {
        const series = await deps.seriesRepo.findById(seriesId);
        if (!series) continue;
        knownSeriesCandidates.push({
          seriesId,
          canonicalTitle: series.canonicalTitle,
          aliases: aliases.filter((alias) => alias.seriesId === seriesId).map((alias) => alias.aliasOriginal),
        });
      }

      const llmInput = {
        channelTitle: chat?.title ?? targetMessage.chatId,
        channelUsername: chat?.username ?? null,
        targetMessageId: targetMessage.telegramMessageId,
        fileName: mediaAsset.fileName,
        mimeType: mediaAsset.mimeType,
        sizeBytes: mediaAsset.sizeBytes,
        durationSeconds: mediaAsset.durationSeconds,
        width: mediaAsset.width,
        height: mediaAsset.height,
        contextMessages,
        deterministicHints,
        knownSeriesCandidates,
      };

      let parsed: ExtractionResult | null = null;
      let lastError = "";
      for (let attempt = 0; attempt < LLM_VALIDATION_ATTEMPTS && !parsed; attempt++) {
        llmCalled = true;
        const raw = await deps.llmExtractor.extract(llmInput);
        const result = extractionResultSchema.safeParse(raw);
        if (result.success) {
          parsed = result.data;
        } else {
          lastError = result.error.message;
        }
      }

      extractionRun = await deps.extractionRunRepo.insert({
        contextGroupId: contextGroup.group.id,
        inputFingerprint: contextGroup.group.inputFingerprint,
        ...deps.versions,
        status: parsed ? "succeeded" : "failed",
        isTvEpisode: parsed?.isTvEpisode ?? null,
        resultJson: parsed ? JSON.stringify(parsed) : null,
        error: parsed ? null : `LLM output failed schema validation: ${lastError}`,
        now,
      });
    }

    let release: Release | null = null;
    if (extractionRun.status === "succeeded" && extractionRun.isTvEpisode && extractionRun.resultJson) {
      const extraction = extractionResultSchema.parse(JSON.parse(extractionRun.resultJson));
      const materialized = await deps.materializeRelease({
        mediaAssetId,
        extractionRunId: extractionRun.id,
        extraction,
        fileName: mediaAsset.fileName,
        assetHeight: mediaAsset.height,
        deterministicSeason: deterministicHints.season,
        deterministicEpisode: deterministicHints.episode,
        now,
      });
      release = materialized.release;
    }

    return { kind: "processed", extractionRun, release, llmCalled };
  };
}
