export const PROBE_SOURCES = ["github", "pypi", "npm", "showhn", "producthunt", "sitemap"] as const;

export type ProbeSource = (typeof PROBE_SOURCES)[number];

export function parseProbe(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "需要 JSON 对象" as const };
  const record = body as Record<string, unknown>;
  if ("url" in record || "command" in record || "script" in record || "path" in record) {
    return { error: "不允许指定地址、路径或命令" as const };
  }
  const source = String(record.source || record.collector || "");
  if (!PROBE_SOURCES.includes(source as ProbeSource)) return { error: "不在试采白名单" as const };
  return {
    source: source as ProbeSource,
    maxItems: clampNumber(record.maxItems, 1, 20, 8),
    budgetMs: clampNumber(record.budgetMs, 5000, 45000, 20000),
    dryRun: record.dryRun === true,
  };
}

export function capCursor(ids: string[], emitIds: string[], maxItems: number | undefined, baselined: boolean) {
  if (!baselined) return { nextCursor: ids, emitIds: [] as string[] };
  const emit = maxItems ? emitIds.slice(0, maxItems) : emitIds;
  const deferred = new Set(emitIds.slice(emit.length));
  return { nextCursor: ids.filter((id) => !deferred.has(id)), emitIds: emit };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
