import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "./db";

const COOKIE = "ci_session";
const SECRET = process.env.SESSION_SECRET ?? "dev-only-secret-change-me";

export type User = {
  id: number;
  contact: string;
  contact_type: "email" | "phone";
  name: string | null;
  verified: number;
};

function sign(value: string): string {
  const mac = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${mac}`;
}

function verify(signed: string | undefined): string | null {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const expected = sign(value);
  // timing-veilige vergelijking
  const a = Buffer.from(signed);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

export function setSession(userId: number) {
  cookies().set(COOKIE, sign(String(userId)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}

export function currentUser(): User | null {
  const raw = cookies().get(COOKIE)?.value;
  const userId = verify(raw);
  if (!userId) return null;
  const user = db
    .prepare(
      "SELECT id, contact, contact_type, name, verified FROM users WHERE id = ? AND verified = 1"
    )
    .get(Number(userId)) as User | undefined;
  return user ?? null;
}
