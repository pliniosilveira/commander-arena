// "For as long as that creature has a shadow counter on it, it's a Wraith in addition to its other types" (Minas Morgul, Dark Fortress): `setTypes.whileHasCounter`.
// Pins: CR 611.2b (a duration that is over ends for good), CR 122.1 (counters), CR 205.1b, CR 205.3d (creature types), CR 613.1d (layer 4).
// The cards are SYNTHETIC; defined here.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MARK = 'SYNTHETIC Mark Creature';
const CLEANSE = 'SYNTHETIC Cleanse Mark';
const BEARS = 'Grizzly Bears';

const TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

const MARK_CARD = singleFaceCard({
  name: MARK,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    "Put a shadow counter on target creature. For as long as it has a shadow counter on it, it's a Wraith in addition to its other types.",
  spell: {
    targets: [TARGET],
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'addCounters',
          objects: { kind: 'target', id: 't1' },
          counter: 'shadow',
          count: 1,
        },
        {
          kind: 'setTypes',
          objects: { kind: 'target', id: 't1' },
          subtypes: ['Wraith'],
          additive: true,
          whileHasCounter: 'shadow',
          duration: 'permanent',
        },
      ],
    },
  },
});

const CLEANSE_CARD = singleFaceCard({
  name: CLEANSE,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'Remove a shadow counter from target creature.',
  spell: {
    targets: [TARGET],
    effect: {
      kind: 'removeCounters',
      objects: { kind: 'target', id: 't1' },
      counter: 'shadow',
      count: 1,
    },
  },
});

describe('a type that lasts while the counter does (CR 611.2b)', () => {
  const board = () =>
    scenario()
      .define(MARK_CARD)
      .define(CLEANSE_CARD)
      .seat(0)
      .hand(MARK, CLEANSE)
      .battlefield(BEARS)
      .pool('BB')
      .at('precombatMain', { active: 0 })
      .build();

  test('the creature is a Wraith in addition to its other types while it has the counter', () => {
    const g = board();
    g.act(0).cast(MARK, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.derived(BEARS, { subtypes: ['Bear', 'Wraith'] });
  });

  test('when the counter is gone it is no Wraith, for good', () => {
    const g = board();
    g.act(0).cast(MARK, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).cast(CLEANSE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
    g.expect.derived(BEARS, { subtypes: ['Bear'] });
  });
});
