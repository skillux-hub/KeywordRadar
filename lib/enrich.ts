import { all, get, num, run } from "./db";
import { fetchText } from "./http";
import { decideDemand, filterDemandPhrases, heuristicDemandPhrases } from "./signals/demand";
import { evaluateTrendsHit, summarizeReviews } from "./signals/trends";
import { dataForSeoEnabled, trendsInterest } from "./vendors/dataforseo";

type JudgeItem = { term: string; snippets: string[] };

export async function judgeNameBatch(items: JudgeItem[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !items.length) return null;
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const scores = new Map<string, number>();
  try {
    for (let index = 0; index < items.length; index += 25) {
      const batch = items.slice(index, index + 25).map((item) => ({
        term: item.term,
        context: item.snippets.slice(0, 3),
      }));
      const res = await fetchText(`${base}/chat/completions`, {
        method: "POST",
        timeoutMs: 25000,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: "system",
              content: "你判断一个英文短语是不是具体的新产品、模型、仓库或项目名，而不是泛泛的描述。只返回 JSON：{\"scores\":[{\"term\":string,\"score\":number}]}。score 从 0 到 1。",
            },
            { role: "user", content: JSON.stringify(batch) },
          ],
        }),
      });
      if (!res.ok) return scores.size ? scores : null;
      const content = JSON.parse(res.text).choices?.[0]?.message?.content ?? "";
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const parsed = JSON.parse(match[0]) as { scores?: { term?: string; score?: number }[] };
      for (const row of parsed.scores ?? []) {
        if (!row.term || typeof row.score !== "number") continue;
        scores.set(row.term, Math.max(0, Math.min(1, row.score)));
      }
    }
    return scores;
  } catch {
    return scores.size ? scores : null;
  }
}

export async function scoreUnjudgedNames() {
  const terms = all<{ id: number; display: string }>(
    "select id, display from terms where name_score is null order by opportunity_score desc limit 50",
  );
  if (!terms.length || !process.env.OPENAI_API_KEY) return { judged: 0, skipped: !process.env.OPENAI_API_KEY };
  const payload = terms.map((term) => ({
    term: term.display,
    snippets: all<{ quote: string | null; title: string | null }>(
      "select quote, title from term_evidence where term_id = ? order by id desc limit 3",
      term.id,
    ).map((row) => `${row.title ?? ""} ${row.quote ?? ""}`.trim()).filter(Boolean),
  }));
  const scores = await judgeNameBatch(payload);
  if (!scores) return { judged: 0, skipped: false };
  let judged = 0;
  for (const term of terms) {
    const score = scores.get(term.display);
    if (score == null) continue;
    run("update terms set name_score = ? where id = ?", score, term.id);
    judged += 1;
  }
  return { judged, skipped: false };
}

