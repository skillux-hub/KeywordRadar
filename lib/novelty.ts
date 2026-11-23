export const NOVEL_WINDOW_DAYS = 180;

const EDITION = new Set(
  "pro home enterprise ultimate standard premium plus lite classic se me ce lts os code studio viewer server edition bit x64 x86 nt xp vista".split(/\s+/),
);

const STEMS: string[][] = [
  ["windows"], ["win"], ["macos"], ["ios"], ["ipados"], ["android"], ["linux"], ["ubuntu"], ["debian"], ["centos"], ["redhat"],
  ["office"], ["excel"], ["outlook"], ["powerpoint"], ["onenote"],
  ["teamviewer"], ["team", "viewer"], ["anydesk"], ["any", "desk"], ["splashtop"],
  ["chrome"], ["chromium"], ["firefox"], ["safari"], ["edge"],
  ["photoshop"], ["illustrator"], ["premiere"], ["lightroom"], ["indesign"], ["autocad"],
  ["slack"], ["zoom"], ["skype"], ["whatsapp"], ["telegram"], ["discord"], ["messenger"],
  ["dropbox"], ["notion"], ["figma"], ["spotify"], ["netflix"], ["steam"], ["minecraft"],
  ["iphone"], ["ipad"], ["macbook"], ["imac"], ["airpods"], ["galaxy"],
  ["visual", "studio"], ["vscode"], ["intellij"], ["pycharm"], ["webstorm"], ["eclipse"],
  ["github"], ["gitlab"], ["bitbucket"], ["docker"], ["kubernetes"],
  ["python"], ["javascript"], ["typescript"], ["java"], ["react"], ["vue"], ["angular"], ["nextjs"],
  ["chatgpt"], ["openai"], ["copilot"], ["claude"], ["gemini"],
  ["wordpress"], ["shopify"], ["salesforce"], ["jira"], ["confluence"], ["trello"],
  ["matlab"], ["spss"], ["windows", "server"], ["sql", "server"], ["visual", "studio", "code"],
];

export type AgeEvidence = {
  kind: "repo_created" | "domain_registered" | "wikipedia_created" | "product_launch";
  at?: string | null;
};

export type NoveltyStatus = "novel" | "established" | "unverified";

