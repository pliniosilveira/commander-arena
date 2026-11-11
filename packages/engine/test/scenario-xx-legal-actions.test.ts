// Illegal actions and the legal action list (SPEC 4.2, 17.1 A2).
// Pins: CR 117.1 (Timing and Priority) for who may act; CR 601.2 (Casting Spells) and CR 605.3
// (Mana Abilities) for what a cast and a mana ability need; SPEC 4.2 "One way to change state": an
// illegal action returns an error and leaves the state unchanged, and getLegalActions lists exactly
// what applyAction accepts for priority decisions, so the UI and the AI can never make an illegal
// play. Every check runs against the raw public API.
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  type GameState,
  getLegalActions,
  type ObjectId,
  stateHash,
} from '../src/index';
import { scenario } from '../src/testing/index';
import { newGame, play, randomPolicy } from './random-games';

const same = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);
const listed = (state: GameState, seat: number, action: Action) =>
  getLegalActions(state, seat).some((a) => same(a, action));

/** The engine refuses the action with an error, and the state it was given is untouched. */
function expectRefused(state: GameState, seat: number, action: Action, error?: RegExp) {
  const before = stateHash(state);
  const snapshot = JSON.stringify(state);
  const r = applyAction(state, seat, action);
  expect(r.ok, `expected ${JSON.stringify(action)} to be refused`).toBe(false);
  if (!r.ok && error) expect(r.error).toMatch(error);
  expect(stateHash(state)).toBe(before);
  expect(JSON.stringify(state)).toBe(snapshot);
  expect(listed(state, seat, action)).toBe(false);
}

function richBoard() {
  return scenario()
    .seat(0)
    .hand('Forest', 'Plains', 'Lightning Bolt', 'Murder', 'Divination', 'Grizzly Bears')
    .battlefield('Mountain', 'Island', 'Sol Ring', 'Command Tower', 'Swamp')
    .battlefield('Island', { tapped: true })
    .battlefield('Llanowar Elves')
    .battlefield('Llanowar Elves', { fresh: true })
    .battlefield('Grizzly Bears')
    .commander('Isamaru, Hound of Konda')
    .seat(1)
    .hand('Counterspell', 'Unsummon', 'Swamp')
    .battlefield('Island', { count: 2 })
    .battlefield('Grizzly Bears', 'Llanowar Elves')
    .commander('Yargle, Glutton of Urborg')
    .build();
}

