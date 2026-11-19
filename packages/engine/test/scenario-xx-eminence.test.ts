// Issue 81 (The Ur-Sphinx): "Eminence — As long as ~ is in the command zone or on the battlefield, other Sphinx spells you cast cost {1} less to cast." Pins: CR 601.2f (the total cost
// is determined with reductions), 118.7a (only generic mana, never below zero), 903.8 (a commander in the command zone), 113.6 (an ability that works from another zone). Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SPHINX_LORD = 'SYNTHETIC Eminent Sphinx';
const SPHINX = 'SYNTHETIC Lesser Sphinx';
const BEARS = 'Grizzly Bears';

const lord = singleFaceCard({
  name: SPHINX_LORD,
  manaCost: ['3', 'U', 'U'],
  types: ['creature'],
  subtypes: ['Sphinx'],
  supertypes: ['legendary'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 4,
  toughness: 4,
  oracleText:
    'Eminence — As long as ~ is in the command zone or on the battlefield, other Sphinx spells you cast cost {1} less to cast.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { controller: 'you', subtypes: ['Sphinx'], other: true },
        amount: 1,
        inCommandZone: true,
      },
    },
  ],
});
const sphinx = singleFaceCard({
  name: SPHINX,
  manaCost: ['2', 'U'],
  types: ['creature'],
  subtypes: ['Sphinx'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 2,
  toughness: 2,
  oracleText: '',
});

/** The mana cost the view shows for a card in the hand of seat 0. */
function costOf(g: ReturnType<typeof board>, name: string): string {
  const card = getView(g.state, 0).seats[0]?.hand?.find((c) => c.name === name);
  return JSON.stringify(card?.castCost);
}

function board(where: 'command' | 'battlefield' | 'none') {
  const b = scenario()
    .seat(0)
    .define(lord)
    .define(sphinx)
    .hand(SPHINX, BEARS)
    .battlefield('Island', { count: 2 })
    .library('Island', 'Island');
  const placed =
    where === 'command'
      ? b.commander(SPHINX_LORD)
      : where === 'battlefield'
        ? b.battlefield(SPHINX_LORD)
        : b;
  return placed
    .seat(1)
    .library('Island', 'Island')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

describe('Eminence: a cost reduction that works in the command zone too', () => {
  test('with the commander in the command zone the Sphinx costs {1} less: two Islands pay for it', () => {
    const g = board('command');
    g.expect.legal(0, { cast: SPHINX });
    g.act(0).cast(SPHINX, { pay: true });
    g.passAll();
    g.expect.zone(SPHINX, 'battlefield', { seat: 0 });
  });

  test('without the commander two Islands are not enough', () => {
    const g = board('none');
    g.expect.illegal(0, { cast: SPHINX });
  });

  test('on the battlefield it applies as well', () => {
    const g = board('battlefield');
    g.expect.legal(0, { cast: SPHINX });
  });

  test('it reduces only other Sphinx spells: a Bear costs what it costs, and the view says so', () => {
    const g = board('command');
    expect(costOf(g, BEARS)).toBe(costOf(board('none'), BEARS));
    expect(costOf(g, SPHINX)).not.toBe(costOf(board('none'), SPHINX));
  });

  test('a commander that is in the graveyard reduces nothing', () => {
    const g = scenario()
      .seat(0)
      .define(lord)
      .define(sphinx)
      .hand(SPHINX)
      .graveyard(SPHINX_LORD)
      .battlefield('Island', { count: 2 })
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.expect.illegal(0, { cast: SPHINX });
  });
});
