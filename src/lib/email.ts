import { Resend } from "resend";
import { SITE_NAME } from "./constants";
import { env } from "./env";

let _resend: Resend;

function resend() {
  if (!_resend) {
    _resend = new Resend(env.RESEND_API_KEY());
  }
  return _resend;
}

/** HTML body for the magic-link email that lets a customer re-access orders. */
export function orderLookupEmailHtml(verifyUrl: string): string {
  return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">${SITE_NAME}</h1>
        <p style="font-size: 16px; color: #333; line-height: 1.5;">
          Click the link below to access your order history and download your music.
        </p>
        <a href="${verifyUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background-color: #adfd02; color: #000; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
          View My Orders
        </a>
        <p style="font-size: 13px; color: #888; line-height: 1.5;">
          This link expires in 1 hour. If you didn&apos;t request this, you can safely ignore this email.
        </p>
      </div>
    `;
}

/** HTML body for the post-purchase confirmation email with a download link. */
export function purchaseConfirmationEmailHtml(
  verifyUrl: string,
  itemNames: string[],
): string {
  const itemList = itemNames
    .map((name) => `<li style="padding: 4px 0;">${name}</li>`)
    .join("");

  return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">${SITE_NAME}</h1>
        <p style="font-size: 16px; color: #333; line-height: 1.5;">
          Thank you for your purchase! Your music is ready to download.
        </p>
        <ul style="font-size: 15px; color: #333; line-height: 1.6; padding-left: 20px;">
          ${itemList}
        </ul>
        <a href="${verifyUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background-color: #adfd02; color: #000; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
          Download My Music
        </a>
        <p style="font-size: 13px; color: #888; line-height: 1.5;">
          You can always access your downloads from the <strong>My Orders</strong> page on our site.
        </p>
      </div>
    `;
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
  return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">${SITE_NAME} — Contact Form</h1>
        <p style="font-size: 14px; color: #888; margin-bottom: 4px;"><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />
        <p style="font-size: 16px; color: #333; line-height: 1.6; white-space: pre-wrap;">${message}</p>
      </div>
    `;
}

export async function sendOrderLookupEmail(email: string, verifyUrl: string) {
  await resend().emails.send({
    from: env.EMAIL_FROM(),
    to: email,
    subject: `Your ${SITE_NAME} Downloads`,
    html: orderLookupEmailHtml(verifyUrl),
  });
}

/** Send a purchase confirmation email with a link to download music. */
export async function sendPurchaseConfirmationEmail(
  email: string,
  verifyUrl: string,
  itemNames: string[],
) {
  await resend().emails.send({
    from: env.EMAIL_FROM(),
    to: email,
    subject: `Your ${SITE_NAME} Purchase`,
    html: purchaseConfirmationEmailHtml(verifyUrl, itemNames),
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
  await resend().emails.send({
    from: env.EMAIL_FROM(),
    to: env.CONTACT_EMAIL(),
    replyTo: email,
    subject: `[${SITE_NAME}] Message from ${name}`,
    html: contactEmailHtml({ name, email, message }),
  });
}
