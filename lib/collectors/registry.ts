import { classifyIndustries } from "../extract";
import { fetchJson, fetchText } from "../http";
import { readCursor } from "../baseline";
import { capCursor } from "../probe";
import { hitsFromDoc, result, type CollectContext, type CollectorResult } from "./types";
import { packageBirth, parseNpmUpdates, parsePypiPackages } from "./registry-parse";

function focus(summary: string) {
  return classifyIndustries(summary).some((industry) => industry === "ai" || industry === "devtools");
}

export async function collectPypi(ctx: CollectContext = emptyContext()): Promise<CollectorResult> {
  const res = await fetchText("https://pypi.org/rss/packages.xml", {
    intervalMs: 400,
    timeoutMs: 12000,
    hostKey: "pypi.org",
    headers: { accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok || !res.text.includes("<item")) return result("pypi", "error", `PyPI 新包 RSS 没有解析到条目（HTTP ${res.status || "失败"}）`);
  const items = parsePypiPackages(res.text).slice(0, 30);
  const ids = items.map((item) => item.url || item.name);
  const cursor = readCursor("pypi");
  const fresh = cursor.baselined ? items.filter((item) => !cursor.seen.has(item.url || item.name) && focus(item.summary)) : [];
  const capped = capCursor(ids, fresh.map((item) => item.url || item.name), ctx.maxItems, cursor.baselined);
  const chosen = new Set(capped.emitIds);
  if (!cursor.baselined) {
    return result("pypi", "ok", `首次导入准备记下 ${items.length} 个已有新包。试跑不写游标；正式试采在持久化成功后才推进。`, { nextCursor: ctx.dryRun ? [] : capped.nextCursor, stats: { fetched: items.length, deduped: 0, emitted: 0 } });
  }
  const hits = fresh.filter((item) => chosen.has(item.url || item.name)).flatMap((item) => hitsFromDoc({
    entityOnly: true,
    entityName: item.name,
    context: item.summary,
    url: item.url,
    publishedAt: item.publishedAt,
    bornKind: "product_launch",
    bornAt: item.publishedAt,
    author: "pypi.org",
  }));
  return result("pypi", "ok", `新包 RSS ${items.length} 条，本次保留 ${hits.length} 个。未纳入本限额的新增不会记入游标。上架本身不进入推荐。`, { hits, nextCursor: ctx.dryRun ? [] : capped.nextCursor, stats: { fetched: items.length, deduped: items.length - fresh.length, emitted: hits.length } });
}

function emptyContext(): CollectContext {
  return { seeds: [], xAccounts: [], subreddits: [], redditUsers: [], sites: [], newsletters: [], youtube: [], medium: [] };
}

export async function collectNpm(ctx: CollectContext = emptyContext()): Promise<CollectorResult> {
  const res = await fetchText("https://registry.npmjs.org/-/rss", {
    intervalMs: 400,
    timeoutMs: 12000,
    hostKey: "registry.npmjs.org",
    headers: { accept: "application/rss+xml" },
  });
  if (!res.ok || !res.text.includes("<item")) return result("npm", "error", `npm 更新流没有解析到条目（HTTP ${res.status || "失败"}）`);
  const updates = parseNpmUpdates(res.text).slice(0, 8);
  const created: { name: string; url: string; summary: string; at: string }[] = [];
  for (const item of updates) {
    const meta = await fetchJson<{ time?: { created?: string; modified?: string }; description?: string }>(
      `https://registry.npmjs.org/${encodeURIComponent(item.name)}`,
      { intervalMs: 300, timeoutMs: 10000, hostKey: "registry.npmjs.org" },
    );
    const birth = packageBirth({ created: meta.data?.time?.created, modified: meta.data?.time?.modified });
    if (!birth.fresh || !birth.at) continue;
    const summary = meta.data?.description || item.summary;
    if (!focus(summary)) continue;
    created.push({ name: item.name, url: item.url, summary, at: birth.at });
  }
  const cursor = readCursor("npm");
  const ids = updates.map((item) => item.name);
  const fresh = cursor.baselined ? created.filter((item) => !cursor.seen.has(item.name)) : [];
  const capped = capCursor(ids, fresh.map((item) => item.name), ctx.maxItems, cursor.baselined);
  const chosen = new Set(capped.emitIds);
  if (!cursor.baselined) {
    return result("npm", "ok", `检查了 ${updates.length} 个更新，其中 ${created.length} 个创建时间在窗口内。首次不输出为新词，试跑不写游标。`, { nextCursor: ctx.dryRun ? [] : capped.nextCursor, stats: { fetched: updates.length, deduped: updates.length - created.length, emitted: 0 } });
  }
  const hits = fresh.filter((item) => chosen.has(item.name)).flatMap((item) => hitsFromDoc({
    entityOnly: true,
    entityName: item.name,
    context: item.summary,
    url: item.url,
    publishedAt: item.at,
    bornKind: "product_launch",
    bornAt: item.at,
    author: "registry.npmjs.org",
  }));
  return result("npm", "ok", `检查了 ${updates.length} 个更新。本次保留创建时间在窗口内的 ${hits.length} 个。更新时间没有被当成诞生。`, { hits, nextCursor: ctx.dryRun ? [] : capped.nextCursor, stats: { fetched: updates.length, deduped: updates.length - fresh.length, emitted: hits.length } });
}
