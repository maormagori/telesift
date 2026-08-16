import express, { type Express } from "express";
import { createQbittorrentRoutes, type QbittorrentRoutesDeps } from "./routes.js";

/**
 * The `/api/v2` prefix lives here (not in routes.ts, which stays bare-path)
 * so this whole server object drops into a future `app.use("/qbittorrent", ...)`
 * mount with paths landing exactly where Sonarr expects them when its
 * qBittorrent client is configured with URL Base `/qbittorrent`.
 */
export function createQbittorrentServer(deps: QbittorrentRoutesDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api/v2", createQbittorrentRoutes(deps));
  return app;
}
