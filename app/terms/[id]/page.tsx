"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { Sparkline } from "@/components/sparkline";
import { Badge } from "@/components/ui/badge";
import { ago } from "@/lib/utils";

type Detail = {
  term: string;
  stageLabel: string;
  opportunity: number;
  discovery: number;
  momentum: number;
  newness: number;
  intentLabel: string;
  summary: string;
  firstSeen: string;
  sourceLabels: string[];
  industryLabels: string[];
  spark: number[];
  onSuggest: boolean;
  onTrends: boolean;
  leadHours: number | null;
  googleAtDiscovery: boolean;
  evidence: { sourceLabel: string; url: string; title: string; quote: string; author: string; intent: string }[];
  influencers: { author: string; url: string; quote: string }[];
  pages: { url: string; title: string; author: string }[];
  analysis: null | {
    competitionLabel: string;
    competitionScore: number | null;
    competitionNote: string;
    serp: { url: string; domain: string; kind: string }[];
    domain: string;
    domainStatus: string;
    landScore: number | null;
    landNote: string;
    lifecycle: string;
    lifecycleConfidence: number | null;
    lifecycleNote: string;
    commercialScore: number | null;
    commercialNote: string;
    outline: { titles?: string[]; sections?: { heading: string; points: string[] }[]; related?: string[]; questions?: string[] } | null;
    outlineMethod: string;
  };
  weights: { earlyBonus: number };
};

