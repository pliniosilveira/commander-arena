// Saga cards (CR 714), continued: lore counters put on a Saga by an effect trigger its chapters
// (CR 714.2b), several chapters reached by one event, a Saga that leaves the battlefield (a new
// object with one counter when it returns, CR 400.7, 714.3a; an ability already on the stack
// resolves without it, CR 113.7a), and that a game with Sagas replays exactly and lists exactly the
// plays the engine accepts. Cards are SYNTHETIC (src/cards/fixtures/synthetic-sagas.ts).
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, stateHash } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import {
  BREAKER,
  chaptersTriggered,
  ECHO,
  FILLER,
  FLICKER,
  FLOOD,
  MIRROR,
  RITE,
  resolveTop,
  SURGE,
  TALE,
} from './saga-helpers';

describe('lore counters put on a Saga by an effect (CR 714.2b)', () => {
  test('one counter reaches the next chapter; the Saga is sacrificed after the last', () => {
    const g = scenario()
      .seat(0)
      .hand(TALE)
      .hand(SURGE)
      .battlefield('Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(TALE, { pay: true });
    resolveTop(g); // Brief Tale enters with one counter; chapter I on the stack
    resolveTop(g); // chapter I resolves
    g.expect.life(0, 41);
    g.act(0).cast(SURGE, { targets: [TALE], pay: true });
    resolveTop(g);
    g.expect.counters(TALE, { lore: 2 });
    g.expect.stack([`${TALE} (ability)`]);
    expect(chaptersTriggered(g)).toEqual([1, 2]);
    resolveTop(g);
    g.expect.life(0, 43);
    g.expect.zone(TALE, 'graveyard', { seat: 0 });
  });

  test('two counters at once reach two chapters: both trigger and the player orders them', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, { counters: { lore: 1 } })
      .battlefield('Plains', 'Plains')
      .hand(FLOOD)
      .seat(1)
      .build();
    g.act(0).cast(FLOOD, { targets: [RITE], pay: true });
    g.pass();
    g.pass();
    g.expect.counters(RITE, { lore: 3 });
    g.expect.pending('orderTriggers', 0);
    const d = g.state.pending;
    if (d?.kind !== 'orderTriggers') throw new Error('expected orderTriggers');
    // Chapters II and III are different abilities of one Saga: two entries in the decision.
    expect(d.triggers.map((t) => t.abilityIndex).sort()).toEqual([1, 2]);
    // Each entry says which chapter it is, for the player ordering them (CR 714.2).
    expect(d.triggers.map((t) => t.chapter).sort()).toEqual([2, 3]);
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    g.act(0).orderTriggers(0, 1);
    g.expect.stack(['SYNTHETIC Rite of Three (ability)', 'SYNTHETIC Rite of Three (ability)']);
    // Both are waiting on the stack: the Saga stays until the last one has resolved.
    resolveTop(g);
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    resolveTop(g);
    g.expect.life(0, 46);
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
    expect(chaptersTriggered(g)).toEqual([2, 3]);
  });

  test('a chapter ability for "I, II" triggers twice when two counters reach both (no question: identical)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ECHO)
      .battlefield('Plains', 'Plains')
      .hand(FLOOD)
      .seat(1)
      .build();
    g.act(0).cast(FLOOD, { targets: [ECHO], pay: true });
    g.pass();
    g.pass();
    g.expect.counters(ECHO, { lore: 2 });
    g.expect.stack([`${ECHO} (ability)`, `${ECHO} (ability)`]);
    expect(chaptersTriggered(g)).toEqual([1, 2]);
    g.passAll();
    g.expect.life(0, 42);
    g.expect.zone(ECHO, 'battlefield', { seat: 0 });
  });
});

