import type { Metadata } from "next";
import {
  contactEmailHtml,
  orderLookupEmailHtml,
  purchaseConfirmationEmailHtml,
} from "@/lib/email";

export const metadata: Metadata = {
  title: "Email Previews",
};

const SAMPLE_VERIFY_URL = "https://partypupils.com/orders/verify?token=preview";

const EMAILS = [
  {
    name: "Purchase confirmation",
    description:
      "Sent after a successful checkout — contains the download link.",
    html: purchaseConfirmationEmailHtml(SAMPLE_VERIFY_URL, [
      "Yacht House Summer - Vol 2",
      "Goodie Bags Vol 6",
    ]),
  },
  {
    name: "Order lookup",
    description:
      "Magic link emailed to a returning customer to re-access their downloads.",
    html: orderLookupEmailHtml(SAMPLE_VERIFY_URL),
  },
  {
    name: "Contact form",
    description: "Forwarded to the site owner when a visitor sends a message.",
    html: contactEmailHtml({
      name: "Jane Doe",
      email: "jane@example.com",
      message: "Love the new record! Any chance of a vinyl pressing?",
    }),
  },
];

/** Wraps email HTML in a standalone document so the iframe is style-isolated. */
function lightDoc(html: string): string {
  return `<!doctype html><html><body style="margin:0;background:#ffffff;">${html}</body></html>`;
}

/**
 * Dark-mode preview. Forces light-styled text to a light color the way a mail
 * client's auto-dark-mode would, while leaving the action button's explicit
 * colors intact — that button is the thing being verified here.
 */
function darkDoc(html: string): string {
  return `<!doctype html><html><head><style>body{margin:0;background:#1c1c1e;}h1,p,li,strong{color:#e8e8e8 !important;}</style></head><body>${html}</body></html>`;
}

export default function EmailPreviewsPage() {
  return (
    <div>
      <h1>Email Previews</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-2xl">
        How each transactional email renders. The dark-mode column approximates
        a phone in night mode — real mail clients vary, but the key check is
        that the action button stays clearly visible.
      </p>

      <div className="space-y-10">
        {EMAILS.map((email) => (
          <section key={email.name}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {email.name}
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              {email.description}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Light mode
                </div>
                <iframe
                  title={`${email.name} — light mode`}
                  srcDoc={lightDoc(email.html)}
                  className="w-full h-[500px] rounded-lg border border-border"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Dark mode
                </div>
                <iframe
                  title={`${email.name} — dark mode`}
                  srcDoc={darkDoc(email.html)}
                  className="w-full h-[500px] rounded-lg border border-border"
                />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
