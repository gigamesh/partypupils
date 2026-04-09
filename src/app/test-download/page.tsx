import { DownloadButtons } from "@/components/DownloadButtons";
import { DownloadZipButtons } from "@/components/DownloadZipButtons";

// Order 10: 2 individual tracks (trackId 196 + 200)
const ALA_CARTE_TOKEN = "f8d60b38-aa34-4bb8-b1ed-1ec1118393b6";
const TRACK_A = { id: 196, name: "Boz Scaggs - Lowdown (Party Pupils Remix)" };
const TRACK_B = { id: 200, name: "Christopher Cross x Party Pupils - Ride Like The Wind" };

// Order 7: release 17 (GOODIE BAGS VOL 8)
const RELEASE_17_TOKEN = "621b1a59-8ce0-49d8-afff-34f217c44b57";
const RELEASE_17 = {
  id: 17,
  name: "PARTY PUPILS - GOODIE BAGS - VOL 8",
  tracks: [
    { id: 223, name: "Bill Withers - Lovely Day (Party Pupils Remix)" },
    { id: 224, name: "Chic - Everybody Dance (Party Pupils Remix)" },
    { id: 225, name: "Craig David - Seven Days (Party Pupils Remix)" },
    { id: 226, name: "De La Soul - Breakadawn (Party Pupils Remix)" },
    { id: 227, name: "Lisa Stansfield - All Around The World (Party Pupils Remix)" },
    { id: 228, name: "Loleatta Holloway - Love Sensation (Party Pupils Remix)" },
    { id: 229, name: "Mary J. Blige - Real Love (Party Pupils Remix)" },
    { id: 230, name: "MJ - I Can't Help It (Party Pupils Remix)" },
    { id: 231, name: "Rod Stewart - Do Ya Think I'm Sexy- (Party Pupils Remix)" },
    { id: 232, name: "Sade - Smooth Operator (Party Pupils Remix)" },
    { id: 233, name: "SWV - Rain (Party Pupils Remix)" },
    { id: 234, name: "T.I. x Crystal Waters - Why You Wanna-Gypsy Woman (Party Pupils Remix)" },
  ],
};

// Order 8: release 18 (Yacht House Summer Vol 1)
const RELEASE_18_TOKEN = "07337b89-a8c2-4ea0-8507-3b021ecbe771";
const RELEASE_18 = {
  id: 18,
  name: "Yacht House Summer - Vol 1 - WAVs",
  tracks: [
    { id: 192, name: "Billy Ocean - Caribbean Queen (Party Pupils Remix)" },
    { id: 193, name: "Bobby Caldwell - What You Won't Do For Love (Party Pupils Remix) Extended" },
    { id: 194, name: "Bobby Caldwell - What You Won't Do For Love (Party Pupils Remix)" },
    { id: 195, name: "Boz Scaggs - Lowdown (Party Pupils Remix) Extended" },
    { id: 196, name: "Boz Scaggs - Lowdown (Party Pupils Remix)" },
    { id: 197, name: "Bruce Hornsby - The Way It Is (Party Pupils Remix) Extended" },
    { id: 198, name: "Bruce Hornsby - The Way It Is (Party Pupils Remix)" },
    { id: 199, name: "Caribbean Queen - Party Pupils Remix (Extended)" },
    { id: 200, name: "Christopher Cross x Party Pupils - Ride Like The Wind" },
    { id: 201, name: "Hall & Oates - I Can't Go For That (Party Pupils Remix)" },
    { id: 202, name: "How Much I Feel (Party Pupils Remix) Extended" },
    { id: 204, name: "Looking Glass - Brandy (Party Pupils Remix) Extended" },
    { id: 205, name: "Looking Glass - Brandy (Party Pupils Remix)" },
    { id: 207, name: "Spandau Ballet - True (Party Pupils Remix) Extended" },
    { id: 208, name: "Spandau Ballet - True (Party Pupils Remix)" },
    { id: 209, name: "Steely Dan - Peg (Party Pupils Remix) Extended" },
    { id: 210, name: "Steely Dan - Peg (Party Pupils Remix)" },
    { id: 206, name: "Ride Like The Wind (Party Pupils Remix) Extended" },
    { id: 191, name: "Ambrosia - How Much I Feel (Party Pupils Remix)" },
    { id: 203, name: "KC & The Sunshine Band - That's The Way I Like It (Party Pupils)" },
  ],
};

export default function TestDownloadPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-10">
      <h1>Download Test Page</h1>
      <p className="text-muted-foreground">
        Test all download scenarios. Verify Chrome shows native download progress.
      </p>

      {/* A-la-carte multi-track zip */}
      <div className="glass-panel rounded-lg p-6 space-y-4">
        <h2>1. A-La-Carte Tracks (with zip)</h2>
        <div className="border-b border-border pb-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">{TRACK_A.name}</p>
            <DownloadButtons token={ALA_CARTE_TOKEN} trackId={TRACK_A.id} availableFormats={["wav"]} />
          </div>
        </div>
        <div className="pb-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">{TRACK_B.name}</p>
            <DownloadButtons token={ALA_CARTE_TOKEN} trackId={TRACK_B.id} availableFormats={["wav"]} />
          </div>
        </div>
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">Download All Tracks</p>
            <DownloadZipButtons
              token={ALA_CARTE_TOKEN}
              trackIds={[TRACK_A.id, TRACK_B.id]}
              availableFormats={["wav"]}
            />
          </div>
        </div>
      </div>

      {/* Catalog-style: release purchases with zip + individual tracks */}
      <div className="glass-panel rounded-lg p-6 space-y-6">
        <h2>2. Complete Catalog Purchase</h2>
        <p className="text-sm text-muted-foreground">
          Simulates the &ldquo;Buy the Complete Catalog&rdquo; option from /music.
          Showing 2 releases from separate orders (no single order covers all 9 releases yet).
        </p>

        {/* Release 17 — from order 7 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium">{RELEASE_17.name}</p>
            <DownloadZipButtons
              token={RELEASE_17_TOKEN}
              releaseId={RELEASE_17.id}
              availableFormats={["wav"]}
            />
          </div>
          {RELEASE_17.tracks.map((track) => (
            <div
              key={track.id}
              className="border-b border-border pb-2 last:border-0 last:pb-0 pl-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm">{track.name}</span>
                <DownloadButtons token={RELEASE_17_TOKEN} trackId={track.id} availableFormats={["wav"]} />
              </div>
            </div>
          ))}
        </div>

        {/* Release 18 — from order 8 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium">{RELEASE_18.name}</p>
            <DownloadZipButtons
              token={RELEASE_18_TOKEN}
              releaseId={RELEASE_18.id}
              availableFormats={["wav"]}
            />
          </div>
          {RELEASE_18.tracks.map((track) => (
            <div
              key={track.id}
              className="border-b border-border pb-2 last:border-0 last:pb-0 pl-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm">{track.name}</span>
                <DownloadButtons token={RELEASE_18_TOKEN} trackId={track.id} availableFormats={["wav"]} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
