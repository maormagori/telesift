import type { Release, ReleaseFields } from "../domain/release.js";

export interface CreateReleaseInput {
  mediaAssetId: number;
  fields: ReleaseFields;
  now: number;
}

export interface UpdateReleaseInput {
  releaseId: number;
  fields: ReleaseFields;
  now: number;
}

export interface ReleaseRepository {
  findById(releaseId: number): Promise<Release | null>;
  findByMediaAssetId(mediaAssetId: number): Promise<Release | null>;
  create(input: CreateReleaseInput): Promise<Release>;
  update(input: UpdateReleaseInput): Promise<Release>;
}
