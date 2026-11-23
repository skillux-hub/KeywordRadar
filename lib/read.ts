import { INTENT_LABEL, SOURCE_LABEL, industryName, stageMeta } from "./catalog";
import { xProviderConfigured } from "./sources/x-provider";
import { all, get, num } from "./db";
import { slicePage } from "./pagination";
import { ensureNovelty, readWeights } from "./score";

export type Filters = {
  industry?: string;
  source?: string;
  stage?: string;
  window?: string;
  seed?: string;
  q?: string;
  shape?: string;
};

function cutoff(window: string | undefined) {
  if (!window || window === "all") return null;
  const days = window === "24h" ? 1 : window === "30d" ? 30 : 7;
  return new Date(Date.now() - days * 86400000).toISOString();
}

function keywordWhere(filters: Filters) {
  const since = cutoff(filters.window);
  const params: unknown[] = [];
  let sql = "1 = 1";
  if (since) {
    sql += " and t.last_seen_at >= ?";
    params.push(since);
  }
  if (filters.source) {
    sql += " and exists (select 1 from term_sources s where s.term_id = t.id and s.source = ?)";
    params.push(filters.source);
  }
  if (filters.industry === "none") {
    sql += " and not exists (select 1 from term_industries i where i.term_id = t.id)";
  } else if (filters.industry) {
    sql += " and exists (select 1 from term_industries i where i.term_id = t.id and i.industry = ?)";
    params.push(filters.industry);
  }
  if (filters.stage) {
    sql += " and t.stage = ?";
    params.push(filters.stage);
  }
  if (filters.seed === "none") {
    sql += " and 0";
  } else if (filters.seed) {
    const ids = filters.seed.split(",").map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
    if (ids.length) {
      sql += ` and exists (select 1 from term_seeds ts where ts.term_id = t.id and ts.seed_id in (${ids.map(() => "?").join(",")}))`;
      params.push(...ids);
    }
  }
  if (filters.shape) {
    sql += " and exists (select 1 from term_analysis a where a.term_id = t.id and a.serp_shape = ?)";
    params.push(filters.shape);
  }
  if (filters.q) {
    sql += " and (t.normalized like ? or t.display like ?)";
    params.push(`%${filters.q.toLowerCase()}%`, `%${filters.q}%`);
  }
  sql += " and t.novelty = 'novel'";
  return { where: sql, params };
}

export function listKeywords(filters: Filters & { page?: number; size?: number; all?: boolean }) {
  ensureNovelty();
  const { where, params } = keywordWhere(filters);
  const summaryRow = get<{ total: number; earliest: number; spreading: number; published: number; on_google: number; avg_score: number | null }>(
    `select count(*) as total,
            sum(case when t.stage = 'earliest' then 1 else 0 end) as earliest,
            sum(case when t.stage = 'spreading' then 1 else 0 end) as spreading,
            sum(case when t.stage = 'published' then 1 else 0 end) as published,
            sum(case when t.stage = 'on_google' then 1 else 0 end) as on_google,
            avg(t.opportunity_score) as avg_score
     from terms t where ${where}`,
    ...params,
  );
  const total = num(summaryRow?.total);
  const size = filters.all ? Math.max(total, 1) : Math.max(1, filters.size || 20);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = filters.all ? 1 : Math.min(Math.max(1, filters.page || 1), pages);
  const rows = all<Record<string, unknown>>(
    `select * from terms t where ${where} order by t.opportunity_score desc, t.discovery_score desc limit ? offset ?`,
    ...params,
    filters.all ? size : size,
    filters.all ? 0 : (page - 1) * size,
  );
  const summary = {
    total,
    earliest: num(summaryRow?.earliest),
    spreading: num(summaryRow?.spreading),
    published: num(summaryRow?.published),
    onGoogle: num(summaryRow?.on_google),
    avgOpportunity: summaryRow?.avg_score == null ? 0 : Math.round(num(summaryRow.avg_score)),
  };
  return { items: rows.map(presentTerm), total, page, size: filters.all ? total : size, summary };
}

