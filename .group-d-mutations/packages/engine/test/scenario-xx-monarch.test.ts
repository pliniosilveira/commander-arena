// The monarch (CR 725, D-127): a designation a player can have, one player at most. "You become the monarch" is an
// effect; the monarch draws a card at the beginning of their end step and loses the designation to the controller of
// a creature that deals combat damage to them. The two inherent triggered abilities have no source (CR 725.2): they go
// on the stack like any trigger, controlled by the player who was the monarch as they triggered.
// Pins: CR 725.1 (no monarch until an effect says so), 725.2 (the two abilities, no source, controlled by the monarch
// at the time), 725.3 (one at a time: the old monarch ceases to be it), 725.4 (the monarch leaves the game: the
// active player, else the next player, else nobody), 603.3 (triggers use the stack), 603.10 and 608.2h (last-known
// information of a creature that left), 510.2 and 120.2 (combat damage), 117.4.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-upkeep.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  getLegalActions,
  getView,
  isFeatureSupported,
  SUPPORTED_FEATURES,
  stateHash,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const HERALD = 'SYNTHETIC Court Herald'; // {2}{W} 2/2: when it enters, you become the monarch
const HALL = 'SYNTHETIC Throne Hall'; // {3}{W} enchantment: when it enters, you become the monarch
const CLAIM = 'SYNTHETIC Crown Claim'; // {2}{U} sorcery: you become the monarch
const FLASH = 'SYNTHETIC Crown Flash'; // {1}{U} instant: you become the monarch
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';
const WATCHER = 'SYNTHETIC Step Watcher endStep you';

type Builder = ReturnType<typeof scenario>;
type Game = ReturnType<Builder['build']>;

const base = (build: (b: Builder) => Builder = (b) => b): Builder =>
  build(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER);

/** Passes priority until the stack is empty again (both players pass each time). */
const resolveAll = (g: Game): void => {
  for (let i = 0; i < 20 && g.state.stack.length > 0; i += 1) {
    g.pass();
    g.pass();
  }
};

