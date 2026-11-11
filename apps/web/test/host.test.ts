import { RandomLegalAgent } from '@commander-arena/ai';
import type { Action, PendingDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { deckFor, preconById } from '../src/game/precons';

const clock = () => 0;
const options = { seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' };

/** Plays the human seat with the same random policy until the game ends or `limit` answers. */
async function play(host: GameHost, limit: number) {
  const started = await host.newGame(options);
  let snap = started.snapshot;
  const human = new RandomLegalAgent({ seed: 99 });
  let answers = 0;
  while (snap.view.result === null && answers < limit) {
    const decision = snap.view.pending;
    if (decision === null) throw new Error('the human has nothing pending');
    const action = await human.decide(snap.view, decision, { budgetMs: 1000, now: clock });
    snap = await host.act(action);
    expect(snap.error).toBeNull();
    answers += 1;
  }
  return { snap, answers };
}

test('a new game stops at the human first decision with a view that hides the AI hand', async () => {
  const host = new GameHost({ clock });
  const { snapshot, summary } = await host.newGame(options);
  expect(snapshot.view.pending).not.toBeNull();
  expect(snapshot.view.decidingSeat).toBe(0);
  expect(snapshot.view.seats[1]?.hand).toBeNull();
  expect(snapshot.view.seats[0]?.hand).toHaveLength(7);
  expect(summary.unsupported).toEqual([]);
});

test('the host plays a whole game against the AI through actions only', async () => {
  const host = new GameHost({ clock });
  const { snap } = await play(host, 4000);
  expect(snap.view.result).not.toBeNull();
  expect(snap.aiFallbacks).toBe(0);
});

test('an illegal action is refused and leaves the game unchanged', async () => {
  const host = new GameHost({ clock });
  const { snapshot } = await host.newGame(options);
  const bad: Action = { kind: 'declareBlockers', blocks: [] };
  const reply = await host.act(bad);
  expect(reply.error).not.toBeNull();
  expect(reply.view.pending).toEqual(snapshot.view.pending);
  expect(reply.steps).toEqual([]);
});

test('the same seed and the same human answers reach the same game', async () => {
  // The AI is seeded too, so two hosts fed identical answers end in the same view.
  const first = await play(new GameHost({ clock }), 120);
  const second = await play(new GameHost({ clock }), 120);
  expect(second.snap.actionCount).toBe(first.snap.actionCount);
  expect(second.snap.view).toEqual(first.snap.view);
});

test('a decision that overruns its budget is replaced and counted (A28)', async () => {
  let t = 0;
  const slow = new RandomLegalAgent({ seed: 1 });
  const host = new GameHost({
    clock: () => t,
    aiBudgetMs: 10,
    aiMarginMs: 0,
    makeAgent: () => ({
      name: 'slow',
      async decide(view, decision, ctx) {
        t += 1000;
        return slow.decide(view, decision, ctx);
      },
    }),
  });
  const { snap } = await play(host, 60);
  expect(snap.aiFallbacks).toBeGreaterThan(0);
});

/** Any legal answer to a non-priority decision, for tests that only need the game to move on. */
function chooseAny(d: PendingDecision | null): Action {
  switch (d?.kind) {
    case 'mulligan':
      return { kind: 'keepHand' };
    case 'mulliganBottom':
    case 'discard':
      return { kind: 'chooseCards', objects: d.hand.slice(0, d.count) };
    case 'payMana':
      return { kind: 'payAuto' };
    case 'commanderZone':
      return { kind: 'moveToCommandZone' };
    case 'declareAttackers':
      return { kind: 'declareAttackers', attacks: [] };
    case 'declareBlockers':
      return { kind: 'declareBlockers', blocks: [] };
    default:
      return { kind: 'concede' };
  }
}

describe('undo (D-050)', () => {
  async function toFirstMainWithLand() {
    const host = new GameHost({ clock });
    const started = await host.newGame({
      seed: 7,
      humanDeck: 'white-knights',
      aiDeck: 'swamp-forest',
    });
    let snap = started.snapshot;
    // Keep, then pass until the human has priority in a main phase with a land to play.
    snap = await host.act({ kind: 'keepHand' });
    for (let i = 0; i < 40; i++) {
      const d = snap.view.pending;
      if (d?.kind === 'priority' && d.options.some((o) => o.kind === 'playLand'))
        return { host, snap };
      snap = await host.act(d?.kind === 'priority' ? { kind: 'pass' } : chooseAny(d));
    }
    throw new Error('never reached a main phase with a land');
  }

  test('taking back a land play restores the hand, the log and the action count', async () => {
    const { host, snap } = await toFirstMainWithLand();
    const land =
      snap.view.pending?.kind === 'priority'
        ? snap.view.pending.options.find((o) => o.kind === 'playLand')
        : undefined;
    if (land?.kind !== 'playLand') throw new Error('no land');
    const played = await host.act({ kind: 'playLand', object: land.object });
    expect(played.error).toBeNull();
    expect(played.undoDepth).toBe(1);
    expect(played.view.battlefield.some((o) => o.id !== undefined && o.controller === 0)).toBe(
      true,
    );

    const undone = await host.undo();
    expect(undone.error).toBeNull();
    expect(undone.undoDepth).toBe(0);
    expect(undone.view).toEqual(snap.view);
    expect(undone.actionCount).toBe(snap.actionCount);
    expect(undone.logReset).not.toBeNull();
    expect(undone.logReset?.some((l) => l.text.includes('You play'))).toBe(false);
  });

  test('a pass clears the history: nothing the opponent has acted after can be undone', async () => {
    const { host, snap } = await toFirstMainWithLand();
    const land =
      snap.view.pending?.kind === 'priority'
        ? snap.view.pending.options.find((o) => o.kind === 'playLand')
        : undefined;
    if (land?.kind !== 'playLand') throw new Error('no land');
    await host.act({ kind: 'playLand', object: land.object });
    const passed = await host.act({ kind: 'pass' });
    expect(passed.undoDepth).toBe(0);
    const refused = await host.undo();
    expect(refused.error).not.toBeNull();
  });

  test('an undo leaves the game exactly as it was before the move', async () => {
    const { host, snap } = await toFirstMainWithLand();
    const land =
      snap.view.pending?.kind === 'priority'
        ? snap.view.pending.options.find((o) => o.kind === 'playLand')
        : undefined;
    if (land?.kind !== 'playLand') throw new Error('no land');
    await host.act({ kind: 'playLand', object: land.object });
    const undone = await host.undo();
    expect(undone.error).toBeNull();
    expect(undone.actionCount).toBe(snap.actionCount);
    expect(undone.view).toEqual(snap.view);
  });

  test('a cast can be taken back step by step, and cancelling leaves no stale points', async () => {
    const { host, snap } = await toFirstMainWithLand();
    // Play a land, then try to cast something with it and cancel at the targets or payment.
    const land =
      snap.view.pending?.kind === 'priority'
        ? snap.view.pending.options.find((o) => o.kind === 'playLand')
        : undefined;
    if (land?.kind !== 'playLand') throw new Error('no land');
    let s = await host.act({ kind: 'playLand', object: land.object });
    expect(s.undoDepth).toBe(1);
    const cast =
      s.view.pending?.kind === 'priority'
        ? s.view.pending.options.find((o) => o.kind === 'castSpell')
        : undefined;
    if (cast?.kind === 'castSpell') {
      s = await host.act({ kind: 'castSpell', object: cast.object });
      if (s.view.pending?.kind === 'payMana' || s.view.pending?.kind === 'targets') {
        s = await host.act({ kind: 'cancel' });
        expect(s.undoDepth).toBe(1);
      }
    }
    s = await host.undo();
    expect(s.view).toEqual(snap.view);
  });
});

describe('mulligans', () => {
  async function takeOneMulliganThenKeep(freeMulligan: boolean | undefined) {
    const host = new GameHost({ clock });
    const started = await host.newGame({
      seed: 7,
      humanDeck: 'white-knights',
      aiDeck: 'swamp-forest',
      ...(freeMulligan === undefined ? {} : { freeMulligan }),
    });
    expect(started.snapshot.view.pending?.kind).toBe('mulligan');
    const again = await host.act({ kind: 'takeMulligan' });
    expect(again.view.pending?.kind).toBe('mulligan');
    return host.act({ kind: 'keepHand' });
  }

  test('the first mulligan is free by default: keep seven, nothing goes to the bottom', async () => {
    const kept = await takeOneMulliganThenKeep(undefined);
    expect(kept.error).toBeNull();
    expect(kept.view.pending?.kind).not.toBe('mulliganBottom');
    expect(kept.view.seats[0]?.hand).toHaveLength(7);
  });

  test('without the free mulligan, keeping after one mulligan bottoms a card', async () => {
    const kept = await takeOneMulliganThenKeep(false);
    expect(kept.view.pending?.kind).toBe('mulliganBottom');
    if (kept.view.pending?.kind !== 'mulliganBottom') return;
    expect(kept.view.pending.count).toBe(1);
  });

  test('the second mulligan after a free one bottoms exactly one card', async () => {
    const host = new GameHost({ clock });
    await host.newGame({ seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
    await host.act({ kind: 'takeMulligan' });
    await host.act({ kind: 'takeMulligan' });
    const kept = await host.act({ kind: 'keepHand' });
    expect(kept.view.pending?.kind).toBe('mulliganBottom');
    if (kept.view.pending?.kind === 'mulliganBottom') expect(kept.view.pending.count).toBe(1);
  });
});

test('an imported deck can be played in place of a test deck', async () => {
  const host = new GameHost({ clock });
  const deck = deckFor(preconById('instants'));
  const started = await host.newGame({
    seed: 3,
    humanDeck: 'my-import',
    aiDeck: 'swamp-forest',
    humanCards: deck,
  });
  const names = started.snapshot.view.seats[0]?.hand?.map((o) => o.name) ?? [];
  expect(names).toHaveLength(7);
  const instantsPool = new Set(deck.cards.map((c) => c.name));
  expect(names.every((n) => instantsPool.has(n))).toBe(true);
  expect(started.snapshot.view.seats[0]?.command[0]?.name).toBe('Yargle, Glutton of Urborg');
});
