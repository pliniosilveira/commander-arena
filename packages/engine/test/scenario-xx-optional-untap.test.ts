// "You may choose not to untap ~ during your untap step." (D-125).
// Pins: CR 502.3 (the active player determines which permanents untap, then untaps them all simultaneously;
// effects can keep permanents from untapping), CR 502.4 (no player receives priority in the untap step),
// CR 613.1f (an object that loses its abilities has none). The controller of a tapped permanent with the
// ability is asked once, as the untap step begins, which of them untap: the decision lists them, the answer is
// an ordinary action in the log. All cards are SYNTHETIC (src/cards/fixtures/synthetic-play-rules.ts) or
// real fixtures.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/index';
import {
  applyAction,
  getLegalActions,
  getView,
  isFeatureSupported,
  validateAbility,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';
import type { Builder } from './restriction-helpers';

const LAND = 'SYNTHETIC Drowsy Land';
const GIANT = 'SYNTHETIC Drowsy Giant';
const ROD = 'SYNTHETIC Drowsy Rod';
const SLEEPER = 'SYNTHETIC Drowsy Sleeper'; // optional untap and "doesn't untap"
const BEARS = 'Grizzly Bears';

/** Seat 1's end step of turn 2: the next turn is seat 0's, whose permanents are tapped. */
function beforeUntap(seat0: (b: Builder) => void, seat1: (b: Builder) => void = () => {}) {
  const b = scenario().seat(0).library('Island', { count: 6 });
  seat0(b);
  b.seat(1).library('Island', { count: 6 });
  seat1(b);
  return b.at('end', { active: 1, turn: 2 }).build();
}

/** The game stopped in seat 0's untap step with the question pending. */
function asked(seat0: (b: Builder) => void, seat1: (b: Builder) => void = () => {}) {
  const g = beforeUntap(seat0, seat1);
  g.advanceTo('untap', { turn: 'next' });
  return g;
}

type Game = ReturnType<typeof beforeUntap>;

function question(g: Game) {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent' || d.purpose !== 'untap') {
    throw new Error(`expected the untap question, got ${d?.kind}`);
  }
  return d;
}

const untap = (g: Game, ...names: string[]) =>
  g.act(0).choose({ kind: 'choosePermanents', objects: names.map((n) => g.id(n)) });

