import express, { type Express } from "express";
import { createQbittorrentRoutes, type QbittorrentRoutesDeps } from "./routes.js";

/**
 * The `/api/v2` prefix lives here (not in routes.ts, which stays bare-path) so this whole server
 * object mounts at the app's root. Real qBittorrent's Web API has no configurable base path, and
 * Sonarr's qBittorrent download-client type has no URL Base field — it always dials `/api/v2/...`
 * directly off the configured host/port, so this must land there with no path prefix of its own.
 */
export function createQbittorrentServer(deps: QbittorrentRoutesDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api/v2", createQbittorrentRoutes(deps));
  return app;
}
