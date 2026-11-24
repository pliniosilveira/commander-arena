// Frontline Medic (Party Time deck, issue 170): "Sacrifice this creature: Counter target spell with {X} in its mana cost unless its controller pays {3}."
// Pins: CR 107.3 and 202.1 (an {X} in the printed mana cost is what the filter reads, whatever X was chosen), CR 701.6 (Counter), CR 118.12a (counter unless a cost is paid:
// the controller of the target spell is asked as the ability resolves), CR 602.2 (the sacrifice is a cost, paid on activation) and CR 115.1 (a spell with no {X} is no legal target).
// Cards: the SYNTHETIC "X Counter Medic" of this file, the SYNTHETIC X Burn ({X}{R}) and the real Lightning Bolt.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MEDIC = 'SYNTHETIC X Counter Medic';
const X_BURN = 'SYNTHETIC X Burn';
const BOLT = 'Lightning Bolt';

const medic = singleFaceCard({
  name: MEDIC,
  manaCost: ['1', 'W'],
  types: ['creature'],
  subtypes: ['Human', 'Cleric'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 1,
  toughness: 1,
  oracleText:
    'Sacrifice this creature: Counter target spell with {X} in its mana cost unless its controller pays {3}.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'sacrifice', what: { kind: 'this' } }],
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'stack', stackKind: 'spell', xInManaCost: true },
          },
        },
      ],
      effect: {
        kind: 'counterUnlessPays',
        objects: { kind: 'target', id: 't1' },
        cost: [{ kind: 'mana', symbols: ['3'] }],
      },
    },
  ],
});

const table = (spell: string, mountains: number) =>
  scenario()
    .seat(0)
    .hand(spell)
    .battlefield(...Array.from({ length: mountains }, () => 'Mountain'))
    .seat(1)
    .define(medic)
    .battlefield(MEDIC)
    .build();

describe('"Counter target spell with {X} in its mana cost unless its controller pays {3}"', () => {
  test('a spell with {X} in its cost is a legal target: unable to pay {3}, its controller loses it, and the Medic is sacrificed', () => {
    const g = table(X_BURN, 3);
    g.act(0).cast(X_BURN, { x: 2, targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).activate(MEDIC, { targets: [{ name: X_BURN, zone: 'stack' }] });
    g.expect.zone(MEDIC, 'graveyard', { seat: 1 });
    g.passAll();
    g.expect.zone(X_BURN, 'graveyard', { seat: 0 });
    g.expect.life(1, 40);
    g.expect.invariants();
  });

  test('a spell with no {X} in its cost cannot be targeted (CR 115.1)', () => {
    const g = table(BOLT, 1);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    const r = g.act(1).try.activate(MEDIC);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('target');
    g.expect.zone(MEDIC, 'battlefield', { seat: 1 });
  });
});
