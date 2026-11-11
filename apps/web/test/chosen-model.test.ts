/**
 * "As this enters, choose a creature type / a color" (CR 614.12a, D-100) without a DOM: the words
 * (prompt, color names, chips), the suggestions and the search of the picker, the highlight, the
 * log line, and the decision model (no buttons, no way out).
 */
import { CREATURE_TYPES, type GameState, type ObjectView } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { chosenLabel, colorName, optionText } from '../src/game/chosen';
import { describeEvent } from '../src/game/describe';
import { buildModel } from '../src/ui/decisions/model';
import {
  filterOptions,
  moveHighlight,
  optionPrompt,
  pickerRows,
  suggestedTypes,
} from '../src/ui/decisions/option-picker';
import { initialUi } from '../src/ui/decisions/ui-state';
import { chooseAction } from './bot';
import { asksChoice, chooseOptionOf, reachChosen } from './chosen-decks';

const OPTIONS: readonly string[] = CREATURE_TYPES;

test('color letters read as names; the chip, its title and the preview heading', () => {
  expect(['W', 'U', 'B', 'R', 'G'].map(colorName)).toEqual([
    'White',
    'Blue',
    'Black',
    'Red',
    'Green',
  ]);
  expect(optionText('color', 'U')).toBe('Blue');
  expect(optionText('creatureType', 'Time Lord')).toBe('Time Lord');
  expect(chosenLabel({ chosen: { creatureType: 'Elf' } })).toEqual({
    short: 'Elf',
    title: 'Chosen type: Elf',
    heading: 'Chosen creature type',
  });
  expect(chosenLabel({ chosen: { color: 'U' } })).toEqual({
    short: 'Blue',
    title: 'Chosen color: Blue',
    heading: 'Chosen color',
  });
  // D-151: a name chosen from a list the card gives ("choose Khans or Dragons"). Public to both players,
  // so the tile and the preview must say it: the opponent's choice cannot be guessed.
  expect(chosenLabel({ chosen: { option: 'Dragons' } })).toEqual({
    short: 'Dragons',
    title: 'Chosen option: Dragons',
    heading: 'Chosen option',
  });
  expect(chosenLabel({})).toBeNull();
});

test('the prompt names the entering permanent and what is chosen', () => {
  expect(optionPrompt({ purpose: 'creatureType', sourceName: 'SYNTHETIC X' })).toBe(
    'As SYNTHETIC X enters, choose a creature type.',
  );
  expect(optionPrompt({ purpose: 'color', sourceName: 'SYNTHETIC X' })).toBe(
    'As SYNTHETIC X enters, choose a color.',
  );
});

test('a search puts names that start with the text first, ignores case and space', () => {
  expect(filterOptions(OPTIONS, 'Gob')).toContain('Goblin');
  expect(filterOptions(OPTIONS, '  gob ')[0]).toBe('Goblin');
  expect(filterOptions(OPTIONS, '')).toBe(OPTIONS);
  expect(filterOptions(OPTIONS, 'zzzz')).toEqual([]);
  // A word inside a two-word name matches before a plain substring.
  const lord = filterOptions(OPTIONS, 'lord');
  expect(lord).toContain('Time Lord');
  const fixed = filterOptions(['Elf', 'Shelf', 'Time Elf'], 'elf');
  expect(fixed).toEqual(['Elf', 'Time Elf', 'Shelf']);
});

test('the list is the suggestions then every type alphabetically; a search lists matches only', () => {
  const rows = pickerRows(['Goblin', 'Elf', 'Angel'], ['Elf'], '');
  expect(rows.map((r) => `${r.group}:${r.value}`)).toEqual([
    'suggested:Elf',
    'all:Angel',
    'all:Elf',
    'all:Goblin',
  ]);
  expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  expect(pickerRows(['Goblin', 'Elf', 'Angel'], ['Elf'], 'g').map((r) => r.value)).toEqual([
    'Goblin',
    'Angel',
  ]);
  const full = pickerRows(OPTIONS, [], '');
  expect(full).toHaveLength(OPTIONS.length);
  const names = full.map((r) => r.value.toLowerCase());
  expect(names).toEqual([...names].sort());
});

