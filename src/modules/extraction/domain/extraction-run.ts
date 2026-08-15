export type ExtractionRunStatus = "succeeded" | "failed";

export interface ExtractionVersions {
  pipelineVersion: string;
  promptVersion: string;
  modelVersion: string;
}

export interface ExtractionRun {
  id: number;
  contextGroupId: number;
  inputFingerprint: string;
  pipelineVersion: string;
  promptVersion: string;
  modelVersion: string;
  status: ExtractionRunStatus;
  isTvEpisode: boolean | null;
  resultJson: string | null;
  error: string | null;
  createdAt: number;
}
