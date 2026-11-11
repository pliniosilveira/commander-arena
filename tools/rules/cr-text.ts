// Small pure helpers shared by the CR parser, the lookup functions and the CLIs.
// No I/O. TextDecoder is a global, not a file or network API.

import type { CrRuleKind } from './cr-types.ts';

const BOM = '﻿';

/**
 * Normalizes raw CR text for parsing: strips a leading byte order mark, turns CRLF and lone CR
 * into LF. Curly quotes and every other character are kept as they are.
 */
export function normalizeCrText(text: string): string {
  const withoutBom = text.startsWith(BOM) ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, '\n');
}

/**
 * The real CR uses U+2028 (LINE SEPARATOR) for a soft break inside one rule or glossary entry,
 * followed by non-breaking spaces. Returns the text with each such break as a plain newline and
 * the indentation after it removed. Line numbers stay those of the file, which only counts LF.
 */
export function softBreaksToNewlines(text: string): string {
  return text.replace(/\u2028[\t \u00a0]*/g, '\n');
}

export type CrEncoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export interface DecodedCr {
  readonly text: string;
  readonly encoding: CrEncoding;
}

/** Windows-1252 characters for bytes 0x80 to 0x9F (the other bytes decode like Latin-1). */
const WINDOWS_1252_C1: Readonly<Record<number, number>> = {
  128: 0x20ac,
  130: 0x201a,
  131: 0x0192,
  132: 0x201e,
  133: 0x2026,
  134: 0x2020,
  135: 0x2021,
  136: 0x02c6,
  137: 0x2030,
  138: 0x0160,
  139: 0x2039,
  140: 0x0152,
  142: 0x017d,
  145: 0x2018,
  146: 0x2019,
  147: 0x201c,
  148: 0x201d,
  149: 0x2022,
  150: 0x2013,
  151: 0x2014,
  152: 0x02dc,
  153: 0x2122,
  154: 0x0161,
  155: 0x203a,
  156: 0x0153,
  158: 0x017e,
  159: 0x0178,
};

/**
 * Decodes Windows-1252 by hand. Node's TextDecoder('windows-1252') behaves like ISO-8859-1 and
 * turns curly quotes (0x91 to 0x94) into invisible C1 control characters, so it cannot be used.
 * The five bytes Windows-1252 leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) decode to the C1
 * control with the same number, as the WHATWG Encoding Standard specifies.
 */
function decodeWindows1252(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const units: number[] = [];
  for (const byte of bytes) {
    units.push(WINDOWS_1252_C1[byte] ?? byte);
    if (units.length === 8192) {
      chunks.push(String.fromCharCode(...units));
      units.length = 0;
    }
  }
  chunks.push(String.fromCharCode(...units));
  return chunks.join('');
}

function decodeUtf16be(bytes: Uint8Array): string {
  const swapped = new Uint8Array(bytes.length - (bytes.length % 2));
  for (let i = 0; i < swapped.length; i += 2) {
    swapped[i] = bytes[i + 1] ?? 0;
    swapped[i + 1] = bytes[i] ?? 0;
  }
  return new TextDecoder('utf-16le').decode(swapped);
}

/**
 * Decodes the bytes of a CR download. A UTF-8 or UTF-16 byte order mark decides the encoding.
 * Without one, strict UTF-8 is tried first and Windows-1252 is the fallback, because the file has
 * been published in both forms (curly quotes arrive as 0x91 to 0x94 in Windows-1252).
 */
export function decodeCrBytes(bytes: Uint8Array): DecodedCr {
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) {
    const text = new TextDecoder('utf-8').decode(bytes.subarray(3));
    return { text, encoding: 'utf-8-bom' };
  }
  if (b0 === 0xff && b1 === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (b0 === 0xfe && b1 === 0xff) {
    return { text: decodeUtf16be(bytes.subarray(2)), encoding: 'utf-16be' };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text, encoding: 'utf-8' };
  } catch {
    return { text: decodeWindows1252(bytes), encoding: 'windows-1252' };
  }
}

const MONTHS: Readonly<Record<string, number>> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/**
 * Parses "September 25, 2026" into "2026-09-25". Returns null for any other shape or an
 * impossible calendar date. Pure calendar arithmetic, so the result never depends on a time zone.
 */
export function parseEffectiveDate(dateText: string): string | null {
  const m = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(dateText.trim());
  if (!m) return null;
  const month = MONTHS[(m[1] ?? '').toLowerCase()];
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month === undefined || day < 1) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (day > daysInMonth) return null;
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * Folds text for case-insensitive matching. Curly quotes become straight quotes, en and em
 * dashes become hyphens, no-break spaces become spaces. Every replacement is one character for
 * one character, so a match index in the folded text is valid in the original (except for the
 * few characters whose lower case has a different length, which the CR does not use).
 */
export function foldForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ');
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Shortens text to at most `max` characters, ending with an ellipsis when it was cut. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

const SECTION_RE = /^\d$/;
const SUBSECTION_RE = /^\d{3}$/;
const RULE_RE = /^\d{3}\.\d+$/;
const SUBRULE_RE = /^\d{3}\.\d+[a-z]{1,2}$/;

/** The kind a canonical number has, or null when it is not a CR number. */
export function kindOfNumber(number: string): CrRuleKind | null {
  if (SECTION_RE.test(number)) return 'section';
  if (SUBSECTION_RE.test(number)) return 'subsection';
  if (RULE_RE.test(number)) return 'rule';
  if (SUBRULE_RE.test(number)) return 'subrule';
  return null;
}

/** The structural parent of a canonical number: "702.19b" -> "702.19" -> "702" -> "7" -> null. */
export function parentNumber(number: string): string | null {
  switch (kindOfNumber(number)) {
    case 'subrule':
      return number.replace(/[a-z]+$/, '');
    case 'rule':
      return number.slice(0, 3);
    case 'subsection':
      return number.slice(0, 1);
    default:
      return null;
  }
}

/**
 * Turns what a person types into a canonical rule number, or null when it is not one.
 * Accepts "702.19b", "702.19B", " 702.19. ", "rule 702.19", "CR 702" and "7".
 */
export function normalizeRuleNumber(input: string): string | null {
  const m = /^(?:(?:rules?|cr)\s+)?(\d{1,3})(?:\.(\d+)([a-z]{0,2}))?\.?$/i.exec(input.trim());
  if (!m) return null;
  const head = m[1] ?? '';
  if (m[2] === undefined) return head.length === 1 || head.length === 3 ? head : null;
  if (head.length !== 3) return null;
  return `${head}.${m[2]}${(m[3] ?? '').toLowerCase()}`;
}