function presentTerm(row: Record<string, unknown>) {
  const id = num(row.id);
  const sources = all<{ source: string }>("select source from term_sources where term_id = ?", id).map((item) => item.source);
  const industries = all<{ industry: string }>("select industry from term_industries where term_id = ?", id).map((item) => item.industry);
  return {
    id,
    term: String(row.display),
    stage: String(row.stage || "earliest"),
    stageLabel: stageMeta(String(row.stage || "earliest")).label,
    opportunity: num(row.opportunity_score),
    discovery: num(row.discovery_score),
    momentum: num(row.momentum_score),
    newness: num(row.newness_score),
    intent: String(row.intent || "unknown"),
    intentLabel: INTENT_LABEL[String(row.intent || "unknown")] ?? "未判定",
    summary: String(row.summary || ""),
    firstSeen: String(row.first_seen_at),
    novelty: String(row.novelty || "unverified"),
    noveltyReason: String(row.novelty_reason || ""),
    independentSources: row.independent_sources == null ? 0 : num(row.independent_sources),
    focusIndustry: String(row.focus_industry || ""),
    searchStatus: String(row.search_status || "unknown"),
    searchMethod: String(row.search_method || ""),
    searchNote: String(row.search_note || ""),
    searchCheckedAt: row.search_checked_at ? String(row.search_checked_at) : "",
    lastSeen: String(row.last_seen_at),
    sources,
    sourceLabels: sources.map((source) => SOURCE_LABEL[source] ?? source),
    industries,
    industryLabels: industries.map((industry) => industryName(industry)),
    influencerCount: num(row.influencer_count),
    onGoogle: num(row.on_suggest) === 1 || num(row.on_trends) === 1,
    onSuggest: num(row.on_suggest) === 1,
    onTrends: num(row.on_trends) === 1,
    leadHours: row.lead_hours == null ? null : num(row.lead_hours),
    googleAtDiscovery: num(row.google_at_discovery) === 1,
    spark: row.spark_json ? (JSON.parse(String(row.spark_json)) as number[]) : [],
    nameScore: row.name_score == null ? null : num(row.name_score),
    serpShape: get<{ serp_shape: string | null }>("select serp_shape from term_analysis where term_id = ?", id)?.serp_shape ?? "",
    sourceGroups: parseGroups(row.source_groups),
  };
}

