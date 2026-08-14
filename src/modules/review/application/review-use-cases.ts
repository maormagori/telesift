import { buildDisplayTitle } from "../../catalog/domain/display-title.js";
import type { Release, ReleaseFields } from "../../catalog/domain/release.js";
import type { ReleaseFieldsSnapshot } from "../../catalog/domain/release-revision.js";
import type { ReleaseRepository } from "../../catalog/ports/release-repository.js";
import type { ReleaseRevisionRepository } from "../../catalog/ports/release-revision-repository.js";
import type { SeriesRepository } from "../../catalog/ports/series-repository.js";

export interface ReviewUseCasesDeps {
  releaseRepo: ReleaseRepository;
  releaseRevisionRepo: ReleaseRevisionRepository;
  seriesRepo: SeriesRepository;
}

export class ReleaseNotFoundError extends Error {
  constructor(public readonly releaseId: number) {
    super(`Release not found: ${releaseId}`);
    this.name = "ReleaseNotFoundError";
  }
}

export interface EditReleaseInput {
  seriesId?: number | null;
  season?: number | null;
  episode?: number | null;
  resolution?: string | null;
  source?: string | null;
  codec?: string | null;
  language?: string | null;
}

export interface ReviewUseCases {
  approveRelease(releaseId: number, actor: string, now: number): Promise<Release>;
  rejectRelease(releaseId: number, actor: string, now: number): Promise<Release>;
  editRelease(releaseId: number, input: EditReleaseInput, actor: string, now: number): Promise<Release>;
}

function toSnapshot(release: Release): ReleaseFieldsSnapshot {
  return {
    seriesId: release.seriesId,
    season: release.season,
    episode: release.episode,
    resolution: release.resolution,
    source: release.source,
    codec: release.codec,
    language: release.language,
    displayTitle: release.displayTitle,
    reviewState: release.reviewState,
    manuallyVerified: release.manuallyVerified,
    manuallyVerifiedAt: release.manuallyVerifiedAt,
  };
}

export function createReviewUseCases(deps: ReviewUseCasesDeps): ReviewUseCases {
  async function getExisting(releaseId: number): Promise<Release> {
    const release = await deps.releaseRepo.findById(releaseId);
    if (!release) throw new ReleaseNotFoundError(releaseId);
    return release;
  }

  async function applyChange(
    existing: Release,
    fields: ReleaseFields,
    actor: string,
    now: number,
  ): Promise<Release> {
    const before = toSnapshot(existing);
    const updated = await deps.releaseRepo.update({ releaseId: existing.id, fields, now });
    await deps.releaseRevisionRepo.insert({
      releaseId: existing.id,
      extractionRunId: null,
      changeSource: "review",
      before,
      after: toSnapshot(updated),
      actor,
      now,
    });
    return updated;
  }

  return {
    async approveRelease(releaseId, actor, now) {
      const existing = await getExisting(releaseId);
      return applyChange(
        existing,
        { ...existing, reviewState: "approved", manuallyVerified: true, manuallyVerifiedAt: now },
        actor,
        now,
      );
    },

    async rejectRelease(releaseId, actor, now) {
      const existing = await getExisting(releaseId);
      return applyChange(
        existing,
        { ...existing, reviewState: "rejected", manuallyVerified: true, manuallyVerifiedAt: now },
        actor,
        now,
      );
    },

    async editRelease(releaseId, input, actor, now) {
      const existing = await getExisting(releaseId);

      const seriesId = input.seriesId !== undefined ? input.seriesId : existing.seriesId;
      const season = input.season !== undefined ? input.season : existing.season;
      const episode = input.episode !== undefined ? input.episode : existing.episode;
      const resolution = input.resolution !== undefined ? input.resolution : existing.resolution;
      const source = input.source !== undefined ? input.source : existing.source;
      const codec = input.codec !== undefined ? input.codec : existing.codec;
      const language = input.language !== undefined ? input.language : existing.language;

      const series = seriesId !== null ? await deps.seriesRepo.findById(seriesId) : null;
      const displayTitle = buildDisplayTitle({ seriesTitle: series?.canonicalTitle ?? "Unknown", season, episode, resolution });

      return applyChange(
        existing,
        {
          seriesId,
          extractionRunId: existing.extractionRunId,
          season,
          episode,
          resolution,
          source,
          codec,
          language,
          displayTitle,
          reviewState: existing.reviewState,
          manuallyVerified: true,
          manuallyVerifiedAt: now,
        },
        actor,
        now,
      );
    },
  };
}