describe('SPEC 4.2: an illegal action returns an error and leaves the state unchanged', () => {
  test('the wrong seat', () => {
    const g = richBoard();
    expectRefused(g.state, 1, { kind: 'pass' }, /not your decision/);
    expectRefused(
      g.state,
      1,
      { kind: 'playLand', object: g.id({ name: 'Swamp', seat: 1, zone: 'hand' }) },
      /not your decision/,
    );
  });

  test('actions that answer another kind of decision', () => {
    const g = richBoard();
    const others: Action[] = [
      { kind: 'keepHand' },
      { kind: 'takeMulligan' },
      { kind: 'chooseCards', objects: [] },
      { kind: 'chooseTargets', targets: [] },
      { kind: 'payAuto' },
      { kind: 'payManual', taps: [] },
      { kind: 'cancel' },
      { kind: 'moveToCommandZone' },
      { kind: 'declineCommandZone' },
    ];
    for (const action of others) expectRefused(g.state, 0, action, /not a legal play now/);
  });

  test('playing something that is not a land in hand, or not yours', () => {
    const g = richBoard();
    const theirSwamp = g.id({ name: 'Swamp', seat: 1, zone: 'hand' });
    expectRefused(
      g.state,
      0,
      { kind: 'playLand', object: g.id('Grizzly Bears[0]') },
      /not a legal play/,
    );
    expectRefused(g.state, 0, { kind: 'playLand', object: g.id('Mountain') }, /not a legal play/);
    expectRefused(g.state, 0, { kind: 'playLand', object: theirSwamp }, /not a legal play/);
    expectRefused(g.state, 0, { kind: 'playLand', object: 'o99999' }, /not a legal play/);
  });

  test('casting something that cannot be cast', () => {
    const g = richBoard();
    const counterspell = g.id('Counterspell');
    expectRefused(g.state, 0, { kind: 'castSpell', object: counterspell }, /not a legal play/);
    expectRefused(g.state, 0, { kind: 'castSpell', object: g.id('Mountain') }, /not a legal play/);
    expectRefused(g.state, 0, { kind: 'castSpell', object: g.id('Forest') }, /not a legal play/);
    expectRefused(g.state, 0, { kind: 'castSpell', object: 'o99999' }, /not a legal play/);
  });

  test('a sorcery with a spell on the stack, and a spell that cannot be paid', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', 'Divination')
      .battlefield('Mountain', 'Island', 'Island', 'Island')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    expectRefused(
      g.state,
      0,
      { kind: 'castSpell', object: g.id('Divination') },
      /not a legal play/,
    );
    const poor = scenario().seat(0).hand('Murder').battlefield('Swamp', 'Grizzly Bears').build();
    expectRefused(
      poor.state,
      0,
      { kind: 'castSpell', object: poor.id('Murder') },
      /not a legal play/,
    );
  });

  test('mana abilities that cannot be activated: tapped, summoning sick, not yours, no ability, bad index or color', () => {
    const g = richBoard();
    const act = (source: ObjectId, abilityIndex = 0, color: 'U' | null = null): Action => ({
      kind: 'activateAbility',
      source,
      abilityIndex,
      color,
    });
    const tappedIsland = g.id({ name: 'Island', seat: 0, nth: 1 });
    const sickElves = g.id({ name: 'Llanowar Elves', seat: 0, nth: 1 });
    const theirElves = g.id({ name: 'Llanowar Elves', seat: 1 });
    const bears = g.id({ name: 'Grizzly Bears', seat: 0, zone: 'battlefield' });
    const mountain = g.id('Mountain');
    expectRefused(g.state, 0, act(tappedIsland), /not a legal play/);
    expectRefused(g.state, 0, act(sickElves), /not a legal play/);
    expectRefused(g.state, 0, act(theirElves), /not a legal play/);
    expectRefused(g.state, 0, act(bears), /not a legal play/);
    expectRefused(g.state, 0, act(mountain, 7), /not a legal play/);
    expectRefused(g.state, 0, act(mountain, 0, 'U'), /not a legal play/);
    expectRefused(g.state, 0, act('o99999'), /not a legal play/);
  });

  test('a used mana ability cannot be used twice (CR 605.3c)', () => {
    const g = richBoard();
    g.act(0).tapForMana('Mountain');
    expectRefused(
      g.state,
      0,
      { kind: 'activateAbility', source: g.id('Mountain'), abilityIndex: 0, color: null },
      /not a legal play/,
    );
  });

  test('a finished game refuses everything', () => {
    const g = scenario().seat(0).life(0).seat(1).build();
    g.act(0).pass();
    expect(g.state.result).not.toBeNull();
    expectRefused(g.state, 0, { kind: 'pass' }, /The game is over/);
    expectRefused(g.state, 1, { kind: 'concede' }, /The game is over/);
  });

  test('conceding is always accepted by the deciding seat, and ends the game with a win for the other', () => {
    const g = richBoard();
    const r = applyAction(g.state, 0, { kind: 'concede' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.result).toEqual({ kind: 'win', winner: 1 });
  });
});

