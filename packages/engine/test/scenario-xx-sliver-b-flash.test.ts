// "Any player may cast Sliver spells as though they had flash." (Sliver Swarm deck, group B): `castAsThoughFlash` with `anyPlayer`.
// Pins: CR 601.3b (an effect may let a player cast a spell at a time they could not), CR 702.8a (flash: the timing of an instant), CR 117.1a (sorcery timing).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-sliver-b.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const QUICK = 'SYNTHETIC Hive Quickener';
const SLIVER = 'SYNTHETIC Plain Sliver';
const BEARS = 'Grizzly Bears';

const castable = (g: ScenarioGame, seat: number, name: string): boolean => {
  const id = g.id({ name, zone: 'hand', seat });
  return getLegalActions(g.state, seat).some(
    (a: Action) => a.kind === 'castSpell' && a.object === id,
  );
};

/** Seat 0 has the permission source; both seats hold a Sliver and a Bear with mana, on seat 1's turn. */
function board(sourceSeat: 0 | 1) {
  const b = scenario().define(syntheticCard(SLIVER));
  const seats = [0, 1] as const;
  for (const seat of seats) {
    b.seat(seat).hand(SLIVER, BEARS).battlefield('Forest', { count: 4 });
    if (seat === sourceSeat) b.battlefield(QUICK);
  }
  return b.at('upkeep', { active: 1, priority: 0 }).build();
}

describe('the card is valid', () => {
  test('SYNTHETIC Hive Quickener', () => {
    expect(validateCard(syntheticCard(QUICK))).toEqual([]);
  });

  test('anyPlayer is true or absent, and a permanent filter is needed', () => {
    const card = syntheticCard(QUICK);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (ability === undefined || ability.kind !== 'static') throw new Error('no static');
    const edit = (change: Record<string, unknown>) =>
      validateCard({
        ...card,
        faces: [
          {
            ...face,
            abilities: [{ ...ability, static: { ...ability.static, ...change } }],
          },
        ],
      } as never);
    expect(edit({ anyPlayer: false }).length).toBeGreaterThan(0);
    expect(edit({ spells: { kind: 'this' } }).length).toBeGreaterThan(0);
  });
});

describe('"Any player may cast Sliver spells as though they had flash" (CR 601.3b)', () => {
  test('its controller may cast a Sliver at instant speed, and not a non-Sliver', () => {
    const g = board(0);
    expect(castable(g, 0, SLIVER)).toBe(true);
    expect(castable(g, 0, BEARS)).toBe(false);
  });

  test('the opponent with priority may cast a Sliver on the permanent controller’s turn', () => {
    const g = scenario()
      .define(syntheticCard(SLIVER))
      .seat(0)
      .battlefield(QUICK)
      .seat(1)
      .hand(SLIVER, BEARS)
      .battlefield('Forest', { count: 4 })
      .at('upkeep', { active: 0, priority: 1 })
      .build();
    expect(castable(g, 1, SLIVER)).toBe(true);
    expect(castable(g, 1, BEARS)).toBe(false);
    g.act(1).cast(SLIVER, { pay: true });
    g.passAll();
    g.expect.zone(SLIVER, 'battlefield', { seat: 1 });
  });

  test('without the permanent nobody may', () => {
    const g = scenario()
      .define(syntheticCard(SLIVER))
      .seat(0)
      .hand(SLIVER)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .at('upkeep', { active: 1, priority: 0 })
      .build();
    expect(castable(g, 0, SLIVER)).toBe(false);
  });
});
