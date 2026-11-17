import assert from "node:assert/strict";
import test from "node:test";
import {
  accountScore,
  classifyDiscussion,
  communityScore,
  extractXHandles,
  heatScore,
  parseSubredditInput,
  parseXInput,
  redditSpreadBoost,
  rebalanceSources,
  relevanceScore,
  shouldRetire,
} from "../lib/sources/metrics.ts";
import { parseXSearch, parseXTweets, parseXUser } from "../lib/sources/x-parse.ts";

test("relevance uses seed overlap and ignores unrelated text", () => {
  assert.ok(relevanceScore("a new ai image detector for generated photos", ["ai image detector"]) > 0.5);
  assert.equal(relevanceScore("weekend football scores", ["technical seo"]), 0);
});

test("heat rises when the recent week beats the prior week", () => {
  const flat = heatScore({ audience: 10000, perDay: 2, avgEngagement: 40, trend: 1 });
  const up = heatScore({ audience: 10000, perDay: 2, avgEngagement: 40, trend: 1.4 });
  assert.ok(up > flat);
  assert.ok(up <= 100);
});

test("discussion types catch tool requests, complaints, and comparisons", () => {
  assert.equal(classifyDiscussion("is there a tool that detects ai images?"), "ask");
  assert.equal(classifyDiscussion("looking for an app to watch price changes"), "ask");
  assert.equal(classifyDiscussion("this workflow is frustrating and sucks"), "pain");
  assert.equal(classifyDiscussion("Notion vs Obsidian for research"), "compare");
  assert.equal(classifyDiscussion("I recommend this reader"), "recommend");
});

test("rebalance keeps pinned accounts and retires the rest outside the cap", () => {
  const result = rebalanceSources(
    [
      { key: "keep", score: 10, origin: "user", status: "active", pinned: true, reason: "" },
      { key: "old", score: 20, origin: "discovered", status: "active", pinned: false, reason: "" },
    ],
    [{ key: "new", score: 80, origin: "discovered", status: "active", pinned: false, reason: "搜索出现" }],
    2,
  );
  assert.deepEqual(result.add.map((item) => item.key), ["new"]);
  assert.deepEqual(result.retire.map((item) => item.key), ["old"]);
});

test("rejected handles are not added again", () => {
  const result = rebalanceSources([], [{ key: "gone", score: 90, origin: "discovered", status: "active", pinned: false, reason: "" }], 5, ["gone"]);
  assert.equal(result.add.length, 0);
});

test("inactive communities retire only after we have evidence", () => {
  const now = Date.parse("2026-11-17T00:00:00Z");
  assert.equal(shouldRetire({ pinned: false, postsPerDay: null, relevance: null, lastPostAt: null, now }).retire, false);
  assert.equal(
    shouldRetire({ pinned: false, postsPerDay: 0, relevance: 0.01, lastPostAt: "2026-10-01T00:00:00Z", now }).retire,
    true,
  );
  assert.equal(shouldRetire({ pinned: true, postsPerDay: 0, relevance: 0, lastPostAt: "2026-10-01T00:00:00Z", now }).retire, false);
});

test("handles and subreddits parse from urls and bulk text", () => {
  assert.deepEqual(parseXInput("@Sama https://x.com/karpathy/status/1"), ["sama", "karpathy"]);
  assert.deepEqual(parseSubredditInput("r/SEO\nhttps://www.reddit.com/r/MachineLearning/hot"), ["SEO", "MachineLearning"]);
  assert.ok(extractXHandles("see https://twitter.com/ylecun and @sama").includes("ylecun"));
});

test("cross-subreddit spread boosts a term that is still spreading", () => {
  const now = Date.parse("2026-11-17T00:00:00Z");
  const boost = redditSpreadBoost(
    [
      { channel: "SEO", at: "2026-11-16T00:00:00Z" },
      { channel: "bigseo", at: "2026-11-15T00:00:00Z" },
      { channel: "SEO", at: "2026-11-01T00:00:00Z" },
    ],
    now,
  );
  assert.ok(boost >= 10);
});

test("official and third-party x payloads both parse", () => {
  const user = parseXUser({ data: { id: "1", username: "sama", name: "Sam", description: "ai", public_metrics: { followers_count: 1000 } } });
  assert.equal(user?.followers, 1000);
  const generic = parseXTweets({ tweets: [{ id: "9", text: "hello @gdb", likeCount: 3, entities: { user_mentions: [{ screen_name: "gdb" }] }, author: { userName: "sama", followers: 10 }, retweeted_tweet: { author: { userName: "karpathy" } } }] }, "sama");
  assert.equal(generic[0]?.repostOf, "karpathy");
  assert.ok(generic[0]?.mentions.includes("gdb"));
  const search = parseXSearch({
    data: [{ id: "2", text: "hi", author_id: "5", public_metrics: { like_count: 4 }, referenced_tweets: [{ type: "retweeted", id: "8" }] }],
    includes: { users: [{ id: "5", username: "sama", public_metrics: { followers_count: 20 } }, { id: "6", username: "gdb" }], tweets: [{ id: "8", author_id: "6" }] },
  });
  assert.equal(search[0]?.author, "sama");
  assert.equal(search[0]?.repostOf, "gdb");
  assert.ok(accountScore({ followers: 1000, postsPerDay: 2, engagementRate: 0.02, relevance: 0.8, mentions: null }) > communityScore({ subscribers: 10, postsPerDay: 0, relevance: 0, growth: null }));
});