export default function TermPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void params.then((value) => setId(value.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    void fetch(`/api/keywords/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("没有这个词");
        return res.json();
      })
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, [id]);

  return (
    <Shell>
      <Link href="/" className="text-sm text-muted">← 返回雷达</Link>
      {!data && <div className="panel mt-4 px-5 py-10 text-sm text-muted">{error || "正在读取这个词的证据…"}</div>}
      {data && (
        <div className="mt-3 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs text-muted">{data.industryLabels.join(" / ") || "未分类"} · {data.intentLabel} · {ago(data.firstSeen)}</div>
              <h1 className="display mt-1 break-words text-3xl sm:text-4xl">{data.term}</h1>
              <p className="mt-2 max-w-3xl break-words text-sm leading-6">{data.summary}</p>
            </div>
            <div className="panel w-full px-5 py-3 text-left sm:w-auto sm:text-right">
              <div className="text-xs text-muted">机会分</div>
              <div className="display text-5xl">{data.opportunity}</div>
              <div className="text-xs">{data.stageLabel}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Meter label="发现分" value={data.discovery} note="越早、跨源越多越高；已上 Google 会打折" />
            <Meter label="新近" value={data.newness} note="首次发现越近越高" />
            <Meter label="动量" value={data.momentum} note="最近快照相对前几天" />
            <div className="panel p-4">
              <div className="text-xs text-muted">14 日出现次数</div>
              <Sparkline data={data.spark} />
              <div className="mt-2 text-xs text-muted">早发现加权 {data.weights.earlyBonus}</div>
            </div>
          </div>

          <section className="panel p-4">
            <h2 className="font-medium">Google 只做滞后确认</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              自动补全：{data.onSuggest ? "已经会补全" : "还不会补全"}。每日趋势：{data.onTrends ? "已出现" : "未出现"}。
              {data.googleAtDiscovery
                ? "第一次看见它时，Google 就已经知道了，所以不算领先。"
                : data.leadHours
                  ? `从雷达首次发现到 Google 出现，领先约 ${data.leadHours.toFixed(1)} 小时。`
                  : "还在窗口里，Google 尚未接上。"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {data.sourceLabels.map((label) => <Badge key={label}>{label}</Badge>)}
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <article className="panel p-4">
              <h2 className="font-medium">X 大V</h2>
              {!data.influencers.length && <p className="mt-2 text-sm text-muted">还没有大V帖子指向这个词。没配 token 时这里会是空的。</p>}
              <ul className="mt-3 space-y-3">
                {data.influencers.map((item, index) => (
                  <li key={`${item.url}-${index}`} className="text-sm">
                    <a className="break-all font-medium text-primary" href={item.url || `https://x.com/${item.author}`} target="_blank" rel="noreferrer">@{item.author}</a>
                    <p className="break-words text-muted">{item.quote}</p>
                  </li>
                ))}
              </ul>
            </article>
            <article className="panel p-4">
              <h2 className="font-medium">讨论摘录</h2>
              <ul className="mt-3 space-y-3">
                {data.evidence.slice(0, 6).map((item, index) => (
                  <li key={index} className="text-sm">
                    <div className="text-xs text-muted">{item.sourceLabel} · {item.intent} {item.author && `· ${item.author}`}</div>
                    {item.url ? <a className="break-all text-primary" href={item.url} target="_blank" rel="noreferrer">{item.title || item.quote}</a> : <span className="break-words">{item.title}</span>}
                    {item.quote && <p className="break-words text-muted">{item.quote}</p>}
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="panel p-4">
            <h2 className="font-medium">竞品新页面</h2>
            {!data.pages.length && <p className="mt-2 text-sm text-muted">还没有站点地图证据。</p>}
            <ul className="mt-3 space-y-2 text-sm">
              {data.pages.map((page) => (
                <li key={page.url}>
                  <a className="break-all text-primary" href={page.url} target="_blank" rel="noreferrer">{page.title || page.url}</a>
                  <span className="ml-2 text-muted">{page.author}</span>
                </li>
              ))}
            </ul>
          </section>

          {data.analysis && (
            <section className="grid gap-3 md:grid-cols-2">
              <article className="panel p-4 text-sm leading-6">
                <h2 className="font-medium">竞争与占位</h2>
                <p className="mt-2">竞争：{data.analysis.competitionLabel}{data.analysis.competitionScore != null ? ` · 难度 ${data.analysis.competitionScore}` : ""}</p>
                <p className="text-muted">{data.analysis.competitionNote}</p>
                <p className="mt-2">域名：{data.analysis.domain || "未检查"} · {domainLabel(data.analysis.domainStatus)}{data.analysis.landScore != null ? ` · 窗口分 ${data.analysis.landScore}` : ""}</p>
                <p className="text-muted">{data.analysis.landNote}</p>
                <p className="mt-2">生命周期：{data.analysis.lifecycle}{data.analysis.lifecycleConfidence != null ? ` · 置信 ${Math.round(data.analysis.lifecycleConfidence * 100)}%` : ""}</p>
                <p className="text-muted">{data.analysis.lifecycleNote}</p>
                <p className="mt-2">商业价值：{data.analysis.commercialScore ?? "—"}</p>
                <p className="text-muted">{data.analysis.commercialNote}</p>
              </article>
              <article className="panel p-4 text-sm leading-6">
                <h2 className="font-medium">大纲 · {data.analysis.outlineMethod === "llm" ? "模型" : "模板"}</h2>
                <ul className="mt-2 list-disc pl-4">
                  {data.analysis.outline?.titles?.map((title) => <li key={title}>{title}</li>)}
                </ul>
                {data.analysis.outline?.sections?.map((section) => (
                  <div key={section.heading} className="mt-3">
                    <div className="font-medium">{section.heading}</div>
                    <ul className="list-disc pl-4 text-muted">
                      {section.points.map((point) => <li key={point}>{point}</li>)}
                    </ul>
                  </div>
                ))}
              </article>
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}

function Meter({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="display text-3xl">{value}</div>
      <div className="mt-2 h-1.5 rounded-full bg-[#eadfcd]"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, value)}%` }} /></div>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </div>
  );
}

function domainLabel(status: string) {
  if (status === "available") return "可注册";
  if (status === "new") return "新近注册";
  if (status === "taken") return "已被持有";
  return "未确认";
}
