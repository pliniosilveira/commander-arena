/**
 * Marks which lines of a face's Oracle text the parser did not understand (SPEC 7.2). The
 * parser works on normalized text (reminder text out, self references as `~`), so the original
 * text is split into abilities the same way the parser does and each block is compared with the
 * normalized ability the diagnostic quotes. A block that does not match is not guessed at: the
 * diagnostic is listed verbatim under "Not understood" instead.
 */
import {
  normalizeOracleText,
  type StoredFace,
  splitAbilities,
  type UnparsedAbility,
} from '@commander-arena/cards';

export interface HighlightLine {
  readonly text: string;
  /** False when the parser did not understand the ability this line belongs to. */
  readonly understood: boolean;
}

export interface FaceHighlight {
  readonly lines: readonly HighlightLine[];
  /** Diagnostics whose text could not be located in the original Oracle text. */
  readonly notLocated: readonly UnparsedAbility[];
}

const isLegendary = (typeLine: string): boolean =>
  /\bLegendary\b/i.test(typeLine.split('—')[0] ?? '');

export function highlightFace(
  face: StoredFace,
  faceIndex: number,
  unparsed: readonly UnparsedAbility[],
): FaceHighlight {
  const mine = unparsed.filter((u) => u.face === faceIndex);
  const options = { name: face.name, legendary: isLegendary(face.typeLine) };
  const originalLines = face.oracleText.split('\n');

  // Group the original lines into the same abilities `splitAbilities` makes of the normalized text.
  interface Block {
    readonly lines: number[];
    normalized: string;
  }
  const blocks: Block[] = [];
  const blockOfLine = new Map<number, number>();
  originalLines.forEach((line, i) => {
    const normalized = normalizeOracleText(line, options);
    if (normalized === '') return;
    const last = blocks[blocks.length - 1];
    if (normalized.startsWith('•') && last !== undefined) {
      last.lines.push(i);
      last.normalized = `${last.normalized}\n${normalized}`;
      blockOfLine.set(i, blocks.length - 1);
    } else {
      blocks.push({ lines: [i], normalized });
      blockOfLine.set(i, blocks.length - 1);
    }
  });
  // Cross-check with the parser's own splitting; if they disagree, locate nothing.
  const reference = splitAbilities(normalizeOracleText(face.oracleText, options));
  const aligned =
    reference.length === blocks.length && reference.every((r, i) => r === blocks[i]?.normalized);

  const flagged = new Set<number>();
  const notLocated: UnparsedAbility[] = [];
  for (const u of mine) {
    const block = blocks[u.ability];
    if (aligned && block !== undefined && block.normalized === u.text) flagged.add(u.ability);
    else notLocated.push(u);
  }
  return {
    lines: originalLines.map((text, i) => {
      const block = blockOfLine.get(i);
      return { text, understood: block === undefined || !flagged.has(block) };
    }),
    notLocated,
  };
}
