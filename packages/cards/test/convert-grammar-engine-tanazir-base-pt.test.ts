// "Whenever ~ attacks, you may have the base power and toughness of other creatures you control become equal to ~'s power and toughness until end of turn."
// (Tanazir Quandrix, the Quandrix Unlimited deck; CR 613.4b, 611.2c.) The first block reads the REAL Oracle text from the golden corpus, whole; the rest plays it
// through `applyAction` with the scenario DSL (the creatures and the Aura on the board are engine fixtures, one SYNTHETIC).
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const GOLDEN: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));
const NAME = 'Tanazir Quandrix';

const card = (() => {
  const found = GOLDEN.find((c) => c.name === NAME);
  if (found === undefined) throw new Error(`${NAME} is not in the golden corpus`);
  return importCard(fromGoldenCard(found), undefined, NO_OVERRIDES);
})();

const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4
const GROWTH = 'SYNTHETIC Growth Aura'; // Enchanted creature gets +1/+1.
const LIB = Array.from({ length: 12 }, () => 'Plains');

describe('the real card, whole', () => {
  test('every ability is read and the card is supported', () => {
    expect(card.support.unparsed).toEqual([]);
    expect(card.support.status).toBe('supported');
    expect(validateCard(card.definition)).toEqual([]);
  });

  test('the attack trigger is an optional set-P/T of the other creatures from the source', () => {
    const attack = card.definition.faces[0]?.abilities.find(
      (a) => a.kind === 'triggered' && a.trigger.kind === 'attacks',
    );
    expect(attack).toMatchObject({
      optional: true,
      effect: {
        kind: 'setPt',
        objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
        power: { kind: 'powerOf', of: { kind: 'this' } },
        toughness: { kind: 'toughnessOf', of: { kind: 'this' } },
        duration: 'untilEndOfTurn',
      },
    });
  });

  test('the same words without the duration are not read', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Tanazir',
        typeLine: 'Legendary Creature — Elder Dragon',
        oracleText:
          "Whenever SYNTHETIC Parsed Tanazir attacks, you may have the base power and toughness of other creatures you control become equal to SYNTHETIC Parsed Tanazir's power and toughness.",
        manaCost: '{3}{G}{U}',
        power: '4',
        toughness: '4',
        colors: ['G', 'U'],
      }),
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

describe('Tanazir Quandrix attacks (CR 613.4b, 611.2c)', () => {
  const start = () =>
    scenario()
      .define(card.definition)
      .seat(0)
      .library(...LIB)
      .battlefield(NAME, { label: 'tz', counters: { '+1/+1': 1 } }) // 5/5
      .battlefield(BEARS, { label: 'a' })
      .battlefield(ANGEL, { label: 'b' })
      .battlefield(BEARS, { label: 'c', counters: { '+1/+1': 2 } })
      .battlefield(GROWTH, { attachedTo: 'a' })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(0)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  const attack = () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack('tz');
    g.passAll();
    return g;
  };

  test('accepted: the other creatures have base 5/5, the source and the opponent are unchanged', () => {
    const g = attack();
    g.act(0).accept();
    g.expect.pt('a', 6, 6); // base 5/5 + Aura +1/+1 (layer 7c)
    g.expect.pt('b', 5, 5);
    g.expect.pt('c', 7, 7); // base 5/5 + two counters
    g.expect.pt('tz', 5, 5);
    g.expect.pt('theirs', 2, 2);
    g.expect.invariants();
  });

  test('declined: nothing changes', () => {
    const g = attack();
    g.act(0).decline();
    g.expect.pt('a', 3, 3);
    g.expect.pt('b', 4, 4);
    g.expect.pt('c', 4, 4);
  });

  test('it ends at end of turn', () => {
    const g = attack();
    g.act(0).accept();
    g.expect.pt('b', 5, 5);
    g.advanceTo('upkeep', { turn: 3 });
    g.expect.pt('a', 3, 3);
    g.expect.pt('b', 4, 4);
    g.expect.pt('c', 4, 4);
  });
});
