import { all, get, run } from "./db";
import { fetchJson } from "./http";
import { historyTarget, readGithubCreated, readPypiCreated } from "./history";
import { sameSubject } from "./novelty";
import { readCache, writeCache } from "./sources/cache";
import { birthVerdict } from "./score";

const CACHE_MS = 6 * 60 * 60 * 1000;
let locked = false;

export async function enrichHistory(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { http: 400, ok: false, error: "需要 JSON 对象" };
  const record = body as Record<string, unknown>;
  if ("url" in record || "path" in record || "command" in record || "script" in record) {
    return { http: 400, ok: false, error: "只接受已保存证据里的 termIds，不接受临时 URL 或命令" };
  }
  const termIds = Array.isArray(record.termIds) ? record.termIds.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
  if (!termIds.length || termIds.length > 8) return { http: 400, ok: false, error: "termIds 需要 1 到 8 个已有词条" };
  if (locked) return { http: 409, ok: false, error: "已有一轮历史补证在跑" };
  locked = true;
  try {
    const results = [];
    for (const termId of termIds) results.push(await enrichTerm(termId));
    return { http: 200, ok: true, results };
  } finally {
    locked = false;
  }
}

async function enrichTerm(termId: number) {
  const term = get<{ id: number; display: string }>("select id, display from terms where id = ?", termId);
  if (!term) return { id: termId, status: "missing", lane: "", evidence: [], reason: "没有这个词条" };
  const urls = all<{ url: string }>("select url from term_evidence where term_id = ? and url is not null", termId);
  const targets = [...new Map(urls.map((row) => historyTarget(row.url)).filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => [item.api, item])).values()];
  const owned = targets.filter((target) => sameSubject(term.display, target.page).ok);
  if (!targets.length) {
    const verdict = applyVerdict(term.id, term.display);
    return { id: term.id, name: term.display, status: "missing", lane: verdict.lane, evidence: [], reason: "已存证据里没有可核对的 GitHub 仓库或 PyPI 项目地址" };
  }
  if (!owned.length) {
    const verdict = applyVerdict(term.id, term.display);
    const why = sameSubject(term.display, targets[0].page);
    return { id: term.id, name: term.display, status: "rejected", lane: verdict.lane, evidence: targets.map((target) => ({ kind: target.kind, at: null, url: target.page, source: "subject-mismatch" })), reason: why.why };
  }
  const evidence: { kind: string; at: string | null; url: string; source: string }[] = [];
  let status = "cached";
  for (const target of owned.slice(0, 2)) {
    const known = knownCreated(target);
    if (known) {
      evidence.push({ kind: target.kind === "github" ? "repo_created" : "product_launch", at: known, url: target.page, source: "stored" });
      continue;
    }
    const fetched = await fetchCreated(target);
    status = fetched.status;
    evidence.push({ kind: target.kind === "github" ? "repo_created" : "product_launch", at: fetched.at, url: target.page, source: fetched.source });
    if (fetched.at) storeCreated(term.id, target.kind === "github" ? "repo_created" : "product_launch", fetched.at, target);
  }
  const verdict = applyVerdict(term.id, term.display);
  return { id: term.id, name: term.display, status, lane: verdict.lane, evidence, reason: verdict.reason };
}

function knownCreated(target: { kind: string; key: string }) {
  if (target.kind !== "github") return null;
  const row = get<{ created_at: string | null }>(
    "select created_at from repo_snapshots where lower(full_name) = ? and created_at is not null order by created_at asc limit 1",
    target.key,
  );
  return row?.created_at ?? null;
}

async function fetchCreated(target: { kind: "github" | "pypi"; api: string; key: string }) {
  const cacheKey = `history:${target.kind}:${target.key}`;
  const cached = readCache(cacheKey, CACHE_MS);
  if (cached) {
    try {
      const at = target.kind === "github" ? readGithubCreated(JSON.parse(cached)) : readPypiCreated(JSON.parse(cached));
      if (at) return { status: "cached", at, source: "cache" };
    } catch {
      /* 缓存坏了就重新请求 */
    }
  }
  const headers: Record<string, string> = target.kind === "github"
    ? { accept: "application/vnd.github+json", "user-agent": "SEOKeywordRadar/1.0" }
    : { accept: "application/json" };
  if (target.kind === "github" && process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetchJson<Record<string, unknown>>(target.api, { headers, intervalMs: 800, timeoutMs: 12000, hostKey: new URL(target.api).host });
  if (!res.ok || !res.data) return { status: "error", at: null, source: `http ${res.status || "失败"}，没有把缺时间写成旧项目` };
  writeCache(cacheKey, JSON.stringify(res.data));
  const at = target.kind === "github" ? readGithubCreated(res.data) : readPypiCreated(res.data as { releases?: Record<string, { upload_time_iso_8601?: string }[]> });
  if (!at) return { status: "missing", at: null, source: "响应里没有创建时间，没有把它写成旧项目" };
  return { status: "fetched", at, source: target.kind === "github" ? "github created_at" : "pypi earliest upload" };
}

function storeCreated(termId: number, kind: string, at: string, target: { kind: string; key: string; page: string }) {
  const existing = get<{ observed_at: string | null }>("select observed_at from term_age_evidence where term_id = ? and kind = ?", termId, kind);
  const previous = existing?.observed_at ? Date.parse(existing.observed_at) : NaN;
  const next = Date.parse(at);
  if (Number.isFinite(previous) && (!Number.isFinite(next) || previous <= next)) return;
  run(
    `insert into term_age_evidence (term_id, kind, observed_at, note) values (?, ?, ?, ?)
     on conflict(term_id, kind) do update set observed_at = excluded.observed_at, note = excluded.note`,
    termId,
    kind,
    at,
    target.page,
  );
  if (target.kind === "github") {
    run("insert into repo_snapshots (full_name, stars, created_at, collected_at) values (?, 0, ?, ?)", target.key, at, new Date().toISOString());
  }
}

function applyVerdict(termId: number, display: string) {
  const verdict = birthVerdict(termId, display);
  run(
    "update terms set novelty = ?, novelty_reason = ?, independent_sources = ?, focus_industry = ?, source_groups = ?, review_lane = ? where id = ?",
    verdict.status,
    verdict.reason,
    verdict.independent,
    verdict.industry,
    JSON.stringify({ windowHours: verdict.windowHours, windowStart: verdict.windowStart, windowEnd: verdict.windowEnd, groups: verdict.groups }),
    verdict.lane,
    termId,
  );
  return verdict;
}