describe('CR 502.3: the controller chooses which of its tapped permanents untap', () => {
  test('the control: without the ability everything untaps and nothing is asked', () => {
    const g = beforeUntap((b) => b.battlefield(BEARS, { tapped: true }));
    g.advanceTo('upkeep');
    g.expect.tapped(BEARS, false);
    expect(g.log.some((l) => l.action.kind === 'choosePermanents')).toBe(false);
  });

  test('the decision lists the tapped permanents with the ability; the others have untapped', () => {
    const g = asked((b) =>
      b
        .battlefield(GIANT, { tapped: true })
        .battlefield(BEARS, { tapped: true })
        .battlefield('Forest', { tapped: true }),
    );
    const d = question(g);
    expect(d.seat).toBe(0);
    expect(d.legal).toEqual([g.id(GIANT)]);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.forCost).toBeUndefined();
    g.expect.step('untap', { active: 0, turn: 3 });
    g.expect.tapped(GIANT, true);
    g.expect.tapped(BEARS, false);
    g.expect.tapped('Forest', false);
  });

  test('untapping it: it untaps and the game goes on to the upkeep with priority', () => {
    const g = asked((b) => b.battlefield(GIANT, { tapped: true }));
    const mark = g.mark();
    untap(g, GIANT);
    g.expect.tapped(GIANT, false);
    g.expect.step('upkeep', { active: 0, turn: 3 });
    g.expect.pending('priority', 0);
    expect(g.eventsSince(mark).filter((e) => e.kind === 'untapped')).toEqual([
      { kind: 'untapped', object: g.id(GIANT) },
    ]);
  });

  test('choosing not to: it stays tapped, and the turn goes on', () => {
    const g = asked((b) => b.battlefield(GIANT, { tapped: true }));
    untap(g);
    g.expect.tapped(GIANT, true);
    g.expect.step('upkeep', { active: 0, turn: 3 });
    g.expect.noEvent({ kind: 'untapped', object: g.id(GIANT) });
  });

  test('every turn it is asked again while it is tapped, and not when it is untapped', () => {
    const g = asked((b) => b.battlefield(GIANT, { tapped: true }));
    untap(g);
    // The opponent's untap step (turn 4) asks nothing; seat 0's next one (turn 5) asks again.
    g.advanceTo('untap', { turn: 'next' });
    g.expect.step('untap', { active: 0, turn: 5 });
    question(g);
    untap(g, GIANT);
    // It is untapped now: nothing to ask at turn 7.
    g.advanceTo('upkeep', { turn: 7 });
    g.expect.step('upkeep', { active: 0, turn: 7 });
    g.expect.tapped(GIANT, false);
  });

  test('several: one question lists them all, and any subset can untap', () => {
    const g = asked((b) =>
      b.battlefield(GIANT, { tapped: true }).battlefield(LAND, { tapped: true, count: 2 }),
    );
    const d = question(g);
    expect(d.legal).toHaveLength(3);
    expect(d.max).toBe(3);
    untap(g, GIANT, `${LAND}[1]`);
    g.expect.tapped(GIANT, false);
    g.expect.tapped(`${LAND}[0]`, true);
    g.expect.tapped(`${LAND}[1]`, false);
  });

  test('an untapped permanent with the ability is not asked about', () => {
    const g = beforeUntap((b) => b.battlefield(GIANT));
    g.advanceTo('upkeep');
    g.expect.tapped(GIANT, false);
    expect(g.log.some((l) => l.action.kind === 'choosePermanents')).toBe(false);
  });

  test('a land, an artifact and a creature all work', () => {
    const g = asked((b) =>
      b.battlefield(LAND, { tapped: true }).battlefield(ROD, { tapped: true }),
    );
    expect(question(g).legal).toHaveLength(2);
    untap(g, ROD);
    g.expect.tapped(LAND, true);
    g.expect.tapped(ROD, false);
  });

  test('a land kept tapped makes no mana, and one that untapped does', () => {
    const makesMana = (g: Game) =>
      g.legalActions(0).some((a) => a.kind === 'activateAbility' && a.source === g.id(LAND));
    const kept = asked((b) => b.battlefield(LAND, { tapped: true }));
    untap(kept);
    expect(makesMana(kept)).toBe(false);
    const freed = asked((b) => b.battlefield(LAND, { tapped: true }));
    untap(freed, LAND);
    expect(makesMana(freed)).toBe(true);
  });
});

describe('who is asked, and what the other player sees', () => {
  test('only the active player is asked, for its own permanents', () => {
    const g = asked(
      (b) => b.battlefield(GIANT, { tapped: true }),
      (b) => b.battlefield(ROD, { tapped: true }),
    );
    expect(question(g).legal).toEqual([g.id(GIANT)]);
    untap(g);
    // The opponent's Rod is untouched in seat 0's untap step.
    g.expect.tapped(ROD, true);
  });

  test("the opponent's own turn asks the opponent", () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .battlefield(ROD, { tapped: true })
      .at('end', { active: 0, turn: 3 })
      .build();
    g.advanceTo('untap', { turn: 'next' });
    expect(g.state.pending?.seat).toBe(1);
    expect(question(g).legal).toEqual([g.id(ROD)]);
  });

  test('the other seat sees that a decision is pending, not the decision, and cannot answer it', () => {
    const g = asked((b) => b.battlefield(GIANT, { tapped: true }));
    const theirs = getView(g.state, 1);
    expect(theirs.pending).toBeNull();
    expect(theirs.decidingSeat).toBe(0);
    expect(getView(g.state, 0).pending?.kind).toBe('choosePermanent');
    expect(g.legalActions(1)).toEqual([]);
    const before = g.hash();
    expect(applyAction(g.state, 1, { kind: 'choosePermanents', objects: [g.id(GIANT)] }).ok).toBe(
      false,
    );
    expect(g.hash()).toBe(before);
    // That the permanent is tapped is public.
    expect(theirs.battlefield.find((o) => o.id === g.id(GIANT))?.tapped).toBe(true);
  });
});

