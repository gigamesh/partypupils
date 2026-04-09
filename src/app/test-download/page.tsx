import { DownloadButtons } from "@/components/DownloadButtons";
import { DownloadZipButtons } from "@/components/DownloadZipButtons";

const TOKEN = "5581431d-1b69-4595-99b0-f889d0c51247";

const TRACK_A = { id: 196, name: "Boz Scaggs - Lowdown (Party Pupils Remix)" };
const TRACK_B = { id: 200, name: "Christopher Cross x Party Pupils - Ride Like The Wind" };
const TRACK_C = { id: 191, name: "Ambrosia - How Much I Feel (Party Pupils Remix)" };

const RELEASES = [
  {
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
  },
  {
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
  },
  {
    id: 16,
    name: "PARTY PUPILS - GOODIE BAGS - VOL 7",
    tracks: [
      { id: 237, name: "Al Green - Let's Stay Together (Party Pupils Remix)" },
      { id: 238, name: "Jagged Edge - Where The Party At (Party Pupils Remix)" },
      { id: 239, name: "Janet - Someone To Call My Lover (Party Pupils Remix)" },
      { id: 240, name: "Lloyd - Girls Around The World (Party Pupils Remix)" },
      { id: 241, name: "McFadden & Whitehead - Ain't No Stoppin' Us Now (Party Pupils Remix)" },
      { id: 242, name: "Monica - So Gone (Party Pupils Remix)" },
      { id: 244, name: "The Whispers - It's A Love Thing (Party Pupils Remix)" },
      { id: 245, name: "Tupac - I Get Around (Party Pupils Remix)" },
      { id: 246, name: "Wham! - Last Christmas (Party Pupils Remix)" },
      { id: 235, name: "The Doobie Brothers - What A Fool Believes (Party Pupils Remix)" },
      { id: 236, name: "Luther Vandross - Never Too Much (Party Pupils Remix)" },
    ],
  },
  {
    id: 15,
    name: "PARTY PUPILS - GOODIE BAGS - VOL 6",
    tracks: [
      { id: 253, name: "Janet Jackson - Put Your Hands On (Party Pupils Remix)" },
      { id: 254, name: "Kool & The Gang - Get Down On It (Party Pupils Remix)" },
      { id: 255, name: "Q-Tip - Vivrant Thing (Party Pupils Remix)" },
      { id: 256, name: "Rockwell - Somebody's Watching Me (Party Pupils Remix)" },
      { id: 257, name: "Sounds Of Blackness - Optimistic (Party Pupils Remix)" },
      { id: 258, name: "Teddy Pendergrass - You Can't Hide (Party Pupils Remix)" },
      { id: 248, name: "112 - Dance With Me (Party Pupils Remix)" },
      { id: 249, name: "Bobby Caldwell - My Flame (Party Pupils Remix)" },
      { id: 250, name: "Cece Peniston - Finally (Party Pupils Remix)" },
      { id: 251, name: "Ciara - One Two Step (Party Pupils Remix)" },
      { id: 252, name: "Frankie Beverly - Before I Let Go (Party Pupils Remix)" },
      { id: 247, name: "I Keep Forgettin' - Gigamesh x Party Pupils Remix" },
    ],
  },
  {
    id: 14,
    name: "PARTY PUPILS - GOODIE BAGS - VOL 5",
    tracks: [
      { id: 267, name: "Tinashe - Nasty (Party Pupils Remix)" },
      { id: 268, name: "Toni Braxton - So High (Party Pupils Remix)" },
      { id: 269, name: "Waka Flocka - Grove St Party (Party Pupils Remix)" },
      { id: 259, name: "Big Pun - Still Not A Player (Party Pupils Remix)" },
      { id: 260, name: "Chaka Khan - I'm Every Woman (Party Pupils Remix)" },
      { id: 261, name: "Dazz Band - Let's Whip (Party Pupils Remix)" },
      { id: 262, name: "George Benson - Give Me The Night (Party Pupils Remix)" },
      { id: 263, name: "James Brown - Sex Machine (Party Pupils Remix)" },
      { id: 264, name: "Janet - All For You (Party Pupils Remix)" },
      { id: 265, name: "Jungle - Back On 74 (Party Pupils Remix)" },
      { id: 266, name: "Sounds Of Blackness - Optimistic (Party Pupils Remix)" },
    ],
  },
  {
    id: 13,
    name: "PARTY PUPILS - GOODIE BAGS - VOL 4",
    tracks: [
      { id: 272, name: "Billie Eilish - My Boy (Party Pupils Remix)" },
      { id: 270, name: "50 Cent - 21 Questions (Party Pupils Remix)" },
      { id: 271, name: "50 Cent - Candy Shop (Party Pupils Remix)" },
      { id: 273, name: "Busta Rhymes - Woo Hah! (Party Pupils Remix)" },
      { id: 274, name: "Cardi B - Bodak Yellow (Party Pupils Remix)" },
      { id: 275, name: "Drake - Laugh Now, Cry Later (Party Pupils Remix)" },
      { id: 276, name: "Fugees - Ready Or Not (Party Pupils Remix)" },
      { id: 277, name: "Justin Timberlake - My Love (Party Pupils Remix)" },
      { id: 278, name: "ODB - Got Your Money (Party Pupils Remix)" },
      { id: 279, name: "Rihanna - BBHMM (Party Pupils Remix)" },
      { id: 280, name: "Savage Garden - I Want You (Party Pupils Remix)" },
      { id: 281, name: "T-Pain - Buy U A Drank (Party Pupils x Unheard Remix)" },
      { id: 282, name: "Waka Flocka - No Hands (Party Pupils Remix)" },
    ],
  },
  {
    id: 12,
    name: "PARTY PUPILS - GOODIE BAGS - VOL 3",
    tracks: [
      { id: 283, name: "Anderson Paak - Am I Wrong- (Party Pupils Remix)" },
      { id: 284, name: "ATCQ - Electric Relaxation (Party Pupils x Pat Lok Flip)" },
      { id: 285, name: "Jack Harlow - First Class (Party Pupils Remix)" },
      { id: 287, name: "Kendrick Lamar - LOVE (Party Pupils Remix)" },
      { id: 288, name: "Lil Baby - Drip Too Hard (Party Pupils Remix)" },
      { id: 289, name: "Lil Yachty x D.R.A.M. - Broccoli (Party Pupils Remix)" },
      { id: 290, name: "Nelly - Hot In Here (Party Pupils Remix)" },
      { id: 291, name: "Rihanna - Kiss It Better (Party Pupils Remix)" },
      { id: 292, name: "Rihanna - Wild Thoughts (Party Pupils Remix)" },
      { id: 293, name: "Tyla - Water (Party Pupils Remix)" },
      { id: 294, name: "Wham! - Everything She Wants (Party Pupils Remix)" },
      { id: 286, name: "Jadakiss & Styles P - We Gonna Make It (Party Pupils Instrumental Remix)" },
    ],
  },
  {
    id: 11,
    name: "PARTY PUPILS - GOODIE BAGS - VOL 2",
    tracks: [
      { id: 299, name: "Disclosure - Latch (Party Pupils Remix)" },
      { id: 295, name: "Beyoncé - Crazy In Love (Party Pupils Remix)" },
      { id: 296, name: "Blackbear - Shake Ya Ass (Party Pupils Remix)" },
      { id: 297, name: "Blackstreet - No Diggity (Party Pupils Remix)" },
      { id: 298, name: "Blü Cantrell x Snoop Dogg x Dr. Dre - Hit Em Up G Thang (Party Pupils Remix Mashup)" },
      { id: 300, name: "Groove Armada - I See You Baby (Party Pupils Remix)" },
      { id: 301, name: "Kelis - Milkshake (Party Pupils Remix)" },
      { id: 302, name: "Migos - Pure Water (Party Pupils Remix)" },
      { id: 303, name: "NexT - Too Close (Party Pupils Remix)" },
      { id: 304, name: "TLC - No Scrubs (Party Pupils Remix)" },
      { id: 305, name: "Whitney Houston - Dance With Somebody (Party Pupils Remix)" },
      { id: 306, name: "Will Smith - Gettin' Jiggy Wit It (Party Pupils Remix)" },
    ],
  },
  {
    id: 10,
    name: "PARTY PUPILS - GOODIE BAGS - VOL 1",
    tracks: [
      { id: 307, name: "Missy Elliott - Work It (Party Pupils Remix)" },
      { id: 308, name: "Amerie - 1 Thing (Party Pupils Remix)" },
      { id: 309, name: "Ariana Grande - 34 + 35 (Party Pupils Remix)" },
      { id: 310, name: "Black Box - Everybody Everybody (Party Pupils Remix)" },
      { id: 311, name: "Busta Rhymes - Put Your Hands Where My Eyes Can See (Party Pupils Remix)" },
      { id: 312, name: "James Brown - Sex Machine (Party Pupils)" },
      { id: 313, name: "Janet Jackson - If (Party Pupils Remix)" },
      { id: 314, name: "Kali Uchis - Telepatia (Party Pupils Remix)" },
      { id: 315, name: "Lauryn Hill - Doo Wop (That Thing) -Party Pupils Remix-" },
      { id: 316, name: "Ma$e - Feels So Good (Party Pupils Remix)" },
      { id: 317, name: "T-Pain - Can't Believe It (Party Pupils Remix)" },
      { id: 318, name: "Usher - U Don't Have To Call (Party Pupils Remix)" },
    ],
  },
];

