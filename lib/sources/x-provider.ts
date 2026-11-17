import { fetchJson } from "../http";
import { readCache, writeCache } from "./cache";
import { parseXSearch, parseXTweets, parseXUser, type ParsedPost, type ParsedUser } from "./x-parse";

export type XMode = "official" | "generic";

export function xProviderMode(): XMode | null {
  const prefer = process.env.X_PROVIDER;
  const generic = Boolean(process.env.X_PROVIDER_BASE_URL && process.env.X_PROVIDER_API_KEY);
  const official = Boolean(process.env.X_BEARER_TOKEN);
  if (prefer === "generic" && generic) return "generic";
  if (prefer === "official" && official) return "official";
  if (official) return "official";
  if (generic) return "generic";
  return null;
}

export function xProviderConfigured() {
  return xProviderMode() != null;
}

function headers(): Record<string, string> {
  if (xProviderMode() === "generic") {
    const key = process.env.X_PROVIDER_API_KEY || "";
    if ((process.env.X_PROVIDER_AUTH || "bearer") === "x-api-key") return { "x-api-key": key };
    return { authorization: `Bearer ${key}` };
  }
  return { authorization: `Bearer ${process.env.X_BEARER_TOKEN || ""}` };
}

function base() {
  return (process.env.X_PROVIDER_BASE_URL || "https://api.x.com/2").replace(/\/$/, "");
}

async function getJson(url: string, cacheKey: string, ttlMs: number, bypass: boolean) {
  if (!bypass) {
    const cached = readCache(cacheKey, ttlMs);
    if (cached) {
      try {
        return JSON.parse(cached) as unknown;
      } catch {
        /* fetch again */
      }
    }
  }
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "x-provider";
    }
  })();
  const res = await fetchJson(url, { headers: headers(), intervalMs: 800, timeoutMs: 12000, hostKey: host });
  if (!res.ok || res.data == null) return null;
  writeCache(cacheKey, JSON.stringify(res.data));
  return res.data;
}

export async function fetchXProfile(handle: string, bypass = false): Promise<ParsedUser | null> {
  if (!xProviderMode()) return null;
  const clean = handle.replace(/^@/, "");
  const url =
    xProviderMode() === "official"
      ? `https://api.x.com/2/users/by/username/${encodeURIComponent(clean)}?user.fields=description,public_metrics,name,username`
      : `${base()}/users/by/username/${encodeURIComponent(clean)}`;
  let json = await getJson(url, `x:user:${clean}`, 6 * 3600000, bypass);
  if (!json && xProviderMode() === "generic") {
    json = await getJson(`${base()}/twitter/user/info?userName=${encodeURIComponent(clean)}`, `x:userinfo:${clean}`, 6 * 3600000, bypass);
  }
  return json ? parseXUser(json, clean) : null;
}

export async function fetchXPosts(handle: string, userId: string | null, bypass = false): Promise<ParsedPost[]> {
  if (!xProviderMode()) return [];
  const clean = handle.replace(/^@/, "");
  const official = userId
    ? `https://api.x.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics,entities,referenced_tweets&expansions=referenced_tweets.id.author_id&user.fields=username&exclude=replies`
    : "";
  const url = xProviderMode() === "official" && official ? official : `${base()}/users/${encodeURIComponent(userId || clean)}/tweets?max_results=10`;
  let json = await getJson(url, `x:tweets:${clean}`, 2 * 3600000, bypass);
  if ((!json || !parseXTweets(json, clean).length) && xProviderMode() === "generic") {
    json = await getJson(`${base()}/twitter/user/last_tweets?userName=${encodeURIComponent(clean)}`, `x:last:${clean}`, 2 * 3600000, bypass);
  }
  return json ? parseXTweets(json, clean) : [];
}

export async function searchXPosts(query: string, bypass = false): Promise<ParsedPost[]> {
  if (!xProviderMode()) return [];
  const encoded = encodeURIComponent(query);
  const url =
    xProviderMode() === "official"
      ? `https://api.x.com/2/tweets/search/recent?query=${encoded}&max_results=10&tweet.fields=created_at,public_metrics,entities,referenced_tweets,author_id&expansions=author_id,referenced_tweets.id.author_id&user.fields=username,public_metrics,description`
      : `${base()}/tweets/search/recent?query=${encoded}&max_results=10`;
  let json = await getJson(url, `x:search:${query.toLowerCase()}`, 6 * 3600000, bypass);
  if (!json && xProviderMode() === "generic") {
    json = await getJson(`${base()}/twitter/tweet/advanced_search?query=${encoded}`, `x:adv:${query.toLowerCase()}`, 6 * 3600000, bypass);
  }
  return json ? parseXSearch(json) : [];
}
