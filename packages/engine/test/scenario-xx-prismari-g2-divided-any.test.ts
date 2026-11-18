// The Prismari deck (issue 87), group 2: Magma Opus, "~ deals 4 damage divided as you choose among any number of targets. Tap two target permanents. Create a 4/4 blue and red
// Elemental creature token. Draw two cards." (SYNTHETIC Opus Burst, src/cards/fixtures/synthetic-prismari-g2.ts). Pins: CR 601.2d (the division is chosen as the spell is cast; each
// target gets at least 1), CR 115.1 (any target: a creature, a player, a planeswalker or a battle), CR 115.4 (the same target in two instances of the word "target" is allowed when it
// is another slot), CR 608.2b (a target that is illegal on resolution is not affected and its share is not given to another), CR 120.3 (damage), CR 701.26 (tap), CR 111.4 (token),
// CR 602.1 (an ability that works from the hand: discard this card).
import { describe, expect, test } from 'vitest';
import { applyAction, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const OPUS = 'SYNTHETIC Opus Burst';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

type Builder = ReturnType<typeof scenario>;

function build(extra: (b: Builder) => void = () => {}, lands = 8) {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(OPUS)
    .battlefield('Island', { count: Math.ceil(lands / 2) })
    .battlefield('Mountain', { count: Math.floor(lands / 2) });
  extra(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'bears' })
    .battlefield(ANGEL, { label: 'angel' })
    .at('precombatMain', { active: 0 })
    .build();
}

type Game = ReturnType<typeof build>;
type Ref = string | { readonly player: 0 | 1 };

/**
 * Casts the Opus with `damage` (targets of the divided slot, with their shares) and `tap` (the two permanents). The scenario's `targets` verb fills the slots in order, a slot taking
 * as many as it can, so a spell whose first slot takes any number is answered with the action itself.
 */
function castOpus(
  g: Game,
  damage: readonly (readonly [Ref, number])[],
  tap: readonly [string, string],
  options: { readonly pay?: boolean } = {},
) {
  g.act(0).cast(OPUS, { pay: false });
  const target = (ref: Ref, specId: string, share?: number) => ({
    ...(typeof ref === 'string'
      ? { kind: 'object' as const, id: g.id(ref) }
      : { kind: 'player' as const, seat: ref.player }),
    specId,
    ...(share === undefined ? {} : { share }),
  });
  g.choose(0, {
    kind: 'chooseTargets',
    targets: [
      ...damage.map(([ref, share]) => target(ref, 't1', share)),
      ...tap.map((ref) => target(ref, 't2')),
    ],
  });
  if (options.pay !== false) g.choose(0, { kind: 'payAuto' });
}

describe('the card is valid', () => {
  test(OPUS, () => {
    expect(validateCard(syntheticCard(OPUS))).toEqual([]);
  });
});

describe('divided damage among any number of targets (CR 601.2d, 115.1)', () => {
  test('3 to a creature and 1 to a player', () => {
    const g = build();
    castOpus(
      g,
      [
        ['bears', 3],
        [{ player: 1 }, 1],
      ],
      ['angel', 'bears'],
    );
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 1 })).toHaveLength(1);
    g.expect.life(1, 39);
    g.expect.invariants();
  });

  test('all the damage to one target', () => {
    const g = build();
    castOpus(g, [[{ player: 1 }, 4]], ['angel', 'bears']);
    g.passAll();
    g.expect.life(1, 36);
  });

  test('no target for the damage at all: "any number" includes none; the rest of the spell is done', () => {
    const g = build();
    castOpus(g, [], ['angel', 'bears']);
    g.passAll();
    g.expect.life(1, 40);
    expect(g.find({ name: 'Elemental', zone: 'battlefield', seat: 0 })).toHaveLength(1);
  });

  test('two creatures and two players: four targets of 1 each (the caster is a legal target too)', () => {
    const g = build();
    castOpus(
      g,
      [
        ['bears', 1],
        ['angel', 1],
        [{ player: 0 }, 1],
        [{ player: 1 }, 1],
      ],
      ['bears', 'angel'],
    );
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 39);
    g.expect.damage('angel', 1);
    g.expect.damage('bears', 1);
  });

  test('the same permanent may be a target of the damage and of the tap (two slots, CR 115.3)', () => {
    const g = build();
    castOpus(g, [['bears', 4]], ['bears', 'angel']);
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 1 })).toHaveLength(1);
    expect(g.object('angel').tapped).toBe(true);
  });

  test('the division must add up to 4, and each target needs at least 1', () => {
    const g = build();
    for (const damage of [
      [
        ['bears', 3],
        [{ player: 1 }, 2],
      ],
      [
        ['bears', 4],
        [{ player: 1 }, 0],
      ],
      [['bears', 3]],
    ] as const) {
      const fresh = build();
      expect(() => castOpus(fresh, damage, ['angel', 'bears'], { pay: false })).toThrow();
    }
    expect(g.state.seats[0]?.hand).toHaveLength(1);
  });

  test('a target that is gone when the spell resolves gets nothing and its share goes to nobody else', () => {
    const g = build((b) => b.seat(1).hand('Unsummon').battlefield('Island'));
    castOpus(
      g,
      [
        ['bears', 3],
        [{ player: 1 }, 1],
      ],
      ['angel', 'bears'],
    );
    g.act(0).pass();
    g.act(1).cast('Unsummon', { pay: true, targets: ['bears'] });
    g.passAll();
    // The Bears went back to their owner's hand: the three damage was not given to the player.
    g.expect.life(1, 39);
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 1 })).toHaveLength(0);
  });
});

describe('the rest of the text', () => {
  test('two target permanents are tapped, a 4/4 Elemental is created, two cards are drawn', () => {
    const g = build();
    const handBefore = g.state.seats[0]?.hand.length ?? 0;
    castOpus(g, [[{ player: 1 }, 4]], ['angel', 'bears']);
    g.passAll();
    expect(g.object('angel').tapped).toBe(true);
    expect(g.object('bears').tapped).toBe(true);
    const made = g.find({ name: 'Elemental', zone: 'battlefield', seat: 0 });
    expect(made).toHaveLength(1);
    g.expect.pt(made[0]?.id as string, 4, 4);
    g.expect.derived(made[0]?.id as string, { colors: ['U', 'R'] });
    // The spell left the hand (-1) and two cards were drawn.
    expect(g.state.seats[0]?.hand).toHaveLength(handBefore - 1 + 2);
  });

  test('"two target permanents" needs two: with one permanent on the battlefield the spell cannot be cast', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(OPUS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { cast: OPUS });
  });

  test('the ability that works from the hand: {U/R}{U/R}, discard this card: create a Treasure token', () => {
    const g = build();
    g.act(0).activate({ name: OPUS, zone: 'hand', seat: 0 });
    g.choose(0, { kind: 'payAuto' });
    g.passAll();
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: OPUS, zone: 'graveyard', seat: 0 })).toHaveLength(1);
    expect(applyAction(g.state, 0, { kind: 'pass' }).ok).toBe(true);
  });
});