export async function refreshDemandKeywords() {
  const terms = all<{ id: number; display: string; summary: string | null }>(
    `select id, display, summary from terms
     where name_score is null or name_score >= 0.45
     order by opportunity_score desc limit 8`,
  );
  const now = new Date().toISOString();
  for (const term of terms) {
    const evidence = all<{ quote: string | null; title: string | null }>(
      "select quote, title from term_evidence where term_id = ? order by id desc limit 6",
      term.id,
    );
    const context = `${term.summary ?? ""} ${evidence.map((row) => `${row.title ?? ""} ${row.quote ?? ""}`).join(" ")}`;
    let candidates = heuristicDemandPhrases(term.display, context);
    const generated = await proposeWithModel(term.display, context);
    if (generated) candidates = [...generated, ...candidates];
    const phrases = filterDemandPhrases(candidates, term.display, context);
    const crowded = get<{ serp_shape: string | null }>("select serp_shape from term_analysis where term_id = ?", term.id)?.serp_shape === "平台占据";
    for (const phrase of phrases) {
      let volume: number | null = null;
      let trend: "up" | "flat" | "down" | "unknown" = "unknown";
      let stillHigh = false;
      if (dataForSeoEnabled()) {
        volume = await monthlySearchVolumeSafe(phrase);
        const series = await trendsInterest(phrase);
        if (series && series.length > 3) {
          const recent = series.slice(-4).reduce((sum, point) => sum + point.value, 0) / 4;
          const earlier = series.slice(0, Math.max(1, series.length - 4)).reduce((sum, point) => sum + point.value, 0) / Math.max(1, series.length - 4);
          trend = recent > earlier * 1.25 ? "up" : recent < earlier * 0.8 ? "down" : "flat";
          stillHigh = recent >= earlier;
        }
      }
      const decision = decideDemand({ trend, stillHigh, volume, crowded });
      const note = dataForSeoEnabled() ? "已用搜索量和趋势方向判断" : "没有 DataForSEO，只根据讨论上下文判断";
      run(
        `insert into demand_keywords (term_id, keyword, decision, volume, trend, note, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(term_id, keyword) do update set
           decision=excluded.decision, volume=excluded.volume, trend=excluded.trend, note=excluded.note, updated_at=excluded.updated_at`,
        term.id,
        phrase,
        decision,
        volume,
        trend,
        note,
        now,
      );
    }
  }
}

async function proposeWithModel(name: string, context: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  try {
    const res = await fetchText(`${base}/chat/completions`, {
      method: "POST",
      timeoutMs: 20000,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "把一个新产品或专名改写成用户会拿去搜索的通用需求词。不要重复品牌名。只返回 JSON：{\"keywords\":string[]}，5 到 10 个英文短语。",
          },
          { role: "user", content: `名称：${name}\n材料：${context.slice(0, 1200)}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const content = JSON.parse(res.text).choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { keywords?: string[] };
    return parsed.keywords ?? null;
  } catch {
    return null;
  }
}

async function monthlySearchVolumeSafe(keyword: string) {
  try {
    const { monthlySearchVolume } = await import("./vendors/dataforseo");
    return await monthlySearchVolume(keyword);
  } catch {
    return null;
  }
}

export async function reviewMatureTerms() {
  if (!dataForSeoEnabled()) return { reviewed: 0, skipped: true };
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const terms = all<{ id: number; display: string; first_seen_at: string }>(
    `select t.id, t.display, t.first_seen_at from terms t
     left join trends_reviews r on r.term_id = t.id
     where t.first_seen_at <= ? and r.term_id is null
     order by t.opportunity_score desc limit 10`,
    cutoff,
  );
  let reviewed = 0;
  for (const term of terms) {
    try {
      const series = await trendsInterest(term.display);
      if (!series) continue;
      const outcome = evaluateTrendsHit(series, term.first_seen_at);
      const source = get<{ source: string }>("select source from term_sources where term_id = ? limit 1", term.id)?.source ?? "";
      run(
        `insert into trends_reviews (term_id, source, reviewed_at, hit, lead_days, baseline, peak, note)
         values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(term_id) do update set
           hit=excluded.hit, lead_days=excluded.lead_days, baseline=excluded.baseline, peak=excluded.peak, note=excluded.note, reviewed_at=excluded.reviewed_at`,
        term.id,
        source,
        new Date().toISOString(),
        outcome.hit ? 1 : 0,
        outcome.leadDays,
        outcome.baseline,
        outcome.peak,
        outcome.note,
      );
      reviewed += 1;
    } catch {
      /* one term must not stop the review */
    }
  }
  return { reviewed, skipped: false };
}

export function trendReviewSummary() {
  const rows = all<{ source: string | null; hit: number; lead_days: number | null }>(
    "select source, hit, lead_days from trends_reviews",
  );
  return summarizeReviews(rows.map((row) => ({ source: row.source || "unknown", hit: num(row.hit) === 1, leadDays: row.lead_days == null ? null : num(row.lead_days) })));
}
