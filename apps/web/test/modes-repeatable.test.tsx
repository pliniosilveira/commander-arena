/**
 * Repeatable modes in the web app (D-1000, CR 700.2d): "Choose three. You may choose the same mode more than once." The heading, the
 * picks as a multiset (counters, not check boxes), the sets that can be confirmed, the words of a chosen set on the stack and in the log,
 * and the target slots of a mode chosen more than once, grouped by the time the mode is chosen. Models and static markup only; the click
 * and key paths are in `e2e/modal.e2e.ts`.
 */
import type {
  Action,
  ChooseModesDecision,
  ChosenTarget,
  GameView,
  ObjectView,
  PendingDecision,
  TargetChoiceSpec,
  TargetsDecision,
} from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { keyCommand } from '../src/ui/decisions/keys';
import { ModesDialog } from '../src/ui/decisions/ModesDialog';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import {
  addMode,
  chosenModesLine,
  isPickOne,
  isRepeatable,
  modeCount,
  modesDetail,
  modesHeading,
  modesHint,
  modesSelectionLegal,
  removeMode,
  toggleMode,
} from '../src/ui/decisions/modes-picker';
import { modeHeading, slotLabel, targetsPrompt } from '../src/ui/decisions/target-prompt';
import { currentSlot, modeGroups, toggleTarget } from '../src/ui/decisions/targeting';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const MODE_TEXTS = [
  'Fiery Confluence deals 1 damage to each creature.',
  'Fiery Confluence deals 2 damage to each opponent.',
  'Destroy target artifact.',
] as const;

/** The multisets of three of the three modes. */
const TEN: readonly (readonly number[])[] = [
  [0, 0, 0],
  [0, 0, 1],
  [0, 0, 2],
  [0, 1, 1],
  [0, 1, 2],
  [0, 2, 2],
  [1, 1, 1],
  [1, 1, 2],
  [1, 2, 2],
  [2, 2, 2],
];

const decision = (patch: Partial<ChooseModesDecision> = {}): ChooseModesDecision => ({
  id: 'd1' as ChooseModesDecision['id'],
  seat: 0,
  kind: 'chooseModes',
  source: 'o1',
  sourceName: 'Fiery Confluence',
  sourceOracleText: '',
  purpose: 'spell',
  modes: MODE_TEXTS.map((text, index) => ({ index, text, legal: true })),
  min: 3,
  max: 3,
  repeatable: true,
  sets: TEN,
  ...patch,
});

describe('the heading', () => {
  test('says the card text: three modes, the same one more than once', () => {
    expect(modesHeading(decision())).toBe(
      'Choose three. You may choose the same mode more than once.',
    );
    expect(modesHeading({ min: 0, max: 2, repeatable: true })).toBe(
      'Choose up to two. You may choose the same mode more than once.',
    );
    // A choice that does not repeat keeps its dash.
    expect(modesHeading({ min: 2, max: 2 })).toBe('Choose two —');
  });
});

