/**
 * A melded permanent is one object that two cards represent (D-991, `rules/melded.ts`): `GameObject.card` is the first and `meldedWith` the second. A rule that asks
 * about "the card of an object" and needs to see both goes through `cardsOf`, `commanderCardOf` or `isCommanderObject`. This test reads the sources of the engine and
 * fails when one reads the commander flag of `obj.card` directly (`state.cards[obj.card]?.isCommander`), which would forget the second card: whether a melded
 * permanent is a commander (CR 903.3b) is the question where that goes wrong. A read that is meant (the card itself, with no object) says so with the comment
 * `one card` on the same line.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const SKIP = new Set([join(SRC, 'rules', 'melded.ts'), join(SRC, 'cards'), join(SRC, 'testing')]);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP.has(path)) continue;
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

/** The commander flag read through the card of an object: `state.cards[obj.card]?.isCommander`, `state.cards[o.card].isCommander`, `cards[x.card]?.isCommander`. */
const OBJECT_CARD_FLAG = /\.cards\[\s*[A-Za-z_.]+\.card\s*(?:\?\?[^\]]*)?\]\??\.isCommander/;

describe('melded reads', () => {
  test('no rule reads the commander flag of the card of an object directly', () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (OBJECT_CARD_FLAG.test(line) && !line.includes('one card')) {
            offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  test('the check does catch the pattern it is about', () => {
    expect(
      OBJECT_CARD_FLAG.test(
        'return obj.card !== null && state.cards[obj.card]?.isCommander === true;',
      ),
    ).toBe(true);
    expect(OBJECT_CARD_FLAG.test("if (state.cards[old.card ?? '']?.isCommander === true) {")).toBe(
      true,
    );
    expect(OBJECT_CARD_FLAG.test('const c = state.cards[card]?.isCommander;')).toBe(false);
  });
});
