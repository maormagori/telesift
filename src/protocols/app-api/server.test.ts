import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteChannelRepository } from "../../adapters/sqlite/channel-repository.js";
import { createSqliteChatSyncStateRepository } from "../../adapters/sqlite/chat-sync-state-repository.js";
import { createKyselyDb, openDatabase } from "../../adapters/sqlite/connection.js";
import { createSqliteMediaAssetRepository } from "../../adapters/sqlite/media-asset-repository.js";
import { createSqliteMessageRepository } from "../../adapters/sqlite/message-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "../../adapters/sqlite/migrate.js";
import type { DB } from "../../adapters/sqlite/schema.js";
import { createSqliteTelegramChatRepository } from "../../adapters/sqlite/telegram-chat-repository.js";
import { createFakeTelegramAccessAdapter } from "../../adapters/telegram-fake/fake-telegram-access-adapter.js";
import type { FakeChatFixture } from "../../adapters/telegram-fake/fixtures.js";
import { createAppAuthUseCases } from "../../modules/app-auth/application/use-cases.js";
import { createChannelResolver } from "../../modules/ingestion/application/channel-resolution.js";
import { createMessageInspectionUseCases } from "../../modules/ingestion/application/message-inspection.js";
import { createChannelStatusUseCases, createIngestionUseCases } from "../../modules/ingestion/application/use-cases.js";
import { createTelegramAccessUseCases } from "../../modules/telegram-access/application/use-cases.js";
import { createAppApiServer } from "./server.js";

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function makeFixture(chatId: string, username: string | null = null): FakeChatFixture {
  return {
    chat: { id: chatId, title: `Chat ${chatId}`, type: "channel", username },
    messages: [
      { chatId, messageId: 1, date: 1_700_000_000, text: "first message", replyToMessageId: null, mediaGroupId: null, media: null },
    ],
    media: {},
  };
}

const ADMIN_PASSWORD = "correct horse battery staple";

describe("app-api server", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let server: Server | null;
  let baseUrl: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-app-api-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    server = null;
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  async function startServer(fixtures: FakeChatFixture[] = [makeFixture("1001")]): Promise<void> {
    const channelRepo = createSqliteChannelRepository(kysely);
    const chatSyncStateRepo = createSqliteChatSyncStateRepository(kysely);
    const telegramChatRepo = createSqliteTelegramChatRepository(kysely);
    const messageRepo = createSqliteMessageRepository(kysely);
    const mediaAssetRepo = createSqliteMediaAssetRepository(kysely);
    const telegramAccess = createTelegramAccessUseCases(createFakeTelegramAccessAdapter(fixtures));
    const resolver = createChannelResolver({ telegramAccess: createFakeTelegramAccessAdapter(fixtures), telegramChatRepo });

    const app = createAppApiServer(
      {
        appAuth: createAppAuthUseCases({ username: "operator", passwordHash: hashPassword(ADMIN_PASSWORD) }),
        telegramAccess,
        ingestion: createIngestionUseCases(channelRepo),
        channelStatus: createChannelStatusUseCases({ channelRepo, chatSyncStateRepo, resolver }),
        messageInspection: createMessageInspectionUseCases({ messageRepo, mediaAssetRepo }),
      },
      { secret: "test-secret", cookieSecure: false },
    );
    const listening = app.listen(0);
    server = listening;
    await new Promise<void>((resolve) => listening.once("listening", resolve));
    const address = listening.address();
    if (!address || typeof address === "string") throw new Error("expected an AddressInfo");
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async function login(): Promise<string> {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "operator", password: ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) throw new Error("expected a set-cookie header");
    return setCookie.split(";")[0]!;
  }

  it("rejects protected routes without a session", async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/channels`);
    expect(res.status).toBe(401);
  });

  it("rejects login with the wrong password", async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "operator", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("logs in, reaches protected routes, then logs out and loses access", async () => {
    await startServer();
    const cookie = await login();

    const sessionRes = await fetch(`${baseUrl}/auth/session`, { headers: { Cookie: cookie } });
    expect(sessionRes.status).toBe(200);
    expect(await sessionRes.json()).toEqual({ username: "operator" });

    const logoutRes = await fetch(`${baseUrl}/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
    expect(logoutRes.status).toBe(204);

    const afterLogout = await fetch(`${baseUrl}/channels`, { headers: { Cookie: cookie } });
    expect(afterLogout.status).toBe(401);
  });

  it("GET /telegram/status proxies telegram-service's connection status", async () => {
    await startServer();
    const cookie = await login();

    const res = await fetch(`${baseUrl}/telegram/status`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connected: true });
  });

  it("adds a channel and resolves it synchronously when visible to the account", async () => {
    await startServer([makeFixture("1001")]);
    const cookie = await login();

    const res = await fetch(`${baseUrl}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: "1001" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { resolution: unknown };
    expect(body.resolution).toMatchObject({ status: "resolved", chat: { telegramId: "1001" } });
  });

  it("adds a channel that isn't visible yet without failing the request", async () => {
    await startServer([]);
    const cookie = await login();

    const res = await fetch(`${baseUrl}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: "9999" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { resolution: unknown };
    expect(body.resolution).toEqual({ status: "unresolved" });
  });

  it("lists channels with resolved status", async () => {
    await startServer([makeFixture("1001")]);
    const cookie = await login();
    await fetch(`${baseUrl}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: "1001" }),
    });

    const res = await fetch(`${baseUrl}/channels`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ chat: unknown }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.chat).toMatchObject({ telegramId: "1001" });
  });

  it("enables and disables a channel", async () => {
    await startServer([makeFixture("1001")]);
    const cookie = await login();
    await fetch(`${baseUrl}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: "1001" }),
    });

    const disableRes = await fetch(`${baseUrl}/channels/disable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: { type: "telegram_id", value: "1001" } }),
    });
    expect(disableRes.status).toBe(200);
    const disabled = (await disableRes.json()) as { enabled: boolean };
    expect(disabled.enabled).toBe(false);

    const enableRes = await fetch(`${baseUrl}/channels/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: { type: "telegram_id", value: "1001" } }),
    });
    expect(enableRes.status).toBe(200);
    const enabled = (await enableRes.json()) as { enabled: boolean };
    expect(enabled.enabled).toBe(true);
  });

  it("returns 404 when enabling an unknown channel", async () => {
    await startServer([]);
    const cookie = await login();

    const res = await fetch(`${baseUrl}/channels/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: { type: "telegram_id", value: "does-not-exist" } }),
    });
    expect(res.status).toBe(404);
  });

  it("lists raw messages for a resolved chat", async () => {
    await startServer([makeFixture("1001")]);
    const cookie = await login();
    await fetch(`${baseUrl}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ identifier: "1001" }),
    });
    await createSqliteMessageRepository(kysely).upsertMessage({
      chatId: "1001",
      telegramMessageId: 1,
      text: "hello",
      replyToMessageId: null,
      mediaGroupId: null,
      sourceDate: 1000,
      sourceEditedAt: null,
      media: null,
      now: 1000,
    });

    const res = await fetch(`${baseUrl}/chats/1001/messages`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([{ message: expect.objectContaining({ telegramMessageId: 1 }), media: null }]);
  });
});
