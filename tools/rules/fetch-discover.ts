// Finds links to the Comprehensive Rules download in the HTML of the Wizards rules page.
// Pure: HTML text in, candidates out. Nothing here hardcodes a dated URL or a page structure:
// every link to a .txt, .pdf, .doc or .docx file is collected, scored with simple heuristics, and
// the caller prints all of them.

export type DocFormat = 'txt' | 'pdf' | 'doc' | 'docx';

export interface LinkCandidate {
  /** Absolute URL, fragment removed. */
  readonly url: string;
  readonly format: DocFormat;
  /** Last path segment, percent-decoded: "MagicCompRules 20260925.txt". */
  readonly fileName: string;
  /** Text of the anchor that carried the link, tags stripped. Empty when none was found. */
  readonly linkText: string;
  /** Heuristic score. Non-text formats score below zero and are never chosen. */
  readonly score: number;
  readonly reasons: readonly string[];
}

/** A link needs at least this much evidence (a Comprehensive Rules file name or link text). */
export const MIN_CONFIDENT_SCORE = 50;

const ANCHOR = /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
const QUOTED_FILE_URL = /["']([^"'<>\r\n]*?\.(?:txt|pdf|docx?)(?:[?#][^"'<>\r\n]*)?)["']/gi;

function cleanUrlText(raw: string): string {
  return raw
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&#x0*26;/gi, '&')
    .trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatOf(pathname: string): DocFormat | null {
  const m = /\.(txt|pdf|docx?)$/i.exec(pathname);
  return m ? (m[1]?.toLowerCase() as DocFormat) : null;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Last path segment of a URL, percent-decoded. */
export function fileNameOfUrl(url: string): string {
  try {
    const segments = new URL(url).pathname.split('/');
    return decodeSegment(segments[segments.length - 1] ?? '');
  } catch {
    return '';
  }
}

interface RawLink {
  readonly url: string;
  readonly format: DocFormat;
  linkText: string;
}

function resolveLink(raw: string, pageUrl: string): { url: string; format: DocFormat } | null {
  let parsed: URL;
  try {
    parsed = new URL(cleanUrlText(raw), pageUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const format = formatOf(parsed.pathname);
  if (format === null) return null;
  parsed.hash = '';
  return { url: parsed.href, format };
}

function score(link: RawLink): { score: number; reasons: string[] } {
  if (link.format !== 'txt') return { score: -1000, reasons: [`not plain text (.${link.format})`] };
  const reasons: string[] = [];
  let total = 0;
  const name = fileNameOfUrl(link.url).replace(/[_%\s-]+/g, ' ');
  if (/comp/i.test(name) && /rules/i.test(name)) {
    total += 50;
    reasons.push('file name looks like Comprehensive Rules (+50)');
  }
  if (/comprehensive/i.test(link.linkText) && /rules/i.test(link.linkText)) {
    total += 50;
    reasons.push('link text says Comprehensive Rules (+50)');
  }
  if (new URL(link.url).host === 'media.wizards.com') {
    total += 20;
    reasons.push('host is media.wizards.com (+20)');
  }
  if (/\btxt\b|plain text|\btext\b/i.test(link.linkText)) {
    total += 10;
    reasons.push('link text mentions text (+10)');
  }
  if (
    /change|bulletin|summary|history|appendix|tournament|infraction|\bmtr\b|\bipg\b/i.test(name)
  ) {
    total -= 60;
    reasons.push('file name looks like a companion document (-60)');
  }
  return { score: total, reasons };
}

/**
 * Collects every link to a .txt, .pdf, .doc or .docx file: anchors first (so the link text is
 * known), then any other quoted URL in the page (JSON blobs, data attributes). Deduplicated by
 * URL, in order of first appearance, with scores filled in.
 */
export function extractCandidates(html: string, pageUrl: string): LinkCandidate[] {
  const found = new Map<string, RawLink>();
  const add = (raw: string, linkText: string) => {
    const resolved = resolveLink(raw, pageUrl);
    if (!resolved) return;
    const existing = found.get(resolved.url);
    if (existing) {
      if (existing.linkText === '') existing.linkText = linkText;
    } else {
      found.set(resolved.url, { ...resolved, linkText });
    }
  };
  for (const m of html.matchAll(ANCHOR)) add(m[2] ?? '', stripTags(m[3] ?? ''));
  for (const m of html.matchAll(QUOTED_FILE_URL)) add(m[1] ?? '', '');

  return [...found.values()].map((link) => {
    const scored = score(link);
    return {
      url: link.url,
      format: link.format,
      fileName: fileNameOfUrl(link.url),
      linkText: link.linkText,
      score: scored.score,
      reasons: scored.reasons,
    };
  });
}

export type Choice =
  | { readonly kind: 'chosen'; readonly candidate: LinkCandidate; readonly why: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly LinkCandidate[] };

/** The first YYYYMMDD date in a file name as a number, 0 if none ("MagicCompRules 20260925.txt"). */
function dateKey(fileName: string): number {
  const m = /(?<!\d)(\d{4})[-_ ]?(\d{2})[-_ ]?(\d{2})(?!\d)/.exec(fileName);
  return m ? Number(`${m[1]}${m[2]}${m[3]}`) : 0;
}

/**
 * Picks the link to download. Only plain text links with enough evidence qualify. If several
 * qualify, the best score wins; equal scores are broken by the later date in the file name; if
 * that still ties, the choice is ambiguous and the caller must ask for an explicit --url.
 */
export function chooseCandidate(candidates: readonly LinkCandidate[]): Choice {
  const eligible = candidates
    .filter((c) => c.format === 'txt' && c.score >= MIN_CONFIDENT_SCORE)
    .sort((a, b) => b.score - a.score || dateKey(b.fileName) - dateKey(a.fileName));
  const [best, second] = eligible;
  if (!best) return { kind: 'none' };
  if (!second) return { kind: 'chosen', candidate: best, why: 'only plain text candidate' };
  if (best.score > second.score) {
    return { kind: 'chosen', candidate: best, why: 'highest score' };
  }
  if (dateKey(best.fileName) > dateKey(second.fileName)) {
    return { kind: 'chosen', candidate: best, why: 'equal score, later date in file name' };
  }
  return { kind: 'ambiguous', candidates: eligible.filter((c) => c.score === best.score) };
}
