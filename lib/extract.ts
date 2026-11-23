import { properNounCandidates } from "./signals/names";
import { decodeHtml } from "./xml";

export type Intent = "informational" | "commercial" | "comparison" | "navigational" | "unknown";

export type Phrase = {
  term: string;
  display: string;
  kind: "product" | "question" | "title" | "hashtag" | "repo" | "slug";
  always: boolean;
};

const STOP = new Set(
  "a an the of and or to for in on with from by at as is are was were be been being it this that these those i you we they he she them my your our their not no nor but if so than then too very just about into over after before up down out off own same other such only also can will may should could would do does did doing done its his her their what when where who whom which while during per via than".split(
    /\s+/,
  ),
);

const GENERIC = new Set(
  "app apps tool tools video videos news update updates review reviews guide guides tips tip best new official launch launches launched announces announced says said reportedly post posts question questions help issue issues problem problems discussion weekly daily thread release version data system model using use used your this that just like more about into over after before people users user time world year years day days way make get based open source free online web site sites page pages blog article articles story stories comment comments team company market business work working need want know think look looking good great better real right still even back now today week month thing things something anything everything someone anyone please thanks thank read full show ask tell hn really actually getting started introduction overview recap roundup newsletter podcast episode season series part".split(
    /\s+/,
  ),
);

const DISTINCTIVE = new Set(
  "ai seo llm gpt api ios aws crm dtc b2b b2c sku etl rag mcp sql gpu cpu ar vr xr nft defi saas d2c ugc kol ppc sem etl ipo etf dao vpn cms erp ide cli sdk faq kpi roas ctr cpm".split(
    /\s+/,
  ),
);

const HEAD_SINGLE = new Set(
  "ai seo llm gpt saas b2b b2c api nft defi crypto startup chatgpt openai google github reddit youtube software technology business onboarding product platform service data model system people news video game games finance fitness health marketing ecommerce bitcoin ethereum app apps tool tools whatsapp wordpress facebook instagram tiktok nofollow noreferrer noopener fundamental shadow mined".split(/\s+/),
);

const NARRATIVE = new Set(
  "have has had argued argues argue provide provides provided say says said drop drops seem seems include includes work works worked feel feels felt become becomes became mean means meant always instead without whether won".split(/\s+/),
);

const BLOCK = new Set([
  "artificial intelligence",
  "machine learning",
  "open source",
  "social media",
  "hacker news",
  "product hunt",
  "stack overflow",
  "show hn",
  "ask hn",
  "read more",
  "learn more",
  "full story",
  "github",
  "reddit",
  "youtube",
  "google",
  "twitter",
  "the new",
]);

