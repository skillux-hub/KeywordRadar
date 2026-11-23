import { all, get, run } from "./db";
import { normalize } from "./extract";
import { classifyIndustries } from "./extract";
import { analyzeTop } from "./analyze";
import { refreshDemandKeywords, reviewMatureTerms, scoreUnjudgedNames } from "./enrich";
import { saveDigest } from "./digest";
import { scoreAll, tuneWeights } from "./score";
import { validateGoogle } from "./collectors/google";
import { collectBluesky, collectGithub, collectGoogleNews, collectHn, collectMedium, collectNewsletters, collectProductHunt, collectStackExchange, collectYoutube } from "./collectors/early";
import { collectAmazon, collectDiscord, collectEtsy, collectQuora, collectTelegram, collectThreads, collectTikTok } from "./collectors/optional";
import { collectReddit } from "./collectors/reddit";
import { collectSitemaps } from "./collectors/sitemap";
import { result, withTimeout, type CollectContext, type CollectorResult, type Hit, type Suggestion } from "./collectors/types";
import { collectX } from "./collectors/x";
import { discoveryDue, runDiscovery } from "./sources/discover";

const lock = globalThis as unknown as { __radarLock?: boolean };

const STEPS: { id: string; label: string; budget: number; run: (ctx: CollectContext) => Promise<CollectorResult> }[] = [
  { id: "hn", label: "Hacker News", budget: 28000, run: collectHn },
  { id: "producthunt", label: "Product Hunt", budget: 20000, run: () => collectProductHunt() },
  { id: "github", label: "GitHub", budget: 25000, run: () => collectGithub() },
  { id: "reddit", label: "Reddit", budget: 90000, run: collectReddit },
  { id: "bluesky", label: "Bluesky", budget: 30000, run: collectBluesky },
  { id: "stackexchange", label: "Stack Exchange", budget: 25000, run: () => collectStackExchange() },
  { id: "youtube", label: "YouTube", budget: 35000, run: collectYoutube },
  { id: "substack", label: "通讯", budget: 30000, run: collectNewsletters },
  { id: "medium", label: "Medium", budget: 25000, run: collectMedium },
  { id: "googlenews", label: "Google News", budget: 25000, run: collectGoogleNews },
  { id: "sitemap", label: "Sitemap", budget: 60000, run: collectSitemaps },
  { id: "x", label: "X", budget: 35000, run: collectX },
  { id: "tiktok", label: "TikTok", budget: 15000, run: () => collectTikTok() },
  { id: "quora", label: "Quora", budget: 12000, run: () => collectQuora() },
  { id: "amazon", label: "Amazon", budget: 15000, run: () => collectAmazon() },
  { id: "etsy", label: "Etsy", budget: 12000, run: () => collectEtsy() },
  { id: "discord", label: "Discord", budget: 15000, run: () => collectDiscord() },
  { id: "telegram", label: "Telegram", budget: 15000, run: () => collectTelegram() },
  { id: "threads", label: "Threads", budget: 12000, run: () => collectThreads() },
];

export function isRefreshRunning() {
  return Boolean(lock.__radarLock) || Boolean(get<{ running: number }>("select running from job_state where id = 1")?.running);
}

export function beginRefresh(trigger: string) {
  if (lock.__radarLock) return { started: false as const, reason: "running" };
  lock.__radarLock = true;
  void refreshAll(trigger)
    .catch((error) => {
      const message = error instanceof Error ? error.message : "采集失败";
      run("update job_state set running = 0, last_error = ?, finished_at = ?, phase = ? where id = 1", message, new Date().toISOString(), "失败");
    })
    .finally(() => {
      lock.__radarLock = false;
    });
  return { started: true as const };
}

function loadContext(): CollectContext {
  return {
    seeds: all("select id, topic, region, industry from seeds where active = 1 order by id"),
    xAccounts: all(
      "select id, industry, handle, display_name as displayName, user_id as userId, last_fetched_at as lastFetched from x_accounts where status = 'active'",
    ),
    subreddits: all("select id, industry, name, last_fetched_at as lastFetched from subreddits where status = 'active'"),
    redditUsers: all("select id, industry, username from reddit_users where status = 'active'"),
    sites: all("select id, industry, domain, name from sites where status = 'active'"),
    newsletters: all("select industry, name, url from newsletters where status = 'active'"),
    youtube: all("select industry, name, channel_id as channelId from youtube_channels where status = 'active'"),
    medium: all("select industry, tag from medium_tags where status = 'active'"),
  };
}

