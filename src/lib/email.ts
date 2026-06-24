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
  themeColor: "#adfd02",
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
