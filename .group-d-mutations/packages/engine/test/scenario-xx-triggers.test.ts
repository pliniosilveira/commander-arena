// Triggered abilities (CR 603): detection, the stack, ordering, last-known information.
// Pins: CR 603.2 (a trigger event makes the ability trigger), CR 603.3 and 603.3b (put on the stack
// the next time a player would receive priority, APNAP, each player orders their own), CR 603.5
// ("may" is answered on resolution), CR 603.6a (enters triggers), CR 603.10a and CR 113.7a
// (look back in time; the source leaving does not stop the ability), CR 117.5.
// All cards are SYNTHETIC (see src/cards/fixtures/synthetic-triggers.ts).
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

/** Both players pass once: the top object of the stack resolves (CR 117.4). */
function resolveTop(g: ScenarioGame): ScenarioGame {
  g.pass();
  return g.pass();
}

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('an enters trigger (CR 603.6a, 603.3)', () => {
  test('goes on the stack after the permanent spell resolves, before anyone has priority', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Enters Draw Creature')
      .pool('CU')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Enters Draw Creature', { pay: true });
    resolveTop(g);
    g.expect.zone('SYNTHETIC Enters Draw Creature', 'battlefield', { seat: 0 });
    g.expect.stack(['SYNTHETIC Enters Draw Creature (ability)']);
    g.expect.handSize(0, 0);
    // The active player receives priority with the trigger already on the stack (CR 117.3b).
    g.expect.pending('priority', 0);
    g.expect.eventLog([
      { kind: 'resolved' },
      { kind: 'abilityTriggered', seat: 0, abilityIndex: 0 },
    ]);
    resolveTop(g);
    g.expect.stack([]);
    g.expect.handSize(0, 1);
    g.expect.librarySize(0, 5);
  });

  test('a stack ability is not a card: it has no zone of its own after it resolves', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Enters Draw Creature')
      .pool('CU')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Enters Draw Creature', { pay: true });
    g.passAll();
    g.expect.noObject('SYNTHETIC Enters Draw Creature (ability)');
    g.expect.invariants();
  });

  test('the trigger is controlled by the controller of its source (CR 603.3a)', () => {
    const g = scenario()
      .seat(0)
      .library(...FILLER)
      .seat(1)
      .hand('SYNTHETIC Enters Draw Creature')
      .pool('CU')
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('SYNTHETIC Enters Draw Creature', { pay: true });
    g.passAll();
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 0);
  });
});

describe('a trigger with an optional effect (CR 603.5)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand('SYNTHETIC May Draw Creature')
      .pool('CCU')
      .library(...FILLER)
      .seat(1)
      .build();

  test('goes on the stack either way and asks on resolution; accepting does the effect', () => {
    const g = build();
    g.act(0).cast('SYNTHETIC May Draw Creature', { pay: true });
    resolveTop(g);
    g.expect.stack(['SYNTHETIC May Draw Creature (ability)']);
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.handSize(0, 1);
    g.expect.stack([]);
    g.expect.eventLog([{ kind: 'optionalAnswered', seat: 0, accepted: true }]);
  });

  test('declining does nothing', () => {
    const g = build();
    g.act(0).cast('SYNTHETIC May Draw Creature', { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.handSize(0, 0);
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    g.expect.eventLog([{ kind: 'optionalAnswered', seat: 0, accepted: false }]);
  });

  test('only the controller of the ability is asked', () => {
    const g = scenario()
      .seat(0)
      .library(...FILLER)
      .seat(1)
      .hand('SYNTHETIC May Draw Creature')
      .pool('CCU')
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('SYNTHETIC May Draw Creature', { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 1);
  });
});

describe('landfall (CR 603.6a)', () => {
  test('a land entering under your control triggers; the opponent playing one does not', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Landfall Tokenmaker')
      .hand('Forest')
      .seat(1)
      .hand('Forest')
      .build();
    g.act(0).playLand('Forest');
    g.expect.stack(['SYNTHETIC Landfall Tokenmaker (ability)']);
    g.passAll();
    g.expect.zone('Soldier', 'battlefield', { seat: 0, count: 1 });

    const h = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Landfall Tokenmaker')
      .seat(1)
      .hand('Forest')
      .at('precombatMain', { active: 1 })
      .build();
    h.act(1).playLand('Forest');
    h.expect.stack([]);
    h.expect.noObject('Soldier');
  });

  test('a nonland entering does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Landfall Tokenmaker')
      .hand('Grizzly Bears')
      .pool('CG')
      .seat(1)
      .build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.noObject('Soldier');
  });
});

