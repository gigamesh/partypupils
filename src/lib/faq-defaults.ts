import { FaqContentSchema, type FaqContent } from "./faq-schema";

/** Canonical default FAQ content — used when the `faq_content` site setting is missing or invalid. */
const RAW_DEFAULTS: FaqContent = {
  items: [
    {
      id: "mobile-downloads",
      question: "How do I download my purchases to my mobile device?",
      answer:
        '<p>You can download the files to your mobile device by clicking on the download link you receive when you make a purchase. The music files will download to wherever your device stores local files.</p><p>It is highly suggested that you also download your files to your desktop computer, as you will need to do this in order to use iTunes/Apple Music.</p>',
    },
    {
      id: "spotify",
      question: "How do I listen on Spotify?",
      answer:
        '<p>After you&rsquo;ve purchased and downloaded an album, <a href="https://support.spotify.com/us/article/local-files/" target="_blank" rel="noopener noreferrer">follow these steps</a>.</p>',
    },
    {
      id: "apple-music",
      question: "How do I listen to this on Apple Music?",
      answer:
        '<p>After you&rsquo;ve purchased and downloaded an album, <a href="https://support.apple.com/en-us/108347" target="_blank" rel="noopener noreferrer">follow these steps</a>.</p>',
    },
    {
      id: "remixes-streaming",
      question:
        "Why are these remixes not available to stream accessibly on all streaming apps?",
      answer:
        "<p>It&rsquo;s a complicated licensing issue. The music business is still catching up with the current technology, which creates copyright issues with some platforms. My team and I are constantly in the process of making as many remixes official as we possibly can.</p>",
    },
  ],
  video: {
    url: "https://www.youtube.com/shorts/LOppa3dOl14",
    heading:
      "Please watch this video and read the section below if you have any questions about downloading & listening.",
  },
};

export const FAQ_DEFAULTS: FaqContent = FaqContentSchema.parse(RAW_DEFAULTS);

export const FAQ_SETTING_KEY = "faq_content";
