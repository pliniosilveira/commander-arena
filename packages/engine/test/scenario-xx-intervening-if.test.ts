// The intervening "if" of a triggered ability (CR 603.4): "When/Whenever/At [event], if
// [condition], [effect]." The ability triggers only if the condition is true when the event
// happens, and checks it again as it resolves; if it is false then, the ability is removed from the
// stack and does nothing.
// Pins: CR 603.4 (both checks), CR 603.3 and 603.3b (only a triggered ability goes on the stack
// and needs ordering), CR 702.33d (kicked), CR 113.7a (last-known information), CR 608.2b (the
// mirrored check for targets). Cards are SYNTHETIC (src/cards/fixtures/synthetic-followups.ts).
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  type GameState,
  getLegalActions,
  stateHash,
  syntheticCard,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WARDEN = 'SYNTHETIC Kicker Warden';
const PLEASER = 'SYNTHETIC Crowd Pleaser';
const WOLF = 'SYNTHETIC Lone Wolf';
const TALKER = 'SYNTHETIC Table Talker';
const COMMITTEE = 'SYNTHETIC Welcome Committee';

/** Both players pass once: the top object of the stack resolves (CR 117.4). */
const resolveTop = (g: ScenarioGame): ScenarioGame => g.pass().pass();

const countersOf = (g: ScenarioGame, name: string): number =>
  g.object({ name, zone: 'battlefield' }).counters['+1/+1'] ?? 0;

describe('the cards are well formed', () => {
  test('validateCard accepts every card of this file', () => {
    for (const name of [WARDEN, PLEASER, WOLF, TALKER]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });
});

describe('the check when the event happens (CR 603.4)', () => {
  const cast = (kicked: boolean) => {
    const g = scenario().seat(0).hand(WARDEN).pool('GGGG').seat(1).build();
    g.act(0).cast(WARDEN, { kicked, pay: true });
    return g;
  };

  test('an unkicked creature does not trigger at all: no stack object, no event', () => {
    const g = cast(false);
    const mark = g.mark();
    resolveTop(g);
    g.expect.zone(WARDEN, 'battlefield', { seat: 0 });
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'abilityTriggered' }, { since: mark });
    expect(g.state.pendingTriggers).toEqual([]);
    // The active player has priority at once, with nothing between the creature and them.
    g.expect.pending('priority', 0);
    expect(countersOf(g, WARDEN)).toBe(0);
    g.expect.invariants();
  });

  test('a kicked creature triggers, and the counters arrive when the ability resolves', () => {
    const g = cast(true);
    resolveTop(g);
    g.expect.stack([`${WARDEN} (ability)`]);
    g.expect.eventLog([{ kind: 'abilityTriggered', seat: 0, abilityIndex: 1 }]);
    expect(countersOf(g, WARDEN)).toBe(0);
    resolveTop(g);
    g.expect.stack([]);
    g.expect.pt(WARDEN, 4, 4);
    g.expect.invariants();
  });

  test('an unkicked trigger asks no orderTriggers question; a kicked one beside another does', () => {
    const build = (kicked: boolean) => {
      const g = scenario().seat(0).hand(WARDEN).battlefield(COMMITTEE).pool('GGGG').seat(1).build();
      g.act(0).cast(WARDEN, { kicked, pay: true });
      resolveTop(g);
      return g;
    };
    // Unkicked: only the Committee triggers, so there is one trigger and nothing to order.
    const plain = build(false);
    plain.expect.stack([`${COMMITTEE} (ability)`]);
    plain.expect.pending('priority', 0);
    // Kicked: two different triggers wait for the same player, who orders them (CR 603.3b).
    const kicked = build(true);
    kicked.expect.pending('orderTriggers', 0);
    kicked.act(0).orderTriggers(WARDEN, COMMITTEE);
    kicked.expect.stack([`${COMMITTEE} (ability)`, `${WARDEN} (ability)`]);
  });

  test('"if you control no other creatures": checked with the creature already on the battlefield', () => {
    const alone = scenario().seat(0).hand(WOLF).pool('GG').seat(1).build();
    alone.act(0).cast(WOLF, { pay: true });
    resolveTop(alone);
    alone.expect.stack([`${WOLF} (ability)`]);
    resolveTop(alone);
    expect(countersOf(alone, WOLF)).toBe(1);

    const crowded = scenario()
      .seat(0)
      .hand(WOLF)
      .battlefield('Grizzly Bears')
      .pool('GG')
      .seat(1)
      .build();
    crowded.act(0).cast(WOLF, { pay: true });
    resolveTop(crowded);
    crowded.expect.stack([]);
    crowded.expect.noEvent({ kind: 'abilityTriggered' });
    expect(countersOf(crowded, WOLF)).toBe(0);
  });

  test('a condition that can never hold in this game never triggers', () => {
    const g = scenario().seat(0).hand(TALKER).pool('UUU').seat(1).build();
    g.act(0).cast(TALKER, { pay: true });
    resolveTop(g);
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });

  test('"whenever you cast a spell, if ...": the condition is read at the cast', () => {
    // With one creature the condition is false at the cast: nothing triggers.
    const one = scenario()
      .seat(0)
      .battlefield(PLEASER)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .build();
    one.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    one.expect.stack(['Lightning Bolt']);
    one.expect.noEvent({ kind: 'abilityTriggered' });

    const two = scenario()
      .seat(0)
      .battlefield(PLEASER, 'Grizzly Bears', 'Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .build();
    two.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    two.expect.stack([`${PLEASER} (ability)`, 'Lightning Bolt']);
  });
});

