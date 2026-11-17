const DEFAULT_UA = "SEOKeywordRadar/1.0 (+https://localhost; early-keyword research)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const nextAt = new Map<string, number>();

export type FetchResult = { ok: boolean; status: number; text: string; url: string };

type FetchOpts = {
  intervalMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  hostKey?: string;
  maxBytes?: number;
  browser?: boolean;
  method?: string;
  body?: string;
};

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function pace(key: string, interval: number) {
  if (!interval) return;
  const now = Date.now();
  const at = nextAt.get(key) ?? 0;
  const wait = at - now;
  nextAt.set(key, Math.max(now, at) + interval);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function readLimited(res: Response, maxBytes: number) {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const room = maxBytes - received;
    if (value.byteLength > room) {
      chunks.push(value.slice(0, room));
      received += room;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    received += value.byteLength;
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<FetchResult> {
  const key = opts.hostKey ?? hostOf(url);
  await pace(key, opts.intervalMs ?? 0);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      body: opts.body,
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": opts.browser ? BROWSER_UA : DEFAULT_UA,
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        ...opts.headers,
      },
    });
    const buf = await readLimited(res, opts.maxBytes ?? 1_500_000);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return { ok: res.ok, status: res.status, text, url: res.url || url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, text: message, url };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const res = await fetchText(url, { ...opts, headers: { accept: "application/json", ...opts.headers } });
  if (!res.ok) return { ok: false, status: res.status, data: null, text: res.text.slice(0, 400) };
  try {
    return { ok: true, status: res.status, data: JSON.parse(res.text) as T, text: res.text };
  } catch {
    return { ok: false, status: res.status, data: null, text: res.text.slice(0, 400) };
  }
}

type RobotRules = { allow: string[]; disallow: string[]; sitemaps: string[] };
const robotsCache = new Map<string, RobotRules>();

function parseRobots(text: string): RobotRules {
  const lines = text.split(/\r?\n/);
  let capture = false;
  const allow: string[] = [];
  const disallow: string[] = [];
  const sitemaps: string[] = [];
  for (const lineRaw of lines) {
    const line = lineRaw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      capture = value === "*";
    } else if (key === "sitemap" && value) {
      sitemaps.push(value);
    } else if (capture && key === "allow") {
      allow.push(value);
    } else if (capture && key === "disallow") {
      disallow.push(value);
    }
  }
  return { allow, disallow, sitemaps };
}

function pathAllowed(pathname: string, rules: RobotRules) {
  let best: { len: number; allow: boolean } | null = null;
  for (const rule of rules.disallow) {
    if (rule && pathname.startsWith(rule) && (!best || rule.length > best.len)) best = { len: rule.length, allow: false };
  }
  for (const rule of rules.allow) {
    if (rule && pathname.startsWith(rule) && (!best || rule.length >= best.len)) best = { len: rule.length, allow: true };
  }
  return best ? best.allow : true;
}

export async function readRobots(origin: string): Promise<RobotRules | null> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  const res = await fetchText(`${origin}/robots.txt`, { intervalMs: 600, timeoutMs: 8000, hostKey: hostOf(origin) });
  if (!res.ok) return null;
  const rules = parseRobots(res.text);
  robotsCache.set(origin, rules);
  return rules;
}

export async function robotsAllows(target: string): Promise<"allow" | "deny" | "unknown"> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return "deny";
  }
  const rules = await readRobots(url.origin);
  if (!rules) return "unknown";
  return pathAllowed(url.pathname || "/", rules) ? "allow" : "deny";
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