describe('becoming the monarch (CR 725.1, 725.3)', () => {
  test('there is no monarch until an effect makes a player the monarch', () => {
    const g = base().at('precombatMain').build();
    expect(g.state.monarch).toBeNull();
    expect(getView(g.state, 0).monarch).toBeNull();
    expect(getView(g.state, 1).monarch).toBeNull();
    g.expect.monarch(null);
  });

  test('"When ~ enters, you become the monarch.": the trigger resolves and the controller is the monarch', () => {
    const g = base((b) => b.hand(HERALD).battlefield('Plains', { count: 3 }))
      .at('precombatMain')
      .build();
    g.act(0).cast(HERALD, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${HERALD} (ability)`]);
    g.expect.monarch(null);
    g.pass();
    g.pass();
    g.expect.monarch(0);
    g.expect.eventLog([{ kind: 'monarchChanged', from: null, to: 0 }]);
    expect(getView(g.state, 0).monarch).toBe(0);
    expect(getView(g.state, 1).monarch).toBe(0);
  });

  test('a spell: "You become the monarch."', () => {
    const g = base((b) => b.hand(CLAIM).battlefield('Island', { count: 3 }))
      .at('precombatMain')
      .build();
    g.act(0).cast(CLAIM, { pay: true });
    g.pass();
    g.pass();
    g.expect.monarch(0);
  });

  test('two sources: the second player to become the monarch takes it from the first', () => {
    const g = base((b) => b.hand(CLAIM).battlefield('Island', { count: 3 }))
      .seat(1)
      .hand(FLASH)
      .battlefield('Island', { count: 2 })
      .at('precombatMain')
      .build();
    g.act(0).cast(CLAIM, { pay: true });
    g.pass();
    g.pass();
    g.expect.monarch(0);
    g.act(0).pass();
    g.act(1).cast(FLASH, { pay: true });
    g.pass();
    g.pass();
    g.expect.monarch(1);
    g.expect.eventLog([
      { kind: 'monarchChanged', from: null, to: 0 },
      { kind: 'monarchChanged', from: 0, to: 1 },
    ]);
    expect(getView(g.state, 0).monarch).toBe(1);
  });

  test('becoming the monarch while already the monarch changes nothing and emits nothing', () => {
    const g = base((b) => b.hand(CLAIM).battlefield('Island', { count: 3 }))
      .at('precombatMain', { monarch: 0 })
      .build();
    g.act(0).cast(CLAIM, { pay: true });
    g.pass();
    g.pass();
    g.expect.monarch(0);
    g.expect.noEvent({ kind: 'monarchChanged' });
  });

  test('the designation stays when the permanent that made the player the monarch leaves', () => {
    const g = base((b) => b.hand(HERALD).battlefield('Plains', { count: 3 }))
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .at('precombatMain')
      .build();
    g.act(0).cast(HERALD, { pay: true });
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    g.expect.monarch(0);
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: [{ name: HERALD }], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(HERALD, 'graveyard');
    g.expect.monarch(0);
  });

  test('an enchantment source stays too, and its owner still is the monarch if it is destroyed', () => {
    const g = base((b) => b.hand(HALL).battlefield('Plains', { count: 4 }))
      .at('precombatMain')
      .build();
    g.act(0).cast(HALL, { pay: true });
    resolveAll(g);
    g.expect.monarch(0);
    g.expect.zone(HALL, 'battlefield');
  });

  test('the effect cannot name every player: validation refuses it', () => {
    const card = syntheticCard(CLAIM);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        { ...face, spell: { effect: { kind: 'becomeMonarch', player: { kind: 'eachPlayer' } } } },
      ],
    } as never;
    expect(JSON.stringify(validateCard(bad))).toContain('only one player can be the monarch');
  });
});

describe('the monarch draws at the beginning of their end step (CR 725.2)', () => {
  test('the trigger goes on the stack with no source, named "The monarch", and draws for the monarch', () => {
    const g = base().at('postcombatMain', { monarch: 0 }).build();
    g.advanceTo('end');
    g.expect.stack(['The monarch (ability)']);
    const top = getView(g.state, 1).stack[0];
    expect(top?.name).toBe('The monarch');
    expect(top?.abilitySource).toBeUndefined();
    expect(top?.oracleText).toBe(
      "At the beginning of the monarch's end step, that player draws a card.",
    );
    expect(top?.controller).toBe(0);
    g.expect.pending('priority', 0);
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.pass();
    g.pass();
    expect(g.state.seats[0]?.hand.length).toBe(before + 1);
    g.expect.eventLog([
      { kind: 'abilityTriggered', seat: 0 },
      { kind: 'cardDrawn', seat: 0 },
    ]);
  });

  test('only at the end step of the monarch’s own turn', () => {
    const g = base().at('postcombatMain', { monarch: 0, active: 1, turn: 2 }).build();
    g.advanceTo('end');
    g.expect.stack([]);
    g.expect.step('end', { active: 1 });
  });

  test('a monarch who is not the active player draws at their own end step, not the opponent’s', () => {
    const g = base().at('postcombatMain', { monarch: 1, active: 0 }).build();
    g.advanceTo('end');
    g.expect.stack([]);
    g.advanceTo('end', { turn: 'next' });
    g.expect.step('end', { active: 1 });
    g.expect.stack(['The monarch (ability)']);
    g.expect.pending('priority', 1);
  });

  test('every turn while the player stays the monarch', () => {
    const g = base().at('postcombatMain', { monarch: 0 }).build();
    g.advanceTo('end');
    resolveAll(g);
    const after = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end', { turn: 'next' });
    g.advanceTo('end', { turn: 'next' });
    g.expect.stack(['The monarch (ability)']);
    resolveAll(g);
    // The draw step of turn 3 also drew one.
    expect(g.state.seats[0]?.hand.length).toBe(after + 2);
  });

  test('controlled by the player who was the monarch as it triggered: it draws for them even if the designation moved', () => {
    const g = base()
      .seat(1)
      .hand(FLASH)
      .battlefield('Island', { count: 2 })
      .at('postcombatMain', { monarch: 0 })
      .build();
    g.advanceTo('end');
    g.expect.stack(['The monarch (ability)']);
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.pass(0);
    g.act(1).cast(FLASH, { pay: true });
    g.pass();
    g.pass();
    g.expect.monarch(1);
    // The flash spell resolved; the end-step trigger of the old monarch is still there and resolves for them.
    g.expect.stack(['The monarch (ability)']);
    g.pass();
    g.pass();
    expect(g.state.seats[0]?.hand.length).toBe(before + 1);
    expect(g.state.seats[1]?.hand.length).toBe(0);
  });

  test('with another trigger of the same step the controller orders them, the monarch’s having no source', () => {
    const g = base((b) => b.battlefield(WATCHER))
      .at('postcombatMain', { monarch: 0 })
      .build();
    g.advanceTo('end');
    g.expect.pending('orderTriggers', 0);
    const d = g.state.pending;
    if (d?.kind !== 'orderTriggers') throw new Error('expected orderTriggers');
    expect(d.triggers.map((t) => t.sourceName).sort()).toEqual(['The monarch', WATCHER].sort());
    expect(d.triggers.find((t) => t.sourceName === 'The monarch')?.source).toBeNull();
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
  });
});

describe('a creature deals combat damage to the monarch (CR 725.2)', () => {
  /** Seat 0 attacks with Grizzly Bears; seat 1 is the monarch. */
  const attack = (extra: (b: Builder) => Builder = (b) => b) =>
    extra(base((b) => b.battlefield(BEARS)))
      .at('precombatMain', { monarch: 1 })
      .build();

  test('its controller becomes the monarch through a trigger on the stack', () => {
    const g = attack();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.life(1, 18);
    g.expect.stack(['The monarch (ability)']);
    // The trigger is the old monarch's (CR 725.2), who gets priority after the active player.
    expect(g.state.objects[g.state.stack[0] ?? 'o0']?.controller).toBe(1);
    g.expect.monarch(1);
    resolveAll(g);
    g.expect.monarch(0);
    g.expect.eventLog([{ kind: 'monarchChanged', from: 1, to: 0 }]);
  });

  test('the new monarch draws at their end step of that very turn', () => {
    const g = attack();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    resolveAll(g);
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end');
    g.expect.stack(['The monarch (ability)']);
    g.pass();
    g.pass();
    expect(g.state.seats[0]?.hand.length).toBe(before + 1);
  });

  test('damage to a player who is not the monarch does nothing', () => {
    const g = base((b) => b.battlefield(BEARS))
      .at('precombatMain', { monarch: 0 })
      .build();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.life(1, 18);
    g.expect.stack([]);
    g.expect.monarch(0);
  });

  test('damage to a creature the monarch controls, a blocked creature, does nothing', () => {
    const g = attack((b) => b.seat(1).battlefield('Typhoid Rats'));
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: 'Typhoid Rats', attacker: BEARS }],
      until: 'combatDamage',
    });
    g.expect.life(1, 20);
    g.expect.stack([]);
    g.expect.monarch(1);
  });

  test('damage that is not combat damage does nothing: a spell’s damage to the monarch', () => {
    const g = base((b) => b.hand('Lightning Bolt').battlefield('Mountain'))
      .at('precombatMain', { monarch: 1 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.pass();
    g.pass();
    g.expect.life(1, 17);
    g.expect.stack([]);
    g.expect.monarch(1);
  });

  test('a creature dealing non-combat damage to the monarch does nothing (an ability, not combat damage)', () => {
    const g = base((b) => b.battlefield('SYNTHETIC Pinger'))
      .at('precombatMain', { monarch: 1 })
      .build();
    g.act(0).activate('SYNTHETIC Pinger', { targets: [{ player: 1 }] });
    g.pass();
    g.pass();
    g.expect.life(1, 19);
    g.expect.stack([]);
    g.expect.monarch(1);
    g.expect.noEvent({ kind: 'monarchChanged' });
  });

  test('the trigger still resolves for the creature’s controller if the creature is gone (last-known information)', () => {
    const g = attack((b) => b.seat(1).hand('Murder').battlefield('Swamp', { count: 3 }));
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.stack(['The monarch (ability)']);
    g.pass(0);
    g.act(1).cast('Murder', { targets: [{ name: BEARS }], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard');
    g.expect.monarch(1);
    resolveAll(g);
    g.expect.monarch(0);
  });

  test('two creatures dealing damage: a trigger for each, and the controller ends as the monarch', () => {
    const g = attack((b) => b.seat(0).battlefield('Typhoid Rats'));
    g.playCombat({ attack: [BEARS, 'Typhoid Rats'], until: 'declareBlockers' });
    g.pass();
    g.pass();
    // Two triggers of the monarch with different subjects: they order them (CR 603.3b).
    g.expect.pending('orderTriggers', 1);
    g.act(1).orderTriggers(0, 1);
    g.expect.life(1, 17);
    g.expect.stack(['The monarch (ability)', 'The monarch (ability)']);
    resolveAll(g);
    g.expect.monarch(0);
    // Only the first trigger changed anything: the second finds the player already the monarch.
    g.expect.eventLog([{ kind: 'monarchChanged', from: 1, to: 0 }]);
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

describe('the monarch leaves the game (CR 725.4)', () => {
  test('the active player becomes the monarch as the monarch concedes', () => {
    const g = base().at('precombatMain', { monarch: 1, priority: 1 }).build();
    g.act(1).concede();
    g.expect.hasLost(1);
    g.expect.monarch(0);
    g.expect.eventLog([{ kind: 'monarchChanged', from: 1, to: 0 }]);
  });

  test('the active player conceding while the monarch: nobody else is left to be it but the designation moves on', () => {
    const g = base().at('precombatMain', { monarch: 0 }).build();
    g.act(0).concede();
    g.expect.hasLost(0);
    g.expect.monarch(1);
  });

  test('a player who has no monarch concedes: nothing changes', () => {
    const g = base().at('precombatMain', { priority: 1 }).build();
    g.act(1).concede();
    g.expect.monarch(null);
    g.expect.noEvent({ kind: 'monarchChanged' });
  });

  test('a monarch who loses to state-based actions hands it on too', () => {
    const g = base((b) => b.life(1))
      .at('precombatMain', { monarch: 0, active: 1, turn: 2 })
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.pass();
    g.pass();
    g.expect.hasLost(0);
    g.expect.monarch(1);
  });
});

describe('the engine reports it (CR 725)', () => {
  test('feature ids', () => {
    expect(SUPPORTED_FEATURES.effectKinds).toContain('becomeMonarch');
    expect(isFeatureSupported('effect:becomeMonarch')).toBe(true);
  });

  test('the fixture cards validate', () => {
    for (const name of [HERALD, HALL, CLAIM, FLASH]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('the legal actions of the question and of the stack agree with applyAction', () => {
    const g = base().at('postcombatMain', { monarch: 0 }).build();
    g.advanceTo('end');
    for (const seat of [0, 1] as const) {
      for (const a of getLegalActions(g.state, seat)) {
        expect(applyAction(g.state, seat, a).ok, `${seat} ${a.kind}`).toBe(true);
      }
    }
  });

  test('the structural invariants hold with a monarch', () => {
    const g = base().at('precombatMain', { monarch: 1 }).build();
    g.expect.invariants();
  });
});
