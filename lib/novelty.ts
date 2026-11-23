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
  url?: string | null;
};

export type NoveltyStatus = "novel" | "established" | "unverified";

export function normalizeNoveltyName(raw: string) {
  const folded = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return folded
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Folded names of long-lived products, publishers, and generic compounds.
// Matching is by the whole alias, not by a single word such as "claude".
const ALIASES: { label: string; tokens: string[]; note?: string }[] = [
  { label: "Claude Code", tokens: ["claude", "code"] },
  { label: "Claude AI", tokens: ["claude", "ai"] },
  { label: "GitHub Copilot", tokens: ["github", "copilot"] },
  { label: "Cursor AI", tokens: ["cursor", "ai"] },
  { label: "CrowdStrike", tokens: ["crowd", "strike"] },
  { label: "DeepSeek", tokens: ["deep", "seek"] },
  { label: "DevOps", tokens: ["dev", "ops"] },
  { label: "TechCrunch", tokens: ["tech", "crunch"] },
  { label: "PostgreSQL", tokens: ["postgre", "sql"] },
  { label: "PostgreSQL", tokens: ["postgres"] },
  { label: "McKinsey", tokens: ["mc", "kinsey"] },
  { label: "VentureBeat", tokens: ["venture", "beat"] },
  { label: "Cloud Computing", tokens: ["cloud", "computing"] },
  { label: "Open Source", tokens: ["open", "source"] },
  { label: "FinTech", tokens: ["fin", "tech"] },
  { label: "MySQL", tokens: ["mysql"], note: "长期数据库。基线按名称整体匹配，不是只挡这一个词。" },
  { label: "MariaDB", tokens: ["mariadb"], note: "长期数据库。" },
  { label: "SQLite", tokens: ["sqlite"], note: "长期数据库。" },
  { label: "MongoDB", tokens: ["mongodb"], note: "长期数据库。" },
  { label: "Redis", tokens: ["redis"], note: "长期数据库。" },
  { label: "Elasticsearch", tokens: ["elasticsearch"], note: "长期搜索引擎。" },
  { label: "Stack Overflow", tokens: ["stack", "overflow"], note: "长期开发者平台。" },
  { label: "Stack Overflow", tokens: ["stackoverflow"], note: "长期开发者平台。" },
  { label: "LinkedIn", tokens: ["linkedin"], note: "长期职业平台。" },
  { label: "ClickUp", tokens: ["clickup"], note: "长期协作产品。" },
  { label: "OpenStreetMap", tokens: ["openstreetmap"], note: "长期地图平台。" },
  { label: "ElastiCache", tokens: ["elasticache"], note: "长期云数据库服务。" },
  { label: "WebSockets", tokens: ["websockets"], note: "长期网络协议名。" },
  { label: "WebSocket", tokens: ["websocket"], note: "长期网络协议名。" },
];

const ANCHORED = [
  { label: "OpenCode", name: "opencode", paths: ["github.com/anomalyco/opencode", "github.com/opencode-ai/opencode"], note: "证据 URL 对上 github.com/anomalyco/opencode（2025-04-30 创建）或 github.com/opencode-ai/opencode（2025-03-16 创建）。没对上这些地址时，不把同名提及判成旧项目。" },
  { label: "OpenClaw", name: "openclaw", paths: ["github.com/openclaw/openclaw"], note: "证据 URL 对上 github.com/openclaw/openclaw（2025-11-24 创建）。没对上这个仓库时，不把综述里的提及判成旧项目。" },
];

export function knownProjectByUrl(term: string, urls: string[]) {
  const compact = normalizeNoveltyName(term).replace(/ /g, "");
  const hit = ANCHORED.find((item) => item.name === compact);
  if (!hit) return null;
  const matched = urls.find((url) => hit.paths.some((path) => url.toLowerCase().includes(path)));
  if (!matched) return null;
  return { label: hit.label, url: matched, note: hit.note };
}

export function baselineRelation(raw: string): { relation: "exact" | "embedded" | "none"; label: string; note: string } {
  const tokens = normalizeNoveltyName(raw).split(" ").filter(Boolean);
  const compact = tokens.join("");
  for (const alias of ALIASES) {
    const aliasCompact = alias.tokens.join("");
    const exactTokens =
      tokens.length >= alias.tokens.length &&
      alias.tokens.every((part, index) => tokens[index] === part) &&
      tokens.slice(alias.tokens.length).every(editionToken);
    const rest = compact.startsWith(aliasCompact) ? compact.slice(aliasCompact.length) : null;
    const exactCompact = compact === aliasCompact || (rest != null && /^\d+(?:\.\d+)*$/.test(rest));
    if (exactTokens || exactCompact) return { relation: "exact", label: alias.label, note: alias.note || "" };
  }
  for (const alias of ALIASES) {
    if (alias.tokens.length < 2) continue;
    const aliasCompact = alias.tokens.join("");
    for (let index = 0; index < tokens.length; index += 1) {
      const span = alias.tokens.every((part, offset) => tokens[index + offset] === part);
      if (span || tokens[index] === aliasCompact) return { relation: "embedded", label: alias.label, note: alias.note || "" };
    }
  }
  return { relation: "none", label: "", note: "" };
}

function editionToken(token: string) {
  return EDITION.has(token) || /^\d+(?:\.\d+)*$/.test(token) || /^(19|20)\d{2}$/.test(token);
}

export function isEstablishedName(raw: string) {
  if (baselineRelation(raw).relation === "exact") return true;
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
  const baseline = baselineRelation(term);
  if (baseline.relation === "exact" || isEstablishedName(term)) {
    return {
      status: "established" as NoveltyStatus,
      reason: baseline.relation === "exact"
        ? `这是已知实体「${baseline.label}」。${baseline.note ? `${baseline.note}` : "空格、大小写、符号和驼峰都算同一个词。"}新域名、新帖或新仓库镜像不能把它重新放行。`
        : "这是已知的长期产品、平台或版本。大小写、空格和重新变热都不能把它变成新词。",
    };
  }
  if (baseline.relation === "embedded") {
    return {
      status: "unverified" as NoveltyStatus,
      reason: `短语里包含已知实体「${baseline.label}」的完整别名。组合本身没有独立诞生证据，不能当成新词。`,
    };
  }
  const windowMs = NOVEL_WINDOW_DAYS * 86400000;
  let youngReason = "";
  let oldReason = "";
  for (const item of evidence) {
    if (item.kind === "product_launch" && githubRepoName(item.url || "")) continue;
    const time = item.at ? Date.parse(item.at) : NaN;
    if (!Number.isFinite(time)) continue;
    const age = now - time;
    if (age < 0) continue;
    const fresh = age <= windowMs;
    const reason = reasonFor(item.kind, fresh);
    if (fresh) youngReason = youngReason || reason;
    else oldReason = oldReason || reason;
  }
  if (oldReason) {
    return {
      status: "unverified" as NoveltyStatus,
      reason: `${oldReason} 这条时间早于窗口，因此不能进入推荐。记录留在原始记录，不是品牌黑名单。`,
      blocksNovel: true,
    };
  }
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

export function confirmationWindow(sightings: Sighting[], windowHours: number) {
  const timed = sightings
    .map((item) => ({ item, time: Date.parse(item.at || "") }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  let bestGroups: SourceGroup[] = [];
  let bestStart: number | null = null;
  let bestEnd: number | null = null;
  for (let index = 0; index < timed.length; index += 1) {
    const start = timed[index].time;
    const slice: Sighting[] = [];
    let end = start;
    for (let next = index; next < timed.length; next += 1) {
      if (timed[next].time - start > windowHours * 3600000) break;
      slice.push(timed[next].item);
      end = timed[next].time;
    }
    const groups = groupSightings(slice);
    const span = end - start;
    const bestSpan = bestStart == null || bestEnd == null ? Number.POSITIVE_INFINITY : bestEnd - bestStart;
    if (groups.length > bestGroups.length || (groups.length === bestGroups.length && groups.length > 0 && span < bestSpan)) {
      bestGroups = groups;
      bestStart = start;
      bestEnd = end;
    }
  }
  return {
    groups: bestGroups,
    windowHours,
    windowStart: bestStart == null ? null : new Date(bestStart).toISOString(),
    windowEnd: bestEnd == null ? null : new Date(bestEnd).toISOString(),
  };
}

function youngEvidence(evidence: AgeEvidence[], now: number) {
  return evidence.some((item) => {
    const time = item.at ? Date.parse(item.at) : NaN;
    return Number.isFinite(time) && now - time <= 180 * 86400000 && now - time >= 0;
  });
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
  const baseline = baselineRelation(input.term);
  const focus = input.industries.filter((industry) => (FOCUS_INDUSTRIES as readonly string[]).includes(industry));
  let chosen = focus[0] || "";
  let counted = confirmationWindow([], windowHours);
  for (const industry of focus) {
    const scoped = input.sightings.filter((item) => item.industry === industry);
    const window = confirmationWindow(scoped, windowHours);
    if (window.groups.length > counted.groups.length) {
      chosen = industry;
      counted = window;
    }
  }
  const windowFields = {
    industry: chosen,
    independent: counted.groups.length,
    groups: counted.groups,
    windowHours,
    windowStart: counted.windowStart,
    windowEnd: counted.windowEnd,
  };
  if (excluded.status === "established" || baseline.relation === "exact") {
    return {
      status: "established" as NoveltyStatus,
      reason: `${excluded.reason} 窗口内的讨论组只说明有人提到它，不能代替历史排除。`,
      ...windowFields,
    };
  }
  const common = commonTermKind(input.term);
  if (common) {
    return {
      status: "unverified" as NoveltyStatus,
      reason: `「${input.term}」属于${common}。新仓库、新帖或同名路径不能把这个说法投射成新产品。`,
      ...windowFields,
    };
  }
  if ("blocksNovel" in excluded && excluded.blocksNovel) {
    return {
      status: "unverified" as NoveltyStatus,
      reason: `${excluded.reason} 窗口内的讨论不能把它变成新词。`,
      ...windowFields,
    };
  }
  if (baseline.relation === "embedded") {
    return {
      status: "unverified" as NoveltyStatus,
      reason: `${excluded.reason} 两组讨论、新域名或新仓库都不能把含有该实体的组合短语放行。`,
      ...windowFields,
    };
  }
  if (!focus.length) {
    return {
      status: "unverified" as NoveltyStatus,
      reason: "还没有和这个名称绑定的简介或产品上下文，行业待定。不能只因为名字里没有行业词就断言它不属于，也不能把整篇综述的标签灌给它。",
      industry: "",
      independent: 0,
      groups: [] as SourceGroup[],
      windowHours,
      windowStart: null,
      windowEnd: null,
    };
  }
  const young = youngEvidence(input.ageEvidence ?? [], now);
  const span = counted.windowStart && counted.windowEnd ? Date.parse(counted.windowEnd) - Date.parse(counted.windowStart) : 0;
  const spanHours = Math.max(0, Math.round(span / 3600000));
  const windowNote = counted.groups.length
    ? `计数窗口 ${windowHours} 小时，实际从 ${counted.windowStart} 到 ${counted.windowEnd}，跨 ${spanHours} 小时，计入 ${counted.groups.length} 组。只计这个子窗口里的来源，不把更早或更晚的讨论算进去。`
    : `没有落在 ${windowHours} 小时子窗口里的可分组来源。`;
  if (young && counted.groups.length >= 2) {
    return {
      status: "novel" as NoveltyStatus,
      reason: `${chosen} 基线内同时满足三项：观察到的年轻诞生记录、没有更早的历史排除、以及窗口内 ${counted.groups.length} 组可分开来源。${windowNote} 分组只依据链接、标题和发起人，不能保证识别出所有同一运营者。诞生记录来自已采到的仓库、域名或发布日，不是编造的发布时间。`,
      ...windowFields,
    };
  }
  const missingBirth = counted.groups.length >= 2
    ? "窗口内的讨论组只证明有人在谈，没有独立诞生证据，不能进入推荐。"
    : "窗口内独立来源不足，而且也不能用缺历史记录来证明它是新词。";
  return {
    status: "unverified" as NoveltyStatus,
    reason: `${missingBirth}${young ? " 已有年轻域名或仓库记录，但单独不够，还要和历史排除、窗口内两组一起满足。" : " 缺独立诞生证据时一律待验证。"} ${windowNote}`,
    ...windowFields,
  };
}

export type SearchStatus = "unknown" | "absent" | "indexed";

export function releaseWindowDays() {
  const raw = Number(process.env.NOVEL_WINDOW_DAYS || NOVEL_WINDOW_DAYS);
  if (!Number.isFinite(raw)) return NOVEL_WINDOW_DAYS;
  return Math.min(3650, Math.max(30, Math.round(raw)));
}

export type ReleaseRow = {
  kind?: string | null;
  title?: string | null;
  url?: string | null;
  quote?: string | null;
  publishedAt?: string | null;
  collectedAt?: string | null;
  eventKind?: AgeEvidence["kind"] | "package_created" | "listing_updated" | null;
  eventAt?: string | null;
};

export function githubRepoName(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "github.com") return "";
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return "";
  const repo = parts[1].replace(/\.git$/i, "");
  if (!parts[0] || !repo || parts[0] === "." || repo === "..") return "";
  return `${parts[0]}/${repo}`.toLowerCase();
}

export function commonTermKind(term: string) {
  if (/\b(hypothesis|conjecture|theorem|lemma)\b/i.test(term)) return "数学通名";
  if (/\b(emulator|emulation)\b/i.test(term)) return "模拟器类别";
  if (/\binternships?\b/i.test(term)) return "实习清单";
  if (/\bsdk\b/i.test(term)) return "SDK 名称壳";
  if (/\b(awesome|cheatsheet)\b/i.test(term)) return "清单";
  return "";
}

export function reviewLane(term: string, rows: ReleaseRow[], now = Date.now(), windowDays = releaseWindowDays()) {
  const baseline = baselineRelation(term);
  if (baseline.relation === "exact") return { lane: "raw" as const, reason: "名称已由基线排除，不会进待核候选。" };
  if (baseline.relation === "embedded") {
    return { lane: "raw" as const, reason: `短语包含已知实体「${baseline.label}」，但没有这个组合自己的发布绑定。先留在原始记录，不把它写成已知旧词，也不进入待核候选。` };
  }
  if (/\b(privacy (policy|notice|statement)|cookie (policy|notice|settings)|terms of (service|use))\b/i.test(term)) {
    return { lane: "raw" as const, reason: "导航、隐私或条款页用语。原始记录保留，不进入待核候选。" };
  }
  const common = commonTermKind(term);
  const repoDates = dated(rows, (row) => row.eventKind === "repo_created" && Boolean(githubRepoName(row.url || "")), now);
  if (common) {
    const seen = repoDates[0]?.at;
    return {
      lane: "raw" as const,
      reason: seen
        ? `「${term}」属于${common}。绑定仓库的创建时间原文是 ${seen}，不能把仓库年龄投射成这个说法的诞生。`
        : `「${term}」属于${common}。同名路径或清单不能进入待核。`,
    };
  }
  const packageDates = dated(rows, (row) => (row.eventKind === "package_created" || row.eventKind === "product_launch") && packagePlace(term, row.url || "") && !versionTitle(row.title || ""), now);
  const domainReg = dated(rows, (row) => row.eventKind === "domain_registered", now);
  const older = [...repoDates, ...packageDates, ...domainReg].filter((item) => item.age === "old").sort((a, b) => a.ms - b.ms);
  if (older.length) {
    return {
      lane: "raw" as const,
      reason: `绑定记录的时间原文是 ${older[0].at}，早于 ${windowDays} 天窗口。新帖、重上架、Show HN 或新镜像不能把它变成近期首发。这不是品牌黑名单。`,
    };
  }
  const births = [...repoDates, ...packageDates].filter((item) => item.age === "recent");
  if (births.length) {
    const hit = births.find((item) => rowContext(term, item.url, rows));
    if (!hit) {
      return { lane: "raw" as const, reason: `创建时间原文是 ${births[0].at}，落在窗口内，但同一地址上没有产品上下文。没有因为名字里缺少行业词而拒绝。` };
    }
    return { lane: "candidate" as const, reason: candidateReason(term, hit.at, hit.url) };
  }
  if (rows.some((row) => packagePlace(term, row.url || "") && versionTitle(row.title || ""))) {
    return { lane: "raw" as const, reason: "目录或包标题是版本号、重上架或更新，不是原始创建。旧包的新版本不进入待核。" };
  }
  const published = publishedRelease(term, rows, now, windowDays);
  if (published.kind === "version") {
    return { lane: "raw" as const, reason: "目录或包标题是版本号、重上架或更新，不是原始创建。旧包的新版本不进入待核。" };
  }
  if (published.kind === "recent") return { lane: "candidate" as const, reason: candidateReason(term, published.at, published.url) };
  if (rows.some((row) => row.url && releaseUrl(term, row.url))) {
    return { lane: "raw" as const, reason: "有仓库、包或产品地址，但没有可核对的创建或原始发布时间。先留在原始记录待补证据，不能据此说它是旧项目，也不是已知旧词结论。" };
  }
  return { lane: "raw" as const, reason: "没有绑定到它自己的发布、仓库、产品页或自有域名。标签串和综述提及只留在原始记录。这不是已知旧词结论。" };
}

function candidateReason(term: string, at: string, url: string) {
  return `有与「${term}」绑定的近期原始发布（时间原文 ${at}，${url}）。仍缺第二组独立来源或更完整的历史核验，所以只进待核，不是推荐。`;
}

function dated(rows: ReleaseRow[], take: (row: ReleaseRow) => boolean, now: number) {
  const out: { at: string; ms: number; url: string; age: "recent" | "old" }[] = [];
  for (const row of rows) {
    if (!take(row) || !row.eventAt || !row.url) continue;
    const when = ageOf(row.eventAt, now);
    if (!when) continue;
    out.push({ at: row.eventAt, ms: when.ms, url: row.url, age: when.age });
  }
  return out;
}

function ageOf(at: string, now: number, windowDays = releaseWindowDays()) {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms) || ms > now + 5 * 60 * 1000) return null;
  return { ms, age: now - ms <= windowDays * 86400000 ? ("recent" as const) : ("old" as const) };
}

function publishedRelease(term: string, rows: ReleaseRow[], now: number, windowDays: number) {
  let version = false;
  let hit: { at: string; url: string } | null = null;
  for (const row of rows) {
    if (!row.url || row.eventKind) continue;
    const place = releaseUrl(term, row.url);
    if (place !== "domain" && place !== "ph") continue;
    if (versionTitle(`${row.title || ""} ${row.quote || ""}`)) {
      version = true;
      continue;
    }
    if (!row.publishedAt || !sourceTime(row)) continue;
    if (!rowContext(term, row.url, [row])) continue;
    if (ageConflicts(rows, row)) continue;
    const when = ageOf(row.publishedAt, now, windowDays);
    if (!when || when.age !== "recent") continue;
    if (!hit || when.ms < Date.parse(hit.at)) hit = { at: row.publishedAt, url: row.url };
  }
  if (hit) return { kind: "recent" as const, ...hit };
  if (version) return { kind: "version" as const, at: "", url: "" };
  return { kind: "none" as const, at: "", url: "" };
}

function sourceTime(row: ReleaseRow) {
  if (!row.publishedAt || !Number.isFinite(Date.parse(row.publishedAt))) return false;
  if (row.collectedAt && Number.isFinite(Date.parse(row.collectedAt)) && Date.parse(row.publishedAt) === Date.parse(row.collectedAt)) return false;
  return true;
}

function ageConflicts(rows: ReleaseRow[], row: ReleaseRow) {
  const noted = rows.filter((item) => item.eventKind === "product_launch" && item.url && item.eventAt && samePlace(item.url, row.url || ""));
  if (!noted.length) return false;
  return noted.every((item) => Date.parse(item.eventAt || "") !== Date.parse(row.publishedAt || ""));
}

function samePlace(a: string, b: string) {
  const left = githubRepoName(a) || hostKey(a);
  const right = githubRepoName(b) || hostKey(b);
  return Boolean(left) && left === right;
}

function hostKey(raw: string) {
  try {
    const url = new URL(raw);
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/$/, "").toLowerCase()}`;
  } catch {
    return "";
  }
}

function rowContext(term: string, url: string, rows: ReleaseRow[]) {
  return rows.some((row) => row.url && samePlace(row.url, url) && hasProductContext(term, row.title, row.quote));
}

function hasProductContext(term: string, title?: string | null, quote?: string | null) {
  const left = (title || "").trim();
  const right = (quote || "").trim();
  const text = (right.length >= left.length ? right : left).replace(/\s+/g, " ").trim();
  if (!text || /\b(today on github|this week on github|roundup|weekly digest)\b/i.test(text)) return false;
  let stripped = text;
  for (const part of normalizeNoveltyName(term).split(" ")) {
    if (part.length < 2) continue;
    stripped = stripped.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig"), " ");
  }
  if ((stripped.match(/\p{Script=Han}/gu) || []).length >= 8) return true;
  const stop = new Set("a an the and or for of to with on in by from is are was be this that its not".split(" "));
  const tokens = new Set(stripped.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((token) => token.length > 2 && !stop.has(token)));
  return tokens.size >= 3;
}

function versionTitle(title: string) {
  return /\b\d+\.\d+\b/.test(title) || /\b(relaunch|re-release)\b/i.test(title);
}

function packagePlace(term: string, raw: string) {
  const place = releaseUrl(term, raw);
  return place === "pypi" || place === "npm";
}

function sameSlug(slug: string, term: string) {
  const compact = normalizeNoveltyName(term).replace(/ /g, "");
  return compact.length >= 3 && slug.toLowerCase().replace(/[-_]/g, "") === compact;
}

function releaseUrl(term: string, raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const parts = parsed.pathname.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (host === "github.com" && parts.length >= 2 && sameSlug(parts[1], term)) return "github" as const;
  if (host === "pypi.org" && parts[0] === "project" && parts[1] && sameSlug(parts[1], term)) return "pypi" as const;
  if ((host === "npmjs.com" || host === "www.npmjs.com") && parts[0] === "package" && parts[1] && sameSlug(parts[1], term)) return "npm" as const;
  if (host === "producthunt.com" && (parts[0] === "products" || parts[0] === "posts") && parts[1] && sameSlug(parts[1], term)) return "ph" as const;
  const label = host.split(".")[0]?.replace(/[-_]/g, "") || "";
  if (label && sameSlug(label, term) && parts.length <= 1) return "domain" as const;
  return null;
}

export function judgeSearch(input: {
  suggest: boolean | null;
  trends: boolean | null;
  dataForSeoConfigured?: boolean;
  dataForSeo?: "indexed" | "absent" | "error" | null;
}) {
  const auxiliary = [input.suggest === true ? "google-suggest" : "", input.trends === true ? "google-trends-rss" : ""].filter(Boolean);
  const aux = auxiliary.length ? `辅助信号：${auxiliary.join("、")}。自动补全或趋势出现不等于网页已被搜索引擎收录。` : "";
  if (input.dataForSeo === "indexed") {
    return { status: "indexed" as SearchStatus, method: "dataforseo", note: `索引检查看到了页面证据。${aux}` };
  }
  if (input.dataForSeo === "absent") {
    return { status: "absent" as SearchStatus, method: "dataforseo", note: `索引检查没有检出页面。未检出不等于未收录，也不表示早于搜索引擎。${aux}` };
  }
  return {
    status: "unknown" as SearchStatus,
    method: auxiliary.join("+"),
    note: `${aux}${input.dataForSeo === "error" ? "索引检查失败。" : ""}没有索引页面证据，状态保持未知，不能写成已有收录或未收录。`,
  };
}
