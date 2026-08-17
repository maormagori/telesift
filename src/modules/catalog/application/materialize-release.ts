import type { ExtractionResult } from "../../extraction/domain/extraction-result-schema.js";
import { buildDisplayTitle } from "../domain/display-title.js";
import { crossCheckExtraction } from "../domain/cross-check.js";
import { decideInitialReviewState } from "../domain/decide-initial-review-state.js";
import type { Release, ReleaseFields } from "../domain/release.js";
import type { ReleaseFieldsSnapshot } from "../domain/release-revision.js";
import { normalizeAliasText, resolveSeries } from "../domain/series-matching.js";
import type { ReleaseRepository } from "../ports/release-repository.js";
import type { ReleaseRevisionRepository } from "../ports/release-revision-repository.js";
import type { SeriesAliasRepository } from "../ports/series-alias-repository.js";
import type { SeriesRepository } from "../ports/series-repository.js";

export interface MaterializeReleaseDeps {
  seriesRepo: SeriesRepository;
  seriesAliasRepo: SeriesAliasRepository;
  releaseRepo: ReleaseRepository;
  releaseRevisionRepo: ReleaseRevisionRepository;
  seriesMatchThreshold: number;
  autoIndexEnabled: boolean;
}

export interface MaterializeReleaseInput {
  mediaAssetId: number;
  extractionRunId: number;
  extraction: ExtractionResult;
  fileName: string | null;
  assetHeight: number | null;
  deterministicSeason: number | null;
  deterministicEpisode: number | null;
  now: number;
}

export interface MaterializeReleaseResult {
  release: Release;
  changed: boolean;
}

function toSnapshot(fields: ReleaseFields): ReleaseFieldsSnapshot {
  return {
    seriesId: fields.seriesId,
    season: fields.season,
    episode: fields.episode,
    resolution: fields.resolution,
    source: fields.source,
    codec: fields.codec,
    language: fields.language,
    displayTitle: fields.displayTitle,
    reviewState: fields.reviewState,
    manuallyVerified: fields.manuallyVerified,
    manuallyVerifiedAt: fields.manuallyVerifiedAt,
  };
}

export function createMaterializeRelease(deps: MaterializeReleaseDeps) {
  return async function materializeRelease(input: MaterializeReleaseInput): Promise<MaterializeReleaseResult> {
    const aliases = await deps.seriesAliasRepo.listAll();
    const seriesMatch = resolveSeries(
      input.extraction.seriesTitleObserved,
      input.fileName,
      aliases.map((alias) => ({ seriesId: alias.seriesId, aliasNormalized: alias.aliasNormalized })),
      deps.seriesMatchThreshold,
    );

    let seriesId = seriesMatch.seriesId;
    let seriesTitle =
      input.extraction.seriesTitleCanonical ?? input.extraction.seriesTitleObserved ?? input.fileName ?? "Unknown";

    if (seriesMatch.isNewCandidate) {
      const canonicalTitle = input.extraction.seriesTitleCanonical ?? input.extraction.seriesTitleObserved ?? input.fileName ?? "Unknown";
      const series = await deps.seriesRepo.create({
        canonicalTitle,
        originalLanguage: input.extraction.language,
        now: input.now,
      });
      seriesId = series.id;
      seriesTitle = series.canonicalTitle;

      const aliasText = input.extraction.seriesTitleObserved ?? input.fileName ?? canonicalTitle;
      await deps.seriesAliasRepo.create({
        seriesId: series.id,
        aliasNormalized: normalizeAliasText(aliasText),
        aliasOriginal: aliasText,
        language: input.extraction.language,
        source: "extraction",
        now: input.now,
      });
    } else if (seriesId !== null) {
      const existingSeries = await deps.seriesRepo.findById(seriesId);
      if (existingSeries) seriesTitle = existingSeries.canonicalTitle;
    }

    const crossCheckOk = crossCheckExtraction({
      extractionSeason: input.extraction.season,
      extractionEpisode: input.extraction.episode,
      deterministicSeason: input.deterministicSeason,
      deterministicEpisode: input.deterministicEpisode,
      extractionResolution: input.extraction.resolution,
      assetHeight: input.assetHeight,
    });

    const reviewState = decideInitialReviewState({
      extraction: input.extraction,
      isNewSeriesCandidate: seriesMatch.isNewCandidate,
      crossCheckOk,
      autoIndexEnabled: deps.autoIndexEnabled,
    });

    const fields: ReleaseFields = {
      seriesId,
      extractionRunId: input.extractionRunId,
      season: input.extraction.season,
      episode: input.extraction.episode,
      resolution: input.extraction.resolution,
      source: input.extraction.source,
      codec: input.extraction.codec,
      language: input.extraction.language,
      displayTitle: buildDisplayTitle({
        seriesTitle,
        season: input.extraction.season,
        episode: input.extraction.episode,
        resolution: input.extraction.resolution,
      }),
      reviewState,
      manuallyVerified: false,
      manuallyVerifiedAt: null,
    };

    const existing = await deps.releaseRepo.findByMediaAssetId(input.mediaAssetId);

    if (!existing) {
      const release = await deps.releaseRepo.create({ mediaAssetId: input.mediaAssetId, fields, now: input.now });
      return { release, changed: true };
    }

    if (existing.manuallyVerified) {
      await deps.releaseRevisionRepo.insert({
        releaseId: existing.id,
        extractionRunId: input.extractionRunId,
        changeSource: "extraction",
        before: toSnapshot(existing),
        after: toSnapshot(fields),
        actor: "system",
        now: input.now,
      });
      return { release: existing, changed: false };
    }

    const before = toSnapshot(existing);
    const updated = await deps.releaseRepo.update({ releaseId: existing.id, fields, now: input.now });
    await deps.releaseRevisionRepo.insert({
      releaseId: existing.id,
      extractionRunId: input.extractionRunId,
      changeSource: "extraction",
      before,
      after: toSnapshot(fields),
      actor: "system",
      now: input.now,
    });
    return { release: updated, changed: true };
  };
}
