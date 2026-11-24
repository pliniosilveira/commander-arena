// The initiative (CR 726): a designation a player can have, one player at most. "You take the initiative" is an effect; the player with the initiative ventures into Undercity at the
// beginning of their upkeep, a player who takes it ventures into Undercity, and a player whose creatures deal combat damage to the player who has it takes it. The three inherent
// triggered abilities have no source (CR 726.2): they go on the stack like any trigger, controlled by the player who had the initiative as they triggered.
// Pins: CR 726.1 (no initiative until an effect says so), 726.2 (the three abilities, no source, one occurrence for one or more creatures a player controls), 726.3 (one at a time: the
// old holder ceases to have it), 726.4 (the holder leaves the game: the active player takes it, else the next player in turn order, and ventures), 726.5 (taking it again: no second
// designation, the venture triggers), 603.3 (triggers use the stack), 510.2 and 120.2 (combat damage), 101.4 (APNAP), 800.4 (a player leaving).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-initiative.ts) or real fixtures. The venture itself is tested in scenario-xx-undercity.test.ts.
import { describe, expect, test } from 'vitest';
import { type GameEvent, getView, isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { findInitiativeTriggers } from '../src/rules/initiative';
import { createDriver, type ScenarioGame, scenario } from '../src/testing/index';

const HERALD = 'SYNTHETIC Initiative Herald'; // {2}{W} 2/2: when it enters, you take the initiative
const FLASH = 'SYNTHETIC Initiative Flash'; // {1}{W} instant: you take the initiative
const GIFT = 'SYNTHETIC Initiative Gift'; // {1}{W} sorcery: target player takes the initiative
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

/** `seats` players, each with a library of Plains (so Secret Entrance has a basic land to find). */
function table(seats: 2 | 3 | 4, build: (b: Builder) => Builder = (b) => b): Builder {
  let b = scenario({ seats }).seat(0).life(20).library(...FILLER);
  for (let seat = 1; seat < seats; seat += 1) b = b.seat(seat).life(20).library(...FILLER);
  return build(b);
}

/** Passes priority until the stack is empty again. A room question is answered with the first room offered. */
function resolveAll(g: ScenarioGame): void {
  for (let i = 0; i < 40; i += 1) {
    const d = g.state.pending;
    if (d?.kind === 'chooseOption' && d.purpose === 'dungeonRoom') {
      g.act(d.seat).chooseOption(d.options[0] ?? '');
      continue;
    }
    if (d?.kind === 'chooseCards') {
      g.act(d.seat).chooseCards(...d.legal.slice(0, d.min).map((id) => ({ id })));
      continue;
    }
    if (d?.kind === 'targets') {
      const first = d.specs[0]?.legal[0];
      if (first === undefined) throw new Error('no legal target');
      g.act(d.seat).chooseTargets(first.kind === 'player' ? { player: first.seat } : { id: first.id });
      continue;
    }
    if (g.state.stack.length === 0 && d?.kind === 'priority') return;
    g.pass();
  }
  throw new Error('the stack did not settle');
}

describe('taking the initiative (CR 726.1, 726.3, 726.5)', () => {
  test('there is no initiative until an effect makes a player take it', () => {
    const g = table(2).at('precombatMain').build();
    expect(g.state.initiative).toBeUndefined();
    expect(getView(g.state, 0).initiative).toBeUndefined();
    g.expect.initiative(null);
    g.expect.dungeon(0, null);
  });

  test('a spell: the player has the initiative at once and the venture it triggers is on the stack, named "The initiative"', () => {
    const g = table(2, (b) => b.seat(0).hand(FLASH).battlefield('Plains', { count: 2 }))
      .at('precombatMain')
      .build();
    g.act(0).cast(FLASH, { pay: true });
    g.pass();
    g.pass();
    g.expect.initiative(0);
    g.expect.dungeon(0, null);
    g.expect.eventLog([{ kind: 'initiativeTaken', seat: 0, from: null }]);
    g.expect.stack(['The initiative (ability)']);
    const top = getView(g.state, 1).stack[0];
    expect(top?.name).toBe('The initiative');
    expect(top?.abilitySource).toBeUndefined();
    expect(top?.oracleText).toBe('Whenever a player takes the initiative, that player ventures into Undercity.');
    expect(top?.controller).toBe(0);
    expect(getView(g.state, 1).initiative).toBe(0);
    resolveAll(g);
    // Taking it ventured: Undercity is in the command zone with the marker on Secret Entrance (CR 701.49a, 309.4a).
    g.expect.initiative(0);
    g.expect.dungeon(0, 'secretEntrance');
    expect(getView(g.state, 1).seats[0]?.dungeon?.roomName).toBe('Secret Entrance');
  });

  test('"When ~ enters, you take the initiative.": the trigger resolves and the controller has it', () => {
    const g = table(2, (b) => b.seat(0).hand(HERALD).battlefield('Plains', { count: 3 }))
      .at('precombatMain')
      .build();
    g.act(0).cast(HERALD, { pay: true });
    resolveAll(g);
    g.expect.initiative(0);
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.zone(HERALD, 'battlefield');
  });

  test('taking it while already holding it changes nothing but still ventures (CR 726.5)', () => {
    const g = table(2, (b) => b.seat(0).hand(FLASH).battlefield('Plains', { count: 2 }).dungeon('forge'))
      .at('precombatMain', { initiative: 0 })
      .build();
    g.act(0).cast(FLASH, { pay: true });
    g.pass();
    g.pass();
    g.expect.initiative(0);
    g.expect.eventLog([{ kind: 'initiativeTaken', seat: 0, from: 0 }]);
    g.expect.stack(['The initiative (ability)']);
    resolveAll(g);
    // From Forge a venture moves on (a choice of Trap! and Arena, answered with the first); it does not start a second dungeon.
    g.expect.dungeon(0, 'trap');
    g.expect.initiative(0);
  });

  test('"Target player takes the initiative.": the old holder ceases to have it and the new one ventures (CR 726.3)', () => {
    const g = table(2, (b) => b.seat(0).hand(GIFT).battlefield('Plains', { count: 2 }))
      .at('precombatMain', { initiative: 0 })
      .build();
    g.act(0).cast(GIFT, { targets: [{ player: 1 }], pay: true });
    g.pass();
    g.pass();
    g.expect.initiative(1);
    g.expect.eventLog([{ kind: 'initiativeTaken', seat: 1, from: 0 }]);
    // The venture trigger is the new holder's: seat 1 enters Undercity, seat 0 does nothing.
    expect(g.state.objects[g.state.stack[0] ?? 'o0']?.controller).toBe(1);
    resolveAll(g);
    g.expect.dungeon(1, 'secretEntrance');
    g.expect.dungeon(0, null);
  });

  test('the target may be a player who is not an opponent: the caster takes it with "target player"', () => {
    const g = table(2, (b) => b.seat(0).hand(GIFT).battlefield('Plains', { count: 2 }))
      .at('precombatMain')
      .build();
    g.act(0).cast(GIFT, { targets: [{ player: 0 }], pay: true });
    g.pass();
    g.pass();
    g.expect.initiative(0);
  });

  test('the effect names exactly one player: validation refuses every player', () => {
    const card = syntheticCard(GIFT);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        { ...face, spell: { effect: { kind: 'takeInitiative', player: { kind: 'eachPlayer' } } } },
      ],
    } as never;
    expect(JSON.stringify(validateCard(bad))).toContain('only one player can have the initiative');
    expect(isFeatureSupported('effect:takeInitiative')).toBe(true);
    expect(isFeatureSupported('effect:venture')).toBe(true);
  });
});

