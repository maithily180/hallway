import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  campusEmail,
  getSessionUser,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  userFromEmail,
  verifySession,
} from "@/lib/auth/session";

const maya = userFromEmail("maya@demo.edu");

beforeEach(() => vi.stubEnv("AUTH_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

describe("session", () => {
  it("accepts only emails on the campus domain", () => {
    expect(campusEmail(" Maya@Demo.edu ", "demo.edu")).toBe("maya@demo.edu");
    expect(campusEmail("maya@gmail.com", "demo.edu")).toBeNull();
    expect(campusEmail("maya@evil-demo.edu", "demo.edu")).toBeNull();
    expect(campusEmail("maya@demo.edu", "")).toBeNull();
  });

  it("derives the demo user id from the email", () => {
    expect(maya).toEqual({ id: "maya", email: "maya@demo.edu", name: "Maya" });
  });

  it("round-trips a signed session", async () => {
    expect(await verifySession(await signSession(maya))).toEqual(maya);
  });

  it("rejects tampered, expired and foreign-secret tokens", async () => {
    const token = await signSession(maya);
    const [payload, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ ...maya, id: "leo", exp: Date.now() + 1e6 })).replace(/=+$/, "");
    expect(await verifySession(`${forged}.${sig}`)).toBeNull();
    expect(await verifySession(`${payload}.`)).toBeNull();
    expect(await verifySession(token, Date.now() + (SESSION_TTL_SECONDS + 1) * 1000)).toBeNull();
    vi.stubEnv("AUTH_SECRET", "other");
    expect(await verifySession(token)).toBeNull();
  });

  it("reads the user from the request cookie", async () => {
    const req = new Request("http://x", { headers: { cookie: `a=1; ${SESSION_COOKIE}=${await signSession(maya)}` } });
    expect(await getSessionUser(req)).toEqual(maya);
    expect(await getSessionUser(new Request("http://x"))).toBeNull();
  });
});
