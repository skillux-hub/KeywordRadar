"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

type Payload = {
  items: { id: number; term: string; stageLabel: string; opportunity: number; summary: string; sources: string[] }[];
  backtest: { samples: number; avgLeadHours: number | null };
};

export default function DigestPage() {
  const [digest, setDigest] = useState<{ createdAt: string; trigger: string; payload: Payload; delivery: Record<string, unknown> | null } | null>(null);
  const [backtest, setBacktest] = useState<{ samples: number; avgLeadHours: number | null; weights: { earlyBonus: number } } | null>(null);
  const [schedule, setSchedule] = useState({ hour: 8, timeZone: "Asia/Shanghai" });
  const [sending, setSending] = useState(false);

  async function load() {
    const data = await fetch("/api/digest").then((res) => res.json());
    setDigest(data.digest);
    setBacktest(data.backtest);
    setSchedule(data.schedule);
  }

  useEffect(() => {
    void load();
  }, []);

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
          <h1 className="display text-4xl">日报与回测</h1>
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

      <section className="mt-4 space-y-3">
        {!digest && <div className="panel px-4 py-8 text-sm text-muted">首轮采集结束后会留下一份快照。采集快照不会发邮件。</div>}
        {digest?.payload.items.map((item, index) => (
          <article key={item.id} className="panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <Link href={`/terms/${item.id}`} className="font-medium">{index + 1}. {item.term}</Link>
              <span className="display text-2xl">{item.opportunity}</span>
            </div>
            <div className="mt-1 text-xs text-muted">{item.stageLabel} · {item.sources.join("、")}</div>
            <p className="mt-2 text-sm leading-6">{item.summary}</p>
          </article>
        ))}
        {digest?.delivery && (
          <p className="text-xs text-muted">投递：{JSON.stringify(digest.delivery)}</p>
        )}
      </section>
    </Shell>
  );
}
