export type PageKind = "tool" | "list" | "article" | "video" | "forum" | "official";
export type SerpShape = "平台占据" | "可超越" | "有争夺";

const PLATFORMS = ["youtube.com", "reddit.com", "wikipedia.org", "amazon.com", "medium.com", "linkedin.com", "quora.com", "facebook.com", "tiktok.com", "github.com", "forbes.com", "nytimes.com"];

export function classifyResultPage(url: string, title = ""): { kind: PageKind; homepage: boolean; platform: boolean } {
  let host = "";
  let path = "/";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, "");
    path = parsed.pathname || "/";
  } catch {
    host = url;
  }
  const homepage = path === "/" || path === "";
  const platform = PLATFORMS.some((item) => host === item || host.endsWith(`.${item}`));
  const text = `${title} ${path}`.toLowerCase();
  let kind: PageKind = "article";
  if (/youtube\.com|vimeo\.com|\/watch|\/video/.test(text)) kind = "video";
  else if (/reddit\.com|quora\.com|stackoverflow\.com|stackexchange\.com|discourse|\/forum/.test(text)) kind = "forum";
  else if (/\b(best|top\s+\d+|roundup|alternatives|tools list)\b|\/best-|\/top-/.test(text)) kind = "list";
  else if (/\/(app|tool|tools|pricing|product|features)(\/|$)/.test(path) || /\b(tool|app|software|pricing)\b/.test(title.toLowerCase())) kind = "tool";
  else if (homepage) kind = "official";
  return { kind, homepage, platform };
}

export function deriveSerpShape(rows: { platform: boolean; homepage: boolean }[]): { shape: SerpShape; platformShare: number } {
  if (!rows.length) return { shape: "有争夺", platformShare: 0 };
  const platformShare = rows.filter((row) => row.platform).length / rows.length;
  const homepages = rows.filter((row) => row.homepage).length;
  if (platformShare >= 0.6) return { shape: "平台占据", platformShare };
  if (platformShare <= 0.3 && homepages <= 2) return { shape: "可超越", platformShare };
  return { shape: "有争夺", platformShare };
}

export function loosenCompetition(label: string, ageDays: number) {
  if (!Number.isFinite(ageDays) || ageDays >= 180) return { label, loosened: false };
  if (label === "红海") return { label: "竞争中等", loosened: true };
  if (label === "竞争中等") return { label: "蓝海", loosened: true };
  return { label, loosened: false };
}

export function kgr(allintitle: number | null, monthlyVolume: number | null) {
  if (allintitle == null || monthlyVolume == null || monthlyVolume <= 0) return null;
  return Math.round((allintitle / monthlyVolume) * 1000) / 1000;
}
