/**
 * The web side of D-192 (damage redirection, CR 614.9; damage that stays, CR 514.2): the words of the two abilities of Ancient Adamantoise, the log
 * line of a redirection and the "Then:" line of a question whose choice redirects the damage.
 */
import type { Ability, ChooseOptionDecision, GameState } from '@commander-arena/engine';
import { syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { lordWordings } from '../src/game/static-text';
import { namedOptionRows, replacementThen } from '../src/ui/decisions/option-names';

const TOISE = 'SYNTHETIC Ancient Adamantoise';
const abilities = (): readonly Ability[] => syntheticCard(TOISE).faces[0]?.abilities ?? [];
const redirect = (extra: Record<string, unknown>): Ability =>
  ({ kind: 'replacement', replacement: { kind: 'redirectDamage', you: true, ...extra } }) as never;

test('the two abilities of the card are worded, with the words of the printed text', () => {
  expect(lordWordings(abilities(), { noun: 'creature' })).toEqual([
    "Damage isn't removed from this creature during cleanup steps.",
    'All damage that would be dealt to you and other permanents you control is dealt to this creature instead.',
  ]);
});

test.each([
  [{}, 'All damage that would be dealt to you is dealt to this creature instead.'],
  [
    { permanents: { types: ['creature'], controller: 'you' } },
    'All damage that would be dealt to you and other creatures you control is dealt to this creature instead.',
  ],
  [
    { you: false, permanents: { types: ['creature'], controller: 'you' } },
    'All damage that would be dealt to other creatures you control is dealt to this creature instead.',
  ],
])('the recipients %j', (extra, words) => {
  expect(lordWordings([redirect(extra)], { noun: 'creature' })).toEqual([words]);
});

test('a recipient the words cannot say is left out: the Oracle text stays the only description', () => {
  expect(
    lordWordings(
      [
        redirect({
          permanents: {
            anyOf: [{ types: ['creature'] }, { types: ['artifact'] }],
            controller: 'you',
          },
        }),
      ],
      { noun: 'creature' },
    ),
  ).toEqual([]);
});

test('the log line of a redirection names the source, the amount and both recipients', () => {
  const state = {
    pending: null,
    objects: {},
    lki: {
      o7: { characteristics: { name: 'Lightning Bolt' } },
      o2: { characteristics: { name: TOISE } },
    },
  } as unknown as GameState;
  const event = (from: { kind: 'player'; seat: number } | { kind: 'object'; id: string }) =>
    ({
      kind: 'damageRedirected',
      source: 'o7',
      from,
      to: { kind: 'object', id: 'o2' },
      amount: 3,
      combat: false,
    }) as never;
  const me = describeEvent(event({ kind: 'player', seat: 0 }), state, state, 0);
  expect(me?.text).toBe(`Lightning Bolt's 3 damage to you is dealt to ${TOISE} instead.`);
  expect(me?.rule).toBe('CR 614.9');
  expect(describeEvent(event({ kind: 'player', seat: 1 }), state, state, 0)?.text).toContain(
    'damage to Opponent is dealt to',
  );
});

test('"Then:" names the recipient only when a redirection changes it and something is still dealt', () => {
  expect(replacementThen(3, TOISE)).toBe(`Then: 3 damage to ${TOISE}`);
  expect(replacementThen(0, TOISE)).toBe('Then: 0 damage');
  expect(replacementThen(2)).toBe('Then: 2 damage');
});

test('the rows of a question with a redirection: prevention says what is dealt to you, the redirection says where it goes', () => {
  const d = {
    id: 'd1',
    kind: 'chooseOption',
    seat: 1,
    purpose: 'replacement',
    options: ['shield:ce1', 'redirect:o2:3'],
    source: 'o7',
    sourceName: 'Lightning Bolt',
    sourceOracleText: '',
    replacement: {
      event: {
        source: 'o7',
        sourceName: 'Lightning Bolt',
        to: { kind: 'player', seat: 1 },
        amount: 3,
        combat: false,
      },
      choices: [
        {
          option: 'shield:ce1',
          kind: 'prevent',
          text: 'Prevent the next 2 damage that would be dealt to you this turn',
          outcome: { to: { kind: 'object', id: 'o2' }, toName: TOISE, amount: 1, prevented: 2 },
        },
        {
          option: 'redirect:o2:3',
          kind: 'redirect',
          text: `Deal it to ${TOISE} instead`,
          object: 'o2',
          objectName: TOISE,
          outcome: { to: { kind: 'object', id: 'o2' }, toName: TOISE, amount: 3, prevented: 0 },
        },
      ],
    },
  } as unknown as ChooseOptionDecision;
  expect(namedOptionRows(d)).toEqual([
    {
      option: 'shield:ce1',
      label: 'Prevent the next 2 damage that would be dealt to you this turn',
      detail: `Then: 1 damage to ${TOISE}`,
    },
    {
      option: 'redirect:o2:3',
      label: `Deal it to ${TOISE} instead`,
      detail: `Then: 3 damage to ${TOISE}`,
    },
  ]);
});
