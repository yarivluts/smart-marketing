/**
 * Ad Studio planning (KAN-230): turns a landing page's HTML into the few things a plan can build
 * on - its title, meta description, h1/h2 headings and main visible text. Pure string work with no
 * HTML parser dependency: the page is only read for its words, never rendered or executed, so a
 * tolerant regex pass is enough and malformed markup degrades to less text rather than an error.
 */

/** How much visible text a plan receives from one page. */
export const AD_STUDIO_LANDING_PAGE_MAX_TEXT_CHARS = 6000;
const MAX_HEADINGS = 20;
const MAX_HEADING_CHARS = 200;
const MAX_META_CHARS = 500;

export interface ExtractedLandingPage {
  title: string;
  description: string;
  headings: string[];
  text: string;
  /** True when the visible text was cut at the character cap. */
  truncated: boolean;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  copy: '(c)',
  reg: '(R)',
  trade: '(TM)',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Tags removed, entities decoded, whitespace collapsed. */
function toPlainText(html: string): string {
  return collapse(decodeEntities(html.replace(/<[^>]*>/g, ' ')));
}

function cap(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max).trimEnd()}...` : value;
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    result[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? '';
  }
  return result;
}

function metaDescription(html: string): string {
  let ogDescription = '';
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    const key = (attrs.name ?? attrs.property ?? '').toLowerCase();
    if (key === 'description' && attrs.content) return collapse(decodeEntities(attrs.content));
    if (key === 'og:description' && attrs.content && !ogDescription) ogDescription = collapse(decodeEntities(attrs.content));
  }
  return ogDescription;
}

/** Elements whose content is never the page's message: code, styling, embedded media, navigation chrome. */
const STRIPPED_ELEMENTS = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'footer'];

function stripElements(html: string, names: readonly string[]): string {
  let result = html;
  for (const name of names) {
    result = result.replace(new RegExp(`<${name}\\b[\\s\\S]*?<\\/${name}\\s*>`, 'gi'), ' ');
  }
  return result;
}

/** Cuts at the last word boundary before `max` so the text never ends mid-word. */
function capText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return { text: (lastSpace > max * 0.8 ? slice.slice(0, lastSpace) : slice).trimEnd(), truncated: true };
}

export function extractLandingPageContent(html: string, maxTextChars: number = AD_STUDIO_LANDING_PAGE_MAX_TEXT_CHARS): ExtractedLandingPage {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const titleMatch = withoutComments.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = cap(titleMatch ? toPlainText(titleMatch[1]) : '', MAX_HEADING_CHARS);
  const description = cap(metaDescription(withoutComments), MAX_META_CHARS);

  const bodyMatch = withoutComments.match(/<body\b[^>]*>([\s\S]*)<\/body\s*>/i) ?? withoutComments.match(/<body\b[^>]*>([\s\S]*)$/i);
  const body = stripElements(bodyMatch ? bodyMatch[1] : withoutComments.replace(/<head\b[\s\S]*?<\/head\s*>/gi, ' '), STRIPPED_ELEMENTS);

  const headings: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)) {
    const heading = cap(toPlainText(match[2]), MAX_HEADING_CHARS);
    const key = heading.toLowerCase();
    if (heading && !seen.has(key)) {
      seen.add(key);
      headings.push(heading);
    }
    if (headings.length >= MAX_HEADINGS) break;
  }

  // The page's own main region when it marks one, so sidebars and cookie banners stay out.
  const mainMatch = body.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i);
  const region = mainMatch && toPlainText(mainMatch[1]).length > 0 ? mainMatch[1] : body;
  const { text, truncated } = capText(toPlainText(region.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)\b[^>]*>/gi, ' ')), maxTextChars);
  return { title, description, headings, text, truncated };
}
