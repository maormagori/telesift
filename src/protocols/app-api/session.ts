import session from "express-session";
import type { NextFunction, Request, RequestHandler, Response } from "express";

declare module "express-session" {
  interface SessionData {
    username?: string;
  }
}

export interface SessionConfig {
  secret: string;
  cookieSecure: boolean;
}

export function createSessionMiddleware(config: SessionConfig): RequestHandler {
  return session({
    secret: config.secret,
    name: "telesift.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
    },
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.username) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  next();
}
