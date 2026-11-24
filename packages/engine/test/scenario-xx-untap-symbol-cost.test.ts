// Order of Whiteclay (Party Time deck, issue 170): "{1}{W}{W}, {Q}: Return target creature card with mana value 3 or less from your graveyard to the battlefield."
// Pins: CR 107.6 (the untap symbol means "Untap this permanent"; an untapped permanent can't pay it), CR 602.5a (a creature's {Q} ability needs it under its controller's
// control since their most recent turn began), CR 122.1d (a stun counter is removed instead of untapping, the cost still paid).
// Cards: the SYNTHETIC "Untap Reanimator" of this file and the real Grizzly Bears.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const ORDER = 'SYNTHETIC Untap Reanimator';
const BEARS = 'Grizzly Bears';

const order = singleFaceCard({
  name: ORDER,
  manaCost: ['1', 'W', 'W'],
  types: ['creature'],
  subtypes: ['Human', 'Cleric'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 2,
  oracleText:
    '{1}{W}{W}, {Q}: Return target creature card with mana value 3 or less from your graveyard to the battlefield.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1', 'W', 'W'] }, { kind: 'untap' }],
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'graveyard',
              types: ['creature'],
              controller: 'you',
              manaValue: { cmp: 'atMost', value: 3 },
            },
          },
        },
      ],
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'target', id: 't1' },
        to: 'battlefield',
        controller: 'you',
      },
    },
  ],
});

const table = (tapped: boolean) =>
  scenario()
    .seat(0)
    .define(order)
    .battlefield('Plains', { count: 3 })
    .battlefield(ORDER, { tapped })
    .graveyard(BEARS)
    .seat(1)
    .build();

describe('the untap symbol {Q} as a cost (CR 107.6)', () => {
  test('a tapped permanent pays it: it untaps as the ability is activated and the creature returns', () => {
    const g = table(true);
    g.act(0).activate(ORDER, { targets: [{ name: BEARS, zone: 'graveyard' }], pay: true });
    expect(g.view(0).battlefield.find((o) => o.name === ORDER)?.tapped).toBe(false);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('an untapped permanent cannot pay it: the ability is not activated', () => {
    const g = table(false);
    const r = g.act(0).try.activate(ORDER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('untapped');
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});
