export type ParsedUser = { id: string; handle: string; name: string; bio: string; followers: number };
export type ParsedPost = {
  id: string;
  text: string;
  createdAt: string | null;
  author: string | null;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  mentions: string[];
  repostOf: string | null;
  followers: number | null;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metrics(value: Record<string, unknown>) {
  const nested = record(value.public_metrics) ?? record(value.publicMetrics) ?? {};
  return {
    likes: numberOf(value.like_count ?? value.likeCount ?? nested.like_count ?? nested.likeCount),
    reposts: numberOf(value.retweet_count ?? value.retweetCount ?? nested.retweet_count ?? nested.retweetCount),
    replies: numberOf(value.reply_count ?? value.replyCount ?? nested.reply_count ?? nested.replyCount),
    quotes: numberOf(value.quote_count ?? value.quoteCount ?? nested.quote_count ?? nested.quoteCount),
    followers: numberOf(value.followers ?? value.followers_count ?? value.followersCount ?? nested.followers_count ?? nested.followersCount),
  };
}

function mentionsOf(value: Record<string, unknown>) {
  const entities = record(value.entities);
  const lists = [entities?.mentions, entities?.user_mentions, entities?.userMentions].filter(Array.isArray) as Record<string, unknown>[][];
  const names: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      const name = text(item.username ?? item.screen_name ?? item.screenName).replace(/^@/, "").toLowerCase();
      if (name) names.push(name);
    }
  }
  return [...new Set(names)];
}

export function parseXUser(json: unknown, fallbackHandle = ""): ParsedUser | null {
  const root = record(json);
  if (!root) return null;
  const data = record(root.data) ?? root;
  const handle = text(data.username ?? data.userName ?? data.screen_name ?? fallbackHandle).replace(/^@/, "");
  const id = text(data.id ?? data.id_str ?? handle);
  if (!handle || !id) return null;
  const count = metrics(data);
  return {
    id,
    handle,
    name: text(data.name) || handle,
    bio: text(data.description ?? data.bio),
    followers: count.followers,
  };
}

function postFrom(value: Record<string, unknown>, fallbackAuthor: string | null): ParsedPost | null {
  const id = text(value.id ?? value.id_str);
  const body = text(value.text ?? value.full_text ?? value.fullText);
  if (!id || !body) return null;
  const authorRecord = record(value.author) ?? record(value.user);
  const author = text(authorRecord?.username ?? authorRecord?.userName ?? value.author_id ?? fallbackAuthor) || fallbackAuthor;
  const count = metrics(value);
  const reposted = record(value.retweeted_tweet) ?? record(value.retweetedTweet);
  const repostAuthor = text(record(reposted?.author)?.userName ?? record(reposted?.author)?.username).replace(/^@/, "").toLowerCase();
  return {
    id,
    text: body,
    createdAt: text(value.created_at ?? value.createdAt) || null,
    author: author ? author.replace(/^@/, "") : null,
    likes: count.likes,
    reposts: count.reposts,
    replies: count.replies,
    quotes: count.quotes,
    mentions: mentionsOf(value),
    repostOf: repostAuthor || null,
    followers: authorRecord ? metrics(authorRecord).followers || null : null,
  };
}

function tweetArray(json: unknown) {
  const root = record(json);
  if (!root) return [];
  if (Array.isArray(root.data)) return root.data;
  const data = record(root.data);
  if (data && Array.isArray(data.tweets)) return data.tweets;
  if (Array.isArray(root.tweets)) return root.tweets;
  return [];
}

export function parseXTweets(json: unknown, fallbackAuthor: string | null = null): ParsedPost[] {
  const posts: ParsedPost[] = [];
  for (const item of tweetArray(json)) {
    const row = record(item);
    if (!row) continue;
    const post = postFrom(row, fallbackAuthor);
    if (post) posts.push(post);
  }
  return posts;
}

export function parseXSearch(json: unknown): ParsedPost[] {
  const root = record(json);
  const users = new Map<string, { handle: string; followers: number }>();
  const included = record(root?.includes);
  for (const user of Array.isArray(included?.users) ? included.users : []) {
    const row = record(user);
    if (!row) continue;
    const handle = text(row.username ?? row.userName).replace(/^@/, "");
    if (!handle) continue;
    users.set(text(row.id), { handle, followers: metrics(row).followers });
  }
  const originals = new Map<string, string>();
  for (const tweet of Array.isArray(included?.tweets) ? included.tweets : []) {
    const row = record(tweet);
    if (!row) continue;
    const author = users.get(text(row.author_id))?.handle;
    if (author) originals.set(text(row.id), author);
  }
  const rawItems = tweetArray(json).map(record).filter((item): item is Record<string, unknown> => Boolean(item));
  return parseXTweets(json).map((post) => {
    const raw = rawItems.find((item) => text(item.id) === post.id);
    const known = post.author ? users.get(post.author) : undefined;
    const ref = (Array.isArray(raw?.referenced_tweets) ? raw.referenced_tweets : []).map(record).find((item) => item?.type === "retweeted");
    return {
      ...post,
      author: known?.handle || (post.author && !/^\d+$/.test(post.author) ? post.author : null),
      followers: post.followers ?? known?.followers ?? null,
      repostOf: post.repostOf || (ref ? originals.get(text(ref.id)) || null : null),
    };
  });
}
