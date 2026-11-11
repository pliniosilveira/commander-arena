/**
 * The division of damage end to end through the page's store (D-145), in a real game of the hidden SYNTHETIC deck
 * `synthetic-dinosaurs`: the engine asks the division with the targets, the page's own helpers pick two targets and the even
 * split, the engine accepts the answer and the stack item shows each target with its share.
 */
import type { ChosenTarget, GameView, ObjectView, TargetsDecision } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { isOwnHideaway } from '../src/game/later-text';
import { bumpShare, divisionComplete } from '../src/ui/decisions/divide';
import { toggleTarget } from '../src/ui/decisions/targeting';
import { asksDivide, asksHideaway, reachDinosaursStore } from './dinosaurs-decks';

const targetsOf = (view: GameView | undefined): TargetsDecision => {
  const pending = view?.pending;
  if (pending?.kind !== 'targets') throw new Error('no targets decision');
  return pending;
};

test('an Arc Volley divides 3 damage: two targets, the even split, a step, the stack shows the shares', async () => {
  const store = await reachDinosaursStore(asksDivide, /Arc Volley/, { seeds: 40 });
  if (store === null) throw new Error('no seed reaches the division');
  const d = targetsOf(store.getState().snapshot?.view);
  const spec = d.specs[0];
  expect(spec?.divide).toBe(3);
  expect(spec?.max).toBe(3);
  // The engine refuses an answer with no share on a slot that divides.
  const [first, second] = spec?.legal ?? [];
  if (first === undefined || second === undefined) throw new Error('fewer than two legal targets');
  await store
    .getState()
    .act({ kind: 'chooseTargets', targets: [{ ...first, specId: spec?.specId ?? '' }] });
  expect(store.getState().error).not.toBeNull();

  // The page's helpers: two targets, split 2 and 1, then one step moves the damage to the second target.
  const specs = d.specs;
  let picks: readonly ChosenTarget[] = toggleTarget(specs, [], first);
  expect(picks.map((p) => p.share)).toEqual([3]);
  picks = toggleTarget(specs, picks, second);
  expect(picks.map((p) => p.share)).toEqual([2, 1]);
  expect(divisionComplete(specs, picks)).toBe(true);
  const firstPick = picks[0];
  const secondPick = picks[1];
  if (firstPick === undefined || secondPick === undefined) throw new Error('no picks');
  picks = bumpShare(specs, picks, firstPick, firstPick.specId, -1);
  expect(divisionComplete(specs, picks)).toBe(false);
  picks = bumpShare(specs, picks, secondPick, secondPick.specId, 1);
  expect(picks.map((p) => p.share)).toEqual([1, 2]);
  expect(divisionComplete(specs, picks)).toBe(true);

  await store.getState().act({ kind: 'chooseTargets', targets: [...picks] });
  expect(store.getState().error).toBeNull();
  // The spell resolved with the shares it was cast with: each target was dealt its own.
  const log = store.getState().log.map((l) => l.text);
  expect(log.some((t) => /^SYNTHETIC Arc Volley deals 1 damage to /.test(t))).toBe(true);
  expect(log.some((t) => /^SYNTHETIC Arc Volley deals 2 damage to /.test(t))).toBe(true);
}, 120_000);

test('Hideaway looks at the top cards, must take one and exiles it face down for its controller alone', async () => {
  const store = await reachDinosaursStore(asksHideaway, /Hidden Cache/, { seeds: 40 });
  if (store === null) throw new Error('no seed reaches Hideaway');
  const pending = store.getState().snapshot?.view.pending;
  if (pending?.kind !== 'chooseCards') throw new Error('no question');
  expect(pending.min).toBe(1);
  expect(pending.max).toBe(1);
  // Nothing taken is not an answer.
  await store.getState().act({ kind: 'chooseCards', objects: [] });
  expect(store.getState().error).not.toBeNull();
  const [card] = pending.legal;
  if (card === undefined) throw new Error('no card to take');
  await store.getState().act({ kind: 'chooseCards', objects: [card] });
  expect(store.getState().error).toBeNull();
  const view = store.getState().snapshot?.view;
  const hidden = view?.exile.find((o) => o.faceDown === true);
  // The controller of the permanent sees the whole card, face down: a real name, not the placeholder.
  expect(hidden).toBeDefined();
  expect(hidden?.name).not.toBe('Face-down card');
  expect(isOwnHideaway(hidden as ObjectView)).toBe(true);
  // The log says a card was exiled face down and names none (the other player reads the same log).
  const log = store.getState().log.map((l) => l.text);
  expect(log).toContain('You exile a card face down (Hideaway).');
  expect(log.some((t) => t.endsWith(': library to exile'))).toBe(false);
}, 120_000);
