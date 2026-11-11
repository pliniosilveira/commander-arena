/**
 * Keyword batch 1 (D-104, D-110) through the game host with the hidden SYNTHETIC deck
 * `synthetic-keyword-batch`: the multikicker question and its answer, the cast line and the badge
 * data, poison on the opponent and its log line, and the options and the note under split second.
 * Seeds are searched, not fixed.
 */
import type { GameView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import type { Snapshot } from '../src/game/protocol';
import { hasRelevantAction } from '../src/policy/should-stop';
import { priorityDetail, SPLIT_SECOND_HINT } from '../src/ui/decisions/priority';
import { kickedWords } from '../src/ui/format';
import { pressCancel } from './abilities-decks';
import {
  asksMultikicker,
  holdsPriorityUnderSplitSecond,
  opponentPoisoned,
  reachKeywords,
} from './keywords-decks';
import { pressButton } from './mana-decks';

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);

async function must(accept: (view: GameView) => boolean) {
  const reached = await reachKeywords(accept);
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached;
}

describe('the multikicker question', () => {
  test('it names the card and the cost; 0 to the most are legal; the confirm button names the count', async () => {
    const { snap } = await must(asksMultikicker('SYNTHETIC Volley Barrage', 2));
    const d = snap.view.pending;
    if (d?.kind !== 'chooseX') throw new Error('wrong decision');
    expect(d.purpose).toBe('multikicker');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1'] }]);
    expect(d.perX).toEqual({ mana: 0, life: 0 });
    expect(d.min).toBe(0);
    expect(d.max).toBeGreaterThanOrEqual(2);
    expect(pressButton(snap.view, "Don't kick")).toEqual({ kind: 'chooseX', value: 0 });
    expect(pressButton(snap.view, 'Kick once', (ui) => ({ ...ui, x: 1 }))).toEqual({
      kind: 'chooseX',
      value: 1,
    });
    expect(pressButton(snap.view, 'Kick 2 times', (ui) => ({ ...ui, x: 2 }))).toEqual({
      kind: 'chooseX',
      value: 2,
    });
    expect(pressCancel(snap.view)).toEqual({ kind: 'cancel' });
  });

  test('2 kicks: the cast is logged "kicked 2 times", the stack object has kicks, the damage matches', async () => {
    const { host, snap } = await must(asksMultikicker('SYNTHETIC Volley Barrage', 2));
    const before = snap.view.seats[1]?.life ?? 0;
    const chose = await host.act(pressButton(snap.view, 'Kick 2 times', (ui) => ({ ...ui, x: 2 })));
    expect(chose.error).toBeNull();
    let next = chose;
    if (next.view.pending?.kind === 'targets') {
      const legal = next.view.pending.specs.flatMap((s) => s.legal);
      const face = legal.find((t) => t.kind === 'player' && t.seat !== next.view.viewer);
      if (face === undefined) throw new Error('the opponent is not a legal target');
      next = await host.act({ kind: 'chooseTargets', targets: [face] });
      expect(next.error).toBeNull();
    }
    if (next.view.pending?.kind === 'payMana') {
      // The cost has the multikicker cost once for each kick: {R} and {1}{1}.
      expect([...next.view.pending.totalCost].sort()).toEqual(['1', '1', 'R']);
      next = await host.act({ kind: 'payAuto' });
      expect(next.error).toBeNull();
    }
    expect(texts(next)).toContain('You cast SYNTHETIC Volley Barrage, kicked 2 times.');
    const spell = next.view.stack.find((o) => o.name === 'SYNTHETIC Volley Barrage');
    expect(spell?.kicks).toBe(2);
    expect(kickedWords(spell ?? {})).toBe('kicked 2 times');
    let done = next;
    for (let i = 0; i < 6 && done.view.stack.length > 0; i += 1) {
      done = await host.act({ kind: 'pass' });
      expect(done.error).toBeNull();
    }
    expect(done.view.seats[1]?.life).toBe(before - 2);
  });

  test('Cancel rewinds the cast: nothing was cast', async () => {
    const { host, snap } = await must(asksMultikicker('SYNTHETIC Volley Barrage'));
    const back = await host.act({ kind: 'cancel' });
    expect(back.error).toBeNull();
    expect(back.view.stack).toEqual([]);
    expect(texts(back).some((t) => t.includes('You cast SYNTHETIC Volley Barrage'))).toBe(false);
    expect(back.view.pending?.kind).toBe('priority');
    void snap;
  });
});

describe('poison', () => {
  test('an infect hit puts counters on the opponent, shown by the view and the log', async () => {
    const { snap } = await must(opponentPoisoned);
    const opponent = snap.view.seats.find((s) => s.id !== snap.view.viewer);
    expect(opponent?.poison).toBeGreaterThan(0);
    const line = texts(snap).find((t) =>
      /^Opponent gets \d+ poison counters? \(\d+ of 10\)\.$/.test(t),
    );
    expect(line).toBeDefined();
  });
});

describe('split second', () => {
  test('the human who holds priority is offered nothing, and the bar says why', async () => {
    const { snap } = await must(holdsPriorityUnderSplitSecond);
    const p = snap.view.pending;
    if (p?.kind !== 'priority') throw new Error('wrong decision');
    expect(p.options.some((o) => o.kind === 'castSpell' || o.kind === 'activate')).toBe(false);
    expect(hasRelevantAction(snap.view, p)).toBe(false);
    expect(priorityDetail(snap.view)).toBe(SPLIT_SECOND_HINT);
    const spell = snap.view.stack.find((o) => o.keywords.includes('splitSecond'));
    expect(spell?.name).toMatch(/SYNTHETIC Hush (Bolt|Gain)/);
  });
});
