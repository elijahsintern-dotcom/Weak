/**
 * Bundled science notes, keyed by exercise id. Each note is Markdown with these sections:
 * Muscles trained · Resistance profile · Technique cues · Common errors · Variants compared ·
 * Programming · Evidence (author/year + DOI, one-line finding, strength of evidence).
 *
 * Bump `version` when a note changes, so the app can tell you the bundled note was updated
 * if you have edited your own copy.
 */
export interface BundledNote {
  version: number;
  markdown: string;
}

const modules = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function parse(raw: string): BundledNote {
  const m = raw.match(/^---\nversion:\s*(\d+)\n---\n/);
  return m ? { version: Number(m[1]), markdown: raw.slice(m[0].length) } : { version: 1, markdown: raw };
}

export const BUNDLED_NOTES: Record<string, BundledNote> = Object.fromEntries(
  Object.entries(modules).map(([path, raw]) => [path.replace(/^\.\//, '').replace(/\.md$/, ''), parse(raw)]),
);
