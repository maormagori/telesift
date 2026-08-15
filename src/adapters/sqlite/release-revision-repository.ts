import type { Kysely, Selectable } from "kysely";
import type { ReleaseFieldsSnapshot, ReleaseRevision } from "../../modules/catalog/domain/release-revision.js";
import type { ReleaseRevisionRepository } from "../../modules/catalog/ports/release-revision-repository.js";
import type { DB, ReleaseRevisionsTable } from "./schema.js";

function toReleaseRevision(row: Selectable<ReleaseRevisionsTable>): ReleaseRevision {
  return {
    id: row.id,
    releaseId: row.release_id,
    extractionRunId: row.extraction_run_id,
    changeSource: row.change_source,
    before: JSON.parse(row.before_json) as ReleaseFieldsSnapshot,
    after: JSON.parse(row.after_json) as ReleaseFieldsSnapshot,
    actor: row.actor,
    createdAt: row.created_at,
  };
}

export function createSqliteReleaseRevisionRepository(db: Kysely<DB>): ReleaseRevisionRepository {
  return {
    async insert(input) {
      const row = await db
        .insertInto("release_revisions")
        .values({
          release_id: input.releaseId,
          extraction_run_id: input.extractionRunId,
          change_source: input.changeSource,
          before_json: JSON.stringify(input.before),
          after_json: JSON.stringify(input.after),
          actor: input.actor,
          created_at: input.now,
        })
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new Error(`Failed to insert release revision for release: ${input.releaseId}`);
      return toReleaseRevision(row);
    },

    async listByReleaseId(releaseId) {
      const rows = await db
        .selectFrom("release_revisions")
        .selectAll()
        .where("release_id", "=", releaseId)
        .orderBy("created_at", "asc")
        .execute();
      return rows.map(toReleaseRevision);
    },
  };
}
