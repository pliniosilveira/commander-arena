// "Whenever a source you control deals noncombat damage to an opponent, you draw that many cards." (D-942): the trigger `noncombatDamageDealt`, with
// "that much" (`triggerDamage`) and the player damaged (`triggerPlayer`).
// Pins: CR 120.2b (damage as an effect of a spell or ability: any object can be the source), CR 120.2a (combat damage is not it), CR 603.2 and 603.2c
// (one trigger for each event, and for each occurrence of an event), CR 603.2g (damage that is entirely prevented triggers nothing), CR 113.7a
// (the controller of a source is read as it is, or as it last was), CR 120.3 (a creature damaged is not a player damaged).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-niv-draw.ts, synthetic-damage-order.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SCRIBE = 'SYNTHETIC Spark Scribe'; // by you, to an opponent: draw that many cards
const RIVAL = 'SYNTHETIC Rival Scribe'; // by any, to a player: gain that much life
const ECHO = 'SYNTHETIC Echo Scribe'; // by you, to a player: that player loses 1 life
const PINGER = 'SYNTHETIC Spark Pinger'; // {T}: 2 damage to any target
const WAVE = 'SYNTHETIC Scorch Wave'; // sorcery: 2 damage to each opponent
const BOLT = 'Lightning Bolt'; // 3 damage to any target
const SHIELD5 = 'SYNTHETIC Shield Five'; // prevent the next 5 damage to any target this turn
const SHIELD2 = 'SYNTHETIC Shield Two'; // prevent the next 2 damage to any target this turn
const BEAR = 'SYNTHETIC Vanilla 2/2';

const LIBRARY = Array.from({ length: 12 }, () => 'Forest');

/** Seat 0 with `mine` on the battlefield and `hand` in hand, lands for several spells, a full library; seat 1 with `theirs`. */
function build(
  mine: readonly string[],
  hand: readonly string[] = [],
  theirs: readonly string[] = [],
) {
  return scenario()
    .seat(0)
    .life(20)
    .library(...LIBRARY)
    .hand(...hand)
    .battlefield(...mine)
    .battlefield('Mountain', { count: 6 })
    .seat(1)
    .life(20)
    .library(...LIBRARY)
    .hand(BOLT)
    .battlefield(...theirs)
    .battlefield('Mountain', { count: 3 })
    .at('precombatMain')
    .build();
}