export function normalizeNoveltyName(raw: string) {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editionToken(token: string) {
  return EDITION.has(token) || /^\d+(?:\.\d+)*$/.test(token) || /^(19|20)\d{2}$/.test(token);
}

export function isEstablishedName(raw: string) {
  const tokens = normalizeNoveltyName(raw).split(" ").filter(Boolean);
  if (!tokens.length) return false;
  const compact = tokens.join("");
  for (const stem of STEMS) {
    if (tokens.length >= stem.length && stem.every((part, index) => tokens[index] === part) && tokens.slice(stem.length).every(editionToken)) {
      return true;
    }
    const stemCompact = stem.join("");
    if (stemCompact.length < 3) continue;
    if (compact === stemCompact) return true;
    if (compact.startsWith(stemCompact) && /^\d+(?:\.\d+)*$/.test(compact.slice(stemCompact.length))) return true;
  }
  return false;
}

export function judgeNovelty(term: string, evidence: AgeEvidence[] = [], now = Date.now()) {
  if (isEstablishedName(term)) {
    return {
      status: "established" as NoveltyStatus,
      reason: "这是已知的长期产品、平台或版本。大小写、空格和重新变热都不能把它变成新词。",
    };
  }
  const windowMs = NOVEL_WINDOW_DAYS * 86400000;
  let youngReason = "";
  let oldReason = "";
  for (const item of evidence) {
    const time = item.at ? Date.parse(item.at) : NaN;
    if (!Number.isFinite(time)) continue;
    const age = now - time;
    if (age < 0) continue;
    const fresh = age <= windowMs;
    const reason = reasonFor(item.kind, fresh);
    if (fresh) youngReason = youngReason || reason;
    else oldReason = oldReason || reason;
  }
  if (oldReason) return { status: "established" as NoveltyStatus, reason: oldReason };
  if (youngReason) {
    return {
      status: "unverified" as NoveltyStatus,
      reason: `${youngReason}这只是辅助线索。新域名、新仓库或新品上架不能单独放行，还需要历史排除和另一组独立来源。`,
    };
  }
  return {
    status: "unverified" as NoveltyStatus,
    reason: "没有独立于本次采集时间的年龄证据。本系统第一次见到、最近被提及或热度上升，都不能单独证明它是新词。",
  };
}

function reasonFor(kind: AgeEvidence["kind"], fresh: boolean) {
  if (kind === "repo_created") return fresh ? "对应仓库是 180 天内创建的，名称和仓库本身一致。" : "对应仓库的创建时间早于 180 天。";
  if (kind === "domain_registered") return fresh ? "同名域名是 180 天内注册的。" : "同名域名的注册时间早于 180 天。";
  if (kind === "wikipedia_created") return fresh ? "公开资料显示这个名称是 180 天内出现的。" : "公开资料显示这个名称早于 180 天。";
  return fresh ? "它作为 180 天内新品发布的产品名出现，而不是旧词被顺带提到。" : "这个产品名的发布记录早于 180 天。";
}
export const FOCUS_INDUSTRIES = ["ai", "devtools"] as const;

export function confirmWindowHours() {
  const raw = Number(process.env.CONFIRM_WINDOW_HOURS || 48);
  if (!Number.isFinite(raw)) return 48;
  return Math.min(48, Math.max(24, Math.round(raw)));
}

export type Sighting = {
  source: string;
  at?: string | null;
  url?: string | null;
  author?: string | null;
  title?: string | null;
  industry?: string | null;
};

export type SourceGroup = {
  sources: string[];
  urls: string[];
  authors: string[];
  titles: string[];
  firstAt: string | null;
  lastAt: string | null;
  why: string;
};

export function canonicalUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "ref" || key === "source" || key === "si") url.searchParams.delete(key);
    }
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const query = url.searchParams.toString();
    return `${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

function titleKey(title?: string | null) {
  const text = (title || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, " ").replace(/\s+/g, " ").trim();
  if (text.length < 18) return "";
  return text;
}

function authorKey(author?: string | null) {
  const name = (author || "").trim().toLowerCase().replace(/^@/, "");
  if (!name || name === "[deleted]" || name === "automoderator") return "";
  return name;
}

export function groupSightings(items: Sighting[]): SourceGroup[] {
  const parents = items.map((_, index) => index);
  const find = (index: number): number => (parents[index] === index ? index : (parents[index] = find(parents[index])));
  const unite = (a: number, b: number) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parents[right] = left;
  };
  const byUrl = new Map<string, number>();
  const byTitle = new Map<string, number>();
  const byAuthor = new Map<string, number>();
  items.forEach((item, index) => {
    const url = item.url ? canonicalUrl(item.url) : "";
    const title = titleKey(item.title);
    const author = authorKey(item.author);
    if (!url && !author) return;
    if (url) {
      const previous = byUrl.get(url);
      if (previous != null) unite(previous, index);
      else byUrl.set(url, index);
    }
    if (title) {
      const previous = byTitle.get(title);
      if (previous != null) unite(previous, index);
      else byTitle.set(title, index);
    }
    if (author) {
      const previous = byAuthor.get(author);
      if (previous != null) unite(previous, index);
      else byAuthor.set(author, index);
    }
  });
  const buckets = new Map<number, Sighting[]>();
  items.forEach((item, index) => {
    if (!item.url && !authorKey(item.author)) return;
    const root = find(index);
    const list = buckets.get(root) ?? [];
    list.push(item);
    buckets.set(root, list);
  });
  return [...buckets.values()].map((rows) => {
    const times = rows.map((row) => Date.parse(row.at || "")).filter((time) => Number.isFinite(time)).sort((a, b) => a - b);
    const urls = [...new Set(rows.map((row) => row.url).filter((url): url is string => Boolean(url)))];
    const authors = [...new Set(rows.map((row) => authorKey(row.author)).filter(Boolean))];
    const sources = [...new Set(rows.map((row) => row.source).filter(Boolean))];
    const why = urls.length > 1 || sources.length > 1
      ? "同一链接、同一标题或同一发起人，跨平台也算一组，避免把转载和同步推广算成多个来源。"
      : "这一组目前看得到的链接和发起人还不能再拆开。";
    return {
      sources,
      urls,
      authors,
      titles: [...new Set(rows.map((row) => (row.title || "").trim()).filter(Boolean))].slice(0, 2),
      firstAt: times.length ? new Date(times[0]).toISOString() : null,
      lastAt: times.length ? new Date(times[times.length - 1]).toISOString() : null,
      why,
    };
  });
}

export function groupsInsideWindow(groups: SourceGroup[], windowHours: number) {
  const timed = groups.filter((group) => group.firstAt);
  if (!timed.length) return [];
  const ordered = [...timed].sort((a, b) => Date.parse(a.firstAt || "") - Date.parse(b.firstAt || ""));
  let best: SourceGroup[] = [];
  for (let start = 0; start < ordered.length; start += 1) {
    const cluster = [ordered[start]];
    for (let next = start + 1; next < ordered.length; next += 1) {
      const span = Date.parse(ordered[next].firstAt || "") - Date.parse(ordered[start].firstAt || "");
      if (span <= windowHours * 3600000) cluster.push(ordered[next]);
    }
    if (cluster.length > best.length) best = cluster;
  }
  return best;
}

export function judgeBirth(input: {
  term: string;
  industries: string[];
  sightings: Sighting[];
  ageEvidence?: AgeEvidence[];
  now?: number;
  windowHours?: number;
}) {
  const now = input.now ?? Date.now();
  const windowHours = input.windowHours ?? confirmWindowHours();
  const excluded = judgeNovelty(input.term, input.ageEvidence ?? [], now);
  const focus = input.industries.filter((industry) => (FOCUS_INDUSTRIES as readonly string[]).includes(industry));
  if (excluded.status === "established") {
    return { status: "established" as NoveltyStatus, reason: excluded.reason, industry: focus[0] || "", independent: 0, groups: [] as SourceGroup[] };
  }
  const auxiliary = (input.ageEvidence ?? []).some((item) => {
    const time = item.at ? Date.parse(item.at) : NaN;
    return Number.isFinite(time) && now - time <= 180 * 86400000 && now - time >= 0;
  });
  if (!focus.length) {
    return {
      status: "unverified" as NoveltyStatus,
      reason: "不在当前聚焦的 AI 工具或开发者工具基线里。其它行业的记录仍保留，但不进入正式推荐。",
      industry: "",
      independent: 0,
      groups: [] as SourceGroup[],
    };
  }
  let chosen = focus[0];
  let chosenGroups: SourceGroup[] = [];
  for (const industry of focus) {
    const scoped = input.sightings.filter((item) => item.industry === industry);
    const inside = groupsInsideWindow(groupSightings(scoped), windowHours);
    if (inside.length > chosenGroups.length) {
      chosen = industry;
      chosenGroups = inside;
    }
  }
  const auxiliaryNote = auxiliary ? " 新域名、新仓库或新品上架只作为辅助，不能单独放行。" : "";
  if (chosenGroups.length >= 2) {
    const labels = chosenGroups.map((group) => group.sources.join("+") || "未知来源").join("、");
    return {
      status: "novel" as NoveltyStatus,
      reason: `${chosen} 基线内，${windowHours} 小时里有 ${chosenGroups.length} 组可分开的来源（${labels}）。分组只依据链接、标题和发起人，不能保证识别出所有同一运营者。${auxiliaryNote}`,
      industry: chosen,
      independent: chosenGroups.length,
      groups: chosenGroups,
    };
  }
  if (chosenGroups.length === 1) {
    return {
      status: "unverified" as NoveltyStatus,
      reason: `目前只有 1 组来源，留待观察，不进入正式推荐。${auxiliaryNote}`,
      industry: chosen,
      independent: 1,
      groups: chosenGroups,
    };
  }
  return {
    status: "unverified" as NoveltyStatus,
    reason: `没有落在 ${windowHours} 小时窗口内、且能分开的两组来源。缺历史记录不能当成新词证明。${auxiliaryNote}`,
    industry: chosen,
    independent: 0,
    groups: [],
  };
}

export type SearchStatus = "unknown" | "absent" | "indexed";

export function judgeSearch(input: {
  suggest: boolean | null;
  trends: boolean | null;
  dataForSeoConfigured?: boolean;
  dataForSeo?: "indexed" | "absent" | "error" | null;
}) {
  if (input.suggest === true) return { status: "indexed" as SearchStatus, method: "google-suggest", note: "Google 自动补全这次写出了这个词。这只是滞后校验，不是发现来源。" };
  if (input.trends === true) return { status: "indexed" as SearchStatus, method: "google-trends-rss", note: "Google 每日趋势这次出现了这个词。这只是滞后校验，不是发现来源。" };
  if (input.dataForSeo === "indexed") return { status: "indexed" as SearchStatus, method: "dataforseo", note: "DataForSEO 这次看到了收录。这只是滞后校验。" };
  if (input.dataForSeo === "error" || (input.dataForSeoConfigured === false && input.suggest == null && input.trends == null)) {
    return { status: "unknown" as SearchStatus, method: input.dataForSeo === "error" ? "dataforseo" : "", note: "没有成功的搜索校验。未配置 DataForSEO 或请求失败时必须标为未知，不能写成未收录。" };
  }
  if (input.suggest == null && input.trends == null && input.dataForSeo == null) {
    return { status: "unknown" as SearchStatus, method: "", note: "还没有成功做过搜索校验，不能写成未收录。" };
  }
  if (input.suggest === false || input.trends === false || input.dataForSeo === "absent") {
    const method = input.suggest === false ? "google-suggest" : input.trends === false ? "google-trends-rss" : "dataforseo";
    return { status: "absent" as SearchStatus, method, note: "这次查询没有检出该词。未检出不等于搜索引擎未收录，也不能说明我们更早。" };
  }
  return { status: "unknown" as SearchStatus, method: "", note: "搜索校验结果不完整，保持未知。" };
}