describe('picking modes as a multiset', () => {
  test('a repeatable choice is counted, never a radio group, even for a maximum of one', () => {
    expect(isRepeatable(decision())).toBe(true);
    expect(isPickOne(decision())).toBe(false);
    expect(isPickOne(decision({ max: 1, min: 1 }))).toBe(false);
    expect(isPickOne({ max: 1 })).toBe(true);
  });

  test('a click or a digit picks the mode once more, up to the number to choose, in printed order', () => {
    const d = decision();
    let picks: readonly number[] = [];
    picks = toggleMode(d, picks, 2);
    picks = toggleMode(d, picks, 0);
    picks = toggleMode(d, picks, 2);
    expect(picks).toEqual([0, 2, 2]);
    expect(modeCount(picks, 2)).toBe(2);
    // Three are picked: nothing more is added.
    expect(toggleMode(d, picks, 1)).toEqual([0, 2, 2]);
    expect(addMode(d, picks, 1)).toEqual([0, 2, 2]);
  });

  test('the minus button takes one choice away, and nothing when the mode is not picked', () => {
    expect(removeMode([0, 2, 2], 2)).toEqual([0, 2]);
    expect(removeMode([0, 2], 2)).toEqual([0]);
    expect(removeMode([0], 1)).toEqual([0]);
  });

  test('an illegal mode cannot be picked, however often', () => {
    const d = decision({
      modes: MODE_TEXTS.map((text, index) => ({ index, text, legal: index !== 2 })),
    });
    expect(toggleMode(d, [], 2)).toEqual([]);
    expect(toggleMode(d, [0], 7)).toEqual([0]);
  });

  test('only a multiset the engine listed can be confirmed: [0,0,1] is not [0,1,1]', () => {
    const d = decision({
      sets: [
        [0, 0, 1],
        [1, 1, 1],
      ],
    });
    expect(modesSelectionLegal(d, [1, 0, 0])).toBe(true);
    expect(modesSelectionLegal(d, [0, 1, 1])).toBe(false);
    expect(modesSelectionLegal(d, [0, 1])).toBe(false);
    expect(modesHint(d, [0, 0])).toBe('Choose 1 more mode');
    expect(modesHint(d, [0, 1, 1])).toBe('That choice of modes is not allowed');
    expect(modesHint(d, [0, 0, 1])).toBeNull();
  });

  test('the detail says how many are chosen, and how to change a full choice', () => {
    expect(modesDetail(decision(), [0, 0])).toBe('2 of 3 chosen');
    expect(modesDetail(decision({ min: 0, max: 2 }), [0, 0])).toBe(
      '2 of 0 to 2 chosen. Remove one to pick another.',
    );
  });
});

