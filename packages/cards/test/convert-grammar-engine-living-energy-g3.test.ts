// The Aetherdrift energy deck (issue 105), group 3: "you may pay <energy>. If you do / When you do, ..." (CR 107.14, 118.3, 603.12, 608.2c). REAL cards of the golden corpus read through
// the grammar only, defined in an engine scenario and played through applyAction.
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

const KITE = real('Territorial Aetherkite');
const RAMPAGING = real('Rampaging Aetherhood');
const RUNNER = real('Lightning Runner');

describe('the cards read', () => {
  test.each([KITE, RAMPAGING, RUNNER])(
    '$golden.name: supported, nothing left unparsed, validateCard is clean',
    ({ card }) => {
      expect(card.support.status).toBe('supported');
      expect(card.support.unparsed).toEqual([]);
      expect(validateCard(card.definition)).toEqual([]);
    },
  );

  test('Lightning Runner offers to pay eight energy, and its follow-up is an untap and an extra combat', () => {
    const attack = RUNNER.card.definition.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(attack).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainEnergy', amount: 2 },
          { kind: 'mayPay', cost: [{ kind: 'energy', count: 8 }] },
        ],
      },
    });
  });

  test('Rampaging Aetherhood pays any amount and puts that many counters on itself', () => {
    const upkeep = RAMPAGING.card.definition.faces[0]?.abilities.find(
      (a) => a.kind === 'triggered',
    );
    expect(upkeep).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainEnergy' },
          { kind: 'payAnyAmount', symbol: 'E', ifPaid: { kind: 'addCounters' } },
        ],
      },
    });
  });
});

describe('played in a game', () => {
  test('Territorial Aetherkite deals damage equal to the energy paid to each other creature', () => {
    const def = KITE.card.definition;
    const g = scenario()
      .define(def)
      .seat(0)
      .pool('WWWWUUUUBBBBRRRRGGGG')
      .hand(def.name)
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Serra Angel')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(def.name, { pay: true });
    g.passAll();
    g.expect.energy(0, 2);
    // The offer: how many of the two counters to pay.
    expect(g.state.pending).toMatchObject({ kind: 'chooseX', purpose: 'payAnyAmount', max: 2 });
    g.act(0).chooseX(2);
    g.passAll();
    g.expect.energy(0, 0);
    // Two damage to every other creature: the 2/2 Bears die, the 4/4 Angel and the Aetherkite itself live.
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 1 });
    g.expect.zone(def.name, 'battlefield', { seat: 0 });
  });

  test('Territorial Aetherkite: paying none keeps the energy and deals no damage', () => {
    const def = KITE.card.definition;
    const g = scenario()
      .define(def)
      .seat(0)
      .pool('WWWWUUUUBBBBRRRRGGGG')
      .hand(def.name)
      .battlefield('Grizzly Bears')
      .seat(1)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(def.name, { pay: true });
    g.passAll();
    g.act(0).chooseX(0);
    g.passAll();
    g.expect.energy(0, 2);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });
});
