import { Download } from "lucide-react";
import "./MediaPreview.css";

export interface MediaPreviewInfo {
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  availability: "available" | "unknown" | "unavailable";
}

export function MediaPreview({ media, src }: { media: MediaPreviewInfo; src: string }) {
  return (
    <div className="media-preview">
      <div className="media-preview-meta text-sm muted mono">
        {media.fileName ?? "media"} · {media.mimeType ?? "unknown type"} ·{" "}
        {media.sizeBytes ? `${Math.round(media.sizeBytes / 1024)} KB` : "size unknown"} · {media.availability}
      </div>
      {media.mimeType?.startsWith("video/") ? (
        <video controls className="media-preview-visual" src={src} />
      ) : media.mimeType?.startsWith("image/") ? (
        <img alt={media.fileName ?? "media preview"} className="media-preview-visual" src={src} />
      ) : (
        <a href={src} className="media-preview-download">
          <Download size={14} aria-hidden="true" />
          Download {media.fileName ?? "media"}
        </a>
      )}
    </div>
  );
}
