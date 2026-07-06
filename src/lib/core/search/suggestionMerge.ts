// Keep this import-free so the unit harness can load it like the other pure
// core modules. Bookmarks can contain unsafe schemes, so URL validation belongs
// here before suggestions become openable actions.

export function isOpenableSuggestionUrl(url: unknown): url is string {
  return typeof url === "string"
    && (url.startsWith("http://") || url.startsWith("https://"));
}

export function suggestionDedupeKey(url: string): string {
  const hashIndex = url.indexOf("#");
  return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

export function mergeSuggestionCandidates<T extends { url?: string }>(
  groups: ReadonlyArray<ReadonlyArray<T>>,
): T[] {
  const seenKeys = new Set<string>();
  const merged: T[] = [];
  for (const group of groups) {
    for (const candidate of group) {
      if (typeof candidate.url === "string" && candidate.url.length > 0) {
        const key = suggestionDedupeKey(candidate.url);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
      }
      merged.push(candidate);
    }
  }
  return merged;
}
