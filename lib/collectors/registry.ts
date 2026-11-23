import { classifyIndustries } from "../extract";
import { fetchJson, fetchText } from "../http";
import { readCursor } from "../baseline";
import { hitsFromDoc, result, type CollectorResult } from "./types";
import { packageBirth, parseNpmUpdates, parsePypiPackages } from "./registry-parse";

function focus(summary: string) {
  return classifyIndustries(summary).some((industry) => industry === "ai" || industry === "devtools");
}

export async function collectPypi(): Promise<CollectorResult> {
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
  if (!cursor.baselined) {
    return result("pypi", "ok", `首次导入只准备记下 ${items.length} 个已有新包，持久化成功后才推进游标，不把它们输出成新词。`, { nextCursor: ids });
  }
  const fresh = items.filter((item) => !cursor.seen.has(item.url || item.name) && focus(item.summary));
  const hits = fresh.flatMap((item) => hitsFromDoc({
    entityOnly: true,
    entityName: item.name,
    context: item.summary,
    url: item.url,
    publishedAt: item.publishedAt,
    bornKind: "product_launch",
    bornAt: item.publishedAt,
    author: "pypi.org",
  }));
  return result("pypi", "ok", `新包 RSS ${items.length} 条，相对基线新增且简介能归入 AI/开发者工具 ${fresh.length} 个。上架本身不进入推荐。`, { hits, nextCursor: fresh.map((item) => item.url || item.name) });
}

export async function collectNpm(): Promise<CollectorResult> {
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
  if (!cursor.baselined) {
    return result("npm", "ok", `更新流里有 ${created.length} 个窗口内新建的包。首次只准备基线，持久化成功后才推进游标。`, { nextCursor: created.map((item) => item.name) });
  }
  const fresh = created.filter((item) => !cursor.seen.has(item.name));
  const hits = fresh.flatMap((item) => hitsFromDoc({
    entityOnly: true,
    entityName: item.name,
    context: item.summary,
    url: item.url,
    publishedAt: item.at,
    bornKind: "product_launch",
    bornAt: item.at,
    author: "registry.npmjs.org",
  }));
  return result("npm", "ok", `检查了 ${updates.length} 个更新。创建时间在窗口内且简介匹配的新包 ${fresh.length} 个。更新时间没有被当成诞生。`, { hits, nextCursor: fresh.map((item) => item.name) });
}
