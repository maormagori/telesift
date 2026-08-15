import type { ReleaseFieldsSnapshot, ReleaseRevision, ReleaseRevisionChangeSource } from "../domain/release-revision.js";

export interface InsertReleaseRevisionInput {
  releaseId: number;
  extractionRunId: number | null;
  changeSource: ReleaseRevisionChangeSource;
  before: ReleaseFieldsSnapshot;
  after: ReleaseFieldsSnapshot;
  actor: string;
  now: number;
}

export interface ReleaseRevisionRepository {
  insert(input: InsertReleaseRevisionInput): Promise<ReleaseRevision>;
  listByReleaseId(releaseId: number): Promise<ReleaseRevision[]>;
}