function harness(pending: PendingDecision, ui?: Partial<UiState>) {
  const view = {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: [],
    stack: [],
    exile: [],
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
  } as unknown as GameView;
  const acts: Action[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  const state = { ...initialUi(pending), ...ui };
  return { model: buildModel(view, pending, state, ctl), acts, state };
}

describe('the chooseModes model and dialog', () => {
  test('Confirm is disabled until a listed multiset is picked, then sends it in printed order', () => {
    const d = decision();
    const none = harness(d);
    expect(none.model.bar.buttons[0]?.disabled).toBe(true);
    const picked = harness(d, { modes: [2, 1, 1] });
    expect(picked.model.bar.buttons[0]?.disabled).toBe(false);
    picked.model.bar.buttons[0]?.run();
    expect(picked.acts).toEqual([{ kind: 'chooseModes', modes: [1, 1, 2] }]);
  });

  test('Enter confirms from a mode card and Esc cancels, as for the other choices', () => {
    const { model } = harness(decision(), { modes: [0, 0, 0] });
    const key = (k: string) =>
      keyCommand(
        {
          key: k,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          tag: 'BODY',
          editable: false,
          foreignModalOpen: false,
        },
        { bar: model.bar, pinned: false, chooserOpen: false, canUndo: false },
      );
    expect(key('Enter')).toBe('primary');
    expect(key('Escape')).toBe('cancel');
  });

  const render = (d: ChooseModesDecision, modes: readonly number[]) => {
    const { model, state } = harness(d, { modes });
    return renderToStaticMarkup(<ModesDialog d={d} ui={state} model={model} update={() => {}} />);
  };

  test('each mode is a counter with a minus and a plus button, not a radio button or a check box', () => {
    const html = render(decision(), [0, 2, 2]);
    expect(html).toContain('Choose three. You may choose the same mode more than once.');
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('type="checkbox"');
    expect((html.match(/data-mode-minus/g) ?? []).length).toBe(3);
    expect((html.match(/data-mode-plus/g) ?? []).length).toBe(3);
    expect(html).toMatch(/data-mode="2"[^>]*data-count="2"/);
    expect(html).toMatch(/data-mode="1"[^>]*data-count="0"/);
    expect(html).toContain('3 of 3 chosen');
  });

  test('with every choice made the plus buttons are disabled, and a mode not picked has a disabled minus', () => {
    const html = render(decision(), [0, 2, 2]);
    const plus = html.match(/<button[^>]*data-mode-plus[^>]*>/g) ?? [];
    expect(plus).toHaveLength(3);
    for (const button of plus) expect(button).toContain('disabled=""');
    // Mode 2 (index 1) is not picked: its minus button is disabled.
    const card = html.split('data-mode-card')[2] ?? '';
    expect(card.match(/<button[^>]*data-mode-minus[^>]*>/)?.[0]).toContain('disabled=""');
  });

  test('an illegal mode says why and has no counter', () => {
    const d = decision({
      modes: MODE_TEXTS.map((text, index) => ({ index, text, legal: index !== 2 })),
      sets: TEN.filter((s) => !s.includes(2)),
    });
    const html = render(d, []);
    expect(html).toContain('No legal target');
    expect((html.match(/data-mode-plus/g) ?? []).length).toBe(2);
  });
});

describe('what the stack says', () => {
  const spell = {
    id: 'o1',
    name: 'Fiery Confluence',
    controller: 0,
    owner: 0,
    types: ['sorcery'],
    modes: [0, 0, 2],
    modeTexts: [...MODE_TEXTS],
  } as unknown as ObjectView;

  test('a mode chosen more than once is said once with how many times', () => {
    expect(chosenModesLine(spell)).toBe(
      'Chosen: Fiery Confluence deals 1 damage to each creature (x2); Destroy target artifact',
    );
  });

  test('a mode chosen once is said as before', () => {
    expect(chosenModesLine({ ...spell, modes: [0, 1, 2] } as ObjectView)).toBe(
      'Chosen: Fiery Confluence deals 1 damage to each creature; Fiery Confluence deals 2 damage to each opponent; Destroy target artifact',
    );
  });
});

describe('target slots of a mode chosen more than once', () => {
  const spell = {
    id: 'o1',
    name: 'Fiery Confluence',
    controller: 0,
    owner: 0,
    types: ['sorcery'],
    modes: [2, 2, 2],
    modeTexts: [...MODE_TEXTS],
  } as unknown as ObjectView;
  const index = lookupIndexFor([spell]);
  const art = (id: string): ChosenTarget => ({ kind: 'object', id, specId: '' }) as ChosenTarget;
  const slot = (specId: string, instance?: number): TargetChoiceSpec => ({
    specId,
    min: 1,
    max: 1,
    mode: 2,
    legal: [art('o7'), art('o8')],
    ...(instance === undefined ? {} : { instance }),
  });
  const specs = [slot('t1'), slot('t1#2', 1), slot('t1#3', 2)];
  const targets: TargetsDecision = {
    id: 'd2' as TargetsDecision['id'],
    seat: 0,
    kind: 'targets',
    source: 'o1',
    specs,
  };

  test('each time has a group of its own, in order, with the time in the heading', () => {
    expect(modeGroups(specs)?.map((g) => [g.mode, g.time])).toEqual([
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
    expect(modeHeading(index, 'o1', 2, 2)).toBe('Mode 3, time 2: Destroy target artifact');
    // A mode chosen once has no time, as before.
    expect(modeHeading(index, 'o1', 2)).toBe('Mode 3: Destroy target artifact');
    expect(modeGroups([slot('t1')])?.map((g) => g.time)).toEqual([null]);
  });

  test('the slot labels and the prompt name the time', () => {
    expect(slotLabel(specs, 0)).toBe('Mode 3, time 1');
    expect(slotLabel(specs, 2)).toBe('Mode 3, time 3');
    const first = currentSlot(specs, []);
    if (first === null) throw new Error('no slot');
    expect(targetsPrompt(targets, index, first)).toBe(
      'Mode 3, time 1: Destroy target artifact. Choose a target for Fiery Confluence.',
    );
    const second = currentSlot(specs, [{ kind: 'object', id: 'o7', specId: 't1' }]);
    if (second === null) throw new Error('no slot');
    expect(targetsPrompt(targets, index, second)).toBe(
      'Mode 3, time 2: Destroy target artifact. Choose a target for Fiery Confluence.',
    );
  });

  test('the same target may fill each time (CR 700.2d)', () => {
    let picks: readonly ChosenTarget[] = [];
    picks = toggleTarget(specs, picks, art('o7'), 't1');
    picks = toggleTarget(specs, picks, art('o7'), 't1#2');
    picks = toggleTarget(specs, picks, art('o7'), 't1#3');
    expect(picks.map((p) => p.specId)).toEqual(['t1', 't1#2', 't1#3']);
  });
});
