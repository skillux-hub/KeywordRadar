import { guard } from "@/lib/auth";
import { latestDigest, saveDigest } from "@/lib/digest";
import { trendReviewSummary } from "@/lib/enrich";
import { DETAIL_SIZES, parsePage, parseSize } from "@/lib/pagination";
import { readWeights } from "@/lib/score";
import { all, get, num } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const row = latestDigest();
  const leadWhere = "lead_hours is not null and ifnull(google_at_discovery, 0) = 0 and lead_hours > 0";
  const samples = num(get<{ c: number }>(`select count(*) as c from terms where ${leadWhere}`)?.c);
  const avg = samples ? num(get<{ v: number }>(`select avg(lead_hours) as v from terms where ${leadWhere}`)?.v) : null;
  const leadSize = parseSize(url.searchParams.get("leadSize"), 10, DETAIL_SIZES);
  const leadPages = Math.max(1, Math.ceil(samples / leadSize) || 1);
  const leadPage = Math.min(parsePage(url.searchParams.get("leadPage")), leadPages);
  const leads = all(
    `select id, display, lead_hours, first_seen_at from terms where ${leadWhere} order by lead_hours desc limit ? offset ?`,
    leadSize,
    (leadPage - 1) * leadSize,
  );
  const reviewTotal = num(get<{ c: number }>("select count(*) as c from trends_reviews")?.c);
  const reviewSize = parseSize(url.searchParams.get("reviewSize"), 10, DETAIL_SIZES);
  const reviewPages = Math.max(1, Math.ceil(reviewTotal / reviewSize) || 1);
  const reviewPage = Math.min(parsePage(url.searchParams.get("reviewPage")), reviewPages);
  const reviews = all(
    `select r.source, r.hit, r.lead_days, r.baseline, r.peak, r.note, r.reviewed_at, t.id as term_id, t.display
     from trends_reviews r join terms t on t.id = r.term_id
     order by r.reviewed_at desc limit ? offset ?`,
    reviewSize,
    (reviewPage - 1) * reviewSize,
  );
  const historySize = parseSize(url.searchParams.get("size"));
  const historyTotal = num(get<{ c: number }>("select count(*) as c from digests")?.c);
  const historyPages = Math.max(1, Math.ceil(historyTotal / historySize) || 1);
  const historyPage = Math.min(parsePage(url.searchParams.get("page")), historyPages);
  const history = all(
    "select id, created_at, trigger, local_date from digests order by id desc limit ? offset ?",
    historySize,
    (historyPage - 1) * historySize,
  );
  return Response.json({
    digest: row
      ? {
          id: row.id,
          createdAt: row.created_at,
          trigger: row.trigger,
          payload: JSON.parse(row.payload_json),
          delivery: row.delivery_json ? JSON.parse(row.delivery_json) : null,
        }
      : null,
    history: { items: history, total: historyTotal, page: historyPage, size: historySize },
    backtest: {
      samples,
      avgLeadHours: avg,
      weights: readWeights(),
      trendReview: trendReviewSummary(),
      leads: { items: leads, total: samples, page: leadPage, size: leadSize },
      reviews: { items: reviews, total: reviewTotal, page: reviewPage, size: reviewSize },
    },
    schedule: { hour: Number(process.env.DIGEST_HOUR || 8), timeZone: process.env.DIGEST_TZ || "Asia/Shanghai" },
  });
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const saved = await saveDigest("manual", true);
  return Response.json(saved);
}
