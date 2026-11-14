// Shared by the SYNTHETIC template corpora (convert-grammar-corpus*.test.ts): the shape of a line,
// the three kinds of expectation, and the card each line is imported as. Nothing here is real card
// data: names are invented and every line is a template.
import { describe, expect, test } from 'vitest';
import type { StoredCard } from '../src/index';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

export type Kind =
  | 'instant'
  | 'sorcery'
  | 'land'
  | 'creature'
  | 'artifact'
  | 'enchantment'
  | 'aura'
  | 'equipment'
  | 'vehicle';

export type Expectation =
  | { readonly supported: true }
  | {
      readonly unparsed: {
        readonly stoppedAt: string;
        readonly closestRule: string;
        /** Diagnostics v2: set when the line is read but the engine cannot run it. */
        readonly reason?: 'notRunnable' | 'unboundReference';
        readonly needs?: readonly string[];
      };
    }
  | { readonly engine: string };

export interface Line {
  readonly kind: Kind;
  /** Written with `~` for the card's own name; the test puts the card name in its place. */
  readonly text: string;
  readonly expect: Expectation;
  /** Why it is expected so, and the real card it is shaped after when it comes from the deck. */
  readonly note?: string;
  /** The printed power and toughness of a creature line, as Scryfall gives them (default 1 and 1). */
  readonly stats?: readonly [string, string];
  /** The X of the text is defined by the text ("..., where X is ..."): the card's mana cost has no {X} (stage P28). */
  readonly noX?: true;
}

export const OK = { supported: true } as const;
export const no = (
  stoppedAt: string,
  closestRule: string,
  more: { reason?: 'notRunnable' | 'unboundReference'; needs?: readonly string[] } = {},
): Expectation => ({
  unparsed: { stoppedAt, closestRule, ...more },
});
export const NONE = 'none';

export function cardFor(entry: Line, index: number): StoredCard {
  const name = `SYNTHETIC Corpus ${index}`;
  const text = entry.text.replaceAll('~', name);
  const usesX = entry.noX !== true && /\bX\b/.test(entry.text);
  switch (entry.kind) {
    case 'instant':
      return syntheticCard({
        name,
        manaCost: usesX ? '{X}{R}' : '{1}{R}',
        typeLine: 'Instant',
        oracleText: text,
      });
    case 'sorcery':
      return syntheticCard({
        name,
        manaCost: usesX ? '{X}{R}' : '{1}{R}',
        typeLine: 'Sorcery',
        oracleText: text,
      });
    case 'land':
      return syntheticCard({ name, typeLine: 'Land', oracleText: text });
    case 'artifact':
      return syntheticCard({ name, manaCost: '{2}', typeLine: 'Artifact', oracleText: text });
    case 'enchantment':
      return syntheticCard({ name, manaCost: '{1}{G}', typeLine: 'Enchantment', oracleText: text });
    case 'aura':
      return syntheticCard({
        name,
        manaCost: '{1}{G}',
        typeLine: 'Enchantment — Aura',
        oracleText: text,
        colors: ['G'],
      });
    case 'equipment':
      return syntheticCard({
        name,
        manaCost: '{2}',
        typeLine: 'Artifact — Equipment',
        oracleText: text,
      });
    case 'vehicle':
      return syntheticCard({
        name,
        manaCost: '{3}',
        typeLine: 'Artifact — Vehicle',
        oracleText: text,
        power: '4',
        toughness: '4',
      });
    case 'creature':
      return syntheticCard({
        name,
        manaCost: usesX ? '{X}{G}' : '{1}{G}',
        typeLine: 'Creature — Bear',
        oracleText: text,
        power: entry.stats?.[0] ?? '1',
        toughness: entry.stats?.[1] ?? '1',
        colors: ['G'],
      });
  }
}

/** Runs every line of a corpus: supported, unparsed at the stated place, or refused by the engine. */
export function runCorpus(title: string, corpus: readonly Line[]): void {
  describe(title, () => {
    test.each(corpus.map((line, i) => [`${line.kind}: ${line.text}`, line, i] as const))(
      '%s',
      (_title, line, index) => {
        const imported = parseOnly(cardFor(line, index));
        const first = imported.support.unparsed[0];
        if ('supported' in line.expect) {
          expect(imported.support.unparsed).toEqual([]);
          expect(imported.support.reasons).toEqual([]);
          expect(imported.support.status).toBe('supported');
        } else if ('unparsed' in line.expect) {
          expect(imported.support.status).toBe('unsupported');
          expect(first, 'the text should not be fully read').toBeDefined();
          expect(first?.stoppedAt.replaceAll(`SYNTHETIC Corpus ${index}`, '~')).toBe(
            line.expect.unparsed.stoppedAt,
          );
          expect(first?.closestRule).toBe(line.expect.unparsed.closestRule);
          expect(first?.reason).toBe(line.expect.unparsed.reason ?? 'unrecognised');
          if (line.expect.unparsed.needs !== undefined) {
            expect(first?.needs).toEqual(line.expect.unparsed.needs);
          }
        } else {
          expect(imported.support.unparsed, 'the text should be read').toEqual([]);
          expect(imported.support.status).toBe('unsupported');
          expect(imported.support.reasons.join('\n')).toContain(line.expect.engine);
        }
      },
    );
  });
}
