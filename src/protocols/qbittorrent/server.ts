import express, { type Express } from "express";
import { createQbittorrentRoutes, type QbittorrentRoutesDeps } from "./routes.js";

/**
 * The `/api/v2` prefix lives here (not in routes.ts, which stays bare-path) so this whole server
 * object mounts at the app's root. Real qBittorrent's Web API has no configurable base path, and
 * matching that means Sonarr's qBittorrent client works with just Host/Port — no operator has to
 * go find Sonarr's URL Base field, which does exist but sits behind an easy-to-miss "Advanced
 * Settings" toggle.
 */
export function createQbittorrentServer(deps: QbittorrentRoutesDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api/v2", createQbittorrentRoutes(deps));
  return app;
}
