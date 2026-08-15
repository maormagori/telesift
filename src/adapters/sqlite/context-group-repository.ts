import type { Kysely, Selectable } from "kysely";
import type { ContextGroup } from "../../modules/context/domain/context-group.js";
import type { ContextGroupRepository } from "../../modules/context/ports/context-group-repository.js";
import type { ContextGroupsTable, DB } from "./schema.js";

function toContextGroup(row: Selectable<ContextGroupsTable>): ContextGroup {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    status: row.status,
    inputFingerprint: row.input_fingerprint,
    quietPeriodDeadline: row.quiet_period_deadline,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteContextGroupRepository(db: Kysely<DB>): ContextGroupRepository {
  return {
    async upsert(input) {
      return db.transaction().execute(async (trx) => {
        const groupRow = await trx
          .insertInto("context_groups")
          .values({
            media_asset_id: input.mediaAssetId,
            status: input.status,
            input_fingerprint: input.inputFingerprint,
            quiet_period_deadline: input.quietPeriodDeadline,
            created_at: input.now,
            updated_at: input.now,
          })
          .onConflict((oc) =>
            oc.column("media_asset_id").doUpdateSet((eb) => ({
              status: eb.ref("excluded.status"),
              input_fingerprint: eb.ref("excluded.input_fingerprint"),
              quiet_period_deadline: eb.ref("excluded.quiet_period_deadline"),
              updated_at: eb.ref("excluded.updated_at"),
            })),
          )
          .returningAll()
          .executeTakeFirst();
        if (!groupRow) throw new Error(`Failed to upsert context group for media asset: ${input.mediaAssetId}`);

        await trx.deleteFrom("context_group_messages").where("context_group_id", "=", groupRow.id).execute();

        if (input.members.length > 0) {
          await trx
            .insertInto("context_group_messages")
            .values(
              input.members.map((member) => ({
                context_group_id: groupRow.id,
                message_id: member.messageId,
                role: member.role,
                relative_order: member.relativeOrder,
                created_at: input.now,
              })),
            )
            .execute();
        }

        return { group: toContextGroup(groupRow), members: input.members };
      });
    },

    async getByMediaAssetId(mediaAssetId) {
      const groupRow = await db
        .selectFrom("context_groups")
        .selectAll()
        .where("media_asset_id", "=", mediaAssetId)
        .executeTakeFirst();
      if (!groupRow) return null;

      const memberRows = await db
        .selectFrom("context_group_messages")
        .selectAll()
        .where("context_group_id", "=", groupRow.id)
        .orderBy("relative_order", "asc")
        .execute();

      return {
        group: toContextGroup(groupRow),
        members: memberRows.map((row) => ({ messageId: row.message_id, role: row.role, relativeOrder: row.relative_order })),
      };
    },
  };
}
