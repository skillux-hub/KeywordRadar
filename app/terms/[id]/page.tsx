"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { Sparkline } from "@/components/sparkline";
import { SourceMark } from "@/components/source-mark";
import { ago } from "@/lib/utils";

type Evidence = { source: string; sourceLabel: string; url: string; title: string; quote: string; author: string; intent: string };
type Detail = {
  term: string;
  stage: string;
  stageLabel: string;
  opportunity: number;
  discovery: number;
  momentum: number;
  newness: number;
  intentLabel: string;
  summary: string;
  firstSeen: string;
  sources: string[];
  sourceLabels: string[];
  industryLabels: string[];
  spark: number[];
  nameScore: number | null;
  demands: { keyword: string; decision: string; volume: number | null; trend: string | null; note: string | null }[];
  voices?: { x: string[]; reddit: string[] };
  onSuggest: boolean;
  onTrends: boolean;
  leadHours: number | null;
  googleAtDiscovery: boolean;
  evidence: Evidence[];
  influencers: { author: string; url: string; quote: string }[];
  pages: { url: string; title: string; author: string }[];
  analysis: null | {
    competitionLabel: string;
    competitionScore: number | null;
    competitionNote: string;
    serp: { url: string; domain: string; kind: string; pageKind?: string; homepage?: boolean }[];
    pageMix?: Record<string, number>;
    domain: string;
    domainStatus: string;
    landScore: number | null;
    landNote: string;
    lifecycle: string;
    lifecycleConfidence: number | null;
    lifecycleNote: string;
    commercialScore: number | null;
    commercialNote: string;
    serpShape: string;
    platformShare: number | null;
    youngLoosened: boolean;
    kgr: number | null;
    adsPresent: boolean | null;
    outline: { titles?: string[]; sections?: { heading: string; points: string[] }[]; related?: string[]; questions?: string[] } | null;
    outlineMethod: string;
  };
};

const PAGE_KIND: Record<string, string> = { tool: "工具", list: "清单", article: "文章", video: "视频", forum: "论坛", official: "官网" };

const TABS = [
  { id: "quotes", label: "摘录" },
  { id: "x", label: "X" },
  { id: "reddit", label: "Reddit" },
  { id: "sitemap", label: "站点" },
  { id: "serp", label: "SERP" },
  { id: "outline", label: "大纲" },
] as const;

