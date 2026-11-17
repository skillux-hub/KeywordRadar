const COLOR: Record<string, string> = {
  hn: "#f97316",
  producthunt: "#ea580c",
  github: "#6b7280",
  reddit: "#f43f5e",
  bluesky: "#0ea5e9",
  stackexchange: "#f59e0b",
  youtube: "#ef4444",
  substack: "#f97316",
  medium: "#111827",
  googlenews: "#4285f4",
  sitemap: "#0f766e",
  x: "#111827",
  tiktok: "#111827",
  quora: "#b91c1c",
  amazon: "#f59e0b",
  etsy: "#f97316",
  discord: "#5865f2",
  telegram: "#0ea5e9",
  threads: "#111827",
  google: "#4285f4",
};

export function SourceMark({ id, label }: { id?: string; label: string }) {
  const letter = (label || id || "?").slice(0, 1).toUpperCase();
  const color = COLOR[id || ""] || "#64748b";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted" title={label}>
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] text-[9px] font-semibold text-white" style={{ background: color }}>
        {letter}
      </span>
      <span className="max-w-[7rem] truncate">{label}</span>
    </span>
  );
}
