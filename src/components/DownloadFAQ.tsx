/** Static FAQ rendered on the post-purchase page and on the order-verification page. */
export function DownloadFAQ() {
  return (
    <div className="glass-panel rounded-lg border p-6 space-y-5">
      <h2>Download FAQ</h2>

      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">
          How do I download my purchases to my mobile device?
        </h3>
        <p className="text-sm text-muted-foreground">
          You can download the files to your mobile device by clicking on the
          download link you receive when you make a purchase. The music files
          will download to wherever your device stores local files.
        </p>
        <p className="text-sm text-muted-foreground">
          It is highly suggested that you also download your files to your
          desktop computer, as you will need to do this in order to use
          iTunes/Apple Music.
        </p>
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">How do I listen on Spotify?</h3>
        <p className="text-sm text-muted-foreground">
          After you&rsquo;ve purchased and downloaded an album,{" "}
          <a
            href="https://support.spotify.com/us/article/local-files/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            follow these steps
          </a>
          .
        </p>
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">
          How do I listen to this on Apple Music?
        </h3>
        <p className="text-sm text-muted-foreground">
          After you&rsquo;ve purchased and downloaded an album,{" "}
          <a
            href="https://support.apple.com/en-us/108347"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            follow these steps
          </a>
          .
        </p>
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">
          Why are these remixes not available to stream accessibly on all
          streaming apps?
        </h3>
        <p className="text-sm text-muted-foreground">
          It&rsquo;s a complicated licensing issue. The music business is
          still catching up with the current technology, which creates
          copyright issues with some platforms. My team and I are constantly
          in the process of making as many remixes official as we possibly
          can.
        </p>
      </div>
    </div>
  );
}