describe('a triggered ability exists on the stack independently of its source (CR 113.7a)', () => {
  test('it can be responded to, and the source leaving does not stop it', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Enters Draw Creature')
      .pool('CU')
      .library(...FILLER)
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();
    g.act(0).cast('SYNTHETIC Enters Draw Creature', { pay: true });
    resolveTop(g);
    g.expect.stack(['SYNTHETIC Enters Draw Creature (ability)']);
    // The active player passes; the opponent responds by killing the source.
    g.pass();
    g.act(1).cast('Murder', { targets: [{ name: 'SYNTHETIC Enters Draw Creature' }], pay: true });
    g.expect.stack(['Murder', 'SYNTHETIC Enters Draw Creature (ability)']);
    g.pass();
    g.pass();
    g.expect.zone('SYNTHETIC Enters Draw Creature', 'graveyard', { seat: 0 });
    // The trigger is still on the stack and still resolves.
    g.expect.stack(['SYNTHETIC Enters Draw Creature (ability)']);
    resolveTop(g);
    g.expect.handSize(0, 1);
    g.expect.stack([]);
  });
});

describe('a dies trigger looks back in time (CR 603.10a)', () => {
  const wrath = () =>
    scenario()
      .seat(0)
      .hand('SYNTHETIC Wrath')
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield('SYNTHETIC Mourner')
      .battlefield('SYNTHETIC Dies Treasure Creature')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();

  test('creatures that die together all see each other die; the dying creature sees itself', () => {
    const g = wrath();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    resolveTop(g);
    g.expect.zone('SYNTHETIC Mourner', 'graveyard', { seat: 0 });
    g.expect.zone('SYNTHETIC Dies Treasure Creature', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    // Mourner triggers for the other two (twice, CR 603.2c) and the Treasure creature for itself:
    // two distinct abilities, so their controller orders them (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    const d = g.state.pending;
    if (d?.kind !== 'orderTriggers') throw new Error('expected orderTriggers');
    expect(d.triggers.map((t) => [t.sourceName, t.count])).toEqual([
      ['SYNTHETIC Mourner', 2],
      ['SYNTHETIC Dies Treasure Creature', 1],
    ]);
    g.act(0).orderTriggers('SYNTHETIC Mourner', 'SYNTHETIC Dies Treasure Creature');
    g.expect.stack([
      'SYNTHETIC Dies Treasure Creature (ability)',
      'SYNTHETIC Mourner (ability)',
      'SYNTHETIC Mourner (ability)',
    ]);
    g.passAll();
    g.expect.life(0, 42);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
  });

  test('the order the player chooses is the order on the stack: the first goes on first', () => {
    const g = wrath();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    resolveTop(g);
    g.act(0).orderTriggers('SYNTHETIC Dies Treasure Creature', 'SYNTHETIC Mourner');
    g.expect.stack([
      'SYNTHETIC Mourner (ability)',
      'SYNTHETIC Mourner (ability)',
      'SYNTHETIC Dies Treasure Creature (ability)',
    ]);
  });

  test('an order that is not a permutation of the triggers is rejected', () => {
    const g = wrath();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    resolveTop(g);
    const bad = g.act(0).try.action({ kind: 'orderTriggers', order: [0, 0] });
    expect(bad.ok).toBe(false);
    const short = g.act(0).try.action({ kind: 'orderTriggers', order: [1] });
    expect(short.ok).toBe(false);
    g.expect.pending('orderTriggers', 0);
  });

  test('identical triggers are ordered automatically (A18)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Wrath')
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield('SYNTHETIC Mourner')
      .seat(1)
      .battlefield('Grizzly Bears', 'Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    resolveTop(g);
    g.expect.stack(['SYNTHETIC Mourner (ability)', 'SYNTHETIC Mourner (ability)']);
    g.expect.pending('priority', 0);
  });
});

