"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { DETAIL_SIZES } from "@/lib/pagination";

type Payload = {
  items: { id: number; term: string; stageLabel: string; opportunity: number; summary: string; sources: string[] }[];
  backtest: { samples: number; avgLeadHours: number | null };
  demands?: { term: string; keyword: string; decision: string }[];
};

export default function DigestPage() {
  const search = useSearchParams();
  const [digest, setDigest] = useState<{ createdAt: string; trigger: string; payload: Payload; delivery: Record<string, unknown> | null } | null>(null);
  const [history, setHistory] = useState<{ items: { id: number; created_at: string; trigger: string }[]; total: number; page: number; size: number }>({ items: [], total: 0, page: 1, size: 20 });
  const [backtest, setBacktest] = useState<{ samples: number; avgLeadHours: number | null; weights: { earlyBonus: number }; trendReview?: { source: string; total: number; hits: number; hitRate: number; medianLeadDays: number | null }[]; leads?: { items: { id: number; display: string; lead_hours: number }[]; total: number; page: number; size: number }; reviews?: { items: { term_id: number; display: string; source: string | null; hit: number; lead_days: number | null; reviewed_at?: string }[]; total: number; page: number; size: number } } | null>(null);
  const [schedule, setSchedule] = useState({ hour: 8, timeZone: "Asia/Shanghai" });
  const [sending, setSending] = useState(false);

  async function load() {
    const data = await fetch(`/api/digest?${search.toString()}`).then((res) => res.json());
    setDigest(data.digest);
    setHistory(data.history || { items: [], total: 0, page: 1, size: 20 });
    setBacktest(data.backtest);
    setSchedule(data.schedule);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function send() {
    setSending(true);
    await fetch("/api/digest", { method: "POST" });
    await load();
    setSending(false);
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">日报与回测</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            每天 {schedule.hour}:00（{schedule.timeZone}）生成前 10 个还没被 Google 接住的机会。配了 SMTP、Telegram 或 webhook 就会外发，页面上始终能看。
          </p>
        </div>
        <Button onClick={() => void send()} disabled={sending}>{sending ? "发送中" : "立即生成并发送"}</Button>
      </div>

      <section className="panel mt-5 p-4 text-sm leading-6">
        <h2 className="font-medium">领先 Google 的时间</h2>
        {backtest?.samples ? (
          <p className="mt-2">已有 {backtest.samples} 个词是先被雷达看见、后来才出现在自动补全或每日趋势里。平均领先 {backtest.avgLeadHours?.toFixed(1)} 小时。早发现加权目前是 {backtest.weights.earlyBonus}。</p>
        ) : (
          <p className="mt-2 text-muted">还没有闭环样本。第一次看见就已经在 Google 上的词不计入领先时间。多跑几轮之后，这里会用平均领先时间微调权重。</p>
        )}
      </section>

      <section className="panel mt-4 p-4 text-sm leading-6">
        <h2 className="font-medium">14 日趋势复核</h2>
        {!backtest?.trendReview?.length && <p className="mt-2 text-muted">词满 14 天后，如果配了 DataForSEO，会按来源统计命中率和中位领先天数。没配密钥就跳过，不影响采集。</p>}
        {!!backtest?.trendReview?.length && (
          <ul className="mt-2 space-y-1">
            {backtest.trendReview.map((row) => (
              <li key={row.source}>{row.source}：命中 {Math.round(row.hitRate * 100)}%（{row.hits}/{row.total}）{row.medianLeadDays != null ? `，中位领先 ${row.medianLeadDays} 天` : ""}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 space-y-3">
        {!digest && <div className="panel px-4 py-8 text-sm text-muted">首轮采集结束后会留下一份快照。采集快照不会发邮件。</div>}
        {digest?.payload.items.map((item, index) => (
          <article key={item.id} className="panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <Link href={`/terms/${item.id}`} className="font-medium">{index + 1}. {item.term}</Link>
              <span className="text-2xl font-semibold tabular-nums">{item.opportunity}</span>
            </div>
            <div className="mt-1 text-xs text-muted">{item.stageLabel} · {item.sources.join("、")}</div>
            <p className="mt-2 text-sm leading-6">{item.summary}</p>
            {!!digest.payload.demands?.filter((demand) => demand.term === item.term).length && (
              <p className="mt-2 text-xs text-muted">通用需求词：{digest.payload.demands.filter((demand) => demand.term === item.term).map((demand) => `${demand.keyword}（${demand.decision}）`).join("、")}</p>
            )}
          </article>
        ))}
        {digest?.delivery && (
          <p className="text-xs text-muted">投递：{JSON.stringify(digest.delivery)}</p>
        )}
      </section>

      <section className="panel mt-4 p-4">
        <h2 className="font-medium">日报记录</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {history.items.map((item) => <li key={item.id}>{new Date(item.created_at).toLocaleString("zh-CN")} · {item.trigger}</li>)}
          {!history.items.length && <li>还没有历史快照。</li>}
        </ul>
        <Pagination page={history.page} size={history.size} total={history.total} />
      </section>

      <section className="panel mt-4 p-4">
        <h2 className="font-medium">领先样本</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {backtest?.leads?.items.map((item) => (
            <li key={item.id}><Link className="text-primary" href={`/terms/${item.id}`}>{item.display}</Link> <span className="text-muted">领先 {Number(item.lead_hours).toFixed(1)} 小时</span></li>
          ))}
          {!backtest?.leads?.items.length && <li className="text-muted">还没有样本。</li>}
        </ul>
        <Pagination page={backtest?.leads?.page || 1} size={backtest?.leads?.size || 10} total={backtest?.leads?.total || 0} pageParam="leadPage" sizeParam="leadSize" sizes={DETAIL_SIZES} />
      </section>

      <section className="panel mt-4 p-4">
        <h2 className="font-medium">复核明细</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {backtest?.reviews?.items.map((item) => (
            <li key={`${item.term_id}-${item.reviewed_at || item.display}`}><Link className="text-primary" href={`/terms/${item.term_id}`}>{item.display}</Link> <span className="text-muted">{item.source || "未知来源"} · {item.hit ? "命中" : "未命中"}{item.lead_days != null ? ` · ${item.lead_days} 天` : ""}</span></li>
          ))}
          {!backtest?.reviews?.items.length && <li className="text-muted">还没有 14 日复核记录。</li>}
        </ul>
        <Pagination page={backtest?.reviews?.page || 1} size={backtest?.reviews?.size || 10} total={backtest?.reviews?.total || 0} pageParam="reviewPage" sizeParam="reviewSize" sizes={DETAIL_SIZES} />
      </section>
    </Shell>
  );
}
