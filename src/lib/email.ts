import {
  createResendProvider,
  renderContactForm,
  renderOrderLookup,
  renderPurchaseConfirmation,
  type EmailBranding,
} from "@gigamusic/email";
import { SITE_NAME } from "./constants";
import { env } from "./env";

export const EMAIL_BRANDING: EmailBranding = {
  siteName: SITE_NAME,
  themeColor: "#efff0a",
  // Match the site's body typography (Inter) with system fallbacks, since email
  // clients can't reliably load web fonts. Rounded CTAs mirror the site buttons.
  theme: {
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    buttonRadius: "8px",
  },
};

let _provider: ReturnType<typeof createResendProvider> | undefined;
export function emailProvider() {
  if (!_provider) {
    _provider = createResendProvider({ apiKey: env.RESEND_API_KEY() });
  }
  return _provider;
}

/** HTML body for the magic-link email that lets a customer re-access orders. */
export function orderLookupEmailHtml(verifyUrl: string): string {
  return renderOrderLookup({ branding: EMAIL_BRANDING, verifyUrl }).html;
}

/** HTML body for the post-purchase confirmation email with a download link. */
export function purchaseConfirmationEmailHtml(
  verifyUrl: string,
  itemNames: string[],
  totalCents = 0,
): string {
  return renderPurchaseConfirmation({
    branding: EMAIL_BRANDING,
    verifyUrl,
    itemNames,
    totalCents,
  }).html;
}

/** HTML body for a contact-form submission forwarded to the site owner. */
export function contactEmailHtml({
  name,
  email,
  message,
}: {
  name: string;
  email: string;
  message: string;
}): string {
  return renderContactForm({
    branding: EMAIL_BRANDING,
    fromName: name,
    fromEmail: email,
    message,
  }).html;
}

// The one sentence in `renderPurchaseConfirmation`'s body that is wrong for a
// support reissue — the customer bought this days ago and re-sending "Thank you
// for your purchase!" reads like a second charge. Everything else in that
// template (branding shell, item list, total, download CTA) is exactly what a
// reissue wants, so we swap the sentence rather than fork the template.
const CONFIRMATION_INTRO =
  "Thank you for your purchase! Your music is ready to download.";

function reissueIntro(expiryDays: number): string {
  return `We&apos;ve refreshed the download link for your order — the one below replaces any earlier link and works for the next ${expiryDays} days.`;
}

/**
 * Subject + HTML for the admin-initiated "reissue downloads" email.
 *
 * Composed from `renderPurchaseConfirmation` so the reissue can never drift
 * from the branding, layout, and item formatting of the email the customer
 * originally received. If the upstream intro sentence ever changes, the
 * replacement is a no-op and the customer still gets a valid, correctly branded
 * email carrying the new link — a stale sentence, not a broken send.
 */
export function renderDownloadReissue(args: {
  verifyUrl: string;
  itemNames: string[];
  totalCents: number;
  expiryDays: number;
}): { subject: string; html: string } {
  const { html } = renderPurchaseConfirmation({
    branding: EMAIL_BRANDING,
    verifyUrl: args.verifyUrl,
    itemNames: args.itemNames,
    totalCents: args.totalCents,
  });

  return {
    subject: `Your ${EMAIL_BRANDING.siteName} Download Link`,
    html: html.replace(CONFIRMATION_INTRO, reissueIntro(args.expiryDays)),
  };
}

/** Send the reissued magic link. Throws on provider failure so the admin sees it. */
export async function sendDownloadReissueEmail(args: {
  to: string;
  verifyUrl: string;
  itemNames: string[];
  totalCents: number;
  expiryDays: number;
}) {
  const { subject, html } = renderDownloadReissue(args);
  await emailProvider().send({
    from: env.EMAIL_FROM(),
    to: args.to,
    subject,
    html,
  });
}

export async function sendOrderLookupEmail(email: string, verifyUrl: string) {
  const { subject, html } = renderOrderLookup({ branding: EMAIL_BRANDING, verifyUrl });
  await emailProvider().send({
    from: env.EMAIL_FROM(),
    to: email,
    subject,
    html,
  });
}

/** Forward a contact form submission to the site owner. */
export async function sendContactEmail({
  name,
  email,
  message,
}: {
  name: string;
  email: string;
  message: string;
}) {
  const { subject, html } = renderContactForm({
    branding: EMAIL_BRANDING,
    fromName: name,
    fromEmail: email,
    message,
  });
  await emailProvider().send({
    from: env.EMAIL_FROM(),
    to: env.CONTACT_EMAIL(),
    replyTo: email,
    subject,
    html,
  });
}
