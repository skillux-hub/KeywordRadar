import { asArray, decodeHtml, parseXml, textOf, type Xml } from "../xml";

export { freshAfterBaseline, githubCreatedSearch, packageBirth, showHnParts } from "./registry-rules";

export type PackageNotice = {
  name: string;
  url: string;
  summary: string;
  publishedAt: string;
};

function nodeText(node: Xml | undefined, key: string) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return "";
  return decodeHtml(textOf(node[key])).trim();
}

function rssItems(xmlText: string) {
  const xml = parseXml(xmlText);
  if (!xml || typeof xml !== "object" || Array.isArray(xml)) return [];
  const rss = xml.rss;
  if (!rss || typeof rss !== "object" || Array.isArray(rss)) return [];
  const channel = rss.channel;
  if (!channel || typeof channel !== "object" || Array.isArray(channel)) return [];
  return asArray(channel.item);
}

export function parsePypiPackages(xmlText: string): PackageNotice[] {
  const out: PackageNotice[] = [];
  for (const item of rssItems(xmlText)) {
    const link = nodeText(item, "link");
    const match = link.match(/\/project\/([^/]+)\/?$/i);
    const name = match ? decodeURIComponent(match[1]) : "";
    const publishedAt = nodeText(item, "pubDate");
    if (!name || !publishedAt) continue;
    out.push({ name, url: link, summary: nodeText(item, "description"), publishedAt });
  }
  return out;
}

export function parseNpmUpdates(xmlText: string): PackageNotice[] {
  const out: PackageNotice[] = [];
  for (const item of rssItems(xmlText)) {
    const name = nodeText(item, "title");
    const publishedAt = nodeText(item, "pubDate");
    if (!name || !publishedAt || name.includes(" ")) continue;
    const link = nodeText(item, "link") || `https://www.npmjs.com/package/${name}`;
    out.push({ name, url: link, summary: nodeText(item, "description"), publishedAt });
  }
  return out;
}