export default function TestDownloadPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-10">
      <h1>Download Test Page</h1>
      <p className="text-muted-foreground">
        Test all download scenarios. Verify Chrome shows native download progress.
      </p>

      {/* Single track download */}
      <div className="glass-panel rounded-lg p-6 space-y-4">
        <h2>1. Single Track Download</h2>
        <div className="flex items-center justify-between">
          <p className="text-sm">{TRACK_A.name}</p>
          <DownloadButtons token={TOKEN} trackId={TRACK_A.id} availableFormats={["wav"]} />
        </div>
      </div>

      {/* A-la-carte multi-track zip */}
      <div className="glass-panel rounded-lg p-6 space-y-4">
        <h2>2. A-La-Carte Tracks (with zip)</h2>
        <div className="border-b border-border pb-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">{TRACK_A.name}</p>
            <DownloadButtons token={TOKEN} trackId={TRACK_A.id} availableFormats={["wav"]} />
          </div>
        </div>
        <div className="border-b border-border pb-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">{TRACK_B.name}</p>
            <DownloadButtons token={TOKEN} trackId={TRACK_B.id} availableFormats={["wav"]} />
          </div>
        </div>
        <div className="pb-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">{TRACK_C.name}</p>
            <DownloadButtons token={TOKEN} trackId={TRACK_C.id} availableFormats={["wav"]} />
          </div>
        </div>
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">Download All Tracks</p>
            <DownloadZipButtons
              token={TOKEN}
              trackIds={[TRACK_A.id, TRACK_B.id, TRACK_C.id]}
              availableFormats={["wav"]}
            />
          </div>
        </div>
      </div>

      {/* Complete Catalog purchase — all releases, each with zip + individual tracks */}
      <div className="glass-panel rounded-lg p-6 space-y-6">
        <h2>3. Complete Catalog Purchase</h2>
        <p className="text-sm text-muted-foreground">
          Simulates the &ldquo;Buy the Complete Catalog&rdquo; option from /music.
          All 9 releases, each with its own ZIP button and individual track downloads.
        </p>
        {RELEASES.map((release) => (
          <div key={release.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">{release.name}</p>
              <DownloadZipButtons
                token={TOKEN}
                releaseId={release.id}
                availableFormats={["wav"]}
              />
            </div>
            {release.tracks.map((track) => (
              <div
                key={track.id}
                className="border-b border-border pb-2 last:border-0 last:pb-0 pl-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm">{track.name}</span>
                  <DownloadButtons token={TOKEN} trackId={track.id} availableFormats={["wav"]} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
