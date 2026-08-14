import type { Kysely, Selectable } from "kysely";
import type { ExtractionRun } from "../../modules/extraction/domain/extraction-run.js";
import type { ExtractionRunRepository } from "../../modules/extraction/ports/extraction-run-repository.js";
import type { DB, ExtractionRunsTable } from "./schema.js";

function toExtractionRun(row: Selectable<ExtractionRunsTable>): ExtractionRun {
  return {
    id: row.id,
    contextGroupId: row.context_group_id,
    inputFingerprint: row.input_fingerprint,
    pipelineVersion: row.pipeline_version,
    promptVersion: row.prompt_version,
    modelVersion: row.model_version,
    status: row.status,
    isTvEpisode: row.is_tv_episode === null ? null : row.is_tv_episode === 1,
    resultJson: row.result_json,
    error: row.error,
    createdAt: row.created_at,
  };
}

export function createSqliteExtractionRunRepository(db: Kysely<DB>): ExtractionRunRepository {
  return {
    async findByKey(input) {
      const row = await db
        .selectFrom("extraction_runs")
        .selectAll()
        .where("context_group_id", "=", input.contextGroupId)
        .where("input_fingerprint", "=", input.inputFingerprint)
        .where("pipeline_version", "=", input.pipelineVersion)
        .where("prompt_version", "=", input.promptVersion)
        .where("model_version", "=", input.modelVersion)
        .executeTakeFirst();
      return row ? toExtractionRun(row) : null;
    },

    async insert(input) {
      const row = await db
        .insertInto("extraction_runs")
        .values({
          context_group_id: input.contextGroupId,
          input_fingerprint: input.inputFingerprint,
          pipeline_version: input.pipelineVersion,
          prompt_version: input.promptVersion,
          model_version: input.modelVersion,
          status: input.status,
          is_tv_episode: input.isTvEpisode === null ? null : input.isTvEpisode ? 1 : 0,
          result_json: input.resultJson,
          error: input.error,
          created_at: input.now,
        })
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new Error(`Failed to insert extraction run for context group: ${input.contextGroupId}`);
      return toExtractionRun(row);
    },
  };
}
