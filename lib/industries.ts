export const INDUSTRY_RULES: [string, RegExp][] = [
  ["ai", /\b(llm|gpt|chatgpt|claude|gemini|openai|anthropic|machine learning|neural|rag|agentic|copilot|diffusion|ai agent|ai tool|ai coding|coding agent|ai collaboration|multi-agent|ai evals?)\b/i],
  ["crypto", /\b(crypto|bitcoin|ethereum|solana|defi|nft|blockchain|web3|tokenomics)\b/i],
  ["ecommerce", /\b(ecommerce|e-commerce|shopify|dtc|d2c|amazon seller|sku|checkout|storefront)\b/i],
  ["marketing", /\b(seo|sem|ppc|backlink|keyword research|content marketing|newsletter growth|search console)\b/i],
  ["health", /\b(fitness|workout|skincare|supplement|nutrition|longevity|sleep tracker|protein powder)\b/i],
  ["gaming", /\b(gaming|game dev|steam deck|playstation|xbox|nintendo|esports|indie game)\b/i],
  ["devtools", /\b(developer tool|devtools|cli tool|sdk|linter|github action|vscode extension|package manager|ide plugin|cli)\b/i],
  ["finance", /\b(stocks|investing|portfolio|fintech|trading|etf|mortgage|personal finance|brokerage)\b/i],
  ["saas", /\b(saas|b2b|startup|mrr|arr|onboarding|workflow automation|product led)\b/i],
];

export function classifyIndustries(text: string): string[] {
  const found = INDUSTRY_RULES.filter(([, rule]) => rule.test(text)).map(([id]) => id);
  return found.length ? found : [];
}

export function industriesFromEvidence(rows: { kind?: string | null; quote?: string | null; title?: string | null }[]) {
  const found = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "entity" && row.kind !== "repo" && row.kind !== "product") continue;
    for (const industry of classifyIndustries(`${row.title || ""} ${row.quote || ""}`)) {
      if (industry === "ai" || industry === "devtools") found.add(industry);
    }
  }
  return [...found];
}
