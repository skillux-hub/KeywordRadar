import assert from "node:assert/strict";
import test from "node:test";
import { pageWindow, parsePage, parseSize, slicePage } from "../lib/pagination.ts";

test("page window keeps the ends and ellipsizes the middle", () => {
  assert.deepEqual(pageWindow(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(5, 10), [1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  assert.deepEqual(pageWindow(10, 10), [1, "ellipsis", 9, 10]);
});

test("page and size fall back when the query is invalid", () => {
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("3"), 3);
  assert.equal(parseSize("15"), 20);
  assert.equal(parseSize("50"), 50);
  assert.equal(parseSize(null, 10, [10, 20, 50]), 10);
});

test("slicePage does not walk past the last page", () => {
  const page = slicePage(["a", "b", "c"], 9, 2);
  assert.equal(page.page, 2);
  assert.deepEqual(page.items, ["c"]);
  assert.equal(page.total, 3);
});