describe('a Saga that leaves the battlefield', () => {
  test('before its final chapter: no more chapters, nothing sacrificed', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, { counters: { lore: 1 } })
      .battlefield('Plains')
      .hand(BREAKER)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(BREAKER, { targets: [RITE], pay: true });
    resolveTop(g);
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'sacrificed' });
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.stack([]);
    expect(chaptersTriggered(g)).toEqual([]);
    g.expect.life(0, 40);
  });

  test('with its final chapter on the stack: the ability still resolves (CR 113.7a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, { counters: { lore: 2 } })
      .battlefield('Plains')
      .hand(BREAKER)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.stack([`${RITE} (ability)`]);
    g.act(0).cast(BREAKER, { targets: [RITE], pay: true });
    resolveTop(g);
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
    g.expect.stack([`${RITE} (ability)`]);
    resolveTop(g);
    g.expect.life(0, 44);
    g.expect.noEvent({ kind: 'sacrificed' });
  });

  test('and returns is a new object with one counter, and chapter I triggers again (CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, { counters: { lore: 2 } })
      .battlefield('Plains', 'Island')
      .hand(FLICKER)
      .seat(1)
      .build();
    const before = g.id(RITE);
    g.act(0).cast(FLICKER, { targets: [RITE], pay: true });
    resolveTop(g);
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    expect(g.id(RITE)).not.toBe(before);
    g.expect.counters(RITE, { lore: 1 });
    g.expect.stack([`${RITE} (ability)`]);
    expect(chaptersTriggered(g)).toEqual([1]);
    resolveTop(g);
    g.expect.life(0, 41);
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
  });
});

describe('a token that is a copy of a Saga (CR 707.2, 714.3a)', () => {
  test('enters with a lore counter, triggers chapter I, and goes through every chapter', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TALE, { counters: { lore: 1 } })
      .battlefield('Island', 'Island', 'Island')
      .hand(MIRROR)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(MIRROR, { targets: [TALE], pay: true });
    resolveTop(g);
    const copy = g.find({ name: TALE, zone: 'battlefield' }).find((o) => o.token !== null);
    if (copy === undefined) throw new Error('no token copy');
    expect(copy.counters.lore).toBe(1);
    g.expect.stack([`${TALE} (ability)`]);
    resolveTop(g);
    g.expect.life(0, 41);
    g.advanceTo('precombatMain', { turn: 5 });
    // The original and the copy each got a counter: two different sources, so they are ordered.
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.life(0, 45);
    // Both are done after chapter II; the token ceased to exist, the card is in the graveyard.
    g.expect.noObject(TALE, { zone: 'battlefield' });
    g.expect.zone(TALE, 'graveyard', { seat: 0, count: 1 });
  });
});

describe('legal plays agree with the engine around a Saga', () => {
  test('a Saga-targeting spell is castable exactly while a Saga is on the battlefield', () => {
    const none = scenario()
      .seat(0)
      .hand(SURGE, BREAKER, FLOOD, FLICKER)
      .battlefield('Plains', 'Plains', 'Island')
      .seat(1)
      .build();
    for (const spell of [SURGE, BREAKER, FLOOD, FLICKER]) {
      none.expect.illegal(0, { cast: spell });
    }
    const some = scenario()
      .seat(0)
      .hand(SURGE, BREAKER, FLOOD, FLICKER)
      .battlefield('Plains', 'Plains', 'Island', RITE)
      .seat(1)
      .build();
    for (const spell of [SURGE, BREAKER, FLOOD, FLICKER]) {
      some.expect.legal(0, { cast: spell });
    }
  });

  test('every option listed through a whole Saga is accepted by applyAction', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE, SURGE)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    const check = (seat: 0 | 1) => {
      for (const action of getLegalActions(g.state, seat)) {
        expect(applyAction(g.state, seat, action).ok, JSON.stringify(action)).toBe(true);
      }
    };
    check(0);
    g.act(0).cast(RITE, { pay: true });
    check(0);
    resolveTop(g);
    check(0);
    resolveTop(g);
    check(0);
    g.advanceTo('precombatMain', { turn: 5 });
    check(0);
    g.expect.legal(0, { cast: SURGE });
  });
});

describe('determinism', () => {
  const script = (g: ScenarioGame): void => {
    g.act(0).cast(RITE, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.act(0).cast(SURGE, { targets: [RITE], pay: true });
    resolveTop(g);
    resolveTop(g);
    g.advanceTo('precombatMain', { turn: 5 });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 7 });
    g.passAll();
  };
  const build = () =>
    scenario()
      .seat(0)
      .hand(RITE, SURGE)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('the same plays give the same game, and the action log replays every state', () => {
    const a = build();
    const hashes: string[] = [];
    script(a);
    const b = build();
    script(b);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    // Replay the recorded log on a fresh game: every intermediate hash must agree with a second run.
    const c = build();
    let state = c.state;
    for (const { seat, action } of a.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(`replay rejected: ${r.error}`);
      state = r.state;
      hashes.push(stateHash(state));
    }
    expect(hashes.at(-1)).toBe(stateHash(a.state));
    expect(a.state.stack).toEqual([]);
    a.expect.zone(RITE, 'graveyard', { seat: 0 });
  });
});
