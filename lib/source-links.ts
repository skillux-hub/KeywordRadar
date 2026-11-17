const HOMES: Record<string, string> = {
  hn: "https://news.ycombinator.com/",
  producthunt: "https://www.producthunt.com/",
  github: "https://github.com/trending",
  reddit: "https://www.reddit.com/",
  bluesky: "https://bsky.app/",
  stackexchange: "https://stackexchange.com/",
  youtube: "https://www.youtube.com/",
  substack: "https://substack.com/",
  medium: "https://medium.com/",
  googlenews: "https://news.google.com/",
  x: "https://x.com/",
  sitemap: "https://www.sitemaps.org/protocol.html",
  tiktok: "https://www.tiktok.com/",
  quora: "https://www.quora.com/",
  amazon: "https://www.amazon.com/gp/movers-and-shakers",
  etsy: "https://www.etsy.com/",
  discord: "https://discord.com/",
  telegram: "https://telegram.org/",
  threads: "https://www.threads.net/",
  google: "https://trends.google.com/trends/trendingsearches/daily",
};

export function sourceHome(id: string) {
  return HOMES[id] || "";
}

export function xProfile(handle: string) {
  const name = handle.replace(/^@/, "").trim();
  return name ? `https://x.com/${encodeURIComponent(name)}` : "";
}

export function xStatus(handle: string, id: string) {
  const name = handle.replace(/^@/, "").trim();
  return name && id ? `https://x.com/${encodeURIComponent(name)}/status/${encodeURIComponent(id)}` : "";
}

export function subredditUrl(name: string) {
  const clean = name.replace(/^\/?r\//i, "").trim();
  return clean ? `https://www.reddit.com/r/${encodeURIComponent(clean)}/` : "";
}

export function redditUserUrl(name: string) {
  const clean = name.replace(/^\/?u\//i, "").trim();
  return clean ? `https://www.reddit.com/user/${encodeURIComponent(clean)}/` : "";
}

export function profileUrl(platform: string, key: string) {
  if (platform === "x") return xProfile(key);
  if (platform === "reddit") return subredditUrl(key);
  return "";
}

export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}
