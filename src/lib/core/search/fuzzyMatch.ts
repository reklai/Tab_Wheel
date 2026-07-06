// Pure fuzzy matcher for the search palette. Zero imports so the single-file
// unit-test harness (see test/fuzzy-match.test.mjs) can transform and load it
// in isolation, exactly like the other core modules under core/tabWheel.
//
// fuzzyScore matches every character of `query` against `text` in order
// (subsequence match, case-insensitive) and rewards matches that a human reads
// as "close": contiguous runs, the start of the text, and characters that begin
// a word (after a separator) or a camelCase hump. It returns the indices it
// matched so the UI can highlight those characters.

export interface FuzzyMatch {
  matched: boolean;
  score: number;
  positions: number[];
}

const CONTIGUOUS_BONUS = 8;
const BOUNDARY_BONUS = 6;
const CAMEL_BONUS = 5;
const IN_WORD_SCORE = 1;
const LEADING_PENALTY = 0.2;
const GAP_PENALTY = 0.5;
const MAX_GAP_PENALTY = 3;
const EXACT_BONUS = 12;

function isSeparator(character: string): boolean {
  return character === " "
    || character === "-"
    || character === "_"
    || character === "/"
    || character === "."
    || character === ":";
}

function isCamelBoundary(original: string, index: number): boolean {
  if (index <= 0) return false;
  const current = original[index];
  const previous = original[index - 1];
  return current >= "A" && current <= "Z" && previous >= "a" && previous <= "z";
}

export function fuzzyScore(query: string, text: string): FuzzyMatch {
  const original = typeof text === "string" ? text : "";
  const trimmedQuery = typeof query === "string" ? query.trim() : "";
  if (trimmedQuery.length === 0) {
    return { matched: true, score: 0, positions: [] };
  }
  if (original.length === 0) {
    return { matched: false, score: 0, positions: [] };
  }

  const lowerQuery = trimmedQuery.toLowerCase();
  const lowerText = original.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let previousIndex = -2;
  let searchFrom = 0;

  for (let queryIndex = 0; queryIndex < lowerQuery.length; queryIndex += 1) {
    const queryChar = lowerQuery[queryIndex];
    const matchIndex = lowerText.indexOf(queryChar, searchFrom);
    if (matchIndex === -1) {
      return { matched: false, score: 0, positions: [] };
    }

    if (matchIndex === previousIndex + 1) {
      score += CONTIGUOUS_BONUS;
    } else {
      const gap = matchIndex - previousIndex - 1;
      score -= Math.min(gap, MAX_GAP_PENALTY) * GAP_PENALTY;
    }

    if (matchIndex === 0 || isSeparator(original[matchIndex - 1])) {
      score += BOUNDARY_BONUS;
    } else if (isCamelBoundary(original, matchIndex)) {
      score += CAMEL_BONUS;
    } else {
      score += IN_WORD_SCORE;
    }

    if (queryIndex === 0) {
      score -= matchIndex * LEADING_PENALTY;
    }

    positions.push(matchIndex);
    previousIndex = matchIndex;
    searchFrom = matchIndex + 1;
  }

  if (lowerText === lowerQuery) {
    score += EXACT_BONUS;
  }

  return { matched: true, score, positions };
}
