import { SOURCE_LABEL } from "./catalog";
import { all, get, num, run } from "./db";
import { detectIntent, industriesFromEvidence, isNoiseTerm, normalize, painNote } from "./extract";
import { judgeBirth, type Sighting } from "./novelty";
import { type AgeEvidence } from "./novelty";
import { redditSpreadBoost } from "./sources/metrics";
import { clamp } from "./utils";

const EARLY = new Set(["x", "reddit", "bluesky", "hn", "producthunt", "youtube", "stackexchange", "tiktok", "discord", "telegram", "quora", "github"]);
const PUBLISHED = new Set(["googlenews", "sitemap", "medium", "substack", "amazon", "etsy"]);

export function readWeights() {
  const row = get<{ value: string }>("select value from meta where key = 'early_bonus'");
  const earlyBonus = row ? Number(row.value) : 8;
  return { earlyBonus: Number.isFinite(earlyBonus) ? earlyBonus : 8 };
}

export function commercialScore(text: string, intent: string) {
  let score = 18;
  if (intent === "commercial") score += 36;
  if (intent === "comparison") score += 30;
  if (/\b(affiliate|coupon|discount|pricing|subscription|buy|shop)\b/i.test(text)) score += 18;
  if (/\b(software|platform|saas|app|tool)\b/i.test(text)) score += 12;
  if (/\b(review|alternative|vs)\b/i.test(text)) score += 8;
  return clamp(score, 0, 100);
}

type Obs = { source: string; collected_at: string; count: number; engagement: number; industry: string | null; seed_id: number | null };

function sparkline(obs: Obs[], now: number) {
  const buckets = Array.from({ length: 14 }, () => 0);
  for (const row of obs) {
    const age = Math.floor((now - new Date(row.collected_at).getTime()) / 86400000);
    if (age >= 0 && age < 14) buckets[13 - age] += Number(row.count) || 1;
  }
  return buckets;
}

