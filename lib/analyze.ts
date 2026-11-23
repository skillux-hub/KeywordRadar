import { INTENT_LABEL } from "./catalog";
import { all, get, run } from "./db";
import { commercialScore } from "./score";
import { fetchJson, fetchText } from "./http";
import { classifyResultPage, deriveSerpShape, kgr, loosenCompetition } from "./signals/serp";
import { dataForSeoEnabled, monthlySearchVolume, serpExtras } from "./vendors/dataforseo";
import { clamp } from "./utils";

type TermRow = {
  id: number;
  display: string;
  normalized: string;
  stage: string | null;
  intent: string | null;
  summary: string | null;
  spark_json: string | null;
  discovery_score: number;
};

const AUTHORITY = [
  "wikipedia.org", "amazon.com", "youtube.com", "nytimes.com", "forbes.com", "bbc.com", "bbc.co.uk", "theguardian.com",
  "cnn.com", "linkedin.com", "microsoft.com", "apple.com", "google.com", "moz.com", "ahrefs.com", "hubspot.com",
  "shopify.com", "healthline.com", "webmd.com", "investopedia.com", "techcrunch.com", "theverge.com", "wired.com",
  "wsj.com", "bloomberg.com", "reuters.com", "github.com", "medium.com",
];
const UGC = ["reddit.com", "quora.com", "stackoverflow.com", "stackexchange.com", "facebook.com", "x.com", "twitter.com", "tiktok.com", "bsky.app", "news.ycombinator.com"];

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function serpLinks(query: string): Promise<{ links: string[]; provider: string; note: string }> {
  const serpKey = process.env.SERPAPI_KEY;
  if (serpKey) {
    const res = await fetchJson<{ organic_results?: { link?: string }[] }>(
      `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&gl=us&hl=en&num=10&api_key=${encodeURIComponent(serpKey)}`,
      { timeoutMs: 15000, hostKey: "serpapi.com" },
    );
    const links = (res.data?.organic_results ?? []).map((row) => row.link).filter((link): link is string => Boolean(link));
    if (links.length) return { links: links.slice(0, 10), provider: "SerpAPI", note: "" };
  }
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (login && password) {
    const res = await fetchJson<{ tasks?: { result?: { items?: { type?: string; url?: string }[] }[] }[] }>(
      "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
      {
        method: "POST",
        timeoutMs: 20000,
        hostKey: "api.dataforseo.com",
        headers: { authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`, "content-type": "application/json" },
        body: JSON.stringify([{ keyword: query, location_code: 2840, language_code: "en", depth: 10 }]),
      },
    );
    const links = (res.data?.tasks?.[0]?.result?.[0]?.items ?? [])
      .filter((item) => item.type === "organic" && item.url)
      .map((item) => item.url as string);
    if (links.length) return { links: links.slice(0, 10), provider: "DataForSEO", note: "" };
  }
  const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    browser: true,
    intervalMs: 800,
    timeoutMs: 12000,
    hostKey: "html.duckduckgo.com",
  });
  if (!html.ok) return { links: [], provider: "none", note: "没有 SERP 密钥，DuckDuckGo 也没有返回结果" };
  const links: string[] = [];
  for (const match of html.text.matchAll(/class="result__a"[^>]*href="([^"]+)"/g)) {
    const href = match[1];
    if (href.includes("ad_domain") || href.includes("ad_provider")) continue;
    const encoded = href.match(/uddg=([^&]+)/)?.[1];
    if (!encoded) continue;
    try {
      const real = decodeURIComponent(encoded);
      if (!real.startsWith("http") || real.includes("duckduckgo.com")) continue;
      links.push(real);
    } catch {
      /* skip bad url */
    }
  }
  return {
    links: links.slice(0, 10),
    provider: links.length ? "DuckDuckGo" : "none",
    note: links.length ? "未配置 SERPAPI_KEY / DataForSEO，用 DuckDuckGo 公开结果做粗分类" : "公开搜索没有解析到链接",
  };
}

function classifySerp(links: string[], term: string) {
  let authority = 0;
  let ugc = 0;
  let small = 0;
  let dedicated = 0;
  const rows = links.map((link) => {
    const domain = host(link);
    const kind = UGC.some((item) => domain.endsWith(item)) ? "ugc" : AUTHORITY.some((item) => domain.endsWith(item)) ? "authority" : "small";
    if (kind === "ugc") ugc += 1;
    else if (kind === "authority") authority += 1;
    else small += 1;
    const slug = link.toLowerCase();
    if (term.length > 4 && slug.includes(term.replace(/\s+/g, "-"))) dedicated += 1;
    return { url: link, domain, kind };
  });
  let label = "未检测";
  let score: number | null = null;
  if (links.length >= 5) {
    if (authority <= 2 && ugc + small >= 6) {
      label = "蓝海";
      score = 28;
    } else if (authority >= 6) {
      label = "红海";
      score = 84;
    } else {
      label = "竞争中等";
      score = 56;
    }
  }
  return { label, score, dedicated, rows };
}

function domainCandidates(term: string) {
  const words = term.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word && word.length > 1);
  if (!words.length || words.length > 3) return [];
  const joined = words.join("");
  const hyphen = words.join("-");
  const out = [];
  if (joined.length >= 4 && joined.length <= 24) out.push(`${joined}.com`);
  if (hyphen.includes("-") && hyphen.length <= 32) out.push(`${hyphen}.com`);
  return out.slice(0, 2);
}

async function rdap(domain: string) {
  const res = await fetchText(`https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(domain)}`, {
    intervalMs: 400,
    timeoutMs: 10000,
    hostKey: "rdap.verisign.com",
    headers: { accept: "application/rdap+json, application/json" },
  });
  if (res.status === 404) return { status: "available" as const, registered: null as string | null };
  if (!res.ok) return { status: "unknown" as const, registered: null };
  try {
    const json = JSON.parse(res.text) as { events?: { eventAction?: string; eventDate?: string }[] };
    const registered = json.events?.find((event) => event.eventAction === "registration")?.eventDate ?? null;
    return { status: "taken" as const, registered };
  } catch {
    return { status: "unknown" as const, registered: null };
  }
}

function lifecycle(spark: number[]) {
  const active = spark.filter((value) => value > 0).length;
  if (active < 3) {
    return { label: "观察中", confidence: 0.28, note: "还没有跨越多天的快照，先不判断昙花一现还是能做长。" };
  }
  const mid = Math.ceil(spark.length / 2);
  const first = spark.slice(0, mid).reduce((sum, value) => sum + value, 0);
  const second = spark.slice(mid).reduce((sum, value) => sum + value, 0);
  const peak = Math.max(...spark);
  const last = spark[spark.length - 1] ?? 0;
  if (last < peak * 0.4 && first > second) {
    return { label: "短期热点", confidence: clamp(active / 8, 0.4, 0.85), note: "前段冲高，最近的快照已经掉下去。" };
  }
  if (second >= first * 0.85) {
    return { label: "可持续", confidence: clamp(active / 10, 0.45, 0.9), note: "后面的快照还在出现，不像一天的噪音。" };
  }
  return { label: "观察中", confidence: 0.4, note: "曲线还不稳定。" };
}

function heuristicOutline(term: TermRow, related: string[], questions: string[]) {
  const intent = INTENT_LABEL[term.intent ?? "unknown"] ?? "未判定";
  return {
    titles: [
      `${term.display}: what people are asking before the search results fill in`,
      `Best ${term.display} options right now`,
      `${term.display} vs the usual alternatives`,
    ],
    sections: [
      { heading: "讨论里出现了什么", points: [term.summary || "多个早期来源已经出现。这只是讨论记录，不是搜索引擎收录，也不表示我们更早。"] },
      { heading: "人们在问什么", points: questions.length ? questions.slice(0, 4) : ["先回答定义、适用对象和第一步。"] },
      { heading: "比较和选择", points: related.length ? related.slice(0, 4).map((item) => `顺带覆盖相关说法：${item}`) : ["列出 3 个可比较的做法或产品。"] },
      { heading: "怎么写才对上意图", points: [`当前意图偏向「${intent}」。英文标题给搜索结果用，正文把痛点和例子写具体。`] },
    ],
    related,
    questions,
  };
}

async function llmOutline(term: TermRow, related: string[], questions: string[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetchText(`${base}/chat/completions`, {
    method: "POST",
    timeoutMs: 20000,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "你为英语市场的 SEO 编辑写大纲。只返回 JSON：{titles:string[], sections:{heading:string, points:string[]}[]}。titles 用英文，sections 用简体中文。",
        },
        {
          role: "user",
          content: `关键词：${term.display}\n阶段：${term.stage}\n相关词：${related.join(", ")}\n问题：${questions.join(" | ")}\n背景：${term.summary ?? ""}`,
        },
      ],
    }),
  });
  if (!res.ok) return null;
  try {
    const json = JSON.parse(res.text) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { titles?: string[]; sections?: { heading: string; points: string[] }[] };
    if (!parsed.titles?.length || !parsed.sections?.length) return null;
    return { titles: parsed.titles, sections: parsed.sections, related, questions };
  } catch {
    return null;
  }
}

export async function analyzeTop() {
  const terms = all<TermRow>(
    `select id, display, normalized, stage, intent, summary, spark_json, discovery_score
     from terms
     where novelty = 'novel'
     order by case when stage = 'on_google' then 1 else 0 end, discovery_score desc
     limit 12`,
  );
  for (const term of terms) {
    const fresh = get<{ updated_at: string; competition_label: string | null }>(
      "select updated_at, competition_label from term_analysis where term_id = ?",
      term.id,
    );
    if (fresh?.competition_label && Date.now() - new Date(fresh.updated_at).getTime() < 12 * 3600000) continue;
    const evidence = all<{ title: string | null; quote: string | null; intent: string | null }>(
      "select title, quote, intent from term_evidence where term_id = ? order by id desc limit 12",
      term.id,
    );
    const blob = evidence.map((row) => `${row.title ?? ""} ${row.quote ?? ""}`).join("\n");
    const related = all<{ display: string }>(
      `select display from terms where id != ? and (
         normalized like ? or display like ?
       ) order by opportunity_score desc limit 6`,
      term.id,
      `%${term.normalized.split(" ")[0]}%`,
      `%${term.display.split(" ")[0]}%`,
    ).map((row) => row.display);
    const questions = evidence
      .map((row) => row.title || row.quote || "")
      .filter((line) => /\?|how |what |why |vs |alternative/i.test(line))
      .slice(0, 5);
    const commercial = commercialScore(blob || term.display, term.intent || "unknown");
    const commercialNote =
      commercial >= 70 ? "对比、工具或价格信号比较密，适合带联盟或产品页。" : commercial >= 45 ? "有一定商业意图，但还不是纯购买词。" : "更像讨论或概念，变现要靠后续内容设计。";
    const serp = await serpLinks(term.display);
    const classified = classifySerp(serp.links, term.normalized);
    const pages = serp.links.map((link) => ({ url: link, ...classifyResultPage(link) }));
    const shape = deriveSerpShape(pages);
    const firstSeen = get<{ first_seen_at: string }>("select first_seen_at from terms where id = ?", term.id)?.first_seen_at;
    const ageDays = firstSeen ? (Date.now() - new Date(firstSeen).getTime()) / 86400000 : 999;
    const loosened = loosenCompetition(classified.label, ageDays);
    let allintitle: number | null = null;
    let ads: boolean | null = null;
    let volume: number | null = null;
    if (dataForSeoEnabled()) {
      try {
        const extras = await serpExtras(term.display);
        allintitle = extras.allintitle;
        ads = extras.ads;
        volume = await monthlySearchVolume(term.display);
      } catch {
        allintitle = null;
      }
    }
    const ratio = kgr(allintitle, volume);
    const mix = pages.reduce<Record<string, number>>((acc, page) => {
      acc[page.kind] = (acc[page.kind] ?? 0) + 1;
      return acc;
    }, {});
    const storedRows = classified.rows.map((row) => {
      const page = pages.find((item) => item.url === row.url);
      return {
        ...row,
        pageKind: page?.kind ?? "article",
        homepage: Boolean(page?.homepage),
        platform: Boolean(page?.platform),
      };
    });
    const domains = domainCandidates(term.normalized);
    let domain = domains[0] ?? "";
    let domainStatus = "unknown";
    let registered: string | null = null;
    let landScore: number | null = null;
    let landNote = "词太长或不像域名，未做 RDAP。";
    if (domains[0]) {
      const lookup = await rdap(domains[0]);
      domain = domains[0];
      domainStatus = lookup.status === "taken" ? "taken" : lookup.status === "available" ? "available" : "unknown";
      registered = lookup.registered;
      if (lookup.status === "available") {
        landScore = 94;
        landNote = `${domain} 尚未注册，窗口还开着。`;
      } else if (lookup.status === "taken" && lookup.registered) {
        const ageDays = (Date.now() - new Date(lookup.registered).getTime()) / 86400000;
        if (ageDays < 90) {
          landScore = 58;
          domainStatus = "new";
          landNote = `${domain} 在 ${Math.round(ageDays)} 天前注册，窗口在收窄。`;
        } else {
          landScore = 22;
          landNote = `${domain} 早已被持有。`;
        }
      } else if (lookup.status === "taken") {
        landScore = 30;
        landNote = `${domain} 已注册，没有读到注册日期。`;
      } else {
        landNote = "RDAP 没有给出明确结果。";
      }
      if (classified.dedicated && landScore != null) landScore = clamp(landScore - 15, 0, 100);
    }
    const spark = term.spark_json ? (JSON.parse(term.spark_json) as number[]) : [];
    const life = lifecycle(spark);
    const generated = await llmOutline(term, related, questions);
    const outline = generated ?? heuristicOutline(term, related, questions);
    const method = generated ? "llm" : "heuristic";
    const competitionNote = classified.score == null
      ? serp.note || "竞争度未检测"
      : `${loosened.label}（${serp.provider}）。SERP 形态 ${shape.shape}，平台结果约占 ${Math.round(shape.platformShare * 100)}%。${loosened.loosened ? "词还年轻，竞争档位放宽了一级。" : ""}${ratio != null ? ` KGR ${ratio}。` : ""}${ads == null ? "" : ads ? " 结果里有广告。" : " 没有看到广告。"}`;
    run(
      `insert into term_analysis (
        term_id, competition_label, competition_score, competition_note, competition_json,
        domain, domain_status, domain_registered_at, land_score, land_note,
        lifecycle, lifecycle_confidence, lifecycle_note, commercial_score, commercial_note,
        cluster_json, outline_method, updated_at,
        serp_shape, platform_share, young_loosened, kgr, ads_present, page_mix_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(term_id) do update set
        competition_label=excluded.competition_label,
        competition_score=excluded.competition_score,
        competition_note=excluded.competition_note,
        competition_json=excluded.competition_json,
        domain=excluded.domain,
        domain_status=excluded.domain_status,
        domain_registered_at=excluded.domain_registered_at,
        land_score=excluded.land_score,
        land_note=excluded.land_note,
        lifecycle=excluded.lifecycle,
        lifecycle_confidence=excluded.lifecycle_confidence,
        lifecycle_note=excluded.lifecycle_note,
        commercial_score=excluded.commercial_score,
        commercial_note=excluded.commercial_note,
        cluster_json=excluded.cluster_json,
        outline_method=excluded.outline_method,
        updated_at=excluded.updated_at,
        serp_shape=excluded.serp_shape,
        platform_share=excluded.platform_share,
        young_loosened=excluded.young_loosened,
        kgr=excluded.kgr,
        ads_present=excluded.ads_present,
        page_mix_json=excluded.page_mix_json`,
      term.id,
      loosened.label,
      classified.score,
      competitionNote,
      JSON.stringify(storedRows),
      domain || null,
      domainStatus,
      registered,
      landScore,
      landNote,
      life.label,
      life.confidence,
      life.note,
      commercial,
      commercialNote,
      JSON.stringify(outline),
      method,
      new Date().toISOString(),
      shape.shape,
      shape.platformShare,
      loosened.loosened ? 1 : 0,
      ratio,
      ads == null ? null : ads ? 1 : 0,
      JSON.stringify(mix),
    );
  }
}