describe('triggers that begin a step (CR 603.2b)', () => {
  test('"your upkeep" triggers only in your upkeep; "each upkeep" in both', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Upkeep Reader', 'SYNTHETIC Each Upkeep Lifegainer')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0 })
      .build();
    // Seat 1's upkeep: only the "each upkeep" trigger.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    g.expect.stack(['SYNTHETIC Each Upkeep Lifegainer (ability)']);
    g.passAll();
    g.expect.life(0, 41);
    // Seat 0's upkeep: both, and seat 0 orders them (they are different abilities).
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.expect.stack([
      'SYNTHETIC Each Upkeep Lifegainer (ability)',
      'SYNTHETIC Upkeep Reader (ability)',
    ]);
    g.passAll();
    g.expect.life(0, 42);
  });

  test('an end step trigger fires at the beginning of the end step for each or you', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC End Step Reader')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    g.expect.stack(['SYNTHETIC End Step Reader (ability)']);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('a creature that sacrifices itself at your end step: the sacrifice happens once', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Fleeting Spirit')
      .seat(1)
      .battlefield('SYNTHETIC Fleeting Spirit')
      .at('postcombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    // Only the active player's creature triggers on their end step.
    g.expect.stack(['SYNTHETIC Fleeting Spirit (ability)']);
    g.passAll();
    g.expect.zone('SYNTHETIC Fleeting Spirit', 'graveyard', { seat: 0, count: 1 });
    g.expect.zone('SYNTHETIC Fleeting Spirit', 'battlefield', { seat: 1, count: 1 });
  });
});

describe('attack, cast and tap triggers', () => {
  test('"another creature you control attacks" triggers once per other attacker', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Banner Bearer', 'Grizzly Bears', 'Grizzly Bears')
      .seat(1)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([
      { name: 'SYNTHETIC Banner Bearer' },
      { name: 'Grizzly Bears', nth: 0 },
      { name: 'Grizzly Bears', nth: 1 },
    ]);
    // The Bearer does not trigger for itself; each Bears does.
    g.expect.stack(['SYNTHETIC Banner Bearer (ability)', 'SYNTHETIC Banner Bearer (ability)']);
    g.passAll();
    g.expect.life(0, 42);
  });

  test('an attacking opponent creature does not trigger "you control"', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Banner Bearer')
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('Grizzly Bears');
    g.expect.stack([]);
  });

  test('"whenever you cast a spell" triggers on cast, before the spell resolves', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Spell Watcher')
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.stack(['SYNTHETIC Spell Watcher (ability)', 'Lightning Bolt']);
    g.passAll();
    g.expect.life(0, 41);
    g.expect.life(1, 37);
  });

  test("an opponent's spell does not trigger a 'you cast' watcher", () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Spell Watcher')
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.expect.stack(['Lightning Bolt']);
  });

  test('"becomes tapped" triggers when an attack taps it, not when it enters tapped', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Tap Watcher').seat(1).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('SYNTHETIC Tap Watcher');
    g.expect.stack(['SYNTHETIC Tap Watcher (ability)']);
    g.passAll();
    g.expect.life(0, 41);
  });
});

describe('"becomes tapped" (CR 603.2e)', () => {
  test('does not trigger for a permanent that enters tapped', () => {
    const land = singleFaceCard({
      name: 'SYNTHETIC Tapped Gain Land',
      manaCost: null,
      types: ['land'],
      colors: [],
      colorIdentity: [],
      oracleText: 'This land enters tapped. Whenever this land becomes tapped, you gain 1 life.',
      abilities: [
        { kind: 'replacement', replacement: { kind: 'entersTapped' } },
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
        {
          kind: 'triggered',
          trigger: { kind: 'becomesTapped', what: { kind: 'this' } },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        },
      ],
    });
    const g = scenario()
      .define(land)
      .seat(0)
      .hand('SYNTHETIC Tapped Gain Land')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).playLand('SYNTHETIC Tapped Gain Land');
    g.expect.tapped('SYNTHETIC Tapped Gain Land', true);
    g.expect.stack([]);
    // It untaps on the next turn and tapping it for mana is the event that triggers it.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).tapForMana('SYNTHETIC Tapped Gain Land');
    g.expect.stack(['SYNTHETIC Tapped Gain Land (ability)']);
  });
});

describe('abilities that trigger before a decision are not lost (CR 603.3, 117.5)', () => {
  test('a trigger that went off before a commander-zone decision goes on the stack after it', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Wrath')
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield('Isamaru, Hound of Konda', { commander: true })
      .seat(1)
      .battlefield('SYNTHETIC Mourner')
      .build();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    resolveTop(g);
    // State-based action CR 903.9a asks first (CR 117.5); the trigger waits, it is not forgotten.
    g.expect.pending('commanderZone', 0);
    g.expect.stack([]);
    g.act(0).sendToCommandZone();
    g.expect.stack(['SYNTHETIC Mourner (ability)']);
    g.passAll();
    g.expect.life(1, 41);
  });
});
