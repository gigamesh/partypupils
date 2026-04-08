/** Validated environment variables. Throws at first access if any are missing. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function lazy(name: string, fallback?: () => string | undefined): () => string {
  let cached: string | undefined;
  return () => {
    if (cached === undefined) {
      const value = process.env[name] || fallback?.();
      if (!value)
        throw new Error(`Missing required environment variable: ${name}`);
      cached = value;
    }
    return cached;
  };
}

export const env = {
  NEXT_PUBLIC_BASE_URL: lazy("NEXT_PUBLIC_BASE_URL", () => {
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return undefined;
  }),
  DATABASE_URL: lazy("DATABASE_URL"),
  STRIPE_SECRET_KEY: lazy("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: lazy("STRIPE_WEBHOOK_SECRET"),
  ADMIN_SECRET: lazy("ADMIN_SECRET"),
  ADMIN_PASSWORD: lazy("ADMIN_PASSWORD"),
  RESEND_API_KEY: lazy("RESEND_API_KEY"),
  EMAIL_FROM: lazy("EMAIL_FROM"),
  CONTACT_EMAIL: lazy("CONTACT_EMAIL"),
  R2_ACCOUNT_ID: lazy("R2_ACCOUNT_ID"),
  R2_ACCESS_KEY_ID: lazy("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: lazy("R2_SECRET_ACCESS_KEY"),
  R2_BUCKET_NAME: lazy("R2_BUCKET_NAME"),
  R2_PUBLIC_URL: lazy("R2_PUBLIC_URL"),
};
