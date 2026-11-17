import { createHash, createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "radar_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 14;

export function authConfigured() {
  return Boolean(process.env.APP_PASSWORD);
}

export function publicAccess() {
  return !process.env.APP_PASSWORD && process.env.PUBLIC_ACCESS === "true";
}

export function authRequired() {
  if (publicAccess()) return false;
  return authConfigured() || process.env.NODE_ENV === "production";
}

export function signSession(password: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  const body = String(exp);
  const sig = createHmac("sha256", password).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined, password: string) {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(body);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = createHmac("sha256", password).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function passwordsMatch(input: string, expected: string) {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function readCookie(header: string, name: string) {
  for (const part of header.split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index) === name) {
      return decodeURIComponent(part.slice(index + 1));
    }
  }
  return "";
}

export function sessionCookie(token: string, secure: boolean) {
  const bits = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_SECONDS}`,
  ];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

export function clearSessionCookie(secure: boolean) {
  const bits = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

export function requestIsSecure(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto");
  return forwarded === "https" || new URL(request.url).protocol === "https:";
}

export function guard(request: Request): Response | null {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV !== "production" || publicAccess()) return null;
    return Response.json({ error: "未配置 APP_PASSWORD，已拒绝公开访问" }, { status: 503 });
  }
  const token = readCookie(request.headers.get("cookie") || "", SESSION_COOKIE);
  if (verifySession(token, password)) return null;
  return Response.json({ error: "需要登录" }, { status: 401 });
}

export function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}