function saveSuggestion(suggestion: Suggestion) {
  if (suggestion.kind === "x_account") {
    const handle = suggestion.value.toLowerCase().replace(/^@/, "");
    if (!handle || get("select id from x_accounts where industry = ? and handle = ?", suggestion.industry, handle)) return;
    run(
      "insert into x_accounts (industry, handle, status, origin, reason) values (?, ?, 'suggested', 'discovered', ?)",
      suggestion.industry,
      handle,
      suggestion.reason,
    );
  } else if (suggestion.kind === "subreddit") {
    const name = suggestion.value.replace(/^\/?r\//i, "");
    if (!name || get("select id from subreddits where industry = ? and lower(name) = lower(?)", suggestion.industry, name)) return;
    run(
      "insert into subreddits (industry, name, status, origin, reason) values (?, ?, 'suggested', 'discovered', ?)",
      suggestion.industry,
      name,
      suggestion.reason,
    );
  } else if (suggestion.kind === "reddit_user") {
    const username = suggestion.value.replace(/^\/?u\//i, "");
    if (!username || get("select id from reddit_users where industry = ? and lower(username) = lower(?)", suggestion.industry, username)) return;
    run(
      "insert into reddit_users (industry, username, status, origin, reason) values (?, ?, 'suggested', 'discovered', ?)",
      suggestion.industry,
      username,
      suggestion.reason,
    );
  }
}

function persist(collector: CollectorResult, runId: number) {
  const now = new Date().toISOString();
  const grouped = new Map<
    string,
    { display: string; always: boolean; count: number; engagement: number; industries: Set<string>; seeds: Set<number>; evidence: Hit[] }
  >();
  for (const hit of collector.hits) {
    const key = normalize(hit.term);
    if (!key || key.length < 3) continue;
    const row = grouped.get(key) ?? {
      display: hit.term,
      always: Boolean(hit.always),
      count: 0,
      engagement: 0,
      industries: new Set<string>(),
      seeds: new Set<number>(),
      evidence: [],
    };
    row.count += 1;
    row.engagement += hit.engagement ?? 0;
    row.always = row.always || Boolean(hit.always);
    if (hit.industry) row.industries.add(hit.industry);
    for (const industry of classifyIndustries(`${hit.term} ${hit.title ?? ""}`)) row.industries.add(industry);
    if (hit.seedId) row.seeds.add(hit.seedId);
    if ((hit.term.match(/[A-Z]/g)?.length ?? 0) > (row.display.match(/[A-Z]/g)?.length ?? 0)) row.display = hit.term;
    if (row.evidence.length < 5 && (hit.quote || hit.url)) row.evidence.push(hit);
    grouped.set(key, row);
  }
  let kept = 0;
  for (const [key, row] of grouped) {
    if (!row.always && row.count < 2) continue;
    const existing = get<{ id: number; display: string }>("select id, display from terms where normalized = ?", key);
    let termId: number;
    if (existing) {
      termId = Number(existing.id);
      if ((row.display.match(/[A-Z]/g)?.length ?? 0) > (String(existing.display).match(/[A-Z]/g)?.length ?? 0)) {
        run("update terms set display = ? where id = ?", row.display, termId);
      }
    } else {
      termId = Number(
        run("insert into terms (normalized, display, first_seen_at, last_seen_at, stage) values (?, ?, ?, ?, 'earliest')", key, row.display, now, now)
          .lastInsertRowid,
      );
    }
    const industry = [...row.industries][0] ?? null;
    const seedId = [...row.seeds][0] ?? null;
    run(
      "insert into term_observations (term_id, source, seed_id, industry, collected_at, count, engagement, run_id) values (?, ?, ?, ?, ?, ?, ?, ?)",
      termId,
      collector.source,
      seedId,
      industry,
      now,
      row.count,
      row.engagement,
      runId,
    );
    for (const evidence of row.evidence) {
      run(
        `insert into term_evidence (term_id, source, industry, url, title, quote, author, channel, engagement, published_at, intent, kind, collected_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        termId,
        collector.source,
        evidence.industry,
        evidence.url ?? null,
        evidence.title ?? null,
        evidence.quote ?? null,
        evidence.author ?? null,
        evidence.channel ?? null,
        evidence.engagement ?? null,
        evidence.publishedAt ?? null,
        evidence.intent ?? null,
        evidence.kind ?? null,
        now,
      );
      if (evidence.bornKind && evidence.bornAt) {
        run(
          `insert into term_age_evidence (term_id, kind, observed_at, note)
           values (?, ?, ?, ?)
           on conflict(term_id, kind) do update set observed_at = excluded.observed_at, note = excluded.note`,
          termId,
          evidence.bornKind,
          evidence.bornAt,
          evidence.url ?? null,
        );
      }
    }
    kept += 1;
  }
  for (const item of collector.feed) {
    run(
      `insert into feed_items (source, industry, external_id, author, title, text, url, engagement, velocity, intent, published_at, fetched_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(source, external_id) do update set
         title = excluded.title, text = excluded.text, engagement = excluded.engagement, velocity = excluded.velocity, fetched_at = excluded.fetched_at`,
      item.source,
      item.industry,
      item.externalId,
      item.author ?? null,
      item.title ?? null,
      (item.text ?? "").slice(0, 500),
      item.url ?? null,
      item.engagement ?? null,
      item.velocity ?? null,
      item.intent ?? null,
      item.publishedAt ?? null,
      now,
    );
  }
  for (const page of collector.pages) {
    const existing = get("select url from sitemap_urls where url = ?", page.url);
    if (!existing) {
      run(
        "insert into sitemap_urls (domain, url, lastmod, first_seen_at, title, h1, description, is_new) values (?, ?, ?, ?, ?, ?, ?, ?)",
        page.domain,
        page.url,
        page.lastmod ?? null,
        now,
        page.title ?? null,
        page.h1 ?? null,
        page.description ?? null,
        page.isNew ? 1 : 0,
      );
    }
  }
  for (const suggestion of collector.suggestions) saveSuggestion(suggestion);
  run("update source_status set status = ?, message = ?, last_run_at = ?, item_count = ? where source = ?", collector.status, collector.message.slice(0, 500), now, kept, collector.source);
  return kept;
}

function applyGoogle(updates: { id: number; suggest: boolean; trends: boolean }[]) {
  const now = new Date().toISOString();
  for (const update of updates) {
    const term = get<{
      first_seen_at: string;
      on_suggest: number;
      on_trends: number;
      google_at_discovery: number;
      google_first_seen_at: string | null;
      checked_google_at: string | null;
      lead_hours: number | null;
    }>("select first_seen_at, on_suggest, on_trends, google_at_discovery, google_first_seen_at, checked_google_at, lead_hours from terms where id = ?", update.id);
    if (!term) continue;
    const hit = update.suggest || update.trends;
    let atDiscovery = term.google_at_discovery ?? 0;
    let first = term.google_first_seen_at;
    let lead = term.lead_hours;
    if (hit && !first) {
      const fresh = !term.checked_google_at && Date.now() - new Date(term.first_seen_at).getTime() < 20 * 60 * 1000;
      if (fresh) {
        atDiscovery = 1;
        first = term.first_seen_at;
        lead = 0;
      } else {
        atDiscovery = 0;
        first = now;
        lead = (Date.now() - new Date(term.first_seen_at).getTime()) / 3600000;
      }
    }
    run(
      `update terms set on_suggest = ?, on_trends = ?, google_at_discovery = ?, google_first_seen_at = ?, lead_hours = ?, checked_google_at = ? where id = ?`,
      update.suggest ? 1 : term.on_suggest,
      update.trends ? 1 : term.on_trends,
      atDiscovery,
      first,
      lead,
      now,
      update.id,
    );
  }
}

export async function refreshAll(trigger: string) {
  const started = new Date().toISOString();
  run(
    "update job_state set running = 1, trigger = ?, phase = ?, done = 0, total = ?, started_at = ?, finished_at = null, last_error = null where id = 1",
    trigger,
    "准备",
    STEPS.length + 2,
    started,
  );
  const runRow = run("insert into runs (trigger, started_at, status) values (?, ?, 'running')", trigger, started);
  const runId = Number(runRow.lastInsertRowid);
  const notes: string[] = [];
  if (trigger === "discover" || discoveryDue()) {
    run("update job_state set phase = ? where id = 1", "发现信息源");
    try {
      const discovery = await runDiscovery(trigger, trigger === "discover");
      notes.push(`发现:${discovery.added}/${discovery.retired}`);
    } catch (error) {
      notes.push(`发现失败:${error instanceof Error ? error.message : "失败"}`);
    }
  }
  const ctx = loadContext();
  let done = 0;
  for (const step of STEPS) {
    done += 1;
    run("update job_state set phase = ?, done = ? where id = 1", step.label, done);
    let collectorResult: CollectorResult;
    try {
      collectorResult = await withTimeout(step.run(ctx), step.budget, step.label);
    } catch (error) {
      collectorResult = result(step.id, "error", error instanceof Error ? error.message : "失败");
    }
    const kept = persist(collectorResult, runId);
    notes.push(`${step.label}:${collectorResult.status}/${kept}`);
    scoreAll();
  }
  done += 1;
  run("update job_state set phase = ?, done = ? where id = 1", "Google 验证", done);
  const terms = all<{ id: number; display: string; normalized: string; region: string | null }>(
    `select t.id, t.display, t.normalized,
            (select s.region from term_seeds ts join seeds s on s.id = ts.seed_id where ts.term_id = t.id limit 1) as region
     from terms t
     where ifnull(t.on_suggest, 0) = 0 or ifnull(t.on_trends, 0) = 0
     order by t.discovery_score desc
     limit 24`,
  );
  const google = await validateGoogle(terms.map((term) => ({ ...term, region: term.region || "US" })));
  applyGoogle(google.updates);
  persist({ ...google, hits: [], feed: [], suggestions: [], pages: [] }, runId);
  scoreAll();
  done += 1;
  run("update job_state set phase = ?, done = ? where id = 1", "机会分析", done);
  try {
    await scoreUnjudgedNames();
  } catch {
    /* 专名判断失败不能挡住这一轮 */
  }
  await analyzeTop();
  try {
    await refreshDemandKeywords();
    await reviewMatureTerms();
  } catch {
    /* 需求词和趋势复核都是可选增强 */
  }
  scoreAll();
  const tuning = tuneWeights();
  await saveDigest("collect", false);
  const finished = new Date().toISOString();
  run("update runs set finished_at = ?, status = 'ok', summary = ? where id = ?", finished, notes.join(" | ").slice(0, 800), runId);
  run("update job_state set running = 0, phase = ?, finished_at = ?, done = total where id = 1", tuning.tuned ? "完成，并微调了早发现权重" : "完成", finished);
}