describe('answers the engine refuses leave the question as it was', () => {
  const refused = (g: Game, objects: string[]) => {
    const before = g.hash();
    const r = applyAction(g.state, 0, { kind: 'choosePermanents', objects: objects as never });
    expect(r.ok, JSON.stringify(objects)).toBe(false);
    expect(g.hash()).toBe(before);
    question(g);
  };

  test('a permanent that is not on the list, one twice, and a permanent of the opponent', () => {
    const g = asked(
      (b) => b.battlefield(GIANT, { tapped: true }).battlefield(BEARS, { tapped: true }),
      (b) => b.battlefield(ROD, { tapped: true }),
    );
    refused(g, [g.id(BEARS)]);
    refused(g, [g.id(GIANT), g.id(GIANT)]);
    refused(g, [g.id(ROD)]);
    refused(g, [g.id(GIANT), g.id(ROD)]);
  });

  test('an action of another kind', () => {
    const g = asked((b) => b.battlefield(GIANT, { tapped: true }));
    const before = g.hash();
    expect(applyAction(g.state, 0, { kind: 'pass' }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'acceptOptional' }).ok).toBe(false);
    expect(g.hash()).toBe(before);
  });

  test('the legal actions list the empty answer and each subset, and every one is accepted', () => {
    const g = asked((b) =>
      b.battlefield(GIANT, { tapped: true }).battlefield(ROD, { tapped: true }),
    );
    const actions = getLegalActions(g.state, 0).filter((a) => a.kind === 'choosePermanents');
    expect(actions).toHaveLength(4);
    for (const a of actions) expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
  });
});

describe('CR 502.3: it combines with other things that keep a permanent tapped', () => {
  test('a permanent that also does not untap is not offered: it stays tapped', () => {
    const g = beforeUntap((b) => b.battlefield(SLEEPER, { tapped: true }));
    g.advanceTo('upkeep');
    g.expect.tapped(SLEEPER, true);
    expect(g.log.some((l) => l.action.kind === 'choosePermanents')).toBe(false);
  });
});

describe('the choice is an ordinary action', () => {
  test('it is in the log, and the same actions give the same hash', () => {
    const play = () => {
      const g = asked((b) =>
        b.battlefield(GIANT, { tapped: true }).battlefield(ROD, { tapped: true }),
      );
      untap(g, ROD);
      return { hash: g.hash(), log: g.log, last: g.log.at(-1) };
    };
    const one = play();
    const two = play();
    expect(one.hash).toBe(two.hash);
    expect(one.log).toEqual(two.log);
    expect(one.last?.action.kind).toBe('choosePermanents');
    expect(one.last?.seat).toBe(0);
  });

  test('answering differently gives a different position', () => {
    const run = (names: string[]) => {
      const g = asked((b) => b.battlefield(GIANT, { tapped: true }));
      untap(g, ...names);
      return g.positionHash();
    };
    expect(run([GIANT])).not.toBe(run([]));
  });
});

describe('validation and features', () => {
  const ability = { kind: 'static', static: { kind: 'optionalUntap' } } as Ability;

  test('the ability is valid and the feature is supported', () => {
    expect(validateAbility(ability)).toEqual([]);
    expect(isFeatureSupported('static:optionalUntap')).toBe(true);
  });

  test.each([LAND, GIANT, ROD, SLEEPER])('the fixture %s is a valid card', (name) => {
    const def = scenario()
      .seat(0)
      .battlefield(name)
      .build()
      .state.definitions.find((d) => d.name === name);
    expect(def && validateCard(def)).toEqual([]);
  });
});
