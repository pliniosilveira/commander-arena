/**
 * The web side of D-191 (the order of prevention effects on a damage event, CR 616.1): the prompt, the rows ("Then: ..."), the dialog drawn from a
 * decision of its own shape over no game (no way out: damage is not undone), the log line of an answer and the words of the question for combat
 * damage and for damage to a permanent.
 */
import type { ChooseOptionDecision, GameState } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { NamedOptionDialog } from '../src/ui/decisions/NamedOptionDialog';
import {
  isReplacementChoice,
  namedOptionPrompt,
  namedOptionRows,
  replacementThen,
} from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';

const choice = (option: string, text: string, amount: number, prevented: number) => ({
  option,
  kind: 'prevent' as const,
  text,
  outcome: { to: { kind: 'player' as const, seat: 0 }, amount, prevented },
});

const decision = (
  event: Partial<NonNullable<ChooseOptionDecision['replacement']>['event']> = {},
): ChooseOptionDecision =>
  ({
    id: 'd1',
    kind: 'chooseOption',
    seat: 0,
    purpose: 'replacement',
    options: ['shield:ce1', 'shield:ce2'],
    source: 'o7',
    sourceName: 'SYNTHETIC Backdraft',
    sourceOracleText: 'SYNTHETIC Backdraft deals 3 damage to you.',
    replacement: {
      event: {
        source: 'o7',
        sourceName: 'SYNTHETIC Backdraft',
        to: { kind: 'player', seat: 0 },
        amount: 3,
        combat: false,
        ...event,
      },
      choices: [
        choice(
          'shield:ce1',
          'Prevent the next 3 damage that would be dealt to you this turn',
          0,
          3,
        ),
        choice(
          'shield:ce2',
          'Prevent the next 5 damage that would be dealt to you this turn',
          0,
          3,
        ),
      ],
    },
  }) as unknown as ChooseOptionDecision;

test('the prompt names the damage, its source and its recipient, and says to choose', () => {
  const d = decision();
  expect(isReplacementChoice(d)).toBe(true);
  expect(namedOptionPrompt(d)).toBe(
    '3 damage from SYNTHETIC Backdraft would be dealt to you. Several effects apply. Choose which to apply first.',
  );
  expect(optionPrompt(d)).toBe(namedOptionPrompt(d));
});

test('combat damage and damage to a permanent say so', () => {
  expect(namedOptionPrompt(decision({ combat: true, amount: 2 }))).toBe(
    '2 combat damage from SYNTHETIC Backdraft would be dealt to you. Several effects apply. Choose which to apply first.',
  );
  expect(
    namedOptionPrompt(
      decision({ to: { kind: 'object', id: 'o4' }, toName: 'Grizzly Bears', amount: 1 }),
    ),
  ).toBe(
    '1 damage from SYNTHETIC Backdraft would be dealt to Grizzly Bears. Several effects apply. Choose which to apply first.',
  );
});

test('a button for each effect, in the engine order, with what it leads to under it', () => {
  expect(namedOptionRows(decision())).toEqual([
    {
      option: 'shield:ce1',
      label: 'Prevent the next 3 damage that would be dealt to you this turn',
      detail: 'Then: 0 damage',
    },
    {
      option: 'shield:ce2',
      label: 'Prevent the next 5 damage that would be dealt to you this turn',
      detail: 'Then: 0 damage',
    },
  ]);
  expect(replacementThen(2)).toBe('Then: 2 damage');
});

test('the dialog is "Damage replacement", quotes the source, offers each effect and has no way out', () => {
  const html = renderToStaticMarkup(<NamedOptionDialog d={decision()} act={() => {}} />);
  expect(html).toContain('aria-label="Damage replacement"');
  expect(html).toContain('>Damage replacement</h2>');
  expect(html).toContain('SYNTHETIC Backdraft deals 3 damage to you.');
  expect(html).toContain('Several effects apply. Choose which to apply first.');
  expect(html).toContain('data-option="shield:ce1"');
  expect(html).toContain('data-option="shield:ce2"');
  expect(html).toContain('>Prevent the next 3 damage that would be dealt to you this turn</span>');
  expect(html).toContain('>Then: 0 damage</span>');
  expect(html).not.toContain('>Cancel<');
});

test('the log line says who applied which effect first, in the engine words', () => {
  const state = {
    pending: null,
    objects: {},
    lki: { o7: { characteristics: { name: 'SYNTHETIC Backdraft' } } },
  } as unknown as GameState;
  const event = (seat: number) =>
    ({
      kind: 'replacementChosen',
      seat,
      source: 'o7',
      option: 'shield:ce1',
      text: 'Prevent the next 3 damage that would be dealt to you this turn',
    }) as const;
  const you = describeEvent(event(0), state, state, 0);
  expect(you?.text).toBe(
    'You apply "Prevent the next 3 damage that would be dealt to you this turn" first (SYNTHETIC Backdraft).',
  );
  expect(you?.rule).toBe('CR 616.1');
  expect(describeEvent(event(1), state, state, 0)?.text).toContain('Opponent applies "Prevent');
});

// D-221 (CR 616.1): two replacement effects of the creation of tokens, the same dialog.
const tokenDecision = (): ChooseOptionDecision =>
  ({
    id: 'd2',
    kind: 'chooseOption',
    seat: 0,
    purpose: 'replacement',
    options: ['tokens:o3:0', 'tokens:o2:0'],
    source: 'o9',
    sourceName: 'SYNTHETIC Treasure Maker',
    sourceOracleText: 'Create two Treasure tokens.',
    replacement: {
      tokens: { creator: 0, would: ['2 Treasure'] },
      choices: [
        {
          option: 'tokens:o3:0',
          kind: 'tokens',
          text: 'Create those tokens plus an additional Thopter token instead',
          object: 'o3',
          objectName: 'Stridehangar Automaton',
          outcome: { tokens: ['3 Dragon'], total: 3 },
        },
        {
          option: 'tokens:o2:0',
          kind: 'tokens',
          text: 'Create that many Dragon tokens instead',
          object: 'o2',
          objectName: 'Draconic Visitor',
          outcome: { tokens: ['2 Dragon'], total: 2 },
        },
      ],
    },
  }) as unknown as ChooseOptionDecision;

test('the order of two replacements of the creation of tokens: the prompt and what each leads to', () => {
  const d = tokenDecision();
  expect(isReplacementChoice(d)).toBe(true);
  expect(namedOptionPrompt(d)).toBe(
    'You would create 2 Treasure. Several effects replace that. Choose which to apply first.',
  );
  expect(namedOptionRows(d)).toEqual([
    {
      option: 'tokens:o3:0',
      label: 'Create those tokens plus an additional Thopter token instead',
      detail: 'Then: 3 Dragon',
    },
    {
      option: 'tokens:o2:0',
      label: 'Create that many Dragon tokens instead',
      detail: 'Then: 2 Dragon',
    },
  ]);
  const html = renderToStaticMarkup(<NamedOptionDialog d={d} act={() => {}} />);
  expect(html).toContain('Then: 3 Dragon');
});
