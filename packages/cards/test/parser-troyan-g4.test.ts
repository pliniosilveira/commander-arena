// The Troyan deck (issue 337), group 4: Rashmi, Eternities Crafter, "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without
// paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand." (CR 601.2i, 603.2, 701.20a, 608.2g, 118.9, 202.3e).
// The first line is the real Oracle text of the acceptance card of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses
// the grammar must not read. The engine runs what is lowered in convert-grammar-engine-troyan-g4.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const SUBTYPES = ['Elf', 'Druid'];
const REVEAL_CAST = {
  kind: 'revealTopCast',
  manaValueBelow: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
};
const TRIGGER = { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', nth: 1 };
const BODY =
  "reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand.";
const REAL = `Whenever you cast your first spell each turn, ${BODY}`;

describe('Rashmi, Eternities Crafter (CR 601.2i, 603.2, 701.20a, 608.2g)', () => {
  test('the real text: the first spell of the turn, the reveal, the free cast of a card with a lesser mana value, the hand otherwise', () => {
    expect(readAll(REAL, 'creature', SUBTYPES).abilities).toEqual([
      { kind: 'triggered', trigger: TRIGGER, effect: REVEAL_CAST },
    ]);
  });

  test('the typographic apostrophes of the card data read the same', () => {
    const typographic = REAL.replaceAll("'", '’');
    expect(readAll(typographic, 'creature', SUBTYPES).abilities).toMatchObject([
      { kind: 'triggered', trigger: TRIGGER },
    ]);
  });

  test('"your first spell each turn" alone is the engine\'s nth of 1 (SYNTHETIC)', () => {
    expect(
      readAll('Whenever you cast your first spell each turn, you gain 1 life.', 'creature')
        .abilities,
    ).toMatchObject([{ kind: 'triggered', trigger: TRIGGER, effect: { kind: 'gainLife' } }]);
  });

  test('the body works for another trigger that names a spell: "whenever an opponent casts their second spell each turn" (SYNTHETIC)', () => {
    expect(
      readAll(`Whenever an opponent casts their second spell each turn, ${BODY}`, 'creature')
        .abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', by: 'opponent', nth: 2 },
        effect: REVEAL_CAST,
      },
    ]);
  });

  test.each([
    // the opponent's and everybody's first spell are other triggers
    `Whenever an opponent casts their first spell each turn, ${BODY}`,
    `Whenever a player casts their first spell each turn, ${BODY}`,
    // "greater" is not "lesser"
    `Whenever you cast a spell, ${BODY.replace('lesser', 'greater')}`,
    // the comparison, the kind of spell, the card's fate or the number of cards is not the one read
    "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value.",
    "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with greater mana value. If you don't cast it, put it into your hand.",
    "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a creature spell with lesser mana value. If you don't cast it, put it into your hand.",
    "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it on the bottom of your library.",
    "Whenever you cast your first spell each turn, reveal the top two cards of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand.",
  ])('another text is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('a spell-less trigger reads the body, and the engine refuses it where no spell caused it (the lowering itself does not look)', () => {
    // "lesser" is relative to the triggering spell, so an ability with another trigger is lowered the same and then refused by `validateCard`
    // (convert-grammar-engine-troyan-g4.test.ts). The parse is the same: it is the trigger's business.
    const parsed = readAll(`When ~ enters, ${BODY}`, 'creature');
    expect(parsed.abilities).toMatchObject([{ kind: 'triggered', effect: REVEAL_CAST }]);
  });

  test('the lowering names the engine features it needs, and drops the ability when one is missing', () => {
    for (const feature of [
      'effect:revealTopCast',
      'amount:manaValueOf',
      'selector:triggerSubject',
    ]) {
      expect(DECLARED_NEEDS).toContain(feature);
    }
    const missing = withoutFeature('effect:revealTopCast', REAL, 'creature', SUBTYPES);
    expect(missing.needs).toContain('effect:revealTopCast');
  });
});
