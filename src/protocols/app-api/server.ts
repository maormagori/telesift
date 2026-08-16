import express, { type Express } from "express";
import { createSessionMiddleware, type SessionConfig } from "./session.js";
import { createAppApiRoutes, type AppApiDeps } from "./routes.js";

export function createAppApiServer(deps: AppApiDeps, sessionConfig: SessionConfig): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use(createSessionMiddleware(sessionConfig));
  app.use(createAppApiRoutes(deps));
  return app;
}
