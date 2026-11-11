/**
 * Modal spells and abilities as pure models (CR 700.2, D-114): the heading from min and max, which
 * modes can be picked and which sets confirmed, the digit keys, the action sent, Cancel and Esc for a
 * spell and none for a trigger, the grouped target slots and their prompt, the words of a chosen
 * set, the log lines and the scripted human's answer. No DOM.
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
import { describe, expect, test } from 'vitest';
import { keyCommand } from '../src/ui/decisions/keys';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import {
  chosenModesLine,
  chosenModeTexts,
  isPickOne,
  modeKey,
  modesCountWords,
  modesDetail,
  modesHeading,
  modesHint,
  modesPrompt,
  modesSelectionLegal,
  modesSourceLabel,
  sortedModes,
  toggleMode,
} from '../src/ui/decisions/modes-picker';
import { modeHeading, slotLabel, targetsPrompt } from '../src/ui/decisions/target-prompt';
import { currentSlot, modeGroups, pickedFor, toggleTarget } from '../src/ui/decisions/targeting';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { chooseAction } from './bot';
import { lookupIndexFor } from './decisions-helpers';

const modes = (...legal: boolean[]): ChooseModesDecision['modes'] =>
  legal.map((l, i) => ({ index: i, text: `Mode text ${i + 1}.`, legal: l }));

const decision = (patch: Partial<ChooseModesDecision> = {}): ChooseModesDecision => ({
  id: 'd1' as ChooseModesDecision['id'],
  seat: 0,
  kind: 'chooseModes',
  source: 'o1',
  sourceName: 'SYNTHETIC Three Way Charm',
  sourceOracleText: '',
  purpose: 'spell',
  modes: modes(true, true, true),
  min: 1,
  max: 1,
  sets: [[0], [1], [2]],
  ...patch,
});

describe('the heading and prompt', () => {
  test('the words of the cards for the usual counts', () => {
    expect(modesHeading({ min: 1, max: 1 })).toBe('Choose one —');
    expect(modesHeading({ min: 2, max: 2 })).toBe('Choose two —');
    expect(modesHeading({ min: 1, max: 2 })).toBe('Choose one or both —');
    expect(modesHeading({ min: 1, max: 3 })).toBe('Choose one or more —');
    expect(modesHeading({ min: 1, max: 5 })).toBe('Choose one or more —');
    expect(modesHeading({ min: 3, max: 3 })).toBe('Choose three —');
  });

  test('a shape the cards do not print is said plainly', () => {
    expect(modesCountWords({ min: 0, max: 2 })).toBe('up to two');
    expect(modesCountWords({ min: 2, max: 4 })).toBe('two to four');
  });

  test('the prompt names the card, or "Name\'s ability" for an ability and a trigger', () => {
    expect(modesPrompt(decision())).toBe('Choose one mode for SYNTHETIC Three Way Charm.');
    expect(modesPrompt(decision({ min: 1, max: 2 }))).toBe(
      'Choose one or both modes for SYNTHETIC Three Way Charm.',
    );
    expect(modesSourceLabel({ sourceName: 'Totem', purpose: 'ability' })).toBe("Totem's ability");
    expect(modesSourceLabel({ sourceName: 'Greeter', purpose: 'trigger' })).toBe(
      "Greeter's ability",
    );
  });
});

describe('picking modes', () => {
  test('"choose one" behaves like radio buttons: a pick replaces the last, the same one stays', () => {
    const d = decision();
    expect(isPickOne(d)).toBe(true);
    expect(toggleMode(d, [], 1)).toEqual([1]);
    expect(toggleMode(d, [1], 2)).toEqual([2]);
    expect(toggleMode(d, [2], 2)).toEqual([2]);
  });

  test('"choose two" toggles, never past the maximum, and keeps printed order', () => {
    const d = decision({
      min: 2,
      max: 2,
      sets: [
        [0, 1],
        [0, 2],
        [1, 2],
      ],
    });
    expect(toggleMode(d, [], 2)).toEqual([2]);
    expect(toggleMode(d, [2], 0)).toEqual([0, 2]);
    expect(toggleMode(d, [0, 2], 1)).toEqual([0, 2]);
    expect(toggleMode(d, [0, 2], 2)).toEqual([0]);
    expect(sortedModes([2, 0])).toEqual([0, 2]);
  });

  test('an illegal mode cannot be picked', () => {
    const d = decision({ modes: modes(false, true, true), sets: [[1], [2]] });
    expect(toggleMode(d, [], 0)).toEqual([]);
    expect(toggleMode(d, [1], 0)).toEqual([1]);
    expect(toggleMode(d, [], 7)).toEqual([]);
  });

  test('only a legal set can be confirmed, and the hint says what is missing', () => {
    const d = decision({ min: 1, max: 2, sets: [[0], [1], [0, 1]] });
    expect(modesSelectionLegal(d, [])).toBe(false);
    expect(modesHint(d, [])).toBe('Choose 1 more mode');
    expect(modesSelectionLegal(d, [0])).toBe(true);
    expect(modesHint(d, [0])).toBeNull();
    expect(modesSelectionLegal(d, [1, 0])).toBe(true);
    // A pair the engine does not list is not confirmable, whatever the count says.
    const odd = decision({ min: 2, max: 2, sets: [[0, 1]] });
    expect(modesSelectionLegal(odd, [0, 2])).toBe(false);
    expect(modesHint(odd, [0, 2])).toBe('That choice of modes is not allowed');
  });

  test('the detail counts the picks against the range', () => {
    expect(modesDetail({ min: 1, max: 1 }, [])).toBe('0 of 1 chosen');
    expect(modesDetail({ min: 1, max: 2 }, [0])).toBe('1 of 1 to 2 chosen');
    expect(modesDetail({ min: 1, max: 2 }, [0, 1])).toBe(
      '2 of 1 to 2 chosen. Clear one to pick another.',
    );
  });

  test('digits 1 to 9 are the first to the ninth mode', () => {
    expect(modeKey('1')).toBe(0);
    expect(modeKey('9')).toBe(8);
    expect(modeKey('0')).toBeNull();
    expect(modeKey('a')).toBeNull();
    expect(modeKey('10')).toBeNull();
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
  return { model: buildModel(view, pending, state, ctl), acts };
}

const key = (k: string, bar: ReturnType<typeof harness>['model']['bar']) =>
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
    { bar, pinned: false, chooserOpen: false, canUndo: false },
  );

describe('the chooseModes model', () => {
  test('nothing is preselected, Confirm is disabled until a legal set is picked', () => {
    const d = decision();
    expect(initialUi(d).modes).toEqual([]);
    const none = harness(d);
    const confirm = none.model.bar.buttons[0];
    expect(confirm?.label).toBe('Confirm');
    expect(confirm?.disabled).toBe(true);
    expect(confirm?.hint).toBe('Choose 1 more mode');
    expect(none.model.bar.inOverlay).toBe(true);
    expect(key('Enter', none.model.bar)).toBeNull();
  });

  test('with a legal set picked, Confirm sends chooseModes in printed order; Enter presses it', () => {
    const d = decision({
      min: 2,
      max: 2,
      sets: [
        [0, 1],
        [0, 2],
        [1, 2],
      ],
    });
    const picked = harness(d, { modes: [2, 0] });
    expect(picked.model.bar.buttons[0]?.disabled).toBe(false);
    expect(key('Enter', picked.model.bar)).toBe('primary');
    picked.model.bar.buttons[0]?.run();
    expect(picked.acts).toEqual([{ kind: 'chooseModes', modes: [0, 2] }]);
  });

  test('a spell or an activation can be cancelled; Esc cancels it', () => {
    for (const purpose of ['spell', 'ability'] as const) {
      const { model, acts } = harness(decision({ purpose }));
      expect(model.bar.cancel?.label).toBe('Cancel');
      expect(key('Escape', model.bar)).toBe('cancel');
      model.bar.cancel?.run();
      expect(acts).toEqual([{ kind: 'cancel' }]);
    }
  });

  test('a triggered ability has no Cancel and Esc does nothing (CR 603.3c)', () => {
    const { model } = harness(decision({ purpose: 'trigger', forTrigger: true }));
    expect(model.bar.cancel).toBeNull();
    expect(key('Escape', model.bar)).toBeNull();
  });

  test('the scripted human answers with the first legal set', () => {
    const d = decision({ modes: modes(false, true, true), sets: [[1], [2]] });
    expect(chooseAction({} as GameView, d)).toEqual({ kind: 'chooseModes', modes: [1] });
  });
});

const spec = (
  specId: string,
  mode: number | undefined,
  legal: ChosenTarget[],
): TargetChoiceSpec => ({
  specId,
  min: 1,
  max: 1,
  legal,
  ...(mode === undefined ? {} : { mode }),
});
const obj = (id: string): ChosenTarget => ({ kind: 'object', id, specId: '' }) as ChosenTarget;

const spell = {
  id: 'o1',
  name: 'SYNTHETIC Twin Charm',
  controller: 0,
  owner: 0,
  types: ['instant'],
  modes: [0, 2],
  modeTexts: ['Destroy target artifact.', 'Draw a card.', 'Deals 2 damage to target creature.'],
} as unknown as ObjectView;
const index = lookupIndexFor([spell]);

describe('target slots grouped by mode', () => {
  const specs = [spec('art', 0, [obj('o7')]), spec('hit', 2, [obj('o7'), obj('o8')])];
  const targets: TargetsDecision = {
    id: 'd2' as TargetsDecision['id'],
    seat: 0,
    kind: 'targets',
    source: 'o1',
    specs,
  };

  test('the groups follow the modes in order; a plain decision has none', () => {
    expect(modeGroups(specs)?.map((g) => g.mode)).toEqual([0, 2]);
    expect(modeGroups([spec('a', undefined, [])])).toBeNull();
  });

  test('the heading is "Mode N: text" from the stack object, the number alone without it', () => {
    expect(modeHeading(index, 'o1', 2)).toBe('Mode 3: Deals 2 damage to target creature');
    expect(modeHeading(new Map(), 'o1', 1)).toBe('Mode 2');
  });

  test('the prompt starts with the mode of the slot being filled', () => {
    const first = currentSlot(specs, []);
    if (first === null) throw new Error('no slot');
    expect(targetsPrompt(targets, index, first)).toBe(
      'Mode 1: Destroy target artifact. Choose a target for SYNTHETIC Twin Charm.',
    );
    const second = currentSlot(specs, [{ kind: 'object', id: 'o7', specId: 'art' }]);
    if (second === null) throw new Error('no slot');
    expect(targetsPrompt(targets, index, second)).toBe(
      'Mode 3: Deals 2 damage to target creature. Choose a target for SYNTHETIC Twin Charm.',
    );
  });

  test('the slot labels name the mode, and the slot within a mode that has several', () => {
    expect(slotLabel(specs, 1)).toBe('Mode 3');
    expect(slotLabel([spec('a', undefined, []), spec('b', undefined, [])], 1)).toBe('Slot 2');
    const two = [spec('a', 1, []), spec('b', 1, [])];
    expect(slotLabel(two, 1)).toBe('Mode 2, target 2');
  });

  test('a chip under a mode picks the target for that slot only, and the same target can serve both', () => {
    const a = toggleTarget(specs, [], obj('o7'), 'hit');
    expect(a).toEqual([{ kind: 'object', id: 'o7', specId: 'hit' }]);
    const b = toggleTarget(specs, a, obj('o7'), 'art');
    expect(b.map((t) => t.specId)).toEqual(['hit', 'art']);
    expect(pickedFor(b, obj('o7'), 'art')).toBe(true);
    // Taking one back leaves the other.
    const c = toggleTarget(specs, b, obj('o7'), 'hit');
    expect(c).toEqual([{ kind: 'object', id: 'o7', specId: 'art' }]);
    // A target that is not legal for that slot is ignored.
    expect(toggleTarget(specs, [], obj('o8'), 'art')).toEqual([]);
  });

  test('a click on the board (no slot named) fills the first open slot, as before', () => {
    expect(toggleTarget(specs, [], obj('o7'))).toEqual([
      { kind: 'object', id: 'o7', specId: 'art' },
    ]);
  });
});

describe('what the stack and the preview say', () => {
  test('"Chosen: ..." lists the chosen modes in printed order without their periods', () => {
    expect(chosenModesLine(spell)).toBe(
      'Chosen: Destroy target artifact; Deals 2 damage to target creature',
    );
    expect(chosenModeTexts(spell)).toEqual([
      'Destroy target artifact',
      'Deals 2 damage to target creature',
    ]);
  });

  test('a spell that is not modal, or whose modes are not chosen yet, says nothing', () => {
    expect(chosenModesLine({})).toBeNull();
    expect(chosenModesLine({ modes: [], modeTexts: ['A.'] })).toBeNull();
    expect(chosenModesLine({ modes: [4], modeTexts: ['A.'] })).toBeNull();
  });
});
