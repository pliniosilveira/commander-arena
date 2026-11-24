// The initiative (CR 726): a designation a player can have, one player at most. "You take the initiative" is an effect; the
// three inherent triggered abilities (CR 726.2) have no source: at the beginning of the upkeep of the holder they venture into
// Undercity, whenever one or more creatures a player controls deal combat damage to the holder that player takes the initiative,
// and whenever a player takes it they venture into Undercity. They are controlled by the player who had the initiative as they
// triggered, and go on the stack like any trigger.
// Pins: CR 726.1 (no initiative until an effect says so), 726.2 (the three abilities, no source), 726.3 (one at a time),
// 726.4 (the holder leaves the game: the active player, else the next player in turn order), 726.5 (taking it while holding it
// ventures again and does not create a second designation), 603.3 (triggers use the stack), 510.2 and 120.2 (combat damage),
// 800.4 (players leaving the game), 101.4 (APNAP order).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-initiative.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  type GameEvent,
  getView,
  isFeatureSupported,
  SUPPORTED_FEATURES,
  stateHash,
} from '../src/index';
import { findInitiativeTriggers } from '../src/rules/initiative';
import { scenario } from '../src/testing/index';

const CLAIM = 'SYNTHETIC Initiative Claim'; // {2}{U} sorcery: you take the initiative
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';

type Builder = ReturnType<typeof scenario>;
type Game = ReturnType<Builder['build']>;

const base = (seats: 2 | 3 | 4 = 2, build: (b: Builder) => Builder = (b) => b): Builder => {
  let b = scenario({ seats });
  for (let s = 0; s < seats; s += 1)
    b = b
      .seat(s)
      .life(20)
      .library(...FILLER);
  return build(b);
};

/** Passes priority until the stack is empty again (everybody passes each time). */
const resolveAll = (g: Game, seats = 2): void => {
  for (let i = 0; i < 40 && g.state.stack.length > 0; i += 1) {
    if (g.state.pending?.kind !== 'priority') return;
    for (let s = 0; s < seats && g.state.stack.length > 0; s += 1) g.pass();
  }
};

describe('taking the initiative (CR 726.1, 726.3, 726.5)', () => {
  test('there is no initiative until an effect makes a player take it', () => {
    const g = base().at('precombatMain').build();
    expect(g.state.initiative ?? null).toBeNull();
    expect(getView(g.state, 0).initiative).toBeNull();
    g.expect.initiative(null);
  });

  test('"You take the initiative.": the player has it, and the ability that ventures is on the stack', () => {
    const g = base(2, (b) => b.seat(0).hand(CLAIM).battlefield('Island', { count: 3 }))
      .at('precombatMain')
      .build();
    g.act(0).cast(CLAIM, { pay: true });
    g.pass();
    g.pass();
    g.expect.initiative(0);
    expect(getView(g.state, 1).initiative).toBe(0);
    g.expect.stack(['The initiative (ability)']);
    const top = getView(g.state, 1).stack[0];
    expect(top?.name).toBe('The initiative');
    expect(top?.abilitySource).toBeUndefined();
    expect(top?.oracleText).toBe('Whenever you take the initiative, venture into Undercity.');
    expect(top?.controller).toBe(0);
    g.expect.eventLog([
      { kind: 'initiativeChanged', from: null, to: 0 },
      { kind: 'initiativeTaken', seat: 0 },
    ]);
  });

  test('the ability that resolves ventures into Undercity: the marker is on the topmost room', () => {
    const g = base(2, (b) => b.seat(0).hand(CLAIM).battlefield('Island', { count: 3 }))
      .at('precombatMain')
      .build();
    g.act(0).cast(CLAIM, { pay: true });
    g.pass();
    g.pass();
    g.expect.dungeon(0, null);
    g.pass();
    g.pass();
    g.expect.dungeon(0, 'secret-entrance');
    expect(getView(g.state, 1).seats[0]?.dungeon?.name).toBe('Undercity');
    expect(getView(g.state, 1).seats[0]?.dungeon?.leadsTo).toEqual(['forge', 'lost-well']);
    g.expect.dungeon(1, null);
    g.expect.eventLog([{ kind: 'ventured', seat: 0, room: 'secret-entrance', from: null }]);
  });

  test('taking it while holding it ventures again and does not move the designation (CR 726.5)', () => {
    const g = base(2, (b) => b.seat(0).hand(CLAIM).battlefield('Island', { count: 3 }))
      .at('precombatMain', { initiative: 0 })
      .build();
    g.act(0).cast(CLAIM, { pay: true });
    g.pass();
    g.pass();
    g.expect.initiative(0);
    g.expect.noEvent({ kind: 'initiativeChanged' });
    g.expect.stack(['The initiative (ability)']);
    g.pass();
    g.pass();
    g.expect.dungeon(0, 'secret-entrance');
  });

  test('a second player taking it takes it from the first, who ceases to have it (CR 726.3)', () => {
    const g = base(2, (b) => b.seat(1).hand(CLAIM).battlefield('Island', { count: 3 }))
      .at('precombatMain', { initiative: 0, active: 1, turn: 2 })
      .build();
    g.act(1).cast(CLAIM, { pay: true });
    g.pass();
    g.pass();
    g.expect.initiative(1);
    g.expect.eventLog([{ kind: 'initiativeChanged', from: 0, to: 1 }]);
    g.pass();
    g.pass();
    g.expect.dungeon(1, 'secret-entrance');
    g.expect.dungeon(0, null);
  });

  test('replaying the same actions gives the same hash', () => {
    const play = () => {
      const g = base(2, (b) => b.seat(0).hand(CLAIM).battlefield('Island', { count: 3 }))
        .at('precombatMain')
        .build();
      g.act(0).cast(CLAIM, { pay: true });
      resolveAll(g);
      return stateHash(g.state);
    };
    expect(play()).toBe(play());
  });
});

