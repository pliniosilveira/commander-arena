// The Aetherdrift energy deck (issue 105), group 2: "you get <amount> {E}" with an amount that is a number word, a count ("for each"), a value ("an amount of {E} equal to ...") or
// the damage of the trigger ("that many {E}"), and "target creature blocks this turn if able" (CR 107.14, 122.1, 509.1b). REAL cards of the golden corpus read through the grammar
// only, defined in an engine scenario and played through applyAction.
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const real = (name: string) => {
  const golden = cards.find((c) => c.name === name);
  if (golden === undefined) throw new Error(`${name} is not in the golden corpus`);
  return { golden, card: importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES) };
};

const WHALE = real('Aethertide Whale');
const BASKER = real('Aetherwind Basker');
const SEER = real('Peema Aether-Seer');
const TRAILBLAZER = real('Peema Trailblazer');

const triggerEffect = (r: ReturnType<typeof real>) =>
  r.card.definition.faces[0]?.abilities.find((a) => a.kind === 'triggered');

describe('the cards read', () => {
  test.each([WHALE, BASKER, SEER, TRAILBLAZER])(
    '$golden.name: supported, nothing left unparsed, validateCard is clean',
    ({ card }) => {
      expect(card.support.status).toBe('supported');
      expect(card.support.unparsed).toEqual([]);
      expect(validateCard(card.definition)).toEqual([]);
    },
  );

  test('the amounts of energy are the ones the text names', () => {
    console.log(JSON.stringify([WHALE, BASKER, SEER, TRAILBLAZER].map(triggerEffect)));
    expect(triggerEffect(WHALE)).toMatchObject({
      effect: { kind: 'gainEnergy', player: { kind: 'you' }, amount: 6 },
    });
    expect(triggerEffect(BASKER)).toMatchObject({
      effect: { kind: 'gainEnergy', amount: { kind: 'countOf' } },
    });
    expect(triggerEffect(SEER)).toMatchObject({
      effect: { kind: 'gainEnergy', amount: { kind: 'aggregate', how: 'greatest', stat: 'power' } },
    });
    expect(triggerEffect(TRAILBLAZER)).toMatchObject({
      effect: { kind: 'gainEnergy', amount: { kind: 'triggerDamage' } },
    });
  });
});

describe('played in a game', () => {
  test('Aethertide Whale gives six energy as it enters', () => {
    const def = WHALE.card.definition;
    const g = scenario()
      .define(def)
      .seat(0)
      .pool('WWWWUUUUBBBBRRRRGGGG')
      .hand(def.name)
      .seat(1)

      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(def.name, { pay: true });
    g.passAll();
    g.expect.energy(0, 6);
  });

  test('Aetherwind Basker gives one energy for each creature its controller has, itself included', () => {
    const def = BASKER.card.definition;
    const g = scenario()
      .define(def)
      .seat(0)
      .pool('WWWWUUUUBBBBRRRRGGGG')
      .hand(def.name)
      .battlefield('Grizzly Bears', 'Grizzly Bears')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(def.name, { pay: true });
    g.passAll();
    g.expect.energy(0, 3);
  });

  test('Peema Aether-Seer gives energy equal to the greatest power among the creatures its controller has', () => {
    const def = SEER.card.definition;
    const g = scenario()
      .define(def)
      .seat(0)
      .pool('WWWWUUUUBBBBRRRRGGGG')
      .hand(def.name)
      .battlefield('Serra Angel')
      .seat(1)

      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(def.name, { pay: true });
    g.passAll();
    // Serra Angel's power is 4, which is also at least the Seer's own.
    g.expect.energy(0, 4);
  });

  test('Peema Aether-Seer pays three energy to make a creature block this turn if able', () => {
    const def = SEER.card.definition;
    const poor = scenario().define(def).seat(0).energy(2).battlefield(def.name).seat(1).build();
    poor.expect.illegal(0, { activate: def.name });
  });
});
