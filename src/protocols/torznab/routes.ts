import { Router, type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import type { SearchReleasesOutput, SearchReleasesQuery } from "../../modules/search/application/search-releases.js";
import { buildCapsXml, buildErrorXml, buildSearchResultsXml } from "./xml.js";

export interface TorznabRoutesDeps {
  searchReleases: (query: SearchReleasesQuery) => Promise<SearchReleasesOutput>;
  /** null disables API-key enforcement — the endpoint serves unauthenticated. */
  apiKey: string | null;
}

const RequestQuerySchema = z.object({
  t: z.enum(["caps", "search", "tvsearch"]),
  apikey: z.string().optional(),
  q: z.string().optional(),
  season: z.coerce.number().int().optional(),
  ep: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

function sendXml(res: Response, status: number, body: string): void {
  res.status(status).set("Content-Type", "application/rss+xml; charset=utf-8").send(body);
}

export function createTorznabRoutes(deps: TorznabRoutesDeps): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    const parsed = RequestQuerySchema.parse(req.query);

    if (deps.apiKey !== null && parsed.apikey !== deps.apiKey) {
      sendXml(res, 401, buildErrorXml(100, "Incorrect API key"));
      return;
    }

    if (parsed.t === "caps") {
      sendXml(res, 200, buildCapsXml());
      return;
    }

    const result = await deps.searchReleases({
      queryText: parsed.q ?? null,
      season: parsed.season ?? null,
      episode: parsed.ep ?? null,
      offset: parsed.offset,
      limit: parsed.limit,
    });

    sendXml(res, 200, buildSearchResultsXml(result.items, parsed.offset, result.total));
  });

  router.use(errorMiddleware);

  return router;
}

const errorMiddleware: ErrorRequestHandler = (err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ZodError) {
    sendXml(res, 400, buildErrorXml(201, "Incorrect parameter"));
    return;
  }
  console.error("torznab route error", err);
  sendXml(res, 500, buildErrorXml(900, "Internal error"));
};
