/**
 * Scry, surveil, reorder and put on top (CR 701.22, 701.25, D-091) through the game host with the
 * hidden SYNTHETIC deck `synthetic-library`: the human's decision and cards in the view, the answer
 * of the scripted human (`test/bot.ts`), the log lines and what they never say.
 */
import type { GameView } from '@commander-arena/engine';
import { expect, test, vi } from 'vitest';
import { GameHost } from '../src/game/host';
import { chooseAction } from './bot';
import {
  arrangeOf,
  arranging,
  BRAINSTORM,
  LIBRARY_DECK,
  putOnTopOf,
  puttingOnTop,
  REORDER,
  SEER,
  searchLibrary,
  startHost,
  WATCHER,
} from './library-decks';
import type { Session } from './ward-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 120_000 });

const AI = 'swamp-forest';

async function reach(cast: string, accept: (view: GameView) => boolean) {
  const reached = await searchLibrary(startHost(LIBRARY_DECK, AI), [cast], accept);
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached.session;
}

const texts = (session: Session) => session.log().map((l) => l.text);

test('a scry shows the viewer the cards looked at; the answer of the scripted human is accepted', async () => {
  const session = await reach(SEER, arranging('scry'));
  const view = session.snapshot().view;
  const d = arrangeOf(view);
  expect(d.piles).toEqual(['top', 'bottom']);
  expect(d.cards).toHaveLength(2);
  // The faces are in the view, in the decision's order, for this seat alone.
  expect(view.pendingCards?.map((c) => c.id)).toEqual(d.cards);
  const answer = chooseAction(view, d);
  expect(answer).toEqual({ kind: 'arrangeCards', top: d.cards, other: [] });
  expect(await session.act(answer)).not.toBeNull();
  expect(session.snapshot().view.pending?.kind).not.toBe('arrangeCards');
  expect(texts(session)).toContain('You scry 2: 2 on top.');
  expect(session.log().find((l) => l.text === 'You scry 2: 2 on top.')?.rule).toBe('CR 701.22');
});

test('a scry with a card moved to the bottom says how many went where, and names no card', async () => {
  const session = await reach(SEER, arranging('scry'));
  const d = arrangeOf(session.snapshot().view);
  const [first, second] = d.cards;
  if (first === undefined || second === undefined) throw new Error('two cards expected');
  const names = (session.snapshot().view.pendingCards ?? []).map((c) => c.name);
  const sent = await session.act({ kind: 'arrangeCards', top: [second], other: [first] });
  expect(sent).not.toBeNull();
  const line = texts(session).find((t) => t.startsWith('You scry 2'));
  expect(line).toBe('You scry 2: 1 on top, 1 on the bottom.');
  // The cards stayed in the library: nothing moved between zones, so no zone-change line.
  const after = texts(session).slice(texts(session).indexOf(line ?? ''));
  for (const name of new Set(names)) {
    expect(after.some((t) => t.startsWith(`${name}: library`))).toBe(false);
  }
});

test('a surveil sends cards into the graveyard, and the zone-change lines name them', async () => {
  const session = await reach(WATCHER, arranging('surveil'));
  const view = session.snapshot().view;
  const d = arrangeOf(view);
  expect(d.piles).toEqual(['top', 'graveyard']);
  const [first, second] = d.cards;
  const gone = view.pendingCards?.find((c) => c.id === first)?.name;
  if (first === undefined || second === undefined || gone === undefined) throw new Error('cards');
  const graveyardBefore = view.seats[view.viewer]?.graveyard.length ?? 0;
  expect(await session.act({ kind: 'arrangeCards', top: [second], other: [first] })).not.toBeNull();
  const lines = texts(session);
  expect(lines).toContain('You surveil 2: 1 on top, 1 into the graveyard.');
  expect(lines).toContain(`${gone}: library to graveyard`);
  expect(session.snapshot().view.seats[view.viewer]?.graveyard).toHaveLength(graveyardBefore + 1);
});

test('"look at the top cards and put them back" shows one pile and logs nothing of its own', async () => {
  const session = await reach(REORDER, arranging('reorder'));
  const d = arrangeOf(session.snapshot().view);
  expect(d.piles).toEqual(['top']);
  const before = session.log().length;
  const reversed = [...d.cards].reverse();
  expect(await session.act({ kind: 'arrangeCards', top: reversed, other: [] })).not.toBeNull();
  // A reorder is not a scry (D-093): no scry line, and the cards do not leave the library.
  expect(
    texts(session)
      .slice(before)
      .some((t) => /scr|surveil/i.test(t)),
  ).toBe(false);
});

test('putting cards from the hand on top: one line with the count, never a card name', async () => {
  const session = await reach(BRAINSTORM, puttingOnTop);
  const view = session.snapshot().view;
  const d = putOnTopOf(view);
  expect([d.min, d.max]).toEqual([2, 2]);
  expect(d.reveal).toBe(false);
  const picked = d.legal.slice(0, 2);
  const names = picked.map((id) => view.pendingCards?.find((c) => c.id === id)?.name ?? '');
  const before = session.log().length;
  expect(await session.act({ kind: 'chooseCards', objects: picked })).not.toBeNull();
  const fresh = texts(session).slice(before);
  expect(fresh).toContain('You put 2 cards on top of your library.');
  // The zone changes from the hand to the library carry ids only and are not logged one by one.
  expect(fresh.some((t) => t.includes('hand to library'))).toBe(false);
  expect(
    fresh.filter((t) => t.includes('library') && names.some((n) => n !== '' && t.includes(n))),
  ).toEqual([]);
});

test('the opponent scrying, surveilling and putting cards on top are logged by count only', async () => {
  const seen = new Set<string>();
  const hidden: string[] = [];
  for (let seed = 1; seed <= 12 && seen.size < 3; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: AI, aiDeck: LIBRARY_DECK })).snapshot;
    const lines = snap.log.map((l) => l.text);
    for (let i = 0; i < 400; i += 1) {
      const view = snap.view;
      if (view.result !== null || view.pending === null) break;
      const next = await host.act(chooseAction(view, view.pending));
      if (next.error !== null) break;
      snap = next;
      lines.push(...next.log.map((l) => l.text));
    }
    for (const t of lines) {
      if (/^Opponent scries \d+: /.test(t)) seen.add('scry');
      if (/^Opponent surveils \d+: /.test(t)) seen.add('surveil');
      if (/^Opponent puts \d+ cards? on top of their library\.$/.test(t)) seen.add('puts');
      if (t.includes('hand to library')) hidden.push(t);
    }
  }
  expect([...seen].sort()).toEqual(['puts', 'scry', 'surveil']);
  expect(hidden).toEqual([]);
});
