export type DemandDecision = "优先" | "观察" | "跳过";

export function heuristicDemandPhrases(name: string, context: string) {
  const brand = name.replace(/\s+\d+(?:\.\d+)*$/, "").trim();
  const words = context
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
  const hints = ["detector", "generator", "editor", "image", "video", "audio", "code", "agent", "search", "monitor", "scraper"];
  const found = hints.filter((hint) => words.some((word) => word.startsWith(hint))).slice(0, 3);
  const phrases = new Set<string>();
  if (found.includes("image") || found.includes("detector")) phrases.add("ai image detector");
  if (found.includes("image")) phrases.add("detect ai generated images");
  if (found.includes("video")) phrases.add("ai video generator");
  if (found.includes("code") || found.includes("agent")) phrases.add("ai coding agent");
  if (found.includes("search")) phrases.add("ai search tool");
  if (found.includes("monitor")) phrases.add("website change monitor");
  for (const hint of found) {
    if (hint === "image" || hint === "video" || hint === "code") continue;
    phrases.add(`${hint} tool`);
  }
  if (!phrases.size && brand) phrases.add(`${brand.toLowerCase()} alternative`);
  return [...phrases].filter((phrase) => phrase !== brand.toLowerCase()).slice(0, 8);
}

export function filterDemandPhrases(candidates: string[], brand: string, context: string) {
  const blocked = brand.toLowerCase().replace(/\s+/g, " ").trim();
  const contextWords = new Set(context.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
  const out: string[] = [];
  for (const raw of candidates) {
    const phrase = raw.toLowerCase().replace(/\s+/g, " ").trim();
    const words = phrase.split(" ").filter(Boolean);
    if (words.length < 2 || words.length > 6) continue;
    if (phrase === blocked || phrase.includes(blocked)) continue;
    const overlap = words.some((word) => contextWords.has(word) || ["ai", "tool", "detect", "generator", "alternative"].includes(word));
    if (!overlap) continue;
    if (!out.includes(phrase)) out.push(phrase);
  }
  return out.slice(0, 10);
}

export function decideDemand(input: {
  trend: "up" | "flat" | "down" | "unknown";
  stillHigh: boolean;
  volume: number | null;
  crowded: boolean;
}): DemandDecision {
  const volumeOk = input.volume == null ? false : input.volume >= 100;
  const roseAndHigh = input.trend === "up" && input.stillHigh;
  if (roseAndHigh && volumeOk && !input.crowded) return "优先";
  if (roseAndHigh && volumeOk && input.crowded) return "观察";
  if (input.trend === "down" || (input.volume != null && input.volume < 30)) return "跳过";
  if (roseAndHigh || input.trend === "unknown") return "观察";
  return "跳过";
}
