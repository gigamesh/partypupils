import { DownloadButtons } from "@/components/DownloadButtons";
import { DownloadZipButtons } from "@/components/DownloadZipButtons";
import { formatCurrency } from "@/lib/utils";

interface TrackShape {
  id: number;
  name: string;
  files: { format: string }[];
}

interface ReleaseTrack extends TrackShape {
  trackNumber: number;
}

interface OrderItemShape {
  id: number;
  release: {
    id: number;
    name: string;
    tracks: ReleaseTrack[];
  } | null;
  track:
    | (TrackShape & {
        release: { name: string } | null;
      })
    | null;
}

interface OrderShape {
  amountTotal: number;
  items: OrderItemShape[];
}

function collectFormats(order: OrderShape): string[] {
  const formats = new Set<string>();
  for (const item of order.items) {
    if (item.release) {
      for (const track of item.release.tracks) {
        for (const file of track.files) formats.add(file.format);
      }
    }
    if (item.track) {
      for (const file of item.track.files) formats.add(file.format);
    }
  }
  return [...formats];
}

function countTracks(order: OrderShape): number {
  return order.items.reduce(
    (sum, item) =>
      sum + (item.release?.tracks.length ?? 0) + (item.track ? 1 : 0),
    0,
  );
}

/**
 * Customer-facing downloads panel shared by the post-checkout success page,
 * the email-magic-link orders view, and the admin demo view. Renders the
 * order total + a single order-wide ZIP control at the top, then a flat list
 * of every track with per-track download buttons.
 */
export function OrderDownloads({
  order,
  token,
}: {
  order: OrderShape;
  token: string | null | undefined;
}) {
  const formats = collectFormats(order);
  const showZip = token && countTracks(order) >= 2 && formats.length > 0;

  const trackButtonClass =
    "w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-initial";

  return (
    <div className="glass-panel rounded-lg border p-6 space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Order total
        </p>
        <p className="text-lg font-semibold">
          {formatCurrency(order.amountTotal)}
        </p>
      </div>

      {showZip && (
        <div className="space-y-2">
          <span className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Download all
          </span>
          <DownloadZipButtons
            manifestEndpoint={`/download/${token}/zip`}
            availableFormats={formats}
            className={trackButtonClass}
          />
        </div>
      )}

      <div className="border-t border-border pt-4 space-y-5">
        {order.items.map((item) => {
          if (item.release) {
            return (
              <div key={item.id} className="space-y-3">
                <p className="font-medium">{item.release.name}</p>
                {item.release.tracks.map((track) => (
                  <div
                    key={track.id}
                    className="border-b border-border pb-3 last:border-0 last:pb-0 pl-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="text-sm">
                        {track.trackNumber}. {track.name}
                      </span>
                      {token && (
                        <DownloadButtons
                          formats={track.files.map((f) => ({
                            format: f.format,
                            href: `/download/${token}?trackId=${track.id}&format=${f.format}`,
                          }))}
                          className={trackButtonClass}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          }
          if (item.track) {
            return (
              <div
                key={item.id}
                className="border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div>
                    <p className="font-medium">{item.track.name}</p>
                    {item.track.release && (
                      <p className="text-xs text-muted-foreground">
                        {item.track.release.name}
                      </p>
                    )}
                  </div>
                  {token && (
                    <DownloadButtons
                      formats={item.track.files.map((f) => ({
                        format: f.format,
                        href: `/download/${token}?trackId=${item.track!.id}&format=${f.format}`,
                      }))}
                      className={trackButtonClass}
                    />
                  )}
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
