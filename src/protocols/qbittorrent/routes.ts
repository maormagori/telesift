import express, { Router, type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import type { Release } from "../../modules/catalog/domain/release.js";
import type { ReleaseRepository } from "../../modules/catalog/ports/release-repository.js";
import type { DownloadControls } from "../../modules/downloads/application/download-controls.js";
import { InvalidMagnetUriError, ReleaseNotFoundError } from "../../modules/downloads/application/grab-release.js";
import type { Download } from "../../modules/downloads/domain/download.js";
import { toQbittorrentState } from "../../modules/downloads/domain/qbittorrent-state.js";
import type { DownloadRepository } from "../../modules/downloads/ports/download-repository.js";

export interface QbittorrentRoutesDeps {
  releaseRepo: ReleaseRepository;
  downloadRepo: DownloadRepository;
  grabRelease: (input: { magnetUri: string; category: string | null; now: number }) => Promise<Download>;
  downloadControls: Pick<DownloadControls, "pauseDownload" | "cancelDownload">;
  stagingDirectory: string;
}

function toTorrentInfo(download: Download, release: Release | null, stagingDirectory: string) {
  const size = download.totalBytes ?? 0;
  return {
    hash: download.clientHash,
    name: release?.displayTitle ?? `download-${download.id}`,
    size,
    progress: size > 0 ? download.progressBytes / size : 0,
    dlspeed: 0,
    upspeed: 0,
    priority: 0,
    num_seeds: 0,
    num_leechers: 0,
    state: toQbittorrentState(download),
    save_path: stagingDirectory,
    content_path: download.stagingPath ?? undefined,
    added_on: Math.floor(download.createdAt / 1000),
    eta: -1,
    category: download.category ?? "",
    // Reported as 0/0 so Sonarr's "seed limit reached" check (ratio_limit>=0 &&
    // ratio_limit-ratio<=0.001) trips, letting it remove the download after
    // import once observedState is "completed" (pausedUP).
    ratio: 0,
    ratio_limit: 0,
  };
}

export function createQbittorrentRoutes(deps: QbittorrentRoutesDeps): Router {
  const router = Router();
  router.use(express.urlencoded({ extended: true }));
  router.use(express.json());

  // Public — Sonarr/Radarr call this without a session to obtain the SID cookie.
  // Real Prowlarr/Sonarr API-key auth is an unresolved project-wide loose end
  // (not specific to this endpoint); always succeeding keeps the grab/track
  // flow usable today without pretending auth is enforced.
  router.post("/auth/login", (_req: Request, res: Response) => {
    res.type("text/plain").send("Ok.");
  });

  router.get("/app/version", (_req: Request, res: Response) => {
    res.type("text/plain").send("v4.3.3");
  });

  router.get("/app/webapiVersion", (_req: Request, res: Response) => {
    res.type("text/plain").send("2.0");
  });

  router.get("/app/preferences", (_req: Request, res: Response) => {
    res.json({ save_path: deps.stagingDirectory, temp_path: deps.stagingDirectory, dht: false });
  });

  router.get("/torrents/categories", (_req: Request, res: Response) => {
    // Categories aren't persisted separately in v1 — they're plain labels
    // stored on each download row at add-time.
    res.json({});
  });

  router.post("/torrents/createCategory", (_req: Request, res: Response) => {
    res.type("text/plain").send("");
  });

  router.post("/torrents/setCategory", (_req: Request, res: Response) => {
    res.type("text/plain").send("");
  });

  router.get("/torrents/info", async (req: Request, res: Response) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const downloads = await deps.downloadRepo.listActive(category);
    const torrents = await Promise.all(
      downloads.map(async (download) => {
        const release = await deps.releaseRepo.findById(download.releaseId);
        return toTorrentInfo(download, release, deps.stagingDirectory);
      }),
    );
    res.json(torrents);
  });

  router.get("/torrents/properties", async (req: Request, res: Response) => {
    const hash = typeof req.query.hash === "string" ? req.query.hash : undefined;
    if (!hash) return res.status(400).send("No hash provided");

    const download = await deps.downloadRepo.findLatestByClientHash(hash);
    if (!download) return res.status(404).send("Torrent not found");

    res.json({
      save_path: deps.stagingDirectory,
      creation_date: Math.floor(download.createdAt / 1000),
      piece_size: 0,
      comment: "",
      total_wasted: 0,
      total_uploaded: 0,
      total_uploaded_session: 0,
      total_downloaded: download.progressBytes,
      total_downloaded_session: download.progressBytes,
      up_limit: -1,
      dl_limit: -1,
      time_elapsed: 0,
      seeding_time: 0,
      nb_connections: 0,
      nb_connections_limit: 0,
      share_ratio: 0,
      addition_date: Math.floor(download.createdAt / 1000),
      completion_date: download.completedAt ? Math.floor(download.completedAt / 1000) : 0,
      created_by: "",
      dl_speed_avg: 0,
      dl_speed: 0,
      eta: -1,
      last_seen: 0,
      peers: 0,
      peers_total: 0,
      pieces_have: 0,
      pieces_num: 0,
      reannounce: 0,
      seeds: 0,
      seeds_total: 0,
      total_size: download.totalBytes ?? 0,
      up_speed_avg: 0,
      up_speed: 0,
      isPrivate: false,
    });
  });

  router.get("/torrents/files", async (req: Request, res: Response) => {
    const hash = typeof req.query.hash === "string" ? req.query.hash : undefined;
    if (!hash) return res.status(400).send("No hash provided");

    const download = await deps.downloadRepo.findLatestByClientHash(hash);
    if (!download) return res.status(404).send("Torrent not found");

    const release = await deps.releaseRepo.findById(download.releaseId);
    const size = download.totalBytes ?? 0;
    res.json([
      {
        index: 0,
        is_seed: download.observedState === "completed",
        name: release?.displayTitle ?? `download-${download.id}`,
        priority: 1,
        progress: size > 0 ? download.progressBytes / size : 0,
        size,
        availability: 1,
      },
    ]);
  });

  router.post("/torrents/add", async (req: Request, res: Response) => {
    const { urls, category, paused, stopped } = req.body as {
      urls?: string;
      category?: string;
      paused?: unknown;
      stopped?: unknown;
    };
    if (!urls) return res.status(400).send("No URLs provided");

    // Sonarr/Radarr send this as the STRING "false"/"true" — a bare truthy
    // check treats "false" as true and pauses every download forever, since
    // Sonarr added it as "start" and never explicitly resumes it.
    const shouldPause = paused === "true" || stopped === "true";
    const urlList = urls
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);

    for (const url of urlList) {
      const download = await deps.grabRelease({ magnetUri: url, category: category || null, now: Date.now() });
      if (shouldPause) await deps.downloadControls.pauseDownload(download.id, Date.now());
    }

    res.type("text/plain").send("Ok.");
  });

  router.post("/torrents/delete", async (req: Request, res: Response) => {
    const { hashes } = req.body as { hashes?: string };
    if (!hashes) return res.status(400).send("No hashes provided");

    const hashList = hashes
      .split("|")
      .map((hash) => hash.trim())
      .filter(Boolean);
    for (const hash of hashList) {
      const download = await deps.downloadRepo.findLatestByClientHash(hash);
      if (download) await deps.downloadControls.cancelDownload(download.id, Date.now());
    }

    res.type("text/plain").send("Ok.");
  });

  router.use(errorMiddleware);

  return router;
}

const errorMiddleware: ErrorRequestHandler = (err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ReleaseNotFoundError) {
    res.status(404).send("Release not found");
    return;
  }
  if (err instanceof InvalidMagnetUriError) {
    res.status(400).send("Invalid magnet URI");
    return;
  }
  console.error("qbittorrent route error", err);
  res.status(500).send("Internal error");
};
