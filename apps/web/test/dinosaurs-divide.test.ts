/**
 * The division of damage among the targets of a spell (D-145, CR 601.2d) as pure models: the even split a new choice starts
 * with, the steppers, what is left to assign, the slots that are complete, and the decision's own model (the prompt, the detail,
 * Confirm only when the shares add up, the answer that carries the shares). No DOM.
 */
import type {
  Action,
  ChosenTarget,
  GameView,
  PendingDecision,
  TargetChoiceSpec,
  TargetsDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  bumpShare,
  divideTotal,
  divisionComplete,
  divisionHint,
  divisionLine,
  evenShares,
  shareOf,
  sharesLeft,
  withEvenShares,
} from '../src/ui/decisions/divide';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { targetsPrompt } from '../src/ui/decisions/target-prompt';
import { currentSlot, targetsReady, toggleTarget } from '../src/ui/decisions/targeting';
import { initialUi } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const obj = (id: `o${number}`, specId = 't1', share?: number): ChosenTarget => ({
  kind: 'object',
  id,
  specId,
  ...(share === undefined ? {} : { share }),
});
const player = (seat: number, specId = 't1'): ChosenTarget => ({ kind: 'player', seat, specId });

const divided = (total: number, min = 0, max = total): TargetChoiceSpec => ({
  specId: 't1',
  min,
  max,
  divide: total,
  legal: [obj('o1'), obj('o2'), obj('o3'), player(1)],
});
const plain: TargetChoiceSpec = { specId: 't2', min: 1, max: 1, legal: [obj('o4', 't2')] };

describe('the shares', () => {
  test('an even split gives the larger shares first and never less than 1', () => {
    expect(evenShares(5, 1)).toEqual([5]);
    expect(evenShares(5, 2)).toEqual([3, 2]);
    expect(evenShares(5, 3)).toEqual([2, 2, 1]);
    expect(evenShares(3, 3)).toEqual([1, 1, 1]);
    expect(evenShares(7, 3)).toEqual([3, 2, 2]);
    expect(evenShares(5, 0)).toEqual([]);
    expect(evenShares(2, 3)).toEqual([1, 1, 1]);
  });

  test('a new choice starts as the even split, in the order picked', () => {
    const specs = [divided(5)];
    let picks = toggleTarget(specs, [], obj('o1', ''));
    expect(picks.map((p) => p.share)).toEqual([5]);
    picks = toggleTarget(specs, picks, obj('o2', ''));
    expect(picks.map((p) => p.share)).toEqual([3, 2]);
    picks = toggleTarget(specs, picks, { kind: 'player', seat: 1, specId: '' });
    expect(picks.map((p) => p.share)).toEqual([2, 2, 1]);
    // A target taken back starts the division over among those left.
    picks = toggleTarget(specs, picks, obj('o1', ''));
    expect(picks.map((p) => p.share)).toEqual([3, 2]);
    expect(divisionComplete(specs, picks)).toBe(true);
  });

  test('a slot that divides nothing never gets a share, and nothing changes for it', () => {
    const specs = [plain];
    const picks = toggleTarget(specs, [], obj('o4', ''));
    expect(picks).toEqual([{ kind: 'object', id: 'o4', specId: 't2' }]);
    expect(withEvenShares(specs, picks)).toBe(picks);
    expect(divideTotal(specs, 't2')).toBeNull();
    expect(sharesLeft(specs, picks, 't2')).toBe(0);
    expect(divisionComplete(specs, picks)).toBe(true);
    // Two slots: only the one that divides is shared out.
    const both = [divided(4, 1, 2), plain];
    const two = toggleTarget(both, toggleTarget(both, [], obj('o1', '')), obj('o4', ''));
    expect(two.map((p) => [p.specId, p.share])).toEqual([
      ['t1', 4],
      ['t2', undefined],
    ]);
  });

  test('the steppers keep every share at 1 or more and the sum within the total', () => {
    const specs = [divided(5)];
    let picks = withEvenShares(specs, [obj('o1'), obj('o2')]);
    const [a, b] = picks;
    if (a === undefined || b === undefined) throw new Error('no picks');
    expect(sharesLeft(specs, picks, 't1')).toBe(0);
    // Nothing is left, so "+" changes nothing and the same array comes back.
    expect(bumpShare(specs, picks, a, 't1', 1)).toBe(picks);
    picks = bumpShare(specs, picks, a, 't1', -1);
    expect(picks.map((p) => p.share)).toEqual([2, 2]);
    expect(sharesLeft(specs, picks, 't1')).toBe(1);
    expect(divisionComplete(specs, picks)).toBe(false);
    expect(divisionHint(specs, picks)).toBe('1 damage left to assign');
    picks = bumpShare(specs, picks, b, 't1', 1);
    expect(picks.map((p) => p.share)).toEqual([2, 3]);
    expect(divisionComplete(specs, picks)).toBe(true);
    // Never below 1: a target that is chosen gets damage.
    let low = picks;
    for (let i = 0; i < 6; i += 1) low = bumpShare(specs, low, a, 't1', -1);
    expect(shareOf(low, a, 't1')).toBe(1);
    // A target that is not chosen has no share to change.
    expect(bumpShare(specs, picks, obj('o3'), 't1', 1)).toBe(picks);
  });

  test('the line under the steppers', () => {
    expect(divisionLine(5, 0)).toBe('All 5 damage assigned.');
    expect(divisionLine(5, 3)).toBe('3 left to assign.');
  });

  test('a slot with no target chosen has nothing to divide, so it is complete', () => {
    const specs = [divided(3)];
    expect(divisionComplete(specs, [])).toBe(true);
    expect(divisionHint(specs, [])).toBeNull();
    // With min 0 that is a legal answer; with a minimum it is not.
    expect(targetsReady(specs, [])).toBe(true);
    expect(targetsReady([divided(3, 1)], [])).toBe(false);
  });

  test('Confirm needs the shares to add up', () => {
    const specs = [divided(4, 1)];
    const picks = [obj('o1', 't1', 3), obj('o2', 't1', 3)];
    // 6 given of 4: too much is not complete either.
    expect(targetsReady(specs, picks)).toBe(false);
    expect(divisionHint(specs, picks)).toBeNull();
    expect(targetsReady(specs, [obj('o1', 't1', 3), obj('o2', 't1', 1)])).toBe(true);
    expect(currentSlot(specs, [])?.spec.specId).toBe('t1');
  });
});