describe('the upkeep of the player who has the initiative (CR 726.2)', () => {
  test('they venture into Undercity at the beginning of their upkeep, named "The initiative"', () => {
    const g = table(2).at('end', { initiative: 0, active: 1, turn: 2 }).build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    g.expect.stack(['The initiative (ability)']);
    const top = getView(g.state, 0).stack[0];
    expect(top?.oracleText).toBe(
      'At the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity.',
    );
    expect(top?.controller).toBe(0);
    resolveAll(g);
    g.expect.dungeon(0, 'secretEntrance');
  });

  test('only at the upkeep of the holder, not at the upkeep of another player', () => {
    const g = table(2).at('end', { initiative: 1, active: 1, turn: 2 }).build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    g.expect.stack([]);
    g.expect.dungeon(0, null);
    g.expect.dungeon(1, null);
  });

  test('every turn of the holder: the marker moves one room down each upkeep', () => {
    const g = table(2).at('end', { initiative: 0, active: 1, turn: 2 }).build();
    g.advanceTo('upkeep', { turn: 'next' });
    resolveAll(g);
    g.expect.dungeon(0, 'secretEntrance');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    resolveAll(g);
    // Forge: the first exit of Secret Entrance, as the question is answered with the first room offered.
    g.expect.dungeon(0, 'forge');
  });

  test('with three seats only the holder ventures at the start of their own upkeep', () => {
    const g = table(3).at('end', { initiative: 2, active: 1, turn: 2 }).build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 2 });
    g.expect.stack(['The initiative (ability)']);
    resolveAll(g);
    g.expect.dungeon(2, 'secretEntrance');
    g.expect.dungeon(0, null);
    g.expect.dungeon(1, null);
  });
});

