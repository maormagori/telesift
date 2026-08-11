import express, { type Express } from "express";
import type { TelegramAccessUseCases } from "../../modules/telegram-access/application/use-cases.js";
import { createTelegramInternalRoutes } from "./routes.js";

export function createTelegramInternalServer(useCases: TelegramAccessUseCases): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(createTelegramInternalRoutes(useCases));
  return app;
}
