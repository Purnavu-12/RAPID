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

// Read the project specification markdown at build time.
const docsPath = join(process.cwd(), "docs", "RAPID.md");
const rawMarkdown = readFileSync(docsPath, "utf8");

/**
 * Convert the RAPID spec markdown into theme-aware HTML.
 * - remark-rehype → mdast → hast (the missing bridge)
 * - rehype-slug   → stable header ids (anchor targets for the TOC)
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
 * Derive a hierarchical TOC from the raw markdown headings.
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
    // Track fenced code blocks so a `## heading` inside a code sample is
    // not mistaken for a real document heading.
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

export async function getDocsContent() {
  return {
    html: await markdownToHtml(rawMarkdown),
    toc: buildToc(rawMarkdown),
  };
}
