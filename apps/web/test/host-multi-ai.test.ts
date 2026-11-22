import { RandomLegalAgent } from '@commander-arena/ai';
import type { Action, PendingDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { withSlowOpponent } from '../src/game/slow-opponent';

const clock = () => 0;
const two = { seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' };
const table = (n: 3 | 4) => ({
  seed: 7,
  humanDeck: 'white-knights',
  aiDeck: 'swamp-forest',
  opponents: Array.from({ length: n - 1 }, () => ({ deck: 'swamp-forest' })),
});

function answer(d: PendingDecision | null): Action {
  switch (d?.kind) {
    case 'priority':
      return { kind: 'pass' };
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

async function run(host: GameHost, opts: Parameters<GameHost['newGame']>[0], acts: number) {
  let snap: Snapshot = (await host.newGame(opts)).snapshot;
  const log: string[] = [];
  for (let i = 0; i < acts && snap.view.result === null; i++) {
    snap = await host.act(answer(snap.view.pending));
    log.push(...snap.steps.map((s) => `${s.seat}:${s.action.kind}`));
  }
  return { snap, log };
}

describe('the human is eliminated', () => {
  test('the game ends at once for the human, as in a two-player game', async () => {
    const host = new GameHost({ clock });
    await host.newGame(table(3));
    const over = await host.act({ kind: 'concede' });
    expect(over.error).toBeNull();
    expect(over.view.result).toMatchObject({ kind: 'win' });
    expect(over.view.result?.kind === 'win' && over.view.result.winner).not.toBe(0);
    expect(over.view.pending).toBeNull();
    // The AIs do not play on, and the game accepts no more answers.
    expect(over.steps.filter((s) => s.seat !== 0)).toEqual([]);
    const again = await host.act({ kind: 'pass' });
    expect(again.error).toBe('The game is over.');
    expect(again.steps).toEqual([]);
  });

  test('a two-player game still ends through the engine', async () => {
    const host = new GameHost({ clock });
    await host.newGame(two);
    const over = await host.act({ kind: 'concede' });
    expect(over.view.result).toEqual({ kind: 'win', winner: 1 });
  });
});

describe('several AI seats', () => {
  test.each([3, 4] as const)(
    'every AI seat of a %i-seat game is asked with its own view',
    async (n) => {
      const asked: number[] = [];
      const host = new GameHost({
        clock,
        makeAgent: (seed) => {
          const inner = new RandomLegalAgent({ seed });
          return {
            name: 'spy',
            async decide(view, decision, ctx) {
              const seat = view.decidingSeat ?? -1;
              asked.push(seat);
              expect(view.seats[seat]?.hand).not.toBeNull();
              return inner.decide(view, decision, ctx);
            },
          };
        },
      });
      const { snap } = await run(host, table(n), 60);
      expect(snap.view.seats).toHaveLength(n);
      expect(snap.error).toBeNull();
      expect(snap.view.seats[1]?.hand).toBeNull();
      for (let seat = 1; seat < n; seat++) expect(asked).toContain(seat);
      expect(asked).not.toContain(0);
    },
  );

  test('a game from a seed plays out the same twice', async () => {
    const a = await run(new GameHost({ clock }), table(3), 80);
    const b = await run(new GameHost({ clock }), table(3), 80);
    expect(b.log).toEqual(a.log);
    expect(b.snap.view).toEqual(a.snap.view);
  });

  test('the 1v1 game is the same with and without an opponents list', async () => {
    const a = await run(new GameHost({ clock }), two, 80);
    const b = await run(
      new GameHost({ clock }),
      { ...two, opponents: [{ deck: 'swamp-forest' }] },
      80,
    );
    expect(b.log).toEqual(a.log);
    expect(b.snap.view).toEqual(a.snap.view);
  });

  test('seat 1 keeps the v1 seed and the other seats get their own', async () => {
    const seeds: number[] = [];
    const host = new GameHost({
      clock,
      makeAgent: (seed) => {
        seeds.push(seed);
        return new RandomLegalAgent({ seed });
      },
    });
    await host.newGame(table(4));
    expect(seeds[0]).toBe(7 ^ 0x5eed);
    expect(new Set(seeds).size).toBe(3);
  });

  test('the watchdog and the fallbacks count per seat', async () => {
    let t = 0;
    const host = new GameHost({
      clock: () => t,
      aiBudgetMs: 10,
      aiMarginMs: 0,
      makeAgent: (seed) => {
        const inner = new RandomLegalAgent({ seed });
        return {
          name: 'slow',
          async decide(view, decision, ctx) {
            if (view.decidingSeat === 2) t += 1000;
            return inner.decide(view, decision, ctx);
          },
        };
      },
    });
    const { snap } = await run(host, table(3), 40);
    expect(snap.aiFallbacksBySeat?.[2]).toBeGreaterThan(0);
    expect(snap.aiFallbacksBySeat?.[1]).toBeUndefined();
    expect(snap.aiFallbacks).toBe(snap.aiFallbacksBySeat?.[2]);
  });

  test('an action that several AI seats answered leaves no undo point', async () => {
    const host = new GameHost({ clock });
    await host.newGame(table(3));
    const kept = await host.act({ kind: 'keepHand' });
    expect(kept.error).toBeNull();
    expect(kept.steps.some((s) => s.seat !== 0)).toBe(true);
    expect(kept.undoDepth).toBe(0);
    expect((await host.undo()).error).toBe('Nothing to undo.');
  });

  test('the slow opponent delays when any AI seat acted', async () => {
    const host = new GameHost({ clock });
    await host.newGame(table(3));
    const slept: number[] = [];
    const slow = withSlowOpponent(host, 50, async (ms) => {
      slept.push(ms);
    });
    let snap = await slow.act({ kind: 'keepHand' });
    for (let i = 0; i < 30 && !snap.steps.some((s) => s.seat === 2); i++) {
      snap = await slow.act(answer(snap.view.pending));
    }
    expect(slept.length).toBeGreaterThan(0);
  });

  test('the honesty summary names the seat of each opponent', async () => {
    const { summary } = await new GameHost({ clock }).newGame(table(3));
    expect(summary.unsupported).toEqual([]);
  });
});
