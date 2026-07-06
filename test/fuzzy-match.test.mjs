import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform } from "esbuild";

const ROOT = process.cwd();

async function loadFuzzyMatchModule() {
  const source = readFileSync(
    resolve(ROOT, "src/lib/core/search/fuzzyMatch.ts"),
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

test("fuzzyScore matches a subsequence and reports matched positions", async () => {
  const { fuzzyScore } = await loadFuzzyMatchModule();

  const result = fuzzyScore("gh", "github");
  assert.equal(result.matched, true);
  assert.deepEqual(result.positions, [0, 3]);
});

test("fuzzyScore is case-insensitive", async () => {
  const { fuzzyScore } = await loadFuzzyMatchModule();

  assert.equal(fuzzyScore("GH", "github").matched, true);
  assert.deepEqual(fuzzyScore("GH", "github").positions, [0, 3]);
});

test("fuzzyScore returns no match when a character is missing", async () => {
  const { fuzzyScore } = await loadFuzzyMatchModule();

  const result = fuzzyScore("xyz", "abc");
  assert.equal(result.matched, false);
  assert.equal(result.score, 0);
  assert.deepEqual(result.positions, []);
});

test("fuzzyScore treats an empty query as a neutral match", async () => {
  const { fuzzyScore } = await loadFuzzyMatchModule();

  const result = fuzzyScore("", "anything");
  assert.equal(result.matched, true);
  assert.equal(result.score, 0);
  assert.deepEqual(result.positions, []);
});

test("fuzzyScore ranks contiguous prefixes above scattered matches", async () => {
  const { fuzzyScore } = await loadFuzzyMatchModule();

  const contiguous = fuzzyScore("abc", "abc").score;
  const scattered = fuzzyScore("abc", "axbxc").score;
  assert.ok(contiguous > scattered, `expected ${contiguous} > ${scattered}`);
});

test("fuzzyScore rewards word-boundary matches", async () => {
  const { fuzzyScore } = await loadFuzzyMatchModule();

  const boundary = fuzzyScore("gh", "git-hub").score;
  const inWord = fuzzyScore("gh", "github").score;
  assert.ok(boundary > inWord, `expected ${boundary} > ${inWord}`);
});