function majority(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function scoreAll() {
  const weights = readWeights();
  const now = Date.now();
  const terms = all<{
    id: number;
    display: string;
    first_seen_at: string;
    on_suggest: number;
    on_trends: number;
    name_score: number | null;
    search_status: string | null;
  }>("select id, display, first_seen_at, on_suggest, on_trends, name_score, search_status from terms");
  run("delete from term_sources");
  run("delete from term_industries");
  run("delete from term_seeds");

  for (const term of terms) {
    const obs = all<Obs>("select source, collected_at, count, engagement, industry, seed_id from term_observations where term_id = ?", term.id);
    if (!obs.length || isNoiseTerm(normalize(term.display))) {
      dropTerm(term.id);
      continue;
    }
    const sources = [...new Set(obs.map((row) => row.source))];
    const early = sources.filter((source) => EARLY.has(source));
    const published = sources.filter((source) => PUBLISHED.has(source));
    const indexed = term.search_status === "indexed";
    let stage = "earliest";
    if (indexed) stage = "on_google";
    else if (early.length >= 2) stage = "spreading";
    else if (early.length === 1) stage = "earliest";
    else if (published.length) stage = "published";

    const ageH = Math.max(0, (now - new Date(term.first_seen_at).getTime()) / 3600000);
    const newness = clamp(100 * Math.exp(-ageH / 72), 8, 100);
    const recent = obs.filter((row) => now - new Date(row.collected_at).getTime() <= 86400000).reduce((sum, row) => sum + num(row.count), 0);
    const prev = obs
      .filter((row) => {
        const age = now - new Date(row.collected_at).getTime();
        return age > 86400000 && age <= 3 * 86400000;
      })
      .reduce((sum, row) => sum + num(row.count), 0);
    let momentum = 64;
    if (prev === 0 && recent > 0) momentum = 80;
    else if (prev > 0) momentum = clamp(50 + 28 * Math.log2((recent + 0.5) / (prev + 0.5)), 8, 100);
    const cross = clamp((sources.length / 5) * 100, 0, 100);
    const earliness = indexed ? 12 : early.length >= 2 ? 96 : early.length === 1 ? 86 : published.length ? 46 : 70;
    const engagement = clamp(Math.log10(1 + obs.reduce((sum, row) => sum + num(row.engagement), 0)) * 30, 0, 100);
    let discovery = 0.28 * newness + 0.22 * momentum + 0.18 * cross + 0.22 * earliness + 0.1 * engagement;
    if (!indexed && early.length >= 1) discovery += weights.earlyBonus;
    if (!indexed && early.length >= 2) discovery += weights.earlyBonus * 0.75;

    const influencers = all<{ author: string }>(
      "select distinct author as author from term_evidence where term_id = ? and source = 'x' and author is not null and author != ''",
      term.id,
    );
    if (influencers.length >= 2) discovery += Math.min(18, (influencers.length - 1) * 6);
    const redditChannels = all<{ channel: string | null; collected_at: string }>(
      "select channel, collected_at from term_evidence where term_id = ? and source = 'reddit' and ifnull(channel, '') != ''",
      term.id,
    );
    discovery += redditSpreadBoost(
      redditChannels.map((row) => ({ channel: String(row.channel || ""), at: row.collected_at })),
      now,
    );
    if (sources.includes("reddit") && sources.includes("x")) discovery += 12;
    const sites = all<{ author: string }>(
      "select distinct author as author from term_evidence where term_id = ? and source = 'sitemap' and ifnull(author,'') != ''",
      term.id,
    );
    if (sites.length >= 2) discovery += Math.min(14, (sites.length - 1) * 5);
    const peakMentions = Math.max(...obs.map((row) => num(row.count)));
    const strongEvidence = sources.length >= 2 || peakMentions >= 2;
    if (term.name_score != null && term.name_score < 0.15 && !strongEvidence) {
      dropTerm(term.id);
      continue;
    }
    if (term.name_score != null && term.name_score < 0.35) discovery *= 0.55;
    if (!strongEvidence) discovery *= 0.38;
    else if (sources.length >= 2) discovery += 8;
    if (indexed) discovery *= 0.52;
    discovery = clamp(discovery, 0, 100);

    const sample = all<{ quote: string | null; title: string | null; intent: string | null }>(
      "select quote, title, intent from term_evidence where term_id = ? order by id desc limit 8",
      term.id,
    );
    const blob = `${term.display} ${sample.map((row) => `${row.title ?? ""} ${row.quote ?? ""}`).join(" ")}`;
    const intent = majority(sample.map((row) => row.intent).filter((item): item is string => Boolean(item))) || detectIntent(blob);
    const commercial = commercialScore(blob, intent);
    const analysis = get<{ competition_score: number | null; land_score: number | null }>(
      "select competition_score, land_score from term_analysis where term_id = ?",
      term.id,
    );
    const durability = lifecycleDurability(obs, now);
    const parts = [
      { w: 0.48, v: discovery },
      { w: 0.2, v: commercial },
      { w: 0.12, v: durability },
    ];
    if (analysis && analysis.competition_score != null) parts.push({ w: 0.12, v: 100 - num(analysis.competition_score) });
    if (analysis && analysis.land_score != null) parts.push({ w: 0.08, v: num(analysis.land_score) });
    const weightSum = parts.reduce((sum, part) => sum + part.w, 0);
    const opportunity = clamp(parts.reduce((sum, part) => sum + (part.w / weightSum) * part.v, 0), 0, 100);
    const names = sources.map((source) => SOURCE_LABEL[source] ?? source).slice(0, 4).join("、");
    const intentLine: Record<string, string> = {
      commercial: "讨论带有选购或工具推荐意图。",
      comparison: "有人在比较方案，或在找替代品。",
      informational: "用户在问怎么做、有没有现成工具。",
      navigational: "更接近找官网或下载入口。",
      unknown: "说法还新，意图还没定型。",
    };
    const quote = sample.find((row) => row.quote)?.quote;
    const pain = painNote(blob);
    const summary = [`出现在${names}。`, intentLine[intent] ?? intentLine.unknown, pain ? `痛点：${pain}。` : "", quote ? `原话：${quote}` : ""]
      .filter(Boolean)
      .join("");
    const verdict = birthVerdict(term.id, term.display, obs.map((row) => row.industry).filter((item): item is string => Boolean(item)), now);
    const lastSeen = obs.map((row) => row.collected_at).sort().at(-1) ?? new Date(now).toISOString();
    run(
      `update terms set stage=?, discovery_score=?, opportunity_score=?, momentum_score=?, newness_score=?, intent=?, summary=?, influencer_count=?, spark_json=?, last_seen_at=?, novelty=?, novelty_reason=?, independent_sources=?, focus_industry=?, source_groups=? where id=?`,
      stage,
      Number(discovery.toFixed(1)),
      Number(opportunity.toFixed(1)),
      Number(momentum.toFixed(1)),
      Number(newness.toFixed(1)),
      intent,
      summary,
      influencers.length,
      JSON.stringify(sparkline(obs, now)),
      lastSeen,
      verdict.status,
      verdict.reason,
      verdict.independent,
      verdict.industry,
      JSON.stringify({ windowHours: verdict.windowHours, windowStart: verdict.windowStart, windowEnd: verdict.windowEnd, groups: verdict.groups }),
      term.id,
    );
    for (const source of sources) run("insert or ignore into term_sources (term_id, source) values (?, ?)", term.id, source);
    for (const industry of new Set(obs.map((row) => row.industry).filter((item): item is string => Boolean(item)))) {
      run("insert or ignore into term_industries (term_id, industry) values (?, ?)", term.id, industry);
    }
    for (const seedId of new Set(obs.map((row) => row.seed_id).filter((item): item is number => item != null))) {
      run("insert or ignore into term_seeds (term_id, seed_id) values (?, ?)", term.id, seedId);
    }
  }
}

function dropTerm(id: number) {
  run("delete from term_observations where term_id = ?", id);
  run("delete from term_evidence where term_id = ?", id);
  run("delete from term_analysis where term_id = ?", id);
  run("delete from term_sources where term_id = ?", id);
  run("delete from term_industries where term_id = ?", id);
  run("delete from term_seeds where term_id = ?", id);
  run("delete from demand_keywords where term_id = ?", id);
  run("delete from trends_reviews where term_id = ?", id);
  run("delete from terms where id = ?", id);
}

function lifecycleDurability(obs: Obs[], now: number) {
  const days = new Map<string, number>();
  for (const row of obs) {
    const key = row.collected_at.slice(0, 10);
    days.set(key, (days.get(key) ?? 0) + num(row.count));
  }
  if (days.size < 3) return 52;
  const values = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((entry) => entry[1]);
  const mid = Math.ceil(values.length / 2);
  const first = values.slice(0, mid).reduce((sum, value) => sum + value, 0);
  const second = values.slice(mid).reduce((sum, value) => sum + value, 0);
  const peak = Math.max(...values);
  const last = values[values.length - 1] ?? 0;
  if (last < peak * 0.4 && first > second) return 30;
  if (second >= first * 0.85) return 78;
  void now;
  return 50;
}

export function birthVerdict(termId: number, display: string, _industries: string[] = [], now = Date.now()) {
  void _industries;
  const evidenceRows = all<{ source: string; url: string | null; author: string | null; title: string | null; quote: string | null; kind: string | null; published_at: string | null; collected_at: string | null; industry: string | null }>(
    "select source, url, author, title, quote, kind, published_at, collected_at, industry from term_evidence where term_id = ?",
    termId,
  );
  const sightings = evidenceRows.map((row): Sighting => ({
    source: row.source,
    url: row.url,
    author: row.author,
    title: row.title,
    industry: row.industry,
    at: row.published_at || row.collected_at,
  }));
  return judgeBirth({ term: display, industries: industriesFromEvidence(evidenceRows), sightings, ageEvidence: ageEvidenceFor(termId), now });
}

export function ageEvidenceFor(termId: number): AgeEvidence[] {
  const rows = all<{ kind: AgeEvidence["kind"]; observed_at: string | null }>("select kind, observed_at from term_age_evidence where term_id = ?", termId);
  const domain = get<{ domain_registered_at: string | null }>("select domain_registered_at from term_analysis where term_id = ?", termId);
  const evidence: AgeEvidence[] = rows.map((row) => ({ kind: row.kind, at: row.observed_at }));
  if (domain?.domain_registered_at) evidence.push({ kind: "domain_registered", at: domain.domain_registered_at });
  return evidence;
}

let noveltyReady = false;

export function ensureNovelty() {
  if (noveltyReady) return;
  noveltyReady = true;
  try {
    reclassifyNovelty();
  } catch {
    noveltyReady = false;
  }
}

export function reclassifyNovelty(now = Date.now()) {
  const terms = all<{ id: number; display: string; stage: string | null; search_status: string | null; search_method: string | null }>(
    "select id, display, stage, search_status, search_method from terms",
  );
  for (const term of terms) {
    const verdict = birthVerdict(term.id, term.display, [], now);
    let searchStatus = term.search_status;
    let searchNote: string | null = null;
    if ((searchStatus === "indexed" || searchStatus === "absent") && term.search_method !== "dataforseo") {
      searchStatus = "unknown";
      searchNote = "自动补全或每日趋势不能当作索引证据，已改回未知。这两项仍留在辅助字段。";
    }
    let stage = term.stage || "earliest";
    if (stage === "on_google" && searchStatus !== "indexed") {
      const sources = num(get<{ c: number }>("select count(*) as c from term_sources where term_id = ?", term.id)?.c);
      stage = sources >= 2 ? "spreading" : "earliest";
    }
    run(
      "update terms set novelty = ?, novelty_reason = ?, independent_sources = ?, focus_industry = ?, source_groups = ?, stage = ?, search_status = coalesce(?, search_status), search_note = coalesce(?, search_note) where id = ?",
      verdict.status,
      verdict.reason,
      verdict.independent,
      verdict.industry,
      JSON.stringify({ windowHours: verdict.windowHours, windowStart: verdict.windowStart, windowEnd: verdict.windowEnd, groups: verdict.groups }),
      stage,
      searchStatus,
      searchNote,
      term.id,
    );
  }
}

export function tuneWeights() {
  const rows = all<{ lead_hours: number }>(
    "select lead_hours from terms where novelty = 'novel' and lead_hours is not null and ifnull(google_at_discovery, 0) = 0 and lead_hours > 0",
  );
  const reviewLeads = all<{ lead_days: number }>("select lead_days from trends_reviews where hit = 1 and lead_days is not null").map((row) => num(row.lead_days) * 24);
  const samples = [...rows.map((row) => num(row.lead_hours)), ...reviewLeads];
  if (samples.length < 5) return { samples: samples.length, tuned: false, avg: null as number | null };
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const today = new Date().toISOString().slice(0, 10);
  const last = get<{ value: string }>("select value from meta where key = 'weights_tuned_on'");
  if (last?.value === today) return { samples: samples.length, tuned: false, avg };
  let bonus = readWeights().earlyBonus;
  if (avg < 24) bonus = Math.min(20, bonus + 1);
  if (avg > 168) bonus = Math.max(4, bonus - 1);
  run("insert into meta (key, value) values ('early_bonus', ?) on conflict(key) do update set value = excluded.value", String(bonus));
  run("insert into meta (key, value) values ('weights_tuned_on', ?) on conflict(key) do update set value = excluded.value", today);
  return { samples: samples.length, tuned: true, avg, bonus };
}
