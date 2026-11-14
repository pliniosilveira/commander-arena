// "Whenever this creature attacks, blocks, or becomes the target of a spell, it deals damage equal to its power to each opponent. {5}: Monstrosity 5." (D-1312, D-1315): the effect
// `monstrosity` (CR 701.37a: "If this permanent isn't monstrous, put N +1/+1 counters on it and it becomes monstrous"), the designation `GameObject.monstrous` (CR 701.37b: it stays
// until the permanent leaves the battlefield and is not copiable), and a trigger with three events, one of them for spells only.
// Pins: CR 701.37a-b (Monstrosity, the designation), CR 603.2c (one ability per event), CR 601.2c (a permanent becomes the target as the spell's targets are chosen), CR 400.7 (a
// permanent that left is a new object), CR 120.3 (the creature is the source of the damage), CR 508.1 / 509.1 (attacking and blocking), CR 702.12b (indestructible).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-feather-g2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TOY = 'SYNTHETIC Spike Toy'; // 1/1 indestructible artifact creature; {5}: Monstrosity 5
const BOUNCE = 'SYNTHETIC Way Light'; // {W} instant, mode 2 returns a permanent you control to its owner's hand
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const LIBRARY = ['Plains', 'Plains', 'Plains'] as const;

const FIVE = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('the card is valid', () => {
  test(TOY, () => {
    expect(validateCard(syntheticCard(TOY))).toEqual([]);
  });

  test('monstrosity puts one or more counters, and only an ability of a permanent does it (CR 701.37a)', () => {
    const withEffect = (count: number, spell: boolean) =>
      singleFace({
        name: 'SYNTHETIC Test Monster',
        manaCost: ['1'],
        types: [spell ? 'instant' : 'creature'],
        colors: [],
        colorIdentity: [],
        ...(spell ? {} : { power: 1, toughness: 1 }),
        oracleText: 'test',
        ...(spell
          ? { spell: { effect: { kind: 'monstrosity' as const, count } } }
          : {
              abilities: [
                {
                  kind: 'activated' as const,
                  cost: [{ kind: 'mana' as const, symbols: ['5'] }],
                  effect: { kind: 'monstrosity' as const, count },
                },
              ],
            }),
      });
    expect(validateCard(withEffect(5, false))).toEqual([]);
    expect(validateCard(withEffect(0, false)).length).toBeGreaterThan(0);
    expect(validateCard(withEffect(-1, false)).length).toBeGreaterThan(0);
    expect(validateCard(withEffect(1.5, false)).length).toBeGreaterThan(0);
    expect(validateCard(withEffect(5, true)).length).toBeGreaterThan(0);
  });
});

describe('{5}: Monstrosity 5', () => {
  const board = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOY)
      .battlefield(...FIVE, 'Plains', 'Plains')
      .hand(BOUNCE)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('five +1/+1 counters and it becomes monstrous: 6/6', () => {
    const g = board();
    g.act(0).activate(TOY, { pay: true });
    g.passAll();
    g.expect.counters(TOY, { '+1/+1': 5 });
    g.expect.pt(TOY, 6, 6);
    expect(g.object(TOY).monstrous).toBe(true);
    expect(g.view(0).battlefield.find((o) => o.name === TOY)?.monstrous).toBe(true);
    g.expect.invariants();
  });

  test('a second activation does nothing: it is monstrous already (CR 701.37a)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOY)
      .battlefield(...FIVE, ...FIVE)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(TOY, { pay: true });
    g.passAll();
    g.act(0).activate(TOY, { pay: true });
    g.passAll();
    g.expect.counters(TOY, { '+1/+1': 5 });
    g.expect.pt(TOY, 6, 6);
  });

  test('two activations on the stack together: the first one makes it monstrous and the second does nothing', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOY)
      .battlefield(...FIVE, ...FIVE)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(TOY, { pay: true });
    g.act(0).activate(TOY, { pay: true });
    g.passAll();
    g.expect.counters(TOY, { '+1/+1': 5 });
    g.expect.pt(TOY, 6, 6);
  });

  test('the permanent is gone as the ability resolves: nothing happens, and the new object is not monstrous (CR 400.7)', () => {
    const g = board();
    g.act(0).activate(TOY, { pay: true });
    g.act(0).cast(BOUNCE, { modes: [1], targets: [TOY], pay: true });
    g.passAll();
    g.expect.zone(TOY, 'hand', { seat: 0 });
    g.expect.noObject(TOY, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('a permanent that was monstrous and came back is not monstrous (CR 701.37b, 400.7)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOY)
      .battlefield(...FIVE, 'Plains', 'Plains')
      .hand(BOUNCE)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(TOY, { pay: true });
    g.passAll();
    expect(g.object(TOY).monstrous).toBe(true);
    g.act(0).cast(BOUNCE, { modes: [1], targets: [TOY], pay: true });
    g.passAll();
    g.expect.zone(TOY, 'hand', { seat: 0 });
    expect(g.object({ name: TOY, seat: 0, zone: 'hand' }).monstrous).toBeUndefined();
  });
});

describe('the trigger: attacks, blocks, or becomes the target of a spell', () => {
  test('attacks: it deals damage equal to its power to each opponent, and then combat damage', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOY)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [TOY], until: 'declareBlockers' });
    // The trigger (CR 508.1m) has resolved by the declare blockers step: 1, its power. Then combat damage: 1 more.
    g.expect.life(1, 19);
    g.passAll();
    g.expect.life(1, 18);
  });

  test('attacks while monstrous: damage equal to the power it has now (6)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOY, { counters: { '+1/+1': 5 } })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [TOY], until: 'declareBlockers' });
    g.passAll();
    // 6 from the trigger and 6 from combat damage.
    g.expect.life(1, 8);
  });

  test('blocks: when its controller blocks with it, the other player is the opponent who takes the damage', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(TOY)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: TOY, attacker: BEARS }],
      until: 'declareBlockers',
    });
    g.expect.stack([`${TOY} (ability)`]);
    g.passAll();
    g.expect.life(0, 19);
    g.expect.invariants();
  });

  test('becomes the target of a spell: of an opponent\'s spell, before the spell resolves, and the spell does nothing to it (indestructible)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOY)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield('Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [TOY], pay: true });
    // The trigger goes on the stack above the Bolt (CR 603.3): it resolves first.
    g.expect.stack([`${TOY} (ability)`, BOLT]);
    g.passAll();
    g.expect.life(1, 19);
    g.expect.zone(TOY, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('becomes the target of a spell of its own controller too ("a spell": any player)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOY, 'Plains')
      .hand(BOUNCE)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOUNCE, { modes: [1], targets: [TOY], pay: true });
    g.passAll();
    g.expect.life(1, 19);
    g.expect.zone(TOY, 'hand', { seat: 0 });
  });

  test('no attack and no spell: no damage', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOY)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.passAll();
    g.expect.life(1, 20);
  });
});
