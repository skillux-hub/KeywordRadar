import assert from "node:assert/strict";
import test from "node:test";
import { isEstablishedName, judgeNovelty } from "../lib/novelty.ts";

const now = Date.parse("2026-11-19T00:00:00Z");
const recent = "2026-11-01T00:00:00Z";
const old = "2018-03-01T00:00:00Z";

test("windows 10 and teamviewer variants are established names", () => {
  for (const name of ["Windows 10", "windows 10", "WINDOWS 10", "windows10", "Windows-10", "TeamViewer", "teamviewer", "team viewer", "Team-Viewer"]) {
    assert.equal(isEstablishedName(name), true, name);
    assert.equal(judgeNovelty(name, [], now).status, "established");
  }
});

test("reheating and a fresh local sighting do not make an old product novel", () => {
  const verdict = judgeNovelty("Windows 10", [{ kind: "product_launch", at: recent }, { kind: "repo_created", at: recent }], now);
  assert.equal(verdict.status, "established");
  assert.match(verdict.reason, /长期产品/);
});

test("a young repo or domain is only auxiliary and does not admit the name", () => {
  assert.equal(judgeNovelty("HyperFrames", [{ kind: "repo_created", at: recent }], now).status, "unverified");
  assert.equal(judgeNovelty("PigeonRelay", [{ kind: "product_launch", at: recent }], now).status, "unverified");
  assert.match(judgeNovelty("HyperFrames", [{ kind: "domain_registered", at: recent }], now).reason, /不能单独放行/);
});

test("an old repo or domain keeps the name out of recommendations", () => {
  const repo = judgeNovelty("HyperFrames", [{ kind: "repo_created", at: old }], now);
  const domain = judgeNovelty("PigeonRelay", [{ kind: "domain_registered", at: old }], now);
  assert.equal(repo.status, "unverified");
  assert.equal(domain.status, "unverified");
  assert.match(repo.reason, /早于/);
  assert.match(domain.reason, /早于/);
  assert.equal("blocksNovel" in repo && repo.blocksNovel, true);
});

test("a chinese sentence that mentions typescript is not the typescript entity", () => {
  const phrase = "從交易紀錄計算已實現與未實現損益 typescript 實作";
  assert.equal(isEstablishedName(phrase), false);
  assert.equal(judgeNovelty(phrase, [], now).status, "unverified");
  assert.equal(isEstablishedName("TypeScript"), true);
  assert.equal(isEstablishedName("typescript 5.5"), true);
});
test("missing age evidence stays unverified without paid keys", () => {
  const previousOpenAi = process.env.OPENAI_API_KEY;
  const previousSeo = process.env.DATAFORSEO_LOGIN;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DATAFORSEO_LOGIN;
  const verdict = judgeNovelty("HyperFrames", [], now);
  assert.equal(verdict.status, "unverified");
  assert.match(verdict.reason, /不能单独证明/);
  if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAi;
  if (previousSeo === undefined) delete process.env.DATAFORSEO_LOGIN;
  else process.env.DATAFORSEO_LOGIN = previousSeo;
});
