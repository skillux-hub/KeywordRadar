import nodemailer from "nodemailer";
import { SOURCE_LABEL, stageMeta } from "./catalog";
import { all, get, run } from "./db";
import { fetchText } from "./http";
import { trendReviewSummary } from "./enrich";
import { readWeights } from "./score";
import { zonedNow } from "./utils";

type DigestItem = {
  id: number;
  term: string;
  stage: string;
  stageLabel: string;
  opportunity: number;
  summary: string;
  sources: string[];
  firstSeen: string;
  demands: { keyword: string; decision: string }[];
};

export function buildDigestItems(): DigestItem[] {
  const primary = all<{
    id: number;
    display: string;
    stage: string;
    opportunity_score: number;
    summary: string | null;
    first_seen_at: string;
  }>(
    `select id, display, stage, opportunity_score, summary, first_seen_at
     from terms where ifnull(stage,'earliest') != 'on_google'
     order by opportunity_score desc limit 10`,
  );
  const rows = primary.length >= 10
    ? primary
    : [
        ...primary,
        ...all<typeof primary[number]>(
          `select id, display, stage, opportunity_score, summary, first_seen_at from terms
           order by opportunity_score desc limit 10`,
        ),
      ].filter((row, index, list) => list.findIndex((item) => item.id === row.id) === index).slice(0, 10);
  return rows.map((row) => ({
    id: row.id,
    term: row.display,
    stage: row.stage,
    stageLabel: stageMeta(row.stage).label,
    opportunity: row.opportunity_score,
    summary: row.summary ?? "",
    sources: all<{ source: string }>("select source from term_sources where term_id = ?", row.id).map((item) => SOURCE_LABEL[item.source] ?? item.source),
    firstSeen: row.first_seen_at,
    demands: all<{ keyword: string; decision: string }>(
      "select keyword, decision from demand_keywords where term_id = ? and decision != '跳过' order by case decision when '优先' then 0 else 1 end limit 5",
      row.id,
    ),
  }));
}

export function latestDigest() {
  return get<{ id: number; created_at: string; trigger: string; payload_json: string; delivery_json: string | null; local_date: string | null }>(
    "select * from digests order by id desc limit 1",
  );
}

export async function saveDigest(trigger: "collect" | "schedule" | "manual", deliver: boolean) {
  const items = buildDigestItems();
  const backtest = all<{ lead_hours: number }>(
    "select lead_hours from terms where lead_hours is not null and ifnull(google_at_discovery,0)=0 and lead_hours > 0",
  );
  const avg = backtest.length ? backtest.reduce((sum, row) => sum + Number(row.lead_hours), 0) / backtest.length : null;
  const zone = zonedNow();
  const payload = {
    title: "SEO 新词雷达 · 早报",
    createdAt: new Date().toISOString(),
    items,
    backtest: { samples: backtest.length, avgLeadHours: avg, weights: readWeights() },
    trendReview: trendReviewSummary(),
    demands: items.flatMap((item) => item.demands.map((demand) => ({ term: item.term, ...demand }))),
  };
  const delivery = deliver ? await deliverDigest(payload) : { skipped: true, reason: trigger === "collect" ? "采集快照会存档，定时或手动发送才外发" : "未发送" };
  const inserted = run(
    "insert into digests (created_at, local_date, trigger, payload_json, delivery_json) values (?, ?, ?, ?, ?)",
    payload.createdAt,
    zone.date,
    trigger,
    JSON.stringify(payload),
    JSON.stringify(delivery),
  );
  return { id: Number(inserted.lastInsertRowid), payload, delivery };
}

function digestText(payload: { title: string; items: DigestItem[]; backtest: { samples: number; avgLeadHours: number | null } }) {
  const lines = [payload.title, ""];
  payload.items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.term}  ·  ${item.stageLabel}  ·  机会分 ${item.opportunity}`);
    lines.push(`   ${item.summary}`);
    lines.push(`   来源：${item.sources.join("、") || "—"}`);
    if (item.demands.length) lines.push(`   通用需求词：${item.demands.map((demand) => `${demand.keyword}（${demand.decision}）`).join("、")}`);
  });
  lines.push("");
  lines.push(
    payload.backtest.samples
      ? `回测样本 ${payload.backtest.samples} 个，平均领先 Google ${payload.backtest.avgLeadHours?.toFixed(1)} 小时。`
      : "还没有「先发现、后被 Google 收录」的闭环样本。",
  );
  return lines.join("\n");
}

async function deliverDigest(payload: { title: string; items: DigestItem[]; backtest: { samples: number; avgLeadHours: number | null } }) {
  const text = digestText(payload);
  const out: Record<string, unknown> = {};
  const host = process.env.SMTP_HOST;
  const to = process.env.DIGEST_EMAIL_TO;
  if (host && to) {
    try {
      const port = Number(process.env.SMTP_PORT || 587);
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" } : undefined,
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "radar@localhost",
        to,
        subject: payload.title,
        text,
      });
      out.email = { ok: true };
    } catch (error) {
      out.email = { ok: false, error: error instanceof Error ? error.message : "发送失败" };
    }
  } else {
    out.email = { skipped: true, reason: "未配置 SMTP_HOST / DIGEST_EMAIL_TO" };
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    const res = await fetchText(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900) }),
    });
    out.telegram = { ok: res.ok, status: res.status };
  } else {
    out.telegram = { skipped: true, reason: "未配置 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID" };
  }
  const webhook = process.env.DIGEST_WEBHOOK_URL;
  if (webhook) {
    const res = await fetchText(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, items: payload.items, createdAt: new Date().toISOString() }),
    });
    out.webhook = { ok: res.ok, status: res.status };
  } else {
    out.webhook = { skipped: true, reason: "未配置 DIGEST_WEBHOOK_URL" };
  }
  return out;
}

export async function maybeSendScheduledDigest() {
  const zone = zonedNow();
  const hour = Number(process.env.DIGEST_HOUR || 8);
  if (zone.hour !== hour || zone.minute > 20) return;
  const sent = get("select id from digests where trigger = 'schedule' and local_date = ?", zone.date);
  if (sent) return;
  await saveDigest("schedule", true);
}
