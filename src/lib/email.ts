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

export async function sendOrderLookupEmail(email: string, verifyUrl: string) {
  await resend().emails.send({
    from: env.EMAIL_FROM(),
    to: email,
    subject: `Your ${SITE_NAME} Downloads`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">${SITE_NAME}</h1>
        <p style="font-size: 16px; color: #333; line-height: 1.5;">
          Click the link below to access your order history and download your music.
        </p>
        <a href="${verifyUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
          View My Orders
        </a>
        <p style="font-size: 13px; color: #888; line-height: 1.5;">
          This link expires in 1 hour. If you didn&apos;t request this, you can safely ignore this email.
        </p>
      </div>
    `,
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
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">${SITE_NAME} — Contact Form</h1>
        <p style="font-size: 14px; color: #888; margin-bottom: 4px;"><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />
        <p style="font-size: 16px; color: #333; line-height: 1.6; white-space: pre-wrap;">${message}</p>
      </div>
    `,
  });
}