describe('noncombat damage dealt to an opponent by a source you control draws that many cards', () => {
  test('a spell: three damage from a Lightning Bolt draws three cards', () => {
    const g = build([SCRIBE], [BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.handSize(0, 3);
    g.expect.librarySize(0, 9);
  });

  test('the trigger goes on the stack after the spell resolved, with the amount of that damage', () => {
    const g = build([SCRIBE], [BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).pass();
    g.expect.life(1, 17);
    g.expect.stack([`${SCRIBE} (ability)`]);
    g.expect.handSize(0, 0);
    g.passAll();
    g.expect.handSize(0, 3);
  });

  test('an ability of a permanent: the Pinger deals 2, so two cards are drawn', () => {
    const g = build([SCRIBE, PINGER]);
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 18);
    g.expect.handSize(0, 2);
  });

  test('each source triggers it on its own, with its own amount: a Bolt and a ping draw 3 and 2', () => {
    const g = build([SCRIBE, PINGER], [BOLT]);
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 5);
  });

  test('two watchers each trigger once for the same damage (CR 603.2c)', () => {
    const g = build([SCRIBE, SCRIBE], [BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).pass();
    // Two triggers of one player: they choose the order (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.handSize(0, 6);
  });

  test('"each opponent": the damage the spell deals to the opponent is one event, one trigger', () => {
    const g = build([SCRIBE], [WAVE]);
    g.act(0).cast(WAVE, { pay: true });
    g.act(0).pass();
    g.act(1).pass();
    g.expect.life(1, 18);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.handSize(0, 2);
  });
});

describe('what does not trigger it', () => {
  test('combat damage (CR 120.2a)', () => {
    const g = build([SCRIBE, BEAR]);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BEAR, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.life(1, 18);
    g.expect.handSize(0, 0);
  });

  test('noncombat damage to a creature (CR 120.3)', () => {
    const g = build([SCRIBE], [BOLT], [BEAR]);
    g.act(0).cast(BOLT, { targets: [{ name: BEAR, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'graveyard', { seat: 1 });
    g.expect.handSize(0, 0);
  });

  test('damage to yourself: you are not an opponent', () => {
    const g = build([SCRIBE], [BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 17);
    g.expect.handSize(0, 0);
  });

  test("damage that a source an opponent controls deals to that opponent's own face is not a source you control", () => {
    const g = build([SCRIBE]);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.handSize(0, 0);
  });

  test('a source an opponent controls that damages me is not a source I control (and I am not an opponent of myself)', () => {
    const g = build([SCRIBE]);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 17);
    g.expect.handSize(0, 0);
  });

  test('damage that is entirely prevented is not dealt (CR 603.2g)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(SCRIBE)
      .battlefield('Mountain', { count: 3 })
      .hand(BOLT)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(SHIELD5)
      .battlefield('Plains', { count: 1 })
      .at('precombatMain')
      .build();
    g.act(0).pass();
    g.act(1).cast(SHIELD5, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 20);
    g.expect.handSize(0, 0);
  });

  test('damage that is partly prevented triggers with the part that was dealt', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(SCRIBE)
      .battlefield('Mountain', { count: 3 })
      .hand(BOLT)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(SHIELD2)
      .battlefield('Plains', { count: 1 })
      .at('precombatMain')
      .build();
    g.act(0).pass();
    g.act(1).cast(SHIELD2, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 19);
    g.expect.handSize(0, 1);
  });

  test("a watcher of an opponent's is not triggered by my damage", () => {
    const g = build([], [BOLT], [SCRIBE]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(1, 1); // the card it started with (the Bolt); nothing was drawn
    g.expect.zone('Forest', 'hand', { seat: 1, count: 0 });
  });
});

describe('the other shapes: any source, any player, and "that player"', () => {
  test('"a source" and "a player": my damage to myself and an opponent damage to anyone trigger it', () => {
    const g = build([RIVAL], [BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 20 - 3 + 3);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 23);
    g.expect.life(1, 17);
  });

  test('it still ignores combat damage and damage to a creature', () => {
    const g = build([RIVAL], [BOLT], [BEAR]);
    g.act(0).cast(BOLT, { targets: [{ name: BEAR, seat: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 20);
  });

  test('"that player" is the player damaged (triggerPlayer)', () => {
    const g = build([ECHO], [BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 16); // 3 damage and 1 life lost
    g.expect.life(0, 20);
  });

  test('"a player" with "you" as the source also sees my own damage to myself, and that player loses the life', () => {
    const g = build([ECHO], [BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 16);
  });
});

describe('validation', () => {
  const withTrigger = (trigger: unknown, effect: unknown) => ({
    ...syntheticCard(SCRIBE),
    faces: [
      {
        ...syntheticCard(SCRIBE).faces[0],
        abilities: [{ kind: 'triggered', trigger, effect }],
      },
    ],
  });
  const draw = { kind: 'draw', player: { kind: 'you' }, count: { kind: 'triggerDamage' } };

  test('the fixture cards are valid', () => {
    for (const name of [SCRIBE, RIVAL, ECHO, PINGER, WAVE]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('by and to are known', () => {
    for (const trigger of [
      { kind: 'noncombatDamageDealt', by: 'opponent', to: 'opponent' },
      { kind: 'noncombatDamageDealt', by: 'you', to: 'creature' },
      { kind: 'noncombatDamageDealt', to: 'opponent' },
      { kind: 'noncombatDamageDealt', by: 'you' },
    ]) {
      expect(
        validateCard(withTrigger(trigger, draw) as never).length,
        JSON.stringify(trigger),
      ).toBeGreaterThan(0);
    }
  });

  test('"that much" is allowed in its ability, and not in a trigger with no amount', () => {
    const own = { kind: 'noncombatDamageDealt', by: 'you', to: 'opponent' };
    expect(validateCard(withTrigger(own, draw) as never)).toEqual([]);
    expect(validateCard(withTrigger({ kind: 'landfall' }, draw) as never).length).toBeGreaterThan(
      0,
    );
  });
});
