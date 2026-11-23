import assert from "node:assert/strict";
import test from "node:test";
import { isEstablishedName, judgeBirth, knownProjectByUrl, reviewLane } from "../lib/novelty.ts";

const now = Date.parse("2026-11-24T00:00:00Z");

test("mysql and stack overflow are baseline platforms, not pending candidates", () => {
  assert.equal(isEstablishedName("MySQL"), true);
  assert.equal(isEstablishedName("StackOverflow"), true);
  assert.equal(isEstablishedName("Stack Overflow"), true);
  assert.equal(isEstablishedName("OpenStreetMap"), true);
  assert.equal(isEstablishedName("ClickUp"), true);
  assert.equal(isEstablishedName("LinkedIn"), true);
  assert.equal(isEstablishedName("ElastiCache"), true);
  assert.equal(isEstablishedName("WebSockets"), true);
  const mention = reviewLane("MySQL", [
    { kind: "product", title: "NTP Pool Migrated from MySQL to Postgres", url: "https://news.ntppool.org/2026/09/postgres-migration/" },
    { kind: "product", title: "How to access MySQL through SSH tunnel and Python script", url: "https://stackoverflow.com/questions/80018091/how-to-access-mysql-through-ssh-tunnel-and-python-script" },
  ]);
  assert.equal(mention.lane, "raw");
});

test("opencode and openclaw mentions stay raw unless the canonical repo url is present", () => {
  assert.equal(isEstablishedName("OpenCode"), false);
  assert.equal(isEstablishedName("OpenClaw"), false);
  const opencode = reviewLane("OpenCode", [
    { kind: "product", title: "Show HN: Git Hook for Model Identifation", url: "https://github.com/orsenthil/git-hook-model-identification" },
    { kind: "product", title: "TEVSEC Gate Launches Local Runtime Protection for Claude Code, OpenAI Codex, and OpenCode", url: "https://bsky.app/profile/undercode.bsky.social/post/3n2rdcd3b772v" },
    { kind: "product", title: "AI assistant and MCP server for Blender. Works with OpenCode.", url: "https://github.com/bookwjitchieni1986/blender-ai-mcp-addon" },
  ]);
  assert.equal(opencode.lane, "raw");
  assert.match(opencode.reason, /不是已知旧词/);
  assert.equal(knownProjectByUrl("OpenCode", ["https://github.com/bookwjitchieni1986/blender-ai-mcp-addon"]), null);
  const bound = knownProjectByUrl("OpenCode", ["https://github.com/anomalyco/opencode"]);
  assert.equal(bound?.label, "OpenCode");
  const claw = reviewLane("OpenClaw", [
    { kind: "product", title: "OpenClaw: Build AI Agents, Skills & Automation", url: "https://bsky.app/profile/udemyfreecourse.bsky.social/post/3n2sbk5x5sq24" },
    { kind: "product", title: "Best Personal AI Agents in 2026: OpenClaw, Hermes Agent, Gemini Spark and More", url: "https://news.google.com/rss/articles/example" },
  ]);
  assert.equal(claw.lane, "raw");
  assert.equal(reviewLane("codescope-ai", [
    { kind: "entity", title: "codescope-ai", url: "https://pypi.org/project/codescope-ai/" },
  ], now).lane, "raw");
  assert.equal(reviewLane("codescope-ai", [
    { kind: "entity", title: "codescope-ai", quote: "Understand a Python codebase: docs linked to the source, cited answers and change review.", url: "https://pypi.org/project/codescope-ai/", publishedAt: "Mon, 23 Nov 2026 19:37:37 GMT", collectedAt: "2026-11-23T19:44:08.407Z" },
    { url: "https://pypi.org/project/codescope-ai/", eventKind: "product_launch", eventAt: "Mon, 23 Nov 2026 19:37:37 GMT" },
  ], now).lane, "candidate");
  assert.equal(reviewLane("Health Privacy Notice", [
    { kind: "product", title: "Health Privacy Notice", url: "https://openai.com/policies/privacy" },
  ]).lane, "raw");
});

test("show hn does not enter review until the bound repo has its own created time", () => {
  const rows = [
    { kind: "product", title: "Show HN: Verfy – checks an AI coding agent's tool calls before they run", url: "https://github.com/verfy-dev/verfy", publishedAt: "2026-11-23T16:49:26Z", collectedAt: "2026-11-23T19:29:16.796Z" },
  ];
  assert.equal(reviewLane("Verfy", rows, now).lane, "raw");
  assert.match(reviewLane("Verfy", rows, now).reason, /待补证据/);
  const created = [...rows, { url: "https://github.com/verfy-dev/verfy", eventKind: "repo_created" as const, eventAt: "2026-11-22T08:00:00Z" }];
  assert.equal(reviewLane("Verfy", created, now).lane, "candidate");
  assert.match(reviewLane("Verfy", created, now).reason, /不是推荐/);
  const verdict = judgeBirth({
    term: "Verfy",
    industries: ["ai"],
    sightings: [{ source: "hn", industry: "ai", at: "2026-11-23T16:49:26.000Z", url: rows[0].url, author: "javohr_verfy", title: rows[0].title }],
    ageEvidence: [{ kind: "repo_created", at: "2026-11-22T08:00:00Z", url: rows[0].url }],
    now,
    windowHours: 48,
  });
  assert.equal(verdict.status, "unverified");
});

test("hashtag and comparison phrases stay out of the candidate lane", () => {
  assert.equal(reviewLane("StackOverflow", [
    { kind: "hashtag", title: "#AI #Agents #DevTools #StackOverflow #Codex", url: "https://bsky.app/profile/example/post/1" },
  ]).lane, "raw");
  assert.equal(reviewLane("Subscription vs Claude Code", [
    { kind: "product", title: "Cursor’s X Subscription vs. Claude Code", url: "https://bsky.app/profile/example/post/2" },
  ]).lane, "raw");
});
