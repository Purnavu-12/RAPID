import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypePrism from "rehype-prism-plus";
import GitHubSlugger from "github-slugger";

export interface TocItem {
  level: number;
  text: string;
  id: string;
  children: TocItem[];
}

/** One chapter of the specification, as surfaced to the UI. */
export interface DocSection {
  slug: string;
  title: string;
  number: number | null;
  description: string;
  /** Raw markdown for this chapter (heading line excluded). */
  content: string;
  /** Rendered HTML, computed lazily. */
  html?: string;
  prevSlug: string | null;
  nextSlug: string | null;
}

/** Lightweight projection used for the index. */
export interface DocSectionMeta {
  slug: string;
  title: string;
  number: number | null;
  description: string;
}

// Read the project specification markdown at build time.
const docsPath = join(process.cwd(), "docs", "RAPID.md");
const rawMarkdown = readFileSync(docsPath, "utf8");

/**
 * Convert a markdown slice into theme-aware HTML.
 * - remark-rehype → mdast → hast (the mdast->hast bridge)
 * - rehype-slug   → stable header ids (anchor targets for TOC / deep links)
 * - rehype-prism  → syntax-highlighted code blocks (class-based tokens)
 * `allowDangerousHtml` lets any raw HTML in the trusted project spec through.
 */
export async function markdownToHtml(md: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypePrism, { showLineNumbers: false })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(md);
  return String(file);
}

/**
 * Derive a hierarchical TOC from a markdown slice's headings.
 * Uses a fresh github-slugger instance so ids match rehype-slug exactly.
 * Ignores `##`-style lines that appear inside fenced code blocks.
 */
export function buildToc(md: string): TocItem[] {
  const slugger = new GitHubSlugger();
  const root: TocItem[] = [];
  const stack: TocItem[] = [];

  const lines = md.split("\n");
  let inCode = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    const match = /^(#{2,6})\s+(.*)$/.exec(line);
    if (!match) continue;

    const level = match[1].length;
    const text = match[2]
      .replace(/^(```\w*\s*)?/, "")
      .replace(/[`*_~]/g, "")
      .replace(/\{[^}]*\}/, "")
      .trim()
      .replace(/\s{2,}$/g, "");
    const id = slugger.slug(text);

    const item: TocItem = { level, text, id, children: [] };

    while (stack.length && stack[0].level >= level) stack.shift();
    if (stack.length === 0) {
      root.push(item);
      stack.push(item);
      continue;
    }
    stack[0].children.push(item);
    stack.unshift(item);
  }

  return root;
}

/**
 * A heading is a chapter boundary iff it is a level-1 numbered section,
 * e.g. `# 10.1 Risk Event Contract` (level-1 `#` with `N.N.` prefix).
 */
const chapterRe = /^(#{1})\s+(\d+(?:\.\d+)*)\.\s+(.*)$/;

function slugifyHeading(text: string): string {
  return new GitHubSlugger().slug(text);
}

/** First paragraph of a markdown slice, trimmed + truncated for cards. */
function firstDescription(lines: string[]): string {
  let inCode = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    if (inCode) continue;
    const trimmed = line.trim();
    if (!trimmed || /^(#{1,6}|-|\*|\||>)\s/.test(trimmed)) continue;
    const text = trimmed.replace(/[`*_~]/g, "");
    return text.length > 160
      ? text.slice(0, 160).replace(/\s+\S*$/, "") + "…"
      : text;
  }
  return "";
}

// Module-level cache so the (large) spec is parsed once per build worker,
// even though generateStaticParams / generateMetadata / page all need it.
let cachedSections: DocSection[] | null = null;

export function getDocSections(): DocSection[] {
  if (cachedSections) return cachedSections;

  const lines = rawMarkdown.split("\n");
  const sections: DocSection[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  // Skip the document title + intro preamble (everything before the first
  // numbered chapter) — that chrome lives on the docs index page.
  let idx = 0;
  while (idx < lines.length) {
    if (chapterRe.test(lines[idx])) break;
    idx++;
  }

  for (let i = idx; i < lines.length; i++) {
    const line = lines[i];
    const m = chapterRe.exec(line);
    if (m) {
      if (current) {
        pushSection(sections, current.heading, current.lines);
      }
      current = { heading: line, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    pushSection(sections, current.heading, current.lines);
  }

  // Wire prev / next navigation.
  sections.forEach((s, i) => {
    s.prevSlug = i > 0 ? sections[i - 1].slug : null;
    s.nextSlug = i < sections.length - 1 ? sections[i + 1].slug : null;
  });

  cachedSections = sections;
  return sections;
}

function pushSection(
  sections: DocSection[],
  headingLine: string,
  bodyLines: string[]
) {
  const m = chapterRe.exec(headingLine)!;
  const number = parseInt(m[2].split(".")[0], 10);
  const title = `${m[2]}. ${m[3]}`;
  // Include the section number in the slug (e.g. "1-executive-summary")
  // so URLs are self-describing and collision-free.
  const slug = slugifyHeading(title);
  const description = firstDescription(bodyLines);
  sections.push({
    slug,
    title,
    number: Number.isNaN(number) ? null : number,
    description,
    content: bodyLines.join("\n"),
    html: undefined,
    prevSlug: null,
    nextSlug: null,
  });
}

/** Lightweight meta for the index page and static path generation. */
export function getDocSectionMetas(): DocSectionMeta[] {
  return getDocSections().map(({ slug, title, number, description }) => ({
    slug,
    title,
    number,
    description,
  }));
}

/** Full section (with rendered HTML). Mutates the cached object so
 * generateMetadata and the page render share one HTML pass. */
export async function getDocSection(slug: string): Promise<DocSection | null> {
  const section = getDocSections().find((s) => s.slug === slug);
  if (!section) return null;
  if (!section.html) {
    section.html = await markdownToHtml(section.content);
  }
  return section;
}
