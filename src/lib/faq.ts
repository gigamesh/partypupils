import { prisma } from "./db";
import { FAQ_DEFAULTS, FAQ_SETTING_KEY } from "./faq-defaults";
import { FaqContentSchema, type FaqContent, type FaqItem } from "./faq-schema";

/** Loads admin-editable FAQ content, falling back to defaults if the row is missing or malformed. */
export async function getFaqContent(): Promise<FaqContent> {
  const row = await prisma.siteSetting.findUnique({
    where: { key: FAQ_SETTING_KEY },
  });
  if (!row) return FAQ_DEFAULTS;

  try {
    const parsed = FaqContentSchema.safeParse(JSON.parse(row.value));
    if (parsed.success) {
      return {
        ...parsed.data,
        items: parsed.data.items.map(migrateLegacyItem),
      };
    }
    console.error("[faq] Stored FAQ content failed schema validation", parsed.error);
  } catch (err) {
    console.error("[faq] Stored FAQ content is not valid JSON", err);
  }
  return FAQ_DEFAULTS;
}

/**
 * Defensive on-read migration for items authored before the Tiptap switchover.
 * Two legacy shapes can appear in storage:
 *  1. Pure markdown (no HTML tags) — convert paragraphs + links to HTML.
 *  2. Tiptap-wrapped markdown — `<p>` wrappers from a Tiptap save but with
 *     literal `[text](url)` syntax untouched inside. Replace those inline.
 * The DB row is left untouched; the next admin save overwrites it as HTML.
 */
function migrateLegacyItem(item: FaqItem): FaqItem {
  if (looksLikeHtml(item.answer)) {
    if (!LINK_RE.test(item.answer)) return item;
    LINK_RE.lastIndex = 0; // .test() advances lastIndex on /g regex
    return {
      ...item,
      answer: item.answer.replace(LINK_RE, mdLinkToAnchor),
    };
  }
  return { ...item, answer: markdownToHtml(item.answer) };
}

function looksLikeHtml(s: string): boolean {
  return /<\w[^>]*>/.test(s);
}

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function mdLinkToAnchor(_full: string, text: string, url: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
}

function markdownToHtml(md: string): string {
  return md
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${renderInline(paragraph)}</p>`)
    .join("");
}

function renderInline(text: string): string {
  let out = "";
  let lastEnd = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const index = match.index ?? 0;
    out += escapeHtml(text.slice(lastEnd, index));
    out += mdLinkToAnchor(match[0], match[1], match[2]);
    lastEnd = index + match[0].length;
  }
  out += escapeHtml(text.slice(lastEnd));
  return out;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}