function parseGroups(value: unknown) {
  if (!value) return [] as { sources: string[]; urls: string[]; authors: string[]; titles: string[]; firstAt: string | null; lastAt: string | null; why: string }[];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapEvidence(item: Record<string, unknown>) {
  return {
    source: String(item.source),
    sourceLabel: SOURCE_LABEL[String(item.source)] ?? String(item.source),
    industry: item.industry ? industryName(String(item.industry)) : "未分类",
    url: item.url ? String(item.url) : "",
    title: item.title ? String(item.title) : "",
    quote: item.quote ? String(item.quote) : "",
    author: item.author ? String(item.author) : "",
    engagement: item.engagement == null ? null : num(item.engagement),
    publishedAt: item.published_at ? String(item.published_at) : "",
    intent: INTENT_LABEL[String(item.intent || "unknown")] ?? "未判定",
  };
}

export function keywordDetail(id: number, pages: { evidencePage?: number; evidenceSize?: number; source?: string; mentionPage?: number; mentionSize?: number; demandPage?: number; demandSize?: number; clusterPage?: number; clusterSize?: number; serpPage?: number; serpSize?: number } = {}) {
  const row = get<Record<string, unknown>>("select * from terms where id = ?", id);
  if (!row) return null;
  const base = presentTerm(row);
  const evidenceSize = pages.evidenceSize || 10;
  const evidenceFilter = pages.source && ["x", "reddit", "sitemap"].includes(pages.source) ? pages.source : "";
  const evidenceParams: unknown[] = [id];
  let evidenceWhere = "term_id = ?";
  if (evidenceFilter) {
    evidenceWhere += " and source = ?";
    evidenceParams.push(evidenceFilter);
  }
  const evidenceTotal = num(get<{ c: number }>(`select count(*) as c from term_evidence where ${evidenceWhere}`, ...evidenceParams)?.c);
  const evidencePages = Math.max(1, Math.ceil(evidenceTotal / evidenceSize) || 1);
  const evidenceCurrent = Math.min(Math.max(1, pages.evidencePage || 1), evidencePages);
  const evidence = all<Record<string, unknown>>(
    `select source, industry, url, title, quote, author, engagement, published_at, intent, kind from term_evidence where ${evidenceWhere} order by id desc limit ? offset ?`,
    ...evidenceParams,
    evidenceSize,
    (evidenceCurrent - 1) * evidenceSize,
  ).map(mapEvidence);
  const analysis = get<Record<string, unknown>>("select * from term_analysis where term_id = ?", id);
  let outline: unknown = null;
  if (analysis?.cluster_json) {
    try {
      outline = JSON.parse(String(analysis.cluster_json));
    } catch {
      outline = null;
    }
  }
  let serpAll: { url: string; domain: string; kind: string; pageKind?: string; homepage?: boolean }[] = [];
  if (analysis?.competition_json) {
    try {
      serpAll = JSON.parse(String(analysis.competition_json)) as typeof serpAll;
    } catch {
      serpAll = [];
    }
  }
  const serpPage = slicePage(serpAll, pages.serpPage || 1, pages.serpSize || 10);
  const outlineRecord = (outline && typeof outline === "object" ? outline : {}) as { titles?: string[]; sections?: { heading: string; points: string[] }[]; related?: string[]; questions?: string[] };
  const clusterPage = slicePage(outlineRecord.related ?? [], pages.clusterPage || 1, pages.clusterSize || 10);
  const sectionPage = slicePage(outlineRecord.sections ?? [], pages.clusterPage || 1, pages.clusterSize || 10);
  const mentionSize = pages.mentionSize || 10;
  const mentionTotal = num(get<{ c: number }>(
    `select count(*) as c from (
       select distinct lower(author) as name from term_evidence where term_id = ? and source = 'x' and ifnull(author,'') != ''
       union
       select distinct lower(channel) as name from term_evidence where term_id = ? and source = 'reddit' and ifnull(channel,'') != ''
     ) voices`,
    id,
    id,
  )?.c);
  const mentionPages = Math.max(1, Math.ceil(mentionTotal / mentionSize) || 1);
  const mentionCurrent = Math.min(Math.max(1, pages.mentionPage || 1), mentionPages);
  const mentionRows = all<{ platform: string; name: string }>(
    `select platform, name from (
       select distinct 'x' as platform, lower(author) as name from term_evidence where term_id = ? and source = 'x' and ifnull(author,'') != ''
       union
       select distinct 'reddit' as platform, lower(channel) as name from term_evidence where term_id = ? and source = 'reddit' and ifnull(channel,'') != ''
     ) voices order by platform, name limit ? offset ?`,
    id,
    id,
    mentionSize,
    (mentionCurrent - 1) * mentionSize,
  );
  const demandSize = pages.demandSize || 10;
  const demandTotal = num(get<{ c: number }>("select count(*) as c from demand_keywords where term_id = ?", id)?.c);
  const demandPages = Math.max(1, Math.ceil(demandTotal / demandSize) || 1);
  const demandCurrent = Math.min(Math.max(1, pages.demandPage || 1), demandPages);
  const demands = all<{ keyword: string; decision: string; volume: number | null; trend: string | null; note: string | null }>(
    "select keyword, decision, volume, trend, note from demand_keywords where term_id = ? order by case decision when '优先' then 0 when '观察' then 1 else 2 end, keyword limit ? offset ?",
    id,
    demandSize,
    (demandCurrent - 1) * demandSize,
  );
  return {
    ...base,
    evidence,
    evidenceTotal,
    evidencePage: evidenceCurrent,
    evidenceSize,
    influencers: evidence.filter((item) => item.source === "x" && item.author),
    pages: evidence.filter((item) => item.source === "sitemap"),
    analysis: analysis
      ? {
          competitionLabel: analysis.competition_label ? String(analysis.competition_label) : "未检测",
          competitionScore: analysis.competition_score == null ? null : num(analysis.competition_score),
          competitionNote: String(analysis.competition_note || ""),
          serp: serpPage.items,
          serpTotal: serpPage.total,
          serpPage: serpPage.page,
          clusterTotal: clusterPage.total,
          clusterPage: clusterPage.page,
          sectionTotal: sectionPage.total,
          domain: analysis.domain ? String(analysis.domain) : "",
          domainStatus: String(analysis.domain_status || "unknown"),
          domainRegisteredAt: analysis.domain_registered_at ? String(analysis.domain_registered_at) : "",
          landScore: analysis.land_score == null ? null : num(analysis.land_score),
          landNote: String(analysis.land_note || ""),
          lifecycle: String(analysis.lifecycle || "观察中"),
          lifecycleConfidence: analysis.lifecycle_confidence == null ? null : num(analysis.lifecycle_confidence),
          lifecycleNote: String(analysis.lifecycle_note || ""),
          commercialScore: analysis.commercial_score == null ? null : num(analysis.commercial_score),
          commercialNote: String(analysis.commercial_note || ""),
          serpShape: analysis.serp_shape ? String(analysis.serp_shape) : "",
          platformShare: analysis.platform_share == null ? null : num(analysis.platform_share),
          youngLoosened: num(analysis.young_loosened) === 1,
          kgr: analysis.kgr == null ? null : num(analysis.kgr),
          adsPresent: analysis.ads_present == null ? null : num(analysis.ads_present) === 1,
          pageMix: (() => {
            if (!analysis.page_mix_json) return {};
            try {
              return JSON.parse(String(analysis.page_mix_json)) as Record<string, number>;
            } catch {
              return {};
            }
          })(),
          outline: outline
            ? { ...outlineRecord, related: clusterPage.items, sections: sectionPage.items }
            : null,
          outlineMethod: String(analysis.outline_method || "heuristic"),
        }
      : null,
    weights: readWeights(),
    voices: { items: mentionRows, total: mentionTotal, page: mentionCurrent, size: mentionSize },
    demands,
    demandTotal,
    demandPage: demandCurrent,
    demandSize,
  };
}

function loadKpis() {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const start = new Date(`${day}T00:00:00+08:00`).toISOString();
  const leads = all<{ lead_hours: number }>(
    "select lead_hours from terms where novelty = 'novel' and lead_hours is not null and lead_hours > 0 and ifnull(google_at_discovery, 0) = 0",
  );
  const statuses = all<{ status: string }>("select status from source_status");
  return {
    newToday: num(get<{ c: number }>("select count(*) as c from terms where novelty = 'novel' and first_seen_at >= ?", start)?.c),
    blueOcean: num(get<{ c: number }>("select count(*) as c from term_analysis where competition_label = '蓝海'")?.c),
    avgLeadHours: leads.length ? Math.round((leads.reduce((sum, row) => sum + num(row.lead_hours), 0) / leads.length) * 10) / 10 : null,
    leadSamples: leads.length,
    sourcesOk: statuses.filter((row) => row.status === "ok").length,
    sourcesError: statuses.filter((row) => row.status === "error").length,
    sourcesTotal: statuses.length,
  };
}

export function jobStatus() {
  ensureNovelty();
  const job = get<Record<string, unknown>>("select * from job_state where id = 1");
  const x = get<{ status: string; message: string }>("select status, message from source_status where source = 'x'");
  return {
    running: num(job?.running) === 1,
    phase: String(job?.phase || ""),
    done: num(job?.done),
    total: num(job?.total),
    startedAt: job?.started_at ? String(job.started_at) : null,
    finishedAt: job?.finished_at ? String(job.finished_at) : null,
    lastError: job?.last_error ? String(job.last_error) : "",
    trigger: job?.trigger ? String(job.trigger) : "",
    termCount: num(get<{ c: number }>("select count(*) as c from terms")?.c),
    kpis: loadKpis(),
    xDisabled: !xProviderConfigured(),
    xMessage: xProviderConfigured()
      ? x?.message || "已配置 X 数据接口，等待本轮时间线"
      : "未配置 X 数据接口。时间线暂停，账号仍会从 Reddit、HN、GitHub 和新闻里自动发现。",
  };
}