describe('creatures deal combat damage to the player who has the initiative (CR 726.2)', () => {
  test('the controller of the creatures takes it: the trigger is the old holder’s, and the new holder ventures', () => {
    const g = table(2, (b) => b.seat(0).battlefield(BEARS))
      .at('precombatMain', { initiative: 1 })
      .build();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.life(1, 18);
    g.expect.stack(['The initiative (ability)']);
    expect(g.state.objects[g.state.stack[0] ?? 'o0']?.controller).toBe(1);
    expect(getView(g.state, 0).stack[0]?.oracleText).toBe(
      'Whenever one or more creatures a player controls deal combat damage to the player who has the initiative, the controller of those creatures takes the initiative.',
    );
    g.expect.initiative(1);
    resolveAll(g);
    g.expect.initiative(0);
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.dungeon(1, null);
    g.expect.eventLog([{ kind: 'initiativeTaken', seat: 0, from: 1 }]);
  });

  test('two creatures of the same player are one occurrence: one trigger, one venture', () => {
    const g = table(2, (b) => b.seat(0).battlefield(BEARS).battlefield(ELVES))
      .at('precombatMain', { initiative: 1 })
      .build();
    g.playCombat({ attack: [BEARS, ELVES], until: 'combatDamage' });
    g.expect.stack(['The initiative (ability)']);
    resolveAll(g);
    g.expect.initiative(0);
    g.expect.dungeon(0, 'secretEntrance');
  });

  test('damage to a player who does not have the initiative does nothing', () => {
    const g = table(2, (b) => b.seat(0).battlefield(BEARS))
      .at('precombatMain', { initiative: 0 })
      .build();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.life(1, 18);
    g.expect.stack([]);
    g.expect.initiative(0);
  });

  test('damage to a creature the holder controls (a blocked creature) does nothing', () => {
    const g = table(2, (b) => b.seat(0).battlefield(BEARS).seat(1).battlefield('Typhoid Rats'))
      .at('precombatMain', { initiative: 1 })
      .build();
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: 'Typhoid Rats', attacker: BEARS }],
      until: 'combatDamage',
    });
    g.expect.life(1, 20);
    g.expect.stack([]);
    g.expect.initiative(1);
  });

  test('damage that is not combat damage does nothing: a spell’s damage to the holder', () => {
    const g = table(2, (b) => b.seat(0).hand('Lightning Bolt').battlefield('Mountain'))
      .at('precombatMain', { initiative: 1 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.pass();
    g.pass();
    g.expect.life(1, 17);
    g.expect.stack([]);
    g.expect.initiative(1);
  });

  test('with three seats the creatures of the third player take it from the second, and the first player is not involved', () => {
    const g = table(3, (b) => b.seat(2).battlefield(BEARS))
      .at('precombatMain', { initiative: 1, active: 2, turn: 3 })
      .build();
    g.playCombat({ attack: [{ attacker: BEARS, target: { player: 1 } }], until: 'combatDamage' });
    g.expect.stack(['The initiative (ability)']);
    expect(g.state.objects[g.state.stack[0] ?? 'o0']?.controller).toBe(1);
    resolveAll(g);
    g.expect.initiative(2);
    g.expect.dungeon(2, 'secretEntrance');
    g.expect.dungeon(0, null);
    g.expect.dungeon(1, null);
  });

  test('with four seats the creatures of the active player take it from the holder; the other seats are not involved', () => {
    const g = table(4, (b) => b.seat(0).battlefield(BEARS).seat(2).battlefield(ELVES))
      .at('precombatMain', { initiative: 1, active: 0, turn: 4 })
      .build();
    g.playCombat({ attack: [{ attacker: BEARS, target: { player: 1 } }], until: 'combatDamage' });
    g.expect.stack(['The initiative (ability)']);
    resolveAll(g);
    g.expect.initiative(0);
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.dungeon(1, null);
    g.expect.dungeon(2, null);
    g.expect.dungeon(3, null);
  });

  test('creatures of two players deal damage to the holder together: one trigger for each player, the holder orders them and the last to resolve keeps it', () => {
    const g = table(3, (b) => b.seat(0).battlefield(BEARS).battlefield(ELVES).seat(2).battlefield('Giant Spider'))
      .at('precombatMain', { initiative: 1, active: 0, turn: 3 })
      .build();
    const damage = (label: string, seat: number): GameEvent => ({
      kind: 'damageDealt',
      source: g.id({ name: label, seat }),
      to: { kind: 'player', seat: 1 },
      amount: 2,
      combat: true,
    });
    // Two creatures of seat 0 and one of seat 2 (the combat of an effect that lets both players' creatures attack): one occurrence for each controller (CR 603.2c).
    const found = findInitiativeTriggers(g.state, [
      damage(BEARS, 0),
      damage(ELVES, 0),
      damage('Giant Spider', 2),
    ]);
    expect(found.map((t) => [t.controller, t.player])).toEqual([
      [1, 0],
      [1, 2],
    ]);
    const d = createDriver({ ...g.state, pendingTriggers: found });
    d.pass();
    d.expect.pending('orderTriggers', 1);
    // The first listed goes on the stack first and resolves last: seat 0's, so seat 2 takes it first and seat 0 last.
    d.act(1).orderTriggers(0, 1);
    resolveAll(d);
    d.expect.initiative(0);
    d.expect.dungeon(0, 'secretEntrance');
    d.expect.dungeon(2, 'secretEntrance');
    d.expect.dungeon(1, null);
    // The other order: seat 2 keeps it.
    const e = createDriver({ ...g.state, pendingTriggers: found });
    e.pass();
    e.act(1).orderTriggers(1, 0);
    resolveAll(e);
    e.expect.initiative(2);
  });
});

