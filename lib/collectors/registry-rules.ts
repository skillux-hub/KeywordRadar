export function packageBirth(input: { created?: string | null; modified?: string | null; now?: number; maxAgeDays?: number }) {
  const created = input.created ? Date.parse(input.created) : NaN;
  if (!Number.isFinite(created)) {
    return { fresh: false, at: null as string | null, reason: "注册表没有创建时间，更新时间不能当成新包诞生。" };
  }
  const now = input.now ?? Date.now();
  const ageDays = (now - created) / 86400000;
  const limit = input.maxAgeDays ?? 14;
  if (ageDays < 0 || ageDays > limit) {
    return { fresh: false, at: new Date(created).toISOString(), reason: "创建时间早于观察窗口。最近的更新不是新包。" };
  }
  return { fresh: true, at: new Date(created).toISOString(), reason: "创建时间落在观察窗口内。更新时间没有被当成诞生时间。" };
}

export function freshAfterBaseline(seen: Set<string>, ids: string[], baselined: boolean) {
  if (!baselined) return { fresh: [] as string[], nextSeen: new Set([...seen, ...ids]), baselined: true };
  const fresh = ids.filter((id) => id && !seen.has(id));
  return { fresh, nextSeen: new Set([...seen, ...fresh]), baselined: true };
}

export function githubCreatedSearch(now = Date.now()) {
  const since = new Date(now - 3 * 86400000).toISOString().slice(0, 10);
  const q = `created:>${since} (llm OR chatbot OR cli OR sdk OR "developer tool") in:description`;
  return `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=10`;
}

export function hashtagTerms(blob: string) {
  return [...blob.matchAll(/#([A-Za-z][A-Za-z0-9_]{2,30})/g)].map((match) => match[1]);
}

export function boilerplateTerm(value: string) {
  return /\b(privacy policy|cookie policy|terms of service|cookie settings)\b/i.test(value);
}

export function freshSitemapUrls(seen: Set<string>, urls: { url: string; lastmod?: string | null }[], baselined: boolean) {
  if (!baselined) return [] as string[];
  return urls.filter((item) => item.url && !seen.has(item.url)).map((item) => item.url);
}

export function showHnParts(title: string) {
  const stripped = title.replace(/^show hn\s*:\s*/i, "").trim();
  const parts = stripped.split(/\s+[–—|]\s+|\s+-\s+/);
  const name = (parts[0] || stripped).trim();
  const context = parts.slice(1).join(" ").trim();
  return { name, context };
}
