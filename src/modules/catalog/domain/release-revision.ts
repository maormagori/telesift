import type { ReleaseFields } from "./release.js";

export type ReleaseRevisionChangeSource = "extraction" | "review";

export type ReleaseFieldsSnapshot = Omit<ReleaseFields, "extractionRunId">;

export interface ReleaseRevision {
  id: number;
  releaseId: number;
  extractionRunId: number | null;
  changeSource: ReleaseRevisionChangeSource;
  before: ReleaseFieldsSnapshot;
  after: ReleaseFieldsSnapshot;
  actor: string;
  createdAt: number;
}
