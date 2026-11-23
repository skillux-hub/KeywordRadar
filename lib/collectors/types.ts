import { classifyIndustries, detectIntent, normalize, phrasesFromText, quoteAround, type Intent } from "../extract";

export type CollectContext = {
  seeds: { id: number; topic: string; region: string; industry: string | null }[];
  xAccounts: { id: number; industry: string; handle: string; displayName: string | null; userId: string | null; lastFetched: string | null }[];
  subreddits: { id: number; industry: string; name: string; lastFetched: string | null }[];
  redditUsers: { id: number; industry: string; username: string }[];
  sites: { id: number; industry: string; domain: string; name: string | null }[];
  newsletters: { industry: string; name: string | null; url: string }[];
  youtube: { industry: string; name: string | null; channelId: string }[];
  medium: { industry: string; tag: string }[];
  maxItems?: number;
  dryRun?: boolean;
  probe?: "showhn";
};

export type Hit = {
  term: string;
  always?: boolean;
  industry: string | null;
  seedId: number | null;
  url?: string;
  title?: string;
  quote?: string;
  author?: string;
  channel?: string;
  engagement?: number;
  publishedAt?: string;
  intent?: Intent;
  kind?: string;
  bornKind?: "repo_created" | "domain_registered" | "wikipedia_created" | "product_launch";
  bornAt?: string;
};

export type FeedItem = {
  source: string;
  industry: string | null;
  externalId: string;
  author?: string;
  title?: string;
  text?: string;
  url?: string;
  engagement?: number;
  velocity?: number;
  intent?: string;
  publishedAt?: string;
};

export type Suggestion = {
  kind: "x_account" | "subreddit" | "reddit_user";
  industry: string;
  value: string;
  reason: string;
};

export type SitemapPage = {
  domain: string;
  industry: string;
  url: string;
  lastmod?: string;
  title?: string;
  h1?: string;
  description?: string;
  isNew: boolean;
};

export type CollectorResult = {
  source: string;
  status: "ok" | "disabled" | "error";
  message: string;
  hits: Hit[];
  feed: FeedItem[];
  suggestions: Suggestion[];
  pages: SitemapPage[];
  nextCursor?: string[];
  stats?: { fetched: number; deduped: number; emitted: number };
};

export function result(
  source: string,
  status: CollectorResult["status"],
  message: string,
  extra?: Partial<CollectorResult>,
): CollectorResult {
  return { source, status, message, hits: [], feed: [], suggestions: [], pages: [], ...extra };
}

export type Doc = {
  title?: string;
  body?: string;
  url?: string;
  author?: string;
  channel?: string;
  publishedAt?: string;
  engagement?: number;
  industry?: string | null;
  seedId?: number | null;
  productName?: string;
  repoName?: string;
  slug?: string;
  social?: boolean;
  entityName?: string;
  bornKind?: "repo_created" | "domain_registered" | "wikipedia_created" | "product_launch";
  bornAt?: string;
  entityOnly?: boolean;
  context?: string;
};

export function hitsFromDoc(doc: Doc): Hit[] {
  if (doc.entityOnly && doc.entityName) {
    const context = doc.context || "";
    const industry = classifyIndustries(context)[0] ?? null;
    return [{
      term: doc.entityName,
      always: true,
      industry,
      seedId: doc.seedId ?? null,
      url: doc.url,
      title: doc.entityName,
      quote: context.slice(0, 220),
      author: doc.author,
      channel: doc.channel,
      engagement: doc.engagement,
      publishedAt: doc.publishedAt,
      intent: detectIntent(context),
      kind: "entity",
      bornKind: doc.bornKind,
      bornAt: doc.bornAt,
    }];
  }
  const phrases = phrasesFromText(doc);
  const intent = detectIntent(`${doc.title ?? ""} ${doc.body ?? ""} ${doc.productName ?? ""}`);
  const plain = `${doc.title ?? ""} ${doc.body ?? ""}`.trim();
  const entity = doc.entityName ? normalize(doc.entityName) : "";
  return phrases.map((phrase) => ({
    term: phrase.display,
    always: phrase.always,
    industry: doc.industry ?? null,
    seedId: doc.seedId ?? null,
    url: doc.url,
    title: doc.title,
    quote: quoteAround(plain, phrase.term).slice(0, 220),
    author: doc.author,
    channel: doc.channel,
    engagement: doc.engagement,
    publishedAt: doc.publishedAt,
    intent,
    kind: phrase.kind,
    bornKind: entity && phrase.term === entity ? doc.bornKind : undefined,
    bornAt: entity && phrase.term === entity ? doc.bornAt : undefined,
  }));
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
