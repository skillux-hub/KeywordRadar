"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "@/components/external-link";
import { Shell } from "@/components/shell";
import { ago } from "@/lib/utils";

type Source = {
  id: string;
  name: string;
  roleLabel: string;
  enabled?: boolean;
  fetchStatus?: string;
  status: string;
  message: string;
  lastRunAt: string | null;
  count: number;
  keys: string;
  url?: string;
};

const STATUS_LABEL: Record<string, string> = {
  ok: "正常",
  disabled: "未启用",
  error: "失败",
  idle: "未运行",
};

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  useEffect(() => {
    const load = () => void fetch("/api/sources").then((res) => res.json()).then((data) => setSources(data.sources));
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">数据源</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">每个采集器单独失败。缺密钥的来源会停在「未启用」，页面其他部分继续工作。</p>
      {["发现", "监控", "验证", "未启用"].map((role) => {
        const group = sources.filter((source) => source.roleLabel === role);
        if (!group.length) return null;
        return (
          <section key={role} className="mt-6">
            <h2 className="text-sm font-semibold">{role}</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {group.map((source) => (
          <article key={source.id} className="panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">{source.url ? <ExternalLink href={source.url}>{source.name}</ExternalLink> : source.name}</h2>
              <span className="rounded-full bg-accent px-2 py-1 text-xs">{source.enabled === false ? "配置未启用" : "配置启用"} · 最近采集 {STATUS_LABEL[source.fetchStatus || source.status] || source.status} · {source.roleLabel}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">{source.message}</p>
            <p className="mt-2 text-xs text-muted">密钥：{source.keys}</p>
            <p className="text-xs text-muted">最近：{ago(source.lastRunAt)} · 本轮留下 {source.count} 个词</p>
          </article>
        ))}
      </div>
          </section>
        );
      })}
    </Shell>
  );
}
