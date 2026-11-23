import { fetchText } from "./http";
import { asArray, attr, decodeHtml, linkOf, parseXml, textOf, type Xml } from "./xml";

export type FeedEntry = {
  title: string;
  link: string;
  date?: string;
  content: string;
  author?: string;
};

function entryFrom(item: Xml): FeedEntry {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { title: "", link: "", content: "" };
  }
  const authorNode = item.author;
  const author =
    textOf(item.creator) ||
    (authorNode && typeof authorNode === "object" && !Array.isArray(authorNode) ? textOf(authorNode.name) : textOf(authorNode));
  return {
    title: decodeHtml(textOf(item.title)),
    link: linkOf(item.link) || attr(item, "href"),
    date: textOf(item.pubDate) || textOf(item.published) || textOf(item.updated) || undefined,
    content: decodeHtml(textOf(item.description) || textOf(item.content) || textOf(item.summary) || ""),
    author: author ? decodeHtml(author) : undefined,
  };
}

export async function readFeed(url: string, opts?: { intervalMs?: number; browser?: boolean; hostKey?: string }) {
  const res = await fetchText(url, {
    intervalMs: opts?.intervalMs ?? 350,
    timeoutMs: 12000,
    browser: opts?.browser,
    hostKey: opts?.hostKey,
    headers: { accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, */*" },
  });
  if (res.notModified) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status || "网络错误"}`);
  if (!res.text.includes("<")) throw new Error("返回的不是 XML");
  const xml = parseXml(res.text);
  if (!xml || typeof xml !== "object" || Array.isArray(xml)) return [];
  const rss = xml.rss;
  if (rss && typeof rss === "object" && !Array.isArray(rss)) {
    const channel = rss.channel;
    if (channel && typeof channel === "object" && !Array.isArray(channel)) {
      return asArray(channel.item).map(entryFrom).filter((entry) => entry.title || entry.link);
    }
  }
  const feed = xml.feed;
  if (feed && typeof feed === "object" && !Array.isArray(feed)) {
    return asArray(feed.entry).map(entryFrom).filter((entry) => entry.title || entry.link);
  }
  return [];
}
