export type HistoryTarget = {
  kind: "github" | "pypi";
  api: string;
  key: string;
  page: string;
};

export function historyTarget(raw: string): HistoryTarget | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean).map(decodePart);
  if (parts.some((part) => part === "." || part === "..")) return null;
  if (host === "github.com" && parts.length === 2 && safeRepo(parts[0]) && safeRepo(parts[1].replace(/\.git$/i, ""))) {
    const full = `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
    return { kind: "github", api: `https://api.github.com/repos/${full}`, key: full.toLowerCase(), page: `https://github.com/${full}` };
  }
  if (host === "pypi.org" && parts[0] === "project" && parts[1] && parts.length <= 3 && /^[\w._-]+$/.test(parts[1])) {
    return {
      kind: "pypi",
      api: `https://pypi.org/pypi/${encodeURIComponent(parts[1])}/json`,
      key: parts[1].toLowerCase(),
      page: `https://pypi.org/project/${parts[1]}/`,
    };
  }
  return null;
}

function decodePart(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function safeRepo(part: string) {
  return /^[\w.-]+$/.test(part);
}

export function readGithubCreated(data: { created_at?: unknown; pushed_at?: unknown; updated_at?: unknown } | null) {
  const at = typeof data?.created_at === "string" ? data.created_at : "";
  if (!at || !Number.isFinite(Date.parse(at))) return null;
  return at;
}

export function readPypiCreated(data: { releases?: Record<string, { upload_time_iso_8601?: string }[] | undefined> } | null) {
  let best: { ms: number; at: string } | null = null;
  for (const files of Object.values(data?.releases ?? {})) {
    for (const file of files ?? []) {
      const at = file?.upload_time_iso_8601;
      if (!at) continue;
      const ms = Date.parse(at);
      if (!Number.isFinite(ms)) continue;
      if (!best || ms < best.ms) best = { ms, at };
    }
  }
  return best?.at ?? null;
}
