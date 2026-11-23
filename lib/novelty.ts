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
  return raw.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
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
  if (youngReason) return { status: "novel" as NoveltyStatus, reason: youngReason };
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