describe('the upkeep of the player who has the initiative (CR 726.2)', () => {
  test('at the beginning of their upkeep they venture into Undercity', () => {
    const g = base().at('postcombatMain', { initiative: 0 }).build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack(['The initiative (ability)']);
    expect(getView(g.state, 0).stack[0]?.oracleText).toBe(
      'At the beginning of your upkeep, venture into Undercity.',
    );
    g.pass();
    g.pass();
    g.expect.dungeon(0, 'secret-entrance');
  });

  test('not at the upkeep of another player', () => {
    const g = base().at('postcombatMain', { initiative: 0 }).build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    g.expect.stack([]);
  });

  test('without the initiative nothing triggers', () => {
    const g = base().at('postcombatMain').build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([]);
  });
});

describe('creatures deal combat damage to the player who has the initiative (CR 726.2)', () => {
  const attack = (seats: 2 | 3 | 4 = 2, extra: (b: Builder) => Builder = (b) => b) =>
    extra(base(seats, (b) => b.seat(0).battlefield(BEARS)))
      .at('precombatMain', { initiative: 1 })
      .build();

  test('their controller takes the initiative through a trigger of the holder, then ventures', () => {
    const g = attack();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.life(1, 18);
    g.expect.stack(['The initiative (ability)']);
    // The trigger is the holder's (CR 726.2: controlled by the player who had the initiative as it triggered).
    expect(g.state.objects[g.state.stack[0] ?? 'o0']?.controller).toBe(1);
    expect(getView(g.state, 0).stack[0]?.oracleText).toBe(
      'Whenever one or more creatures a player controls deal combat damage to you, that player takes the initiative.',
    );
    g.expect.initiative(1);
    resolveAll(g);
    g.expect.initiative(0);
    g.expect.dungeon(0, 'secret-entrance');
    g.expect.dungeon(1, null);
    g.expect.eventLog([
      { kind: 'initiativeChanged', from: 1, to: 0 },
      { kind: 'initiativeTaken', seat: 0 },
    ]);
  });

  test('two creatures of one player dealing damage together are one ability (one or more creatures)', () => {
    const g = attack(2, (b) => b.seat(0).battlefield('Typhoid Rats'));
    g.playCombat({ attack: [BEARS, 'Typhoid Rats'], until: 'combatDamage' });
    g.expect.life(1, 17);
    g.expect.stack(['The initiative (ability)']);
  });

  test('damage to a player who does not have the initiative does nothing', () => {
    const g = base(2, (b) => b.seat(0).battlefield(BEARS))
      .at('precombatMain', { initiative: 0 })
      .build();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.life(1, 18);
    g.expect.stack([]);
    g.expect.initiative(0);
  });

  test('a blocked creature deals damage to the blocker, not to the player: nothing happens', () => {
    const g = attack(2, (b) => b.seat(1).battlefield('Typhoid Rats'));
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
    const g = base(2, (b) => b.seat(0).hand('Lightning Bolt').battlefield('Mountain'))
      .at('precombatMain', { initiative: 1 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.pass();
    g.pass();
    g.expect.life(1, 17);
    g.expect.stack([]);
    g.expect.initiative(1);
  });

  test('with three seats the player whose creatures dealt the damage takes it, whichever seat that is', () => {
    const g = attack(3, (b) => b.seat(2).battlefield('Typhoid Rats'));
    g.playCombat({ attack: [{ attacker: BEARS, target: { player: 1 } }], until: 'combatDamage' });
    g.expect.stack(['The initiative (ability)']);
    resolveAll(g, 3);
    g.expect.initiative(0);
    g.expect.dungeon(0, 'secret-entrance');
    g.expect.dungeon(2, null);
  });

  test('with four seats: the holder is a third opponent, and the attacker takes it', () => {
    const g = base(4, (b) => b.seat(1).battlefield(BEARS))
      .at('precombatMain', { initiative: 3, active: 1, turn: 2 })
      .build();
    g.playCombat({
      attack: [{ attacker: BEARS, target: { player: 3 } }],
      until: 'combatDamage',
    });
    g.expect.life(3, 18);
    g.expect.stack(['The initiative (ability)']);
    resolveAll(g, 4);
    g.expect.initiative(1);
    g.expect.dungeon(1, 'secret-entrance');
  });

  test('the creature that left the battlefield: its controller as it last was takes it (CR 608.2h)', () => {
    const g = attack(2, (b) => b.seat(1).hand('Murder').battlefield('Swamp', { count: 3 }));
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.stack(['The initiative (ability)']);
    g.pass(0);
    g.act(1).cast('Murder', { targets: [{ name: BEARS }], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard');
    resolveAll(g);
    g.expect.initiative(0);
  });

  test('creatures of two players dealing combat damage together make one ability for each player, in turn', () => {
    // CR 510.2: combat damage is dealt at once; "a player controls" names each player, so each takes the initiative in turn (APNAP,
    // CR 101.4, is for the choice of order, which the holder, who controls all of them, makes). Events are made by hand: two controllers
    // never deal combat damage to the same player at once in a real combat unless control changes in it.
    const g = base(3, (b) => b.seat(1).battlefield(BEARS).seat(2).battlefield('Typhoid Rats'))
      .at('precombatMain', { initiative: 0 })
      .build();
    const bears = g.id(BEARS);
    const rats = g.id('Typhoid Rats');
    const dealt = (source: string): GameEvent => ({
      kind: 'damageDealt',
      source: source as never,
      to: { kind: 'player', seat: 0 },
      amount: 2,
      combat: true,
    });
    const found = findInitiativeTriggers(g.state, [dealt(bears), dealt(rats)]);
    expect(found.map((t) => [t.inherent, t.controller, t.player])).toEqual([
      ['initiativeDamage', 0, 1],
      ['initiativeDamage', 0, 2],
    ]);
  });

  test('replaying the same actions gives the same hash', () => {
    const play = () => {
      const g = attack();
      g.playCombat({ attack: [BEARS], until: 'combatDamage' });
      resolveAll(g);
      return stateHash(g.state);
    };
    expect(play()).toBe(play());
  });
});

describe('the player who has the initiative leaves the game (CR 726.4)', () => {
  test('the active player takes it as the holder concedes, and ventures', () => {
    const g = base().at('precombatMain', { initiative: 1, priority: 1 }).build();
    g.act(1).concede();
    g.expect.hasLost(1);
    g.expect.initiative(0);
    g.expect.eventLog([
      { kind: 'initiativeChanged', from: 1, to: 0 },
      { kind: 'initiativeTaken', seat: 0 },
    ]);
  });

  test('the active player conceding while holding it: the next player in turn order takes it', () => {
    const g = base(3).at('precombatMain', { initiative: 0 }).build();
    g.act(0).concede();
    g.expect.initiative(1);
  });

  test('a holder who loses to state-based actions hands it on too', () => {
    const g = base(2, (b) => b.seat(0).life(1))
      .at('precombatMain', { initiative: 0, active: 1, turn: 2 })
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.pass();
    g.pass();
    g.expect.hasLost(0);
    g.expect.initiative(1);
  });

  test('with four seats the next player still in the game', () => {
    const g = base(4).at('precombatMain', { initiative: 1, priority: 1 }).build();
    g.act(1).concede();
    g.expect.initiative(0);
    const h = base(4).at('precombatMain', { initiative: 0 }).build();
    h.act(0).concede();
    h.expect.initiative(1);
  });

  test('a player who does not have it concedes: nothing changes', () => {
    const g = base().at('precombatMain', { priority: 1 }).build();
    g.act(1).concede();
    g.expect.initiative(null);
    g.expect.noEvent({ kind: 'initiativeChanged' });
  });
});

describe('the engine reports it (CR 726)', () => {
  test('feature ids', () => {
    expect(SUPPORTED_FEATURES.effectKinds).toContain('takeInitiative');
    expect(SUPPORTED_FEATURES.effectKinds).toContain('ventureIntoDungeon');
    expect(isFeatureSupported('effect:takeInitiative')).toBe(true);
    expect(isFeatureSupported('effect:ventureIntoDungeon')).toBe(true);
  });

  test('the decision to choose a room cannot be answered with another room', () => {
    const g = base(2, (b) =>
      b
        .seat(0)
        .hand('SYNTHETIC Undercity Dive')
        .battlefield('Island', { count: 2 })
        .inUndercity('secret-entrance'),
    )
      .at('precombatMain')
      .build();
    g.act(0).cast('SYNTHETIC Undercity Dive', { pay: true });
    g.pass();
    g.pass();
    expect(g.state.pending?.kind).toBe('chooseOption');
    expect(applyAction(g.state, 0, { kind: 'chooseOption', option: 'archives' }).ok).toBe(false);
  });
});
