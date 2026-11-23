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
import { collectNpm, collectPypi } from "./collectors/registry";
import { collectSitemaps } from "./collectors/sitemap";
import { result, withTimeout, type CollectContext, type CollectorResult, type Hit, type Suggestion } from "./collectors/types";
import { collectX } from "./collectors/x";
import { commitCursor, readCursor } from "./baseline";
import { discoveryDue, runDiscovery } from "./sources/discover";
import { judgeSearch, verifiedCreation } from "./novelty";
import { budgetItems, parseProbe, type ProbeSource } from "./probe";

const lock = globalThis as unknown as { __radarLock?: boolean };

const STEPS: { id: string; label: string; budget: number; run: (ctx: CollectContext) => Promise<CollectorResult> }[] = [
  { id: "hn", label: "Hacker News", budget: 28000, run: collectHn },
  { id: "producthunt", label: "Product Hunt", budget: 20000, run: () => collectProductHunt() },
  { id: "github", label: "GitHub", budget: 25000, run: () => collectGithub() },
  { id: "pypi", label: "PyPI", budget: 20000, run: (ctx) => collectPypi(ctx) },
  { id: "npm", label: "npm", budget: 25000, run: (ctx) => collectNpm(ctx) },
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
    for (const industry of classifyIndustries(hit.term)) row.industries.add(industry);
    if (hit.kind === "entity" && hit.industry) row.industries.add(hit.industry);
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
      if (evidence.bornKind && evidence.bornAt && evidence.url && verifiedCreation(row.display, evidence.bornKind, evidence.url)) {
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
  if (collector.nextCursor?.length) commitCursor(collector.source, collector.nextCursor);
  return kept;
}

function applyGoogle(updates: { id: number; suggest: boolean | null; trends: boolean | null }[]) {
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
      search_status: string | null;
    }>("select first_seen_at, on_suggest, on_trends, google_at_discovery, google_first_seen_at, checked_google_at, lead_hours, search_status from terms where id = ?", update.id);
    if (!term) continue;
    const hit = update.suggest === true || update.trends === true;
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
    const search = judgeSearch({
      suggest: update.suggest,
      trends: update.trends,
      dataForSeoConfigured: Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
      dataForSeo: null,
    });
    const status = search.status === "unknown" && (term.search_status === "indexed" || term.search_status === "absent") ? term.search_status : search.status;
    run(
      `update terms set on_suggest = ?, on_trends = ?, google_at_discovery = ?, google_first_seen_at = ?, lead_hours = ?, checked_google_at = ?, search_status = ?, search_method = ?, search_note = ?, search_checked_at = ? where id = ?`,
      update.suggest === true ? 1 : update.suggest === false ? 0 : term.on_suggest,
      update.trends === true ? 1 : update.trends === false ? 0 : term.on_trends,
      atDiscovery,
      first,
      lead,
      search.status === "unknown" ? term.checked_google_at : now,
      status,
      search.method,
      search.note,
      search.status === "unknown" ? term.checked_google_at : now,
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

const probeAt = { last: 0 };

export async function runProbe(body: unknown) {
  const parsed = parseProbe(body);
  if ("error" in parsed) return { http: 400, ok: false, error: parsed.error };
  if (isRefreshRunning()) return { http: 409, ok: false, error: "已有采集在跑" };
  if (Date.now() - probeAt.last < 10000) return { http: 429, ok: false, error: "试采间隔至少 10 秒" };
  probeAt.last = Date.now();
  const ctx = {
    ...loadContext(),
    maxItems: parsed.maxItems,
    dryRun: parsed.dryRun,
    probe: parsed.source === "showhn" ? ("showhn" as const) : undefined,
  };
  const runners: Record<ProbeSource, (context: CollectContext) => Promise<CollectorResult>> = {
    github: collectGithub,
    pypi: (context) => collectPypi(context),
    npm: (context) => collectNpm(context),
    showhn: collectHn,
    producthunt: () => collectProductHunt(),
    sitemap: collectSitemaps,
  };
  let collector: CollectorResult;
  try {
    collector = await withTimeout(runners[parsed.source](ctx), parsed.budgetMs, parsed.source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "失败";
    if (!parsed.dryRun) {
      run("update source_status set status = 'error', message = ?, last_run_at = ? where source = ?", message.slice(0, 500), new Date().toISOString(), parsed.source === "showhn" ? "hn" : parsed.source);
    }
    return { http: 200, ok: false, mode: parsed.dryRun ? "dry-run" : "persist", source: parsed.source, status: "error", message, fetched: 0, inserted: 0, deduped: 0, cursorAdvanced: false, persisted: false };
  }
  const seen = readCursor(parsed.source === "showhn" ? "hn" : parsed.source).seen;
  const budgeted = applyProbeBudget(collector, parsed.maxItems, seen);
  collector = budgeted.collector;
  const fetched = collector.stats?.fetched ?? budgeted.fetched;
  const deduped = collector.stats?.deduped ?? 0;
  const emitted = budgeted.itemCount;
  if (parsed.dryRun || collector.status === "error") {
    if (!parsed.dryRun && collector.status === "error") {
      run("update source_status set status = 'error', message = ?, last_run_at = ? where source = ?", collector.message.slice(0, 500), new Date().toISOString(), parsed.source === "showhn" ? "hn" : parsed.source);
    }
    return {
      http: 200,
      ok: collector.status !== "error",
      mode: parsed.dryRun ? "dry-run" : "persist",
      source: parsed.source,
      status: collector.status,
      message: collector.message,
      fetched,
      inserted: 0,
      deduped,
      emitted,
      itemCount: budgeted.itemCount,
      termCount: budgeted.termCount,
      cursorAdvanced: false,
      persisted: false,
      maxItems: parsed.maxItems,
      budgetMs: parsed.budgetMs,
    };
  }
  const started = new Date().toISOString();
  const runRow = run("insert into runs (trigger, started_at, status) values (?, ?, 'running')", `probe:${parsed.source}`, started);
  const runId = Number(runRow.lastInsertRowid);
  const inserted = persist(collector, runId);
  scoreAll();
  const finished = new Date().toISOString();
  run("update runs set finished_at = ?, status = 'ok', summary = ? where id = ?", finished, collector.message.slice(0, 500), runId);
  return {
    http: 200,
    ok: true,
    mode: "persist",
    source: parsed.source,
    status: collector.status,
    message: collector.message,
    fetched,
    inserted,
    deduped,
    emitted,
    itemCount: budgeted.itemCount,
    termCount: budgeted.termCount,
    cursorAdvanced: Boolean(collector.nextCursor?.length),
    persisted: true,
    lastSuccess: finished,
    maxItems: parsed.maxItems,
    budgetMs: parsed.budgetMs,
  };
}

function applyProbeBudget(collector: CollectorResult, maxItems: number, seen: Set<string>) {
  const order: string[] = [];
  const costs = new Map<string, number>();
  for (const hit of collector.hits) {
    const id = hit.url || hit.term;
    if (!id || seen.has(id)) continue;
    if (!costs.has(id)) {
      costs.set(id, 0);
      order.push(id);
    }
    costs.set(id, (costs.get(id) || 0) + 1);
  }
  if (!order.length) {
    for (const item of collector.feed) {
      const id = item.url || item.externalId;
      if (!id || seen.has(id) || costs.has(id)) continue;
      costs.set(id, 1);
      order.push(id);
    }
  }
  const budget = budgetItems(order.map((id) => ({ id, terms: costs.get(id) || 1 })), maxItems, maxItems);
  const allow = new Set(budget.kept);
  const deferred = new Set(budget.deferred);
  const hits = collector.hits.filter((hit) => allow.has(hit.url || hit.term));
  const feed = collector.feed.filter((item) => allow.has(item.url || item.externalId));
  const pages = collector.pages.filter((page) => !page.isNew || allow.has(page.url));
  const nextCursor = collector.nextCursor ? collector.nextCursor.filter((id) => !deferred.has(id)) : budget.kept;
  return {
    collector: {
      ...collector,
      hits,
      feed,
      pages,
      nextCursor,
      stats: { fetched: collector.stats?.fetched ?? order.length + seen.size, deduped: collector.stats?.deduped ?? 0, emitted: budget.itemCount },
    },
    fetched: collector.stats?.fetched ?? order.length,
    itemCount: budget.itemCount,
    termCount: hits.length,
  };
}
