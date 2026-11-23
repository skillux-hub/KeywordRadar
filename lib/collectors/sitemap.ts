import { get, run } from "../db";
import { fetchText, isPublicHttpUrl, readRobots, robotsAllows } from "../http";
import { asArray, decodeHtml, parseXml, textOf, type Xml } from "../xml";
import { result, type CollectContext, type CollectorResult, type FeedItem, type SitemapPage } from "./types";

type Loc = { loc: string; lastmod?: string };

function childText(node: Xml | undefined, key: string) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return "";
  return textOf(node[key]);
}

async function expandSitemaps(urls: string[], depth: number): Promise<Loc[]> {
  const found: Loc[] = [];
  for (const url of urls.slice(0, 3)) {
    if (!isPublicHttpUrl(url)) continue;
    const res = await fetchText(url, { intervalMs: 700, timeoutMs: 12000, maxBytes: 1_800_000 });
    if (!isPublicHttpUrl(res.url)) continue;
    if (res.notModified) continue;
    if (!res.ok || !res.text.includes("<")) continue;
    let xml: Xml;
    try {
      xml = parseXml(res.text);
    } catch {
      continue;
    }
    if (!xml || typeof xml !== "object" || Array.isArray(xml)) continue;
    const index = xml.sitemapindex;
    if (index && typeof index === "object" && !Array.isArray(index) && depth < 2) {
      const children = asArray(index.sitemap)
        .map((node) => childText(node, "loc"))
        .filter(Boolean)
        .slice(0, 3);
      found.push(...(await expandSitemaps(children, depth + 1)));
    }
    const urlset = xml.urlset;
    if (urlset && typeof urlset === "object" && !Array.isArray(urlset)) {
      for (const node of asArray(urlset.url)) {
        const loc = childText(node, "loc");
        if (!loc) continue;
        found.push({ loc, lastmod: childText(node, "lastmod") || undefined });
        if (found.length >= 250) return found;
      }
    }
    if (found.length >= 250) break;
  }
  return found;
}

function pageMeta(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const desc =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1];
  return {
    title: title ? decodeHtml(title).slice(0, 180) : "",
    h1: h1 ? decodeHtml(h1).slice(0, 180) : "",
    description: desc ? decodeHtml(desc).slice(0, 240) : "",
  };
}

export async function collectSitemaps(ctx: CollectContext): Promise<CollectorResult> {
  const feed: FeedItem[] = [];
  const pages: SitemapPage[] = [];
  const baselined = Boolean(get<{ value: string }>("select value from meta where key = ?", "baseline_sitemap")?.value);
  const notes: string[] = [];
  for (const site of ctx.sites.slice(0, 6)) {
    const origin = `https://${site.domain}`;
    const robots = await readRobots(origin);
    const maps = robots?.sitemaps ?? [];
    if (!maps.length) {
      notes.push(`${site.domain} 的 robots 没有给出 sitemap，不猜测路径`);
      continue;
    }
    if (!maps.length) {
      notes.push(`${site.domain} 无 sitemap`);
      continue;
    }
    const locs = await expandSitemaps(maps.slice(0, 3), 0);
    const recent = locs.slice(0, 60);
    let fresh = 0;
    for (const loc of recent) {
      if (!isPublicHttpUrl(loc.loc)) continue;
      const existing = get("select url from sitemap_urls where url=?", loc.loc);
      const isNew = baselined && !existing;
      if (!isNew && existing) continue;
      let title = "";
      let h1 = "";
      let description = "";
      if (isNew && fresh < 4) {
        const decision = await robotsAllows(loc.loc);
        if (decision === "allow") {
          const page = await fetchText(loc.loc, { intervalMs: 900, timeoutMs: 8000, maxBytes: 350_000 });
          if (page.ok) {
            const meta = pageMeta(page.text);
            title = meta.title;
            h1 = meta.h1;
            description = meta.description;
          }
        }
      }
      const slug = (() => {
        try {
          return new URL(loc.loc).pathname.split("/").filter(Boolean).pop()?.replace(/[-_]+/g, " ").replace(/\.[a-z]+$/i, "") ?? "";
        } catch {
          return "";
        }
      })();
      pages.push({
        domain: site.domain,
        industry: site.industry,
        url: loc.loc,
        lastmod: loc.lastmod,
        title,
        h1,
        description,
        isNew,
      });
      if (!isNew) continue;
      fresh += 1;
      const headline = title || h1 || slug;
      feed.push({
        source: "sitemap",
        industry: site.industry,
        externalId: loc.loc,
        author: site.domain,
        title: headline,
        text: description,
        url: loc.loc,
        publishedAt: loc.lastmod,
      });
    }
    notes.push(`${site.domain} 新 URL ${fresh}`);
  }
  if (!baselined) run("insert into meta (key, value) values ('baseline_sitemap', '1') on conflict(key) do update set value = excluded.value");
  const note = `${baselined ? "已有基线。" : "首次只建基线，历史 URL 不算新词。"}${notes.join("；") || "没有读到站点地图"} 官网页面只做验证记录。`;
  if (!pages.length && !feed.length) return result("sitemap", notes.length ? "ok" : "error", note);
  return result("sitemap", "ok", note, { hits: [], feed: feed.slice(0, 40), pages });
}