const INDUSTRY_RULES: [string, RegExp][] = [
  ["ai", /\b(ai|llm|gpt|chatgpt|claude|gemini|openai|anthropic|machine learning|neural|rag|agentic|copilot|diffusion)\b/i],
  ["crypto", /\b(crypto|bitcoin|ethereum|solana|defi|nft|blockchain|web3|tokenomics)\b/i],
  ["ecommerce", /\b(ecommerce|e-commerce|shopify|dtc|d2c|amazon seller|sku|checkout|storefront)\b/i],
  ["marketing", /\b(seo|sem|ppc|backlink|keyword research|content marketing|newsletter growth|search console)\b/i],
  ["health", /\b(fitness|workout|skincare|supplement|nutrition|longevity|sleep tracker|protein powder)\b/i],
  ["gaming", /\b(gaming|game dev|steam deck|playstation|xbox|nintendo|esports|indie game)\b/i],
  ["finance", /\b(stocks|investing|portfolio|fintech|trading|etf|mortgage|personal finance|brokerage)\b/i],
  ["saas", /\b(saas|b2b|startup|mrr|arr|onboarding|workflow automation|product led)\b/i],
  ["devtools", /\b(developer tool|devtools|cli tool|sdk|linter|github action|vscode extension|package manager|ide plugin)\b/i],
];

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/&amp;/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}\s.+#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanToken(token: string) {
  return token.replace(/^[.#]+|[.#]+$/g, "");
}

function tokensOf(input: string) {
  return normalize(input)
    .split(" ")
    .map(cleanToken)
    .filter((token) => token && !/^\d+$/.test(token) && !/^v\d+(\.\d+)*$/.test(token) && token.length <= 32);
}

function contentWords(input: string) {
  return tokensOf(input).filter((token) => !STOP.has(token) && !GENERIC.has(token) && (token.length > 1 || DISTINCTIVE.has(token)));
}

function niceDisplay(original: string, phrase: string) {
  const source = original.split(/\s+/);
  return phrase
    .split(" ")
    .map((word) => {
      const found = source.find((part) => cleanToken(normalize(part)) === word);
      if (!found) return word;
      return found.replace(/^[^\p{L}\p{N}#]+|[^\p{L}\p{N}.+#]+$/gu, "");
    })
    .join(" ");
}

function acceptPhrase(phrase: string, kind: Phrase["kind"]) {
  const normalized = normalize(phrase);
  if (!normalized || normalized.length < 3 || normalized.length > 80) return null;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length > 10) return null;
  if (words.every((word) => STOP.has(word) || GENERIC.has(word))) return null;
  if (BLOCK.has(normalized)) return null;
  if (normalized.includes("x2f") || normalized.startsWith("http") || /\bwww\b/.test(normalized)) return null;
  if (!words.some((word) => word.length >= 4 || DISTINCTIVE.has(word) || word.includes("."))) return null;
  if (words.length === 1) {
    const only = words[0];
    if (HEAD_SINGLE.has(only) || GENERIC.has(only) || only.length < 5) return null;
    if (!only.includes(".") && kind !== "repo" && kind !== "product" && kind !== "hashtag") return null;
  }
  if ((kind === "title" || kind === "slug") && words.some((word) => NARRATIVE.has(word))) return null;
  if (kind === "title" && (words.length < 2 || words.length > 4)) return null;
  if (isNoiseTerm(normalized)) return null;
  return normalized;
}

const NOISE_COMPACT = new Set(
  "techseo aiseo gamedev indiegame lowpoly pixelart skincareroutine ceraveskincare hyaluronicacid tiktokshowcase producthunt buildinpublic geovision rankproseo customsoftware softwaredevelopment productmanagement elearning".split(/\s+/),
);

export function isNoiseTerm(normalized: string) {
  const words = normalized.split(" ").filter(Boolean);
  const compact = words.join("");
  if (!compact || compact.length < 3) return true;
  if (/^x[0-9a-f]{3,5}$/i.test(compact)) return true;
  if (/[a-z](19|20)\d{2}$/.test(compact)) return true;
  if (NOISE_COMPACT.has(compact)) return true;
  if (words.length === 1 && (HEAD_SINGLE.has(words[0]) || GENERIC.has(words[0]) || NARRATIVE.has(words[0]) || ESTABLISHED.has(words[0]))) return true;
  if (words.some((word) => NARRATIVE.has(word)) && !words.includes("vs")) return true;
  if (words.some((word) => MONTHS.has(word)) || words[0] === "general") return true;
  if (/dailythread$|weeklythread$|megathread|showcase$/.test(compact)) return true;
  const content = words.filter((word) => !STOP.has(word) && !GENERIC.has(word) && !HEAD_SINGLE.has(word) && !SOFT.has(word));
  if (!content.length) return true;
  if (words.length >= 3 && content.length < 2 && !words.includes("vs")) return true;
  if (words.length > 5 && !words.includes("vs")) return true;
  return false;
}

const ESTABLISHED = new Set(
  "typescript javascript python pytorch react nextjs openai google amazon microsoft apple meta nvidia coindesk blackrock bitcoin ethereum automoderator chatgpt copilot claude gemini technicalseo reddit youtube tiktok instagram facebook shopify wordpress woocommerce".split(/\s+/),
);
const MONTHS = new Set("january february march april may june july august september october november december".split(" "));
const SOFT = new Set(
  "tab accept changes change general major non current platform store development environment hardware software system project projects data model service services tool tools agent agents daily weekly thread mega facing won base code review reviews fix fixes report reports above dont stop below into just really very much many".split(/\s+/),
);

function pushPhrase(bucket: Phrase[], original: string, phrase: string, kind: Phrase["kind"], always: boolean) {
  const term = acceptPhrase(phrase, kind);
  if (!term) return;
  if (bucket.some((item) => item.term === term)) return;
  bucket.push({ term, display: niceDisplay(original, term) || term, kind, always });
}

export function splitHeadline(title: string) {
  const stripped = title.replace(/^(show|ask|tell|launch)\s+hn\s*:\s*/i, "").trim();
  const parts = stripped.split(/\s+[–—|]\s+|\s+-\s+/);
  if (parts.length >= 2) {
    const left = parts[0].trim();
    const leftWords = left.split(/\s+/);
    const looksNamed =
      leftWords.length <= 4 &&
      (leftWords.length === 1 ||
        left.includes(".") ||
        leftWords.every((word) => /^[A-Z0-9]/.test(word) || /^[a-z0-9]+\.[a-z]{2,}$/i.test(word)));
    if (looksNamed) return { product: left, rest: parts.slice(1).join(" ").trim() };
  }
  return { product: undefined as string | undefined, rest: stripped };
}

export function phrasesFromText(input: { title?: string; body?: string; productName?: string; repoName?: string; slug?: string; social?: boolean }): Phrase[] {
  const phrases: Phrase[] = [];
  const title = decodeHtml(input.title ?? "").trim();
  const body = decodeHtml(input.body ?? "").slice(0, 900);
  const blob = `${title} ${body}`.trim();

  if (input.productName) pushPhrase(phrases, input.productName, contentWords(input.productName).join(" ") || input.productName, "product", true);
  if (input.repoName) {
    const repo = input.repoName.split("/").pop() ?? input.repoName;
    const human = repo.replace(/[-_]+/g, " ");
    pushPhrase(phrases, human, contentWords(human).join(" ") || human, "repo", true);
  }
  if (input.slug) pushPhrase(phrases, input.slug, contentWords(input.slug).join(" "), "slug", true);

  if (title && !input.social) {
    const split = splitHeadline(title);
    if (split.product) pushPhrase(phrases, split.product, contentWords(split.product).join(" ") || split.product, "product", true);
    const words = contentWords(split.rest);
    if (words.length >= 2 && words.length <= 4) pushPhrase(phrases, split.rest, words.join(" "), "title", true);
  }

  const patternSource = blob.slice(0, 700);
  const patterns: RegExp[] = [
    /\balternative to ([a-z0-9][\w.+#-]{1,32}(?:\s+[a-z0-9][\w.+#-]{1,24}){0,3})/gi,
    /\b([a-z0-9][\w.+#-]{1,24}(?:\s+[a-z0-9][\w.+#-]{1,24}){0,2})\s+vs\.?\s+([a-z0-9][\w.+#-]{1,24}(?:\s+[a-z0-9][\w.+#-]{1,24}){0,2})/gi,
    /\bhow (?:do i|to)\s+([^?.!]{4,70})/gi,
    /\bis there (?:a|an|any)\s+([^?.!]{4,70})/gi,
    /\b(?:best|top)\s+([^?.!]{3,40}?)\s+(?:tool|tools|software|app|apps|platform)s?\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of patternSource.matchAll(pattern)) {
      const captured = match.slice(1).filter(Boolean).join(" vs ");
      pushPhrase(phrases, captured, contentWords(captured).join(" ") || captured, "question", true);
    }
  }

  for (const match of blob.matchAll(/#([A-Za-z][A-Za-z0-9_]{2,30})/g)) {
    const raw = match[1];
    const lower = raw.toLowerCase();
    const shaped = /[a-z][A-Z]|[A-Z][a-z]+[A-Z]|[0-9]/.test(raw);
    if (!shaped || HEAD_SINGLE.has(lower) || GENERIC.has(lower) || isNoiseTerm(lower)) continue;
    pushPhrase(phrases, raw, raw, "hashtag", true);
  }
  for (const name of properNounCandidates(blob)) pushPhrase(phrases, name, name, "product", true);
  for (const match of blob.matchAll(/\b((?:[A-Z][a-z]+){2,}[A-Za-z0-9]*)\b/g)) {
    pushPhrase(phrases, match[1], contentWords(match[1]).join(" ") || match[1], "product", true);
  }
  for (const match of blob.matchAll(/"([^"]{3,40})"/g)) {
    const words = contentWords(match[1]);
    if (words.length >= 2 && words.length <= 4) pushPhrase(phrases, match[1], words.join(" "), "product", true);
  }

  return phrases.slice(0, 6);
}

export function detectIntent(text: string): Intent {
  const value = text.toLowerCase();
  if (/\b(vs\.?|versus|alternative to|compared to|compare)\b/.test(value)) return "comparison";
  if (/\b(pricing|buy|discount|coupon|affiliate|review|software|platform|saas|best|recommend|cheap|subscription)\b/.test(value)) return "commercial";
  if (/\b(how|what|why|guide|tutorial|is there|anyone|does anyone|help me)\b/.test(value)) return "informational";
  if (/\b(login|official site|homepage|download)\b/.test(value)) return "navigational";
  return "unknown";
}

export function classifyIndustries(text: string): string[] {
  const found = INDUSTRY_RULES.filter(([, rule]) => rule.test(text)).map(([id]) => id);
  return found.length ? found : [];
}

export function painNote(text: string): string | null {
  const match = text.match(
    /(?:frustrating|annoying|hate|broken|doesn'?t work|too expensive|struggling|looking for|wish there was|pain|complaint|sucks|can'?t find)[^.]{0,80}/i,
  );
  return match ? match[0].replace(/\s+/g, " ").trim() : null;
}

export function quoteAround(text: string, term: string): string {
  const plain = text.replace(/\s+/g, " ").trim();
  if (!plain) return "";
  const needle = term.toLowerCase();
  const idx = plain.toLowerCase().indexOf(needle.split(" ")[0] ?? needle);
  if (idx < 0) return plain.slice(0, 180);
  const start = Math.max(0, idx - 60);
  const end = Math.min(plain.length, idx + 120);
  const slice = plain.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${slice}${end < plain.length ? "…" : ""}`;
}

export function withinDays(iso: string | undefined | null, days: number) {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t <= days * 86400000;
}

export function hoursSince(iso: string | undefined | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0.2, (Date.now() - t) / 3600000);
}