describe('SPEC 4.2: each other decision accepts only its own answers', () => {
  test('targets: no passing, paying or other answers; bad targets are refused', () => {
    const g = scenario().seat(0).hand('Lightning Bolt').battlefield('Mountain').seat(1).build();
    g.act(0).cast('Lightning Bolt');
    expectRefused(g.state, 0, { kind: 'pass' }, /Choose targets or cancel/);
    expectRefused(g.state, 0, { kind: 'payAuto' }, /Choose targets or cancel/);
    expectRefused(g.state, 0, { kind: 'keepHand' }, /Choose targets or cancel/);
    expectRefused(g.state, 0, { kind: 'chooseTargets', targets: [] }, /Choose 1 to 1 targets/);
    expectRefused(
      g.state,
      0,
      { kind: 'chooseTargets', targets: [{ kind: 'object', id: g.id('Mountain'), specId: 't1' }] },
      /not a legal target/,
    );
    expectRefused(
      g.state,
      0,
      { kind: 'chooseTargets', targets: [{ kind: 'player', seat: 1, specId: 'nope' }] },
      /./,
    );
    expectRefused(g.state, 1, { kind: 'cancel' }, /not your decision/);
  });

  test('payment: no targets, no passing; a payment that does not cover the cost is refused', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain', 'Grizzly Bears')
      .battlefield('Mountain', { tapped: true })
      .seat(1)
      .battlefield('Mountain')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }] });
    expectRefused(g.state, 0, { kind: 'pass' }, /Pay the cost or cancel/);
    expectRefused(g.state, 0, { kind: 'chooseTargets', targets: [] }, /Pay the cost or cancel/);
    expectRefused(g.state, 0, { kind: 'payManual', taps: [] }, /does not pay that cost/);
    const tap = (object: string, abilityIndex = 0): Action => ({
      kind: 'payManual',
      taps: [{ object: object as ObjectId, abilityIndex }],
    });
    expectRefused(
      g.state,
      0,
      tap(g.id({ name: 'Mountain', seat: 0, nth: 1 })),
      /cannot be activated/,
    );
    expectRefused(g.state, 0, tap(g.id({ name: 'Mountain', seat: 1 })), /cannot be activated/);
    expectRefused(g.state, 0, tap(g.id('Grizzly Bears')), /cannot be activated/);
    expectRefused(
      g.state,
      0,
      tap(g.id({ name: 'Mountain', seat: 0, nth: 0 }), 3),
      /cannot be activated/,
    );
    expectRefused(g.state, 0, tap('o99999'), /cannot be activated/);
  });

  test('the commander zone decision: only its two answers (and concede)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Isamaru, Hound of Konda', { commander: true, damage: 2 })
      .seat(1)
      .build({ settle: true });
    g.expect.pending('commanderZone', 0);
    expectRefused(g.state, 0, { kind: 'pass' }, /Choose whether/);
    expectRefused(g.state, 0, { kind: 'payAuto' }, /Choose whether/);
    expectRefused(g.state, 1, { kind: 'moveToCommandZone' }, /not your decision/);
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toEqual([
      'moveToCommandZone',
      'declineCommandZone',
      'concede',
    ]);
  });

  test('the discard decision: exactly the right number of distinct cards from the hand', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', { count: 9 })
      .battlefield('Mountain')
      .seat(1)
      .library('Island', { count: 3 })
      .at('end')
      .build();
    g.passAll();
    const [a, b, c] = g.state.seats[0]?.hand ?? [];
    if (!a || !b || !c) throw new Error('hand too small');
    for (const objects of [
      [],
      [a],
      [a, b, c],
      [a, a],
      [a, g.id('Mountain')],
      [a, 'o99999' as ObjectId],
    ]) {
      expectRefused(g.state, 0, { kind: 'chooseCards', objects }, /Choose exactly the number/);
    }
    expectRefused(g.state, 0, { kind: 'pass' }, /Choose cards to discard/);
    expectRefused(g.state, 1, { kind: 'chooseCards', objects: [a, b] }, /not your decision/);
  });

  test('the mulligan decisions', () => {
    const state = newGame(1);
    const seat = state.pending?.seat ?? 0;
    expectRefused(state, seat, { kind: 'pass' }, /Keep or take a mulligan/);
    expectRefused(state, 1 - seat, { kind: 'keepHand' }, /not your decision/);
    const mulliganed = applyAction(state, seat, { kind: 'takeMulligan' });
    if (!mulliganed.ok) throw new Error(mulliganed.error);
    const kept = applyAction(mulliganed.state, seat, { kind: 'keepHand' });
    if (!kept.ok) throw new Error(kept.error);
    expect(kept.state.pending?.kind).toBe('mulliganBottom');
    expectRefused(kept.state, seat, { kind: 'keepHand' }, /Choose cards to put on the bottom/);
    expectRefused(kept.state, seat, { kind: 'chooseCards', objects: [] }, /Choose exactly/);
  });
});

/**
 * Candidate priority actions, built to hit every rule: pass, play and cast every object that is
 * not in a library, activate every ability slot of every battlefield permanent with every color.
 */
function candidates(state: GameState): Action[] {
  const out: Action[] = [{ kind: 'pass' }];
  const colors = [null, 'W', 'U', 'B', 'R', 'G', 'C'] as const;
  const libraryObjects = new Set(state.seats.flatMap((s) => s.library));
  let sampledLibrary = 0;
  for (const obj of Object.values(state.objects)) {
    if (libraryObjects.has(obj.id)) {
      if (sampledLibrary >= 2) continue;
      sampledLibrary += 1;
    }
    out.push({ kind: 'playLand', object: obj.id }, { kind: 'castSpell', object: obj.id });
    if (obj.zone === 'battlefield') {
      for (const abilityIndex of [0, 1]) {
        for (const color of colors) {
          out.push({ kind: 'activateAbility', source: obj.id, abilityIndex, color });
        }
      }
    } else {
      out.push({ kind: 'activateAbility', source: obj.id, abilityIndex: 0, color: null });
    }
  }
  return out;
}