/** `seat` concedes: priority is passed (the stack is empty) to the seat first. */
function concedeAs(g: ScenarioGame, seat: number): void {
  for (let i = 0; i < 8 && g.deciding !== seat; i += 1) g.pass();
  g.act(seat).concede();
}

describe('the holder leaves the game (CR 726.4)', () => {
  test('the active player takes the initiative as the holder leaves, and ventures', () => {
    const g = table(3).at('precombatMain', { initiative: 2, active: 0, priority: 2 }).build();
    g.act(2).concede();
    g.expect.initiative(0);
    g.expect.eventLog([{ kind: 'initiativeTaken', seat: 0, from: 2 }]);
    g.expect.hasLost(2, true);
    resolveAll(g);
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.dungeon(1, null);
  });

  test('when the active player is the holder who leaves, the next player in turn order takes it', () => {
    const g = table(4).at('precombatMain', { initiative: 1, active: 1, turn: 2 }).build();
    g.act(1).concede();
    g.expect.initiative(2);
    resolveAll(g);
    g.expect.dungeon(2, 'secretEntrance');
  });

  test('the next player in turn order skips a player who has left already (four seats)', () => {
    const g = table(4).at('precombatMain', { initiative: 1, active: 1, turn: 2, priority: 2 }).build();
    g.act(2).concede();
    g.expect.initiative(1);
    concedeAs(g, 1);
    g.expect.initiative(3);
    resolveAll(g);
    g.expect.dungeon(3, 'secretEntrance');
  });

  test('a player who does not have the initiative leaving changes nothing', () => {
    const g = table(3).at('precombatMain', { initiative: 1, active: 0, priority: 2 }).build();
    g.act(2).concede();
    g.expect.initiative(1);
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'initiativeTaken' });
  });

  test('a holder who loses the game by an effect (life 0) hands it on as well', () => {
    const g = table(3, (b) => b.seat(1).life(0)).at('precombatMain', { initiative: 1, active: 0 }).build();
    g.pass();
    g.expect.hasLost(1, true);
    g.expect.initiative(0);
  });
});
