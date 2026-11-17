export function properNounCandidates(text: string) {
  const found = new Set<string>();
  const patterns = [
    /\b[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]+){1,3}\b/g,
    /\b[A-Z][A-Za-z0-9]{1,24}\s+\d+(?:\.\d+){0,2}\b/g,
    /\b[A-Z]{2,}[a-z]+[A-Z][A-Za-z0-9]*\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].replace(/\s+/g, " ").trim();
      if (value.length >= 4 && value.length <= 40) found.add(value);
    }
  }
  return [...found].slice(0, 8);
}
