import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const secret = () => new TextEncoder().encode(env.ADMIN_SECRET());

export async function createOrderVerificationToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret());
}

export async function verifyOrderVerificationToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload.email as string) || null;
  } catch {
    return null;
  }
}
