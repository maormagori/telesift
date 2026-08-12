import type { DatabaseSync } from "node:sqlite";
import { ChannelNotFoundError, type Channel, type ChannelIdentifier } from "../../modules/ingestion/domain/channel.js";
import type { ChannelRepository } from "../../modules/ingestion/ports/channel-repository.js";

interface ChannelRow {
  id: number;
  identifier_type: "telegram_id" | "username";
  identifier_value: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    identifier: { type: row.identifier_type, value: row.identifier_value },
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteChannelRepository(db: DatabaseSync): ChannelRepository {
  function findRow(identifier: ChannelIdentifier): ChannelRow | undefined {
    return db
      .prepare("SELECT * FROM channels WHERE identifier_type = ? AND identifier_value = ?")
      .get(identifier.type, identifier.value) as unknown as ChannelRow | undefined;
  }

  return {
    async add(identifier) {
      const now = Date.now();
      db.prepare(
        `INSERT INTO channels (identifier_type, identifier_value, enabled, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT (identifier_type, identifier_value) DO NOTHING`,
      ).run(identifier.type, identifier.value, now, now);

      const row = findRow(identifier);
      if (!row) throw new Error(`Failed to add channel: ${identifier.type}=${identifier.value}`);
      return toChannel(row);
    },

    async setEnabled(identifier, enabled) {
      const result = db
        .prepare(
          "UPDATE channels SET enabled = ?, updated_at = ? WHERE identifier_type = ? AND identifier_value = ?",
        )
        .run(enabled ? 1 : 0, Date.now(), identifier.type, identifier.value);

      if (result.changes === 0) throw new ChannelNotFoundError(identifier);

      const row = findRow(identifier);
      if (!row) throw new ChannelNotFoundError(identifier);
      return toChannel(row);
    },

    async list() {
      const rows = db.prepare("SELECT * FROM channels ORDER BY id").all() as unknown as ChannelRow[];
      return rows.map(toChannel);
    },
  };
}