export default function TermPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("quotes");

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
      <Link href="/" className="text-sm text-muted hover:text-foreground">← 返回雷达</Link>
      {!data && (
        <div className="panel mt-4 space-y-3 p-5">
          {error ? <p className="text-sm text-muted">{error}</p> : (
            <>
              <div className="skel h-8 w-2/3" />
              <div className="skel h-4 w-full" />
              <div className="skel h-24 w-full" />
            </>
          )}
        </div>
      )}
      {data && (
        <div className="mt-4 space-y-4">
          <section className="panel p-4 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className={`stage stage-${data.stage}`}>{data.stageLabel}</span>
                  <span>{data.industryLabels.join(" / ") || "未分类"}</span>
                  <span>· {data.intentLabel}</span>
                  <span>· {ago(data.firstSeen)}</span>
                </div>
                <h1 className="mt-3 break-words text-2xl font-semibold tracking-tight sm:text-4xl">{data.term}</h1>
                {data.nameScore != null && <p className="mt-1 text-xs text-faint">专名判断 {Math.round(data.nameScore * 100)} / 100</p>}
                <p className="mt-3 max-w-3xl break-words text-sm leading-6 text-muted">{data.summary}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.sources.map((source, index) => (
                    <SourceMark key={source} id={source} label={data.sourceLabels[index] || source} />
                  ))}
                </div>
              </div>
              <ScoreRing value={data.opportunity} label="机会分" />
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Bar label="发现" value={data.discovery} note="越早、跨源越多越高；已上 Google 会打折" />
              <Bar label="新近" value={data.newness} note="首次发现越近越高" />
              <Bar label="动量" value={data.momentum} note="最近快照相对前几天" />
              <Bar label="商业" value={data.analysis?.commercialScore ?? 0} note={data.analysis?.commercialNote || "还没做商业判断"} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <Sparkline data={data.spark} />
              <p className="text-xs text-faint">14 日出现次数</p>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <Info title="Google" body={data.onSuggest ? "自动补全已经会写出这个词。" : "自动补全还没跟上。"} extra={data.onTrends ? "每日趋势里也出现了。" : data.googleAtDiscovery ? "第一次看见时 Google 就已经知道。" : data.leadHours ? `领先约 ${data.leadHours.toFixed(1)} 小时。` : "还在窗口里。"} />
            <Info title="竞争" body={`${data.analysis?.competitionLabel || "未检测"}${data.analysis?.serpShape ? ` · ${data.analysis.serpShape}` : ""}`} extra={`${data.analysis?.competitionNote || "这一轮还没拉 SERP。"}${data.analysis?.youngLoosened ? " 年轻词已放宽一档。" : ""}${data.analysis?.kgr != null ? ` KGR ${data.analysis.kgr}。` : ""}${data.analysis?.adsPresent == null ? "" : data.analysis.adsPresent ? " 有广告。" : " 无广告。"}`} />
            <Info title="域名窗口" body={domainLabel(data.analysis?.domainStatus || "unknown")} extra={`${data.analysis?.domain || "未检查"}。${data.analysis?.landNote || ""} ${data.analysis?.lifecycle || "观察中"}。`} />
          </section>

          <section className="panel p-4 sm:p-5">
            <h2 className="text-sm font-semibold">谁在说</h2>
            <p className="mt-2 text-sm text-muted">
              X：{data.voices?.x?.length ? data.voices.x.map((name) => `@${name}`).join("、") : "还没有跟踪账号提到"}
            </p>
            <p className="mt-1 text-sm text-muted">
              Reddit：{data.voices?.reddit?.length ? data.voices.reddit.map((name) => `r/${name}`).join("、") : "还没有跟踪板块提到"}
            </p>
          </section>

          <section className="panel p-4 sm:p-5">
            <h2 className="text-sm font-semibold">通用需求词</h2>
            {!data.demands?.length && <p className="mt-2 text-sm text-muted">还没有从专名推出的通用搜索词。有 OPENAI_API_KEY 时会多给一批候选；没有 DataForSEO 时不看搜索量，决定会停在观察或跳过。</p>}
            <ul className="mt-3 space-y-2">
              {data.demands?.map((item) => (
                <li key={item.keyword} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{item.keyword}</span>
                  <span className="text-xs text-muted">{item.decision}{item.volume != null ? ` · 月搜索 ${item.volume}` : ""}{item.trend && item.trend !== "unknown" ? ` · 趋势 ${item.trend}` : ""}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel overflow-hidden">
            <div className="flex gap-1 overflow-x-auto border-b border-border px-2">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`shrink-0 border-b-2 px-3 py-2.5 text-sm transition ${tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="p-4 sm:p-5">
              {tab === "quotes" && <QuoteList items={data.evidence} empty="还没有摘录。" />}
              {tab === "x" && <QuoteList items={data.evidence.filter((item) => item.source === "x")} empty="没有 X 大V提到。未配置 token 时这里是空的。" />}
              {tab === "reddit" && <QuoteList items={data.evidence.filter((item) => item.source === "reddit")} empty="这轮没有 Reddit 讨论挂到这个词上。" />}
              {tab === "sitemap" && (
                <ul className="space-y-3 text-sm">
                  {!data.pages.length && <li className="text-muted">还没有竞品新页面。</li>}
                  {data.pages.map((page) => (
                    <li key={page.url}>
                      <a className="break-all font-medium text-primary hover:underline" href={page.url} target="_blank" rel="noreferrer">{page.title || page.url}</a>
                      <div className="text-xs text-faint">{page.author}</div>
                    </li>
                  ))}
                </ul>
              )}
              {tab === "serp" && (
                <div className="space-y-3 text-sm">
                  {!!data.analysis?.pageMix && !!Object.keys(data.analysis.pageMix).length && (
                    <p className="text-xs text-muted">
                      页面类型：{Object.entries(data.analysis.pageMix).map(([kind, count]) => `${PAGE_KIND[kind] || kind} ${count}`).join(" · ")}
                      {data.analysis.platformShare != null ? ` · 平台占比 ${Math.round(data.analysis.platformShare * 100)}%` : ""}
                    </p>
                  )}
                  <ul className="space-y-2">
                    {!data.analysis?.serp?.length && <li className="text-muted">{data.analysis?.competitionNote || "还没有搜索结果。"}</li>}
                    {data.analysis?.serp?.map((row) => (
                      <li key={row.url} className="flex items-start justify-between gap-3">
                        <a className="break-all text-primary hover:underline" href={row.url} target="_blank" rel="noreferrer">{row.domain || row.url}</a>
                        <span className="shrink-0 text-xs text-faint">{PAGE_KIND[row.pageKind || ""] || row.kind} · {row.homepage ? "首页" : "内页"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tab === "outline" && <Outline data={data.analysis} />}
            </div>
          </section>
        </div>
      )}
    </Shell>
  );
}

function ScoreRing({ value, label }: { value: number; label: string }) {
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.min(100, Math.max(0, value)) / 100) * circ;
  return (
    <div className="flex shrink-0 flex-col items-center">
      <svg width="112" height="112" viewBox="0 0 112 112" aria-label={`${label} ${value}`}>
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 56 56)" />
        <text x="56" y="60" textAnchor="middle" fontSize="26" fontWeight="650" fill="var(--foreground)">{value}</text>
      </svg>
      <div className="text-xs text-faint">{label}</div>
    </div>
  );
}

function Bar({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-accent">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <p className="mt-1 text-xs text-faint">{note}</p>
    </div>
  );
}

function Info({ title, body, extra }: { title: string; body: string; extra: string }) {
  return (
    <article className="panel p-4">
      <div className="text-xs text-faint">{title}</div>
      <div className="mt-1 text-sm font-medium">{body}</div>
      <p className="mt-1 break-words text-xs leading-5 text-muted">{extra}</p>
    </article>
  );
}

function QuoteList({ items, empty }: { items: Evidence[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-4">
      {items.slice(0, 8).map((item, index) => (
        <li key={`${item.url}-${index}`} className="text-sm">
          <div className="text-xs text-faint">{item.sourceLabel} · {item.intent} {item.author && `· ${item.author}`}</div>
          {item.url ? (
            <a className="mt-0.5 block break-all font-medium text-primary hover:underline" href={item.url} target="_blank" rel="noreferrer">{item.title || item.quote}</a>
          ) : (
            <div className="mt-0.5 break-words font-medium">{item.title}</div>
          )}
          {item.quote && <p className="mt-1 break-words leading-6 text-muted">{item.quote}</p>}
        </li>
      ))}
    </ul>
  );
}

function Outline({ data }: { data: Detail["analysis"] }) {
  if (!data?.outline) return <p className="text-sm text-muted">还没有大纲。分析会在采集结束时写给机会分靠前的词。</p>;
  return (
    <div className="space-y-4 text-sm leading-6">
      <div className="text-xs text-faint">{data.outlineMethod === "llm" ? "模型生成" : "模板"}</div>
      <ul className="list-disc space-y-1 pl-4">
        {data.outline.titles?.map((title) => <li key={title} className="break-words">{title}</li>)}
      </ul>
      {data.outline.sections?.map((section) => (
        <div key={section.heading}>
          <div className="font-medium">{section.heading}</div>
          <ul className="mt-1 list-disc pl-4 text-muted">
            {section.points.map((point) => <li key={point} className="break-words">{point}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function domainLabel(status: string) {
  if (status === "available") return "可注册";
  if (status === "new") return "新近注册";
  if (status === "taken") return "已被持有";
  return "未确认";
}
