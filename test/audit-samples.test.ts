import assert from "node:assert/strict";
import test from "node:test";
import { industriesFromEvidence } from "../lib/industries.ts";
import { boilerplateTerm, freshSitemapUrls, hashtagTerms } from "../lib/collectors/registry-rules.ts";
import { judgeBirth } from "../lib/novelty.ts";

const now = Date.parse("2026-11-24T00:00:00Z");

test("audit names get industry from evidence text, not from the bare name", () => {
  const token = industriesFromEvidence([
    { kind: "product", title: "TokenEconomizer: Learning from Experience to Make AI Coding Agents Efficient", quote: "Make AI Coding Agents Efficient" },
    { kind: "hashtag", title: "ClaudeCode", quote: "#ClaudeAI #ClaudeCode #GitHubCopilot #CursorAI" },
  ]);
  assert.equal(token.includes("ai"), true);
  const bench = industriesFromEvidence([
    { kind: "product", title: "KradleBench: Multi-agent AI evals in Minecraft", quote: "" },
  ]);
  assert.equal(bench.includes("ai"), true);
  const suite = industriesFromEvidence([
    { kind: "product", title: "Show HN: A free creative suite, built in Rust, for AI collaboration", quote: "CadYam is a desktop design app" },
  ]);
  assert.equal(suite.includes("ai"), true);
});

test("TokenEconomizer stays observable: context counts, discussion does not prove birth", () => {
  const verdict = judgeBirth({
    term: "TokenEconomizer",
    industries: ["ai"],
    sightings: [
      { source: "reddit", industry: "ai", at: "2026-11-17T02:25:56.000Z", url: "https://www.reddit.com/r/artificial/comments/1xy8mj7/microsoft_tested_a_codingagent_memory_plugin_it/", author: "shoumikgoswami", title: "Microsoft tested a coding-agent memory plugin. It cost more at first, then paid for itself." },
      { source: "hn", industry: "ai", at: "2026-11-17T06:53:51Z", url: "https://www.microsoft.com/en-us/research/blog/tokeneconomizer-learning-from-experience-to-make-ai-coding-agents-more-efficient/", author: "matt_d", title: "TokenEconomizer: Learning from Experience to Make AI Coding Agents Efficient" },
      { source: "bluesky", industry: "ai", at: "2026-11-19T18:17:54.817556Z", url: "https://bsky.app/profile/githubopensource.bsky.social/post/3n2oomsj3mg2i", author: "githubopensource.bsky.social", title: "Cut your AI coding agent costs by thirty percent" },
    ],
    now,
    windowHours: 48,
  });
  assert.equal(verdict.status, "unverified");
  assert.equal(verdict.industry, "ai");
  assert.doesNotMatch(verdict.reason, /名称本身对不上/);
  assert.match(verdict.reason, /诞生|讨论/);
});

test("CadYam and KradleBench stay under observation on a single HN source", () => {
  const cad = judgeBirth({
    term: "CadYam",
    industries: ["ai"],
    sightings: [
      { source: "hn", industry: "ai", at: "2026-11-23T16:17:11Z", url: "https://codeyam.com/apps/cadyam", author: "nadis", title: "Show HN: A free creative suite, built in Rust, for AI collaboration" },
    ],
    ageEvidence: [{ kind: "domain_registered", at: "2026-11-20T16:59:43Z" }],
    now,
    windowHours: 48,
  });
  assert.equal(cad.status, "unverified");
  assert.notEqual(cad.status, "novel");
  const bench = judgeBirth({
    term: "KradleBench",
    industries: ["ai"],
    sightings: [
      { source: "hn", industry: "ai", at: "2026-11-18T17:46:24Z", url: "http://www.kradle.ai", author: "jamest", title: "KradleBench: Multi-agent AI evals in Minecraft" },
      { source: "hn", industry: "ai", at: "2026-11-18T19:14:28Z", url: "https://www.kradle.ai?1", author: "jamest", title: "Show HN: KradleBench – Multi-agent AI evals in Minecraft" },
    ],
    ageEvidence: [{ kind: "domain_registered", at: "2026-10-23T21:32:33Z" }],
    now,
    windowHours: 48,
  });
  assert.equal(bench.status, "unverified");
  assert.equal(bench.independent < 2, true);
});

test("hashtag dumps and policy pages are not terms, and lastmod does not mint urls", () => {
  const dump = "#ClaudeAI #ClaudeCode #AICoding #AITools #GitHubCopilot #CursorAI";
  assert.equal(hashtagTerms(dump).length >= 2, true);
  assert.equal(boilerplateTerm("OpenAI privacy policy"), true);
  assert.equal(boilerplateTerm("cookie policy"), true);
  const seen = new Set(["https://openai.com/policies/privacy-policy"]);
  const changed = freshSitemapUrls(seen, [{ url: "https://openai.com/policies/privacy-policy", lastmod: "2026-11-24T00:00:00Z" }], true);
  assert.deepEqual(changed, []);
  const added = freshSitemapUrls(seen, [{ url: "https://openai.com/index/new-tool", lastmod: null }], true);
  assert.deepEqual(added, ["https://openai.com/index/new-tool"]);
  assert.deepEqual(freshSitemapUrls(seen, [{ url: "https://openai.com/index/new-tool" }], false), []);
});
