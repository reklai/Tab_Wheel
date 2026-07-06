import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform } from "esbuild";

const ROOT = process.cwd();

async function loadSuggestionMergeModule() {
  const source = readFileSync(
    resolve(ROOT, "src/lib/core/search/suggestionMerge.ts"),
    "utf8",
  );

  const transformed = await transform(source, {
    loader: "ts",
    format: "esm",
    target: "es2022",
  });

  const encoded = Buffer.from(transformed.code, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

test("isOpenableSuggestionUrl accepts only http and https URLs", async () => {
  const { isOpenableSuggestionUrl } = await loadSuggestionMergeModule();

  assert.equal(isOpenableSuggestionUrl("http://example.com/"), true);
  assert.equal(isOpenableSuggestionUrl("https://example.com/page"), true);
  assert.equal(isOpenableSuggestionUrl("javascript:alert(1)"), false);
  assert.equal(isOpenableSuggestionUrl("data:text/html,x"), false);
  assert.equal(isOpenableSuggestionUrl("about:blank"), false);
  assert.equal(isOpenableSuggestionUrl("chrome://settings"), false);
  assert.equal(isOpenableSuggestionUrl("file:///etc/hosts"), false);
  assert.equal(isOpenableSuggestionUrl(undefined), false);
  assert.equal(isOpenableSuggestionUrl(42), false);
});

test("suggestionDedupeKey strips the fragment but keeps the query string", async () => {
  const { suggestionDedupeKey } = await loadSuggestionMergeModule();

  assert.equal(
    suggestionDedupeKey("https://example.com/page#section"),
    "https://example.com/page",
  );
  assert.equal(
    suggestionDedupeKey("https://example.com/page"),
    suggestionDedupeKey("https://example.com/page#other"),
  );
  assert.equal(
    suggestionDedupeKey("https://example.com/page?q=1#frag"),
    "https://example.com/page?q=1",
  );
});

test("mergeSuggestionCandidates keeps the first group's item for a shared URL", async () => {
  const { mergeSuggestionCandidates } = await loadSuggestionMergeModule();

  const tabItem = { source: "tab", url: "https://example.com/page" };
  const histItem = { source: "hist", url: "https://example.com/page#section" };
  const merged = mergeSuggestionCandidates([[tabItem], [histItem]]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "tab");
});

test("mergeSuggestionCandidates never drops items without a URL", async () => {
  const { mergeSuggestionCandidates } = await loadSuggestionMergeModule();

  const recentA = { source: "recent", primary: "cat pictures" };
  const recentB = { source: "recent", primary: "dog pictures" };
  const merged = mergeSuggestionCandidates([[recentA, recentB], [recentA]]);

  assert.equal(merged.length, 3);
});

test("mergeSuggestionCandidates collapses duplicates within one group and keeps order", async () => {
  const { mergeSuggestionCandidates } = await loadSuggestionMergeModule();

  const first = { source: "book", url: "https://a.example/" };
  const duplicate = { source: "book", url: "https://a.example/#top" };
  const second = { source: "book", url: "https://b.example/" };
  const merged = mergeSuggestionCandidates([[first, duplicate, second]]);

  assert.deepEqual(
    merged.map((item) => item.url),
    ["https://a.example/", "https://b.example/"],
  );
});
