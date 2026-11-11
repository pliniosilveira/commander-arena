/**
 * The web side of D-194 (voting, CR 701.38): the vote dialog's prompt and buttons, the log line of a vote, the words of the choices (the `chooseOption`
 * decision of purpose 'vote' goes through the dialog of the named options, no new dialog kind), and the words of the effect and of the amount.
 */
import type { ChooseOptionDecision, GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { optionText, purposeNoun } from '../src/game/chosen';
import { describeEvent } from '../src/game/describe';
import {
  isVoteChoice,
  namedOptionPrompt,
  namedOptionRows,
  votePrompt,
} from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';

const VOTE = (seat: number, cast: readonly { seat: number; option: string }[]) =>
  ({
    id: 'd1',
    kind: 'chooseOption',
    seat,
    purpose: 'vote',
    options: ['profit', 'security'],
    source: 'o7',
    sourceName: 'Emissary Green',
    sourceOracleText: 'Whenever Emissary Green attacks, ...',
    vote: { controller: 0, cast },
  }) as unknown as ChooseOptionDecision;

test('the first voter is asked "Vote for profit or security." with nothing cast yet', () => {
  expect(namedOptionPrompt(VOTE(0, []))).toBe('Vote for profit or security.');
  expect(isVoteChoice(VOTE(0, []))).toBe(true);
});

test('a later voter sees the votes already cast, in order, with "You" and "Opponent"', () => {
  expect(namedOptionPrompt(VOTE(1, [{ seat: 0, option: 'profit' }]))).toBe(
    'Vote for profit or security. Opponent voted for profit.',
  );
  expect(
    votePrompt(['gold', 'iron', 'ash'], { controller: 1, cast: [{ seat: 1, option: 'ash' }] }, 0),
  ).toBe('Vote for gold, iron or ash. Opponent voted for ash.');
  expect(
    votePrompt(['gold', 'iron'], { controller: 0, cast: [{ seat: 0, option: 'gold' }] }, 0),
  ).toBe('Vote for gold or iron. You voted for gold.');
});

test('the picker prompt of the decision is the same words', () => {
  expect(optionPrompt(VOTE(1, [{ seat: 0, option: 'security' }]))).toBe(
    'Vote for profit or security. Opponent voted for security.',
  );
});

test('one button for each option, in the card’s order, with a capital', () => {
  expect(namedOptionRows(VOTE(0, []))).toEqual([
    { option: 'profit', label: 'Profit', detail: null },
    { option: 'security', label: 'Security', detail: null },
  ]);
});

test('the words of a vote answer and its noun', () => {
  expect(optionText('vote', 'profit')).toBe('profit');
  expect(purposeNoun('vote')).toBe('vote');
});

test('the log line: "You vote for profit (Emissary Green)." and the opponent’s', () => {
  const asked = (seat: number) =>
    ({
      pending: VOTE(seat, []),
      objects: {},
      lki: { o7: { characteristics: { name: 'Emissary Green' } } },
    }) as unknown as GameState;
  const event = (seat: number, option: string) =>
    ({ kind: 'optionChosen', seat, source: 'o7', purpose: 'vote', option }) as const;
  const you = describeEvent(event(0, 'profit'), asked(0), asked(0), 0);
  expect(you?.text).toBe('You vote for profit (Emissary Green).');
  expect(you?.rule).toBe('CR 701.38a');
  const them = describeEvent(event(1, 'security'), asked(1), asked(1), 0);
  expect(them?.text).toBe('Opponent votes for security (Emissary Green).');
});

test('the amount: "twice the number of profit votes" and "the number of security votes"', () => {
  expect(amountPhrase({ kind: 'votesFor', option: 'security' })).toBe(
    'the number of security votes',
  );
  expect(
    amountPhrase({ kind: 'multiple', factor: 2, of: { kind: 'votesFor', option: 'profit' } }),
  ).toBe('twice the number of profit votes');
});
