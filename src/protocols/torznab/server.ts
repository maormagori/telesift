import express, { type Express } from "express";
import { createTorznabRoutes, type TorznabRoutesDeps } from "./routes.js";

/**
 * The bare `/api` prefix lives here (not in routes.ts) so this whole server object drops
 * into `app.use("/torznab", ...)`, landing at `/torznab/api` — the URL an operator pastes
 * into Sonarr/Prowlarr's Torznab indexer config.
 */
export function createTorznabServer(deps: TorznabRoutesDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", createTorznabRoutes(deps));
  return app;
}
