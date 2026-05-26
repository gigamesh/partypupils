import {
  createResendProvider,
  renderContactForm,
  renderOrderLookup,
  renderPurchaseConfirmation,
  type EmailBranding,
} from "@gigamusic/email";
import { SITE_NAME } from "./constants";
import { env } from "./env";

const BRANDING: EmailBranding = {
  siteName: SITE_NAME,
  themeColor: "#adfd02",
};

let _provider: ReturnType<typeof createResendProvider> | undefined;
function provider() {
  if (!_provider) {
    _provider = createResendProvider({ apiKey: env.RESEND_API_KEY() });
  }
  return _provider;
}

/** HTML body for the magic-link email that lets a customer re-access orders. */
export function orderLookupEmailHtml(verifyUrl: string): string {
  return renderOrderLookup({ branding: BRANDING, verifyUrl }).html;
}

/** HTML body for the post-purchase confirmation email with a download link. */
export function purchaseConfirmationEmailHtml(
  verifyUrl: string,
  itemNames: string[],
  totalCents = 0,
): string {
  return renderPurchaseConfirmation({
    branding: BRANDING,
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
    branding: BRANDING,
    fromName: name,
    fromEmail: email,
    message,
  }).html;
}

export async function sendOrderLookupEmail(email: string, verifyUrl: string) {
  const { subject, html } = renderOrderLookup({ branding: BRANDING, verifyUrl });
  await provider().send({
    from: env.EMAIL_FROM(),
    to: email,
    subject,
    html,
  });
}

/** Send a purchase confirmation email with a link to download music. */
export async function sendPurchaseConfirmationEmail(
  email: string,
  verifyUrl: string,
  itemNames: string[],
  totalCents = 0,
) {
  const { subject, html } = renderPurchaseConfirmation({
    branding: BRANDING,
    verifyUrl,
    itemNames,
    totalCents,
  });
  await provider().send({
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
    branding: BRANDING,
    fromName: name,
    fromEmail: email,
    message,
  });
  await provider().send({
    from: env.EMAIL_FROM(),
    to: env.CONTACT_EMAIL(),
    replyTo: email,
    subject,
    html,
  });
}