describe('the targets decision of a divided spell', () => {
  const decision = (spec: TargetChoiceSpec): TargetsDecision =>
    ({
      id: 'd1',
      seat: 0,
      kind: 'targets',
      source: 'o9',
      specs: [spec],
    }) as unknown as TargetsDecision;

  function harness(pending: PendingDecision, picks: readonly ChosenTarget[]) {
    const stackItem = {
      id: 'o9',
      name: 'SYNTHETIC Arc Volley',
      controller: 0,
      owner: 0,
      types: ['instant'],
      zone: 'stack',
      targets: [],
    };
    const view = {
      viewer: 0,
      turn: 3,
      activeSeat: 0,
      step: 'main1',
      battlefield: [],
      stack: [stackItem],
      exile: [],
      combat: null,
      seats: [
        { id: 0, hand: [], graveyard: [], command: [], mulligans: 0 },
        { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
      ],
      pending,
    } as unknown as GameView;
    const acts: Action[] = [];
    const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
    return {
      model: buildModel(view, pending, { ...initialUi(pending), targets: picks }, ctl),
      acts,
    };
  }

  test('the prompt announces the division with the targets', () => {
    const d = decision(divided(5));
    const slot = currentSlot(d.specs, []);
    expect(targetsPrompt(d, lookupIndexFor([]), slot)).toBe(
      'Choose targets for a card, then divide 5 damage among them.',
    );
  });

  test('Confirm is off until the shares add up, and the answer carries them', () => {
    const d = decision(divided(5, 1));
    const incomplete = harness(d, [obj('o1', 't1', 2), obj('o2', 't1', 2)]);
    const confirm = incomplete.model.bar.buttons[0];
    expect(confirm?.disabled).toBe(true);
    expect(confirm?.hint).toBe('1 damage left to assign');
    expect(incomplete.model.bar.detail).toBe('2 of 1 to 5 chosen. 1 left to assign.');

    const complete = harness(d, [obj('o1', 't1', 3), obj('o2', 't1', 2)]);
    const ok = complete.model.bar.buttons[0];
    expect(ok?.disabled).toBe(false);
    expect(complete.model.bar.detail).toBe('2 of 1 to 5 chosen. All 5 damage assigned.');
    ok?.run();
    expect(complete.acts).toEqual([
      { kind: 'chooseTargets', targets: [obj('o1', 't1', 3), obj('o2', 't1', 2)] },
    ]);
  });

  test('before any target is chosen it asks for one', () => {
    const none = harness(decision(divided(5, 1)), []);
    expect(none.model.bar.buttons[0]?.disabled).toBe(true);
    expect(none.model.bar.buttons[0]?.hint).toBe('Choose 1 more target');
  });
});
