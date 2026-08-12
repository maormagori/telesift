import type { Kysely, Selectable } from "kysely";
import { ChannelNotFoundError, type Channel, type ChannelIdentifier } from "../../modules/ingestion/domain/channel.js";
import type { ChannelRepository } from "../../modules/ingestion/ports/channel-repository.js";
import type { ChannelsTable, DB } from "./schema.js";

function toChannel(row: Selectable<ChannelsTable>): Channel {
  return {
    id: row.id,
    identifier: { type: row.identifier_type, value: row.identifier_value },
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteChannelRepository(db: Kysely<DB>): ChannelRepository {
  function findRow(identifier: ChannelIdentifier) {
    return db
      .selectFrom("channels")
      .selectAll()
      .where("identifier_type", "=", identifier.type)
      .where("identifier_value", "=", identifier.value)
      .executeTakeFirst();
  }

  return {
    async add(identifier) {
      const now = Date.now();
      await db
        .insertInto("channels")
        .values({
          identifier_type: identifier.type,
          identifier_value: identifier.value,
          enabled: 1,
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) => oc.columns(["identifier_type", "identifier_value"]).doNothing())
        .execute();

      const row = await findRow(identifier);
      if (!row) throw new Error(`Failed to add channel: ${identifier.type}=${identifier.value}`);
      return toChannel(row);
    },

    async setEnabled(identifier, enabled) {
      const result = await db
        .updateTable("channels")
        .set({ enabled: enabled ? 1 : 0, updated_at: Date.now() })
        .where("identifier_type", "=", identifier.type)
        .where("identifier_value", "=", identifier.value)
        .executeTakeFirst();

      if (result.numUpdatedRows === 0n) throw new ChannelNotFoundError(identifier);

      const row = await findRow(identifier);
      if (!row) throw new ChannelNotFoundError(identifier);
      return toChannel(row);
    },

    async list() {
      const rows = await db.selectFrom("channels").selectAll().orderBy("id").execute();
      return rows.map(toChannel);
    },
  };
}