test('the highlight stops at both ends and survives an empty list', () => {
  expect(moveHighlight(0, -1, 5)).toBe(0);
  expect(moveHighlight(4, 1, 5)).toBe(4);
  expect(moveHighlight(2, 1, 5)).toBe(3);
  expect(moveHighlight(0, 1, 0)).toBe(0);
});

test('suggestions: own permanents and hand by how common, then the commander, only real types', async () => {
  const reached = await reachChosen(asksChoice('creatureType'));
  if (reached === null) throw new Error('no seed reaches the situation');
  const { view } = reached.snap;
  const me = view.seats[view.viewer];
  const mine: ObjectView[] = [
    ...view.battlefield.filter((o) => o.controller === view.viewer),
    ...(me?.hand ?? []),
  ];
  const suggestions = suggestedTypes(view, OPTIONS);
  expect(suggestions.length).toBeGreaterThan(0);
  expect(suggestions.length).toBeLessThanOrEqual(8);
  expect(new Set(suggestions).size).toBe(suggestions.length);
  for (const s of suggestions) expect(OPTIONS).toContain(s);
  const count = (type: string) => mine.filter((o) => o.subtypes.includes(type)).length;
  // The first suggestion is a type of a permanent or card of the player, and no type is more common.
  const first = suggestions[0] ?? '';
  const top = Math.max(...suggestions.map(count));
  expect(count(first)).toBe(top);
  // An option the engine does not offer is never suggested.
  expect(suggestedTypes(view, ['Nonexistent'])).toEqual([]);
});

test('the question has a model with no buttons and no way out', async () => {
  const reached = await reachChosen(asksChoice('creatureType'));
  if (reached === null) throw new Error('no seed reaches the situation');
  const { view } = reached.snap;
  const pending = view.pending;
  if (pending?.kind !== 'chooseOption') throw new Error('wrong decision');
  const acted: unknown[] = [];
  const model = buildModel(view, pending, initialUi(pending), {
    act: (a) => acted.push(a),
    update: () => {},
    openChooser: () => {},
  });
  expect(model.bar.prompt).toBe(`As ${pending.sourceName} enters, choose a creature type.`);
  expect(model.bar.buttons).toEqual([]);
  expect(model.bar.cancel).toBeNull();
  expect(model.bar.inOverlay).toBe(true);
});

test('the scripted human answers with the first option', async () => {
  const reached = await reachChosen(asksChoice('creatureType'));
  if (reached === null) throw new Error('no seed reaches the situation');
  const pending = chooseOptionOf(reached.snap.view);
  if (pending === null) throw new Error('wrong decision');
  expect(chooseAction(reached.snap.view, pending)).toEqual({
    kind: 'chooseOption',
    option: pending.options[0],
  });
});

test('the log line: "You choose Elf for X." and "Opponent chooses Blue for X."', () => {
  const asked = (seat: number) =>
    ({
      pending: {
        kind: 'chooseOption',
        seat,
        source: 'o7',
        sourceName: 'SYNTHETIC Banner',
        purpose: 'creatureType',
        options: ['Elf'],
        sourceOracleText: '',
      },
      objects: {},
      lki: {},
    }) as unknown as GameState;
  const event = (seat: number, purpose: 'creatureType' | 'color', option: string) =>
    ({ kind: 'optionChosen', seat, source: 'o7', purpose, option }) as const;
  const you = describeEvent(event(0, 'creatureType', 'Elf'), asked(0), asked(0), 0);
  expect(you?.text).toBe('You choose Elf for SYNTHETIC Banner.');
  expect(you?.level).toBe('major');
  expect(you?.rule).toBe('CR 614.12a');
  const them = describeEvent(event(1, 'color', 'U'), asked(1), asked(1), 0);
  expect(them?.text).toBe('Opponent chooses Blue for SYNTHETIC Banner.');
});
