import { withinDays } from "../extract";
import { get } from "../db";
import { fetchText, readRobots, robotsAllows } from "../http";
import { asArray, decodeHtml, parseXml, textOf, type Xml } from "../xml";
import { hitsFromDoc, result, type CollectContext, type CollectorResult, type FeedItem, type Hit, type SitemapPage } from "./types";

type Loc = { loc: string; lastmod?: string };

function childText(node: Xml | undefined, key: string) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return "";
  return textOf(node[key]);
}

async function expandSitemaps(urls: string[], depth: number): Promise<Loc[]> {
  const found: Loc[] = [];
  for (const url of urls.slice(0, 3)) {
    const res = await fetchText(url, { intervalMs: 700, timeoutMs: 12000, maxBytes: 1_800_000 });
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
  const hits: Hit[] = [];
  const feed: FeedItem[] = [];
  const pages: SitemapPage[] = [];
  const notes: string[] = [];
  for (const site of ctx.sites.slice(0, 6)) {
    const origin = `https://${site.domain}`;
    const robots = await readRobots(origin);
    let maps = robots?.sitemaps ?? [];
    if (!maps.length) {
      for (const path of ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-news.xml", "/news-sitemap.xml"]) {
        const probe = await fetchText(origin + path, { intervalMs: 500, timeoutMs: 8000, maxBytes: 200_000 });
        if (probe.ok && probe.text.includes("<")) {
          maps = [origin + path];
          break;
        }
      }
    }
    if (!maps.length) {
      notes.push(`${site.domain} 无 sitemap`);
      continue;
    }
    const locs = await expandSitemaps(maps.slice(0, 3), 0);
    const dated = locs.filter((loc) => loc.lastmod && withinDays(loc.lastmod, 14));
    const recent = (dated.length ? dated : locs.slice(0, 30)).slice(0, 60);
    let fresh = 0;
    for (const loc of recent) {
      const ageOk = Boolean(loc.lastmod) && withinDays(loc.lastmod, 3);
      const existing = get("select url from sitemap_urls where url=?", loc.loc);
      const isNew = !existing && ageOk;
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
      hits.push(
        ...hitsFromDoc({
          title: headline,
          body: description,
          slug,
          url: loc.loc,
          author: site.domain,
          publishedAt: loc.lastmod,
          industry: site.industry,
        }),
      );
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
  if (!pages.length && !hits.length) {
    return result("sitemap", notes.some((note) => note.includes("新 URL")) ? "ok" : "error", notes.join("；") || "没有读到站点地图");
  }
  return result("sitemap", "ok", notes.join("；"), { hits: hits.slice(0, 80), feed: feed.slice(0, 40), pages });
}