describe('the check as the ability resolves (CR 603.4)', () => {
  // Two creatures when the spell is cast; the opponent kills one in response to the trigger.
  const setup = () =>
    scenario()
      .seat(0)
      .battlefield(PLEASER, 'Grizzly Bears', 'Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();

  test('true at the cast and still true on resolution: the ability does its effect', () => {
    const g = setup();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${PLEASER} (ability)`, 'Lightning Bolt']);
    g.passAll();
    g.expect.life(0, 42);
    g.expect.life(1, 37);
  });

  test('true at the cast, false on resolution: removed from the stack, nothing happens', () => {
    const g = setup();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${PLEASER} (ability)`, 'Lightning Bolt']);
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    const mark = g.mark();
    resolveTop(g); // Murder resolves
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.stack([`${PLEASER} (ability)`, 'Lightning Bolt']);
    resolveTop(g); // the trigger is checked again and is removed
    g.expect.stack(['Lightning Bolt']);
    g.expect.life(0, 40);
    g.expect.eventLog([{ kind: 'fizzled', reason: 'interveningIf' }], { since: mark });
    // The ability left no object behind, and the spell below it is untouched.
    g.expect.noObject(`${PLEASER} (ability)`);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('a source that left before the ability resolves still lets "if it was kicked" read its LKI', () => {
    // Kill a kicked Warden in response to its own trigger: it is still "kicked" by last-known information, so
    // the check on resolution passes (CR 113.7a), and the counters have nowhere to go.
    const g = scenario()
      .seat(0)
      .hand(WARDEN)
      .pool('GGGG')
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();
    g.act(0).cast(WARDEN, { kicked: true, pay: true });
    resolveTop(g);
    g.expect.stack([`${WARDEN} (ability)`]);
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: [{ name: WARDEN }], pay: true });
    const mark = g.mark();
    resolveTop(g);
    g.expect.zone(WARDEN, 'graveyard', { seat: 0 });
    resolveTop(g);
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'fizzled', reason: 'interveningIf' }, { since: mark });
    g.expect.invariants();
  });
});

describe('two triggers of one event: the first to resolve can falsify the second\'s "if"', () => {
  const HOST = 'SYNTHETIC Fickle Host';
  const build = (extra: string[]) =>
    scenario()
      .seat(0)
      .battlefield(HOST, ...extra)
      .seat(1)
      .at('postcombatMain')
      .build();

  test('with exactly two creatures both trigger; the sacrifice first leaves the other nothing to do', () => {
    const g = build(['Grizzly Bears']);
    g.advanceTo('end');
    g.expect.pending('orderTriggers', 0);
    // The sacrifice goes on the stack last, so it resolves first.
    g.act(0).orderTriggers(1, 0);
    g.expect.stack([`${HOST} (ability)`, `${HOST} (ability)`]);
    const mark = g.mark();
    resolveTop(g); // the sacrifice (the Bears is the only other creature)
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    resolveTop(g); // the life gain: one creature left, so it is removed
    g.expect.stack([]);
    g.expect.life(0, 40);
    g.expect.eventLog([{ kind: 'sacrificed' }, { kind: 'fizzled', reason: 'interveningIf' }], {
      since: mark,
    });
  });

  test('the other order gains the life first, while the condition still holds', () => {
    const g = build(['Grizzly Bears']);
    g.advanceTo('end');
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.life(0, 43);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });

  test('with three creatures the condition survives the sacrifice', () => {
    const g = build(['Grizzly Bears', 'Giant Spider']);
    g.advanceTo('end');
    g.act(0).orderTriggers(1, 0);
    g.pass().pass(); // the sacrifice starts to resolve and asks which creature
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('Grizzly Bears');
    g.passAll();
    g.expect.life(0, 43);
  });

  test('alone the Host triggers nothing: the "if" is false at the end step', () => {
    const g = build([]);
    g.advanceTo('end');
    g.expect.stack([`${HOST} (ability)`]); // only the sacrifice trigger
    g.expect.pending('priority', 0);
  });
});

describe('determinism and legality', () => {
  const build = () =>
    scenario()
      .seat(0)
      .battlefield(PLEASER, 'Grizzly Bears', 'Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();

  test('the action log replays to the same state, with and without the removal', () => {
    for (const respond of [false, true]) {
      const g = build();
      g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
      g.act(0).pass();
      if (respond) g.act(1).cast('Murder', { targets: [{ name: 'Grizzly Bears' }], pay: true });
      g.passAll();
      let state: GameState = build().state;
      for (const { seat, action } of g.log) {
        const r = applyAction(state, seat, action);
        if (!r.ok) throw new Error(`replay rejected ${JSON.stringify(action)}: ${r.error}`);
        state = r.state;
      }
      expect(stateHash(state), `respond ${respond}`).toBe(stateHash(g.state));
    }
  });

  test('every legal action is accepted by applyAction while an intervening-if ability waits', () => {
    const g = scenario().seat(0).hand(WARDEN).pool('GGGG').seat(1).build();
    g.act(0).cast(WARDEN, { kicked: true, pay: true });
    resolveTop(g);
    g.expect.stack([`${WARDEN} (ability)`]);
    for (const action of getLegalActions(g.state, 0)) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
  });
});
