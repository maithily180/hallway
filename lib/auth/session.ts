export const SESSION_COOKIE = "hallway_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
  return "hallway-dev-secret";
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Normalised campus email, or null when it is not on the campus domain. */
export function campusEmail(email: string, domain = process.env.CAMPUS_EMAIL_DOMAIN ?? ""): string | null {
  const e = email.trim().toLowerCase();
  const d = domain.trim().toLowerCase().replace(/^@/, "");
  if (!d || !/^[^\s@]+@[^\s@]+$/.test(e)) return null;
  return e.endsWith(`@${d}`) ? e : null;
}

/** Session user for an email; the id is the local part ("maya@demo.edu" → "maya") until users live in the DB. */
export function userFromEmail(email: string): SessionUser {
  const local = email.split("@")[0];
  const name = local.split(/[._-]/)[0];
  return { id: local, email, name: name.charAt(0).toUpperCase() + name.slice(1) };
}

/** Signed cookie value: payload.signature, both base64url. */
export async function signSession(user: SessionUser, now = Date.now()): Promise<string> {
  const payload = b64url(encoder.encode(JSON.stringify({ ...user, exp: now + SESSION_TTL_SECONDS * 1000 })));
  return `${payload}.${b64url(await hmac(payload))}`;
}

/** Verifies a cookie value; null when missing, tampered with or expired. */
export async function verifySession(token: string | undefined, now = Date.now()): Promise<SessionUser | null> {
  const [payload, sig] = token?.split(".") ?? [];
  if (!payload || !sig) return null;
  try {
    if (!sameBytes(fromB64url(sig), await hmac(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (typeof data.exp !== "number" || data.exp < now) return null;
    return { id: data.id, email: data.email, name: data.name };
  } catch {
    return null;
  }
}

function readCookie(header: string | null, name: string): string | undefined {
  return header
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** Current user for API routes, from the session cookie. */
export function getSessionUser(req: Request): Promise<SessionUser | null> {
  return verifySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
}
