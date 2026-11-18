// Issue 89 (Silverquill Influence), "Whenever an enchantment you control enters, tap up to one target creature and goad it." (D-651; Killian, Decisive Mentor).
// Pins: CR 701.26a (tap), CR 701.15a-b (goad: the creature attacks each combat if able, until the goader's next turn), CR 115.1 and 601.2c (up to one target may be none).
// Cards: the SYNTHETIC Mentor and Enchantment of this file, the real Grizzly Bears and Healer's Hawk.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MENTOR = 'SYNTHETIC Tap And Goad Mentor';
const ENCHANTMENT = 'SYNTHETIC Plain Enchantment';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const T1 = { kind: 'target', id: 't1' } as const;
const mentor = singleFaceCard({
  name: MENTOR,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Cleric'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 4,
  oracleText:
    'Whenever an enchantment you control enters, tap up to one target creature and goad it.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { types: ['enchantment'], controller: 'you' } },
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          min: 0,
          max: 1,
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: T1 },
          { kind: 'goad', objects: T1 },
        ],
      },
    },
  ],
});

const enchantment = singleFaceCard({
  name: ENCHANTMENT,
  manaCost: ['W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: '',
});

const board = () =>
  scenario()
    .seat(0)
    .define(mentor)
    .define(enchantment)
    .hand(ENCHANTMENT)
    .library(...LIBRARY)
    .battlefield('Plains', MENTOR)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, HAWK)
    .at('precombatMain')
    .build();

describe('"tap up to one target creature and goad it"', () => {
  test('the chosen creature is tapped and goaded: it must attack on its next turn if able', () => {
    const g = board();
    g.act(0).cast(ENCHANTMENT, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    expect(g.object(g.id(BEARS)).tapped).toBe(true);
    expect(g.object(g.id(HAWK)).tapped).toBe(false);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    // The goaded creature untapped in its controller's untap step and must attack; the other need not.
    expect([...d.mustAttack]).toEqual([g.id(BEARS)]);
  });

  test('no target: nothing is tapped or goaded', () => {
    const g = board();
    g.act(0).cast(ENCHANTMENT, { pay: true });
    g.passAll();
    g.act(0).chooseTargets();
    g.passAll();
    expect(g.object(g.id(BEARS)).tapped).toBe(false);
    expect(g.state.continuousEffects).toHaveLength(0);
  });
});