/** For a priority decision: accepted by applyAction if and only if listed by getLegalActions. */
function expectListedMatchesAccepted(state: GameState, where: string) {
  const d = state.pending;
  if (d?.kind !== 'priority') return;
  const before = stateHash(state);
  const legal = getLegalActions(state, d.seat);
  const everything = [...candidates(state), ...legal];
  for (const action of everything) {
    if (action.kind === 'concede') continue;
    const accepted = applyAction(state, d.seat, action).ok;
    expect(
      accepted,
      `${where}: ${JSON.stringify(action)} listed=${listed(state, d.seat, action)}`,
    ).toBe(listed(state, d.seat, action));
  }
  // And nobody else may act, and nothing was changed by all that probing.
  expect(getLegalActions(state, 1 - d.seat)).toEqual([]);
  expect(applyAction(state, 1 - d.seat, { kind: 'pass' }).ok).toBe(false);
  expect(stateHash(state)).toBe(before);
}

describe('SPEC 4.2 and 17.1 A2: getLegalActions is exactly what applyAction accepts', () => {
  test('a rich main phase for each seat with priority', () => {
    expectListedMatchesAccepted(richBoard().state, 'seat 0 main');
    const other = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .hand('Counterspell', 'Plains')
      .battlefield('Island', { count: 2 })
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    expectListedMatchesAccepted(other.state, 'seat 1 holding priority in the opponent main');
  });

  test('on every priority step', () => {
    for (const step of [
      'upkeep',
      'draw',
      'beginningOfCombat',
      'declareAttackers',
      'endOfCombat',
      'postcombatMain',
      'end',
    ] as const) {
      const g = scenario()
        .seat(0)
        .hand('Forest', 'Lightning Bolt', 'Divination')
        .battlefield('Mountain', 'Island', 'Island')
        .seat(1)
        .build();
      const at = scenario()
        .seat(0)
        .hand('Forest', 'Lightning Bolt', 'Divination')
        .battlefield('Mountain', 'Island', 'Island')
        .seat(1)
        .at(step)
        .build();
      expect(g.state.turn.step).toBe('precombatMain');
      expectListedMatchesAccepted(at.state, step);
    }
  });

  test('with a spell on the stack, with mana in the pool and after a land drop', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', 'Forest', 'Plains')
      .battlefield('Mountain', 'Mountain', 'Command Tower')
      .commander('Isamaru, Hound of Konda')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .build();
    expectListedMatchesAccepted(g.state, 'start');
    g.act(0).playLand('Forest');
    expectListedMatchesAccepted(g.state, 'after land');
    g.act(0).tapForMana('Mountain[0]');
    expectListedMatchesAccepted(g.state, 'pool');
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    expectListedMatchesAccepted(g.state, 'spell on the stack, seat 0');
    g.act(0).pass();
    expectListedMatchesAccepted(g.state, 'spell on the stack, seat 1');
  });

  test('mid-cast decisions: every listed answer is accepted (targets, then payment)', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain', 'Grizzly Bears')
      .seat(1)
      .battlefield('Llanowar Elves')
      .build();
    const cast = g.act(0).cast('Lightning Bolt');
    const targets = getLegalActions(g.state, 0);
    expect(targets.filter((a) => a.kind === 'chooseTargets')).toHaveLength(4);
    for (const action of targets)
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    cast.targets([{ player: 1 }]);
    const payment = getLegalActions(g.state, 0);
    expect(payment.map((a) => a.kind)).toEqual(['payAuto', 'cancel', 'concede']);
    for (const action of payment) expect(applyAction(g.state, 0, action).ok).toBe(true);
  });

  test('along a whole random game, at every 7th state', () => {
    let n = 0;
    play(newGame(4), randomPolicy(12), 350, (state) => {
      n += 1;
      if (n % 7 === 0) expectListedMatchesAccepted(state, `random game state ${n}`);
    });
    expect(n).toBe(350);
  });

  test('every listed action of every kind of decision is accepted, in a random game', () => {
    let checked = 0;
    play(newGame(6), randomPolicy(21), 300, (state) => {
      const d = state.pending;
      if (d === null) return;
      for (const action of getLegalActions(state, d.seat)) {
        if (action.kind === 'concede') continue;
        expect(applyAction(state, d.seat, action).ok, `${d.kind}: ${JSON.stringify(action)}`).toBe(
          true,
        );
        checked += 1;
      }
    });
    expect(checked).toBeGreaterThan(300);
  });
});
