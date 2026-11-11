/**
 * The web side of D-185 (the Korvold slice 6) as pure models, no DOM: the riot question and its buttons, the devour question's prompt, the log line of
 * a riot answer, the chips and the words of Encore, Devour and Riot, the exile cost, the group "can't be countered" and a token with devour. The cards are
 * the engine's SYNTHETIC fixtures (`synthetic-korvold-keywords.ts`).
 */
import type {
  Ability,
  CardDefinition,
  ChoosePermanentDecision,
  GameState,
  StackAbility,
} from '@commander-arena/engine';
import { syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { optionText, purposeNoun } from '../src/game/chosen';
import { activationCostPart } from '../src/game/cost-text';
import { describeEvent } from '../src/game/describe';
import { lordWordings } from '../src/game/static-text';
import { chipsOf } from '../src/ui/board/keywords';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';
import { isRiotChoice, namedOptionPrompt, namedOptionRows } from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';
import { choosePermanentPrompt, permanentsDetail } from '../src/ui/decisions/permanents';
import { lookupIndexFor } from './decisions-helpers';

const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

const RIOT = {
  purpose: 'riot',
  options: ['counter', 'haste'],
  sourceName: 'SYNTHETIC Riot Goblin',
  sourceOracleText: 'Riot',
} as const;

test('the riot question: a prompt, and a button for the counter and one for haste', () => {
  expect(isRiotChoice(RIOT)).toBe(true);
  expect(namedOptionPrompt(RIOT)).toBe(
    'As SYNTHETIC Riot Goblin enters, choose a +1/+1 counter or haste (riot).',
  );
  expect(optionPrompt(RIOT)).toBe(namedOptionPrompt(RIOT));
  expect(namedOptionRows(RIOT)).toEqual([
    {
      option: 'counter',
      label: 'A +1/+1 counter',
      detail: 'It enters with an additional +1/+1 counter on it.',
    },
    { option: 'haste', label: 'Haste', detail: 'It gains haste.' },
  ]);
});

test('a second instance of riot says it asks again (CR 702.136b)', () => {
  expect(namedOptionPrompt({ ...RIOT, riotSoFar: ['counter'] })).toBe(
    'As SYNTHETIC Riot Goblin enters, choose a +1/+1 counter or haste (riot). Another instance of riot asks again.',
  );
});

test('the words of a riot answer', () => {
  expect(optionText('riot', 'counter')).toBe('a +1/+1 counter');
  expect(optionText('riot', 'haste')).toBe('haste');
  expect(purposeNoun('riot')).toBe('riot choice');
});

test('the log line: "You choose a +1/+1 counter for X (riot)." and the opponent’s', () => {
  const asked = (seat: number) =>
    ({
      pending: { kind: 'chooseOption', seat, source: 'o7', ...RIOT },
      objects: {},
      lki: {},
    }) as unknown as GameState;
  const event = (seat: number, option: string) =>
    ({ kind: 'optionChosen', seat, source: 'o7', purpose: 'riot', option }) as const;
  const you = describeEvent(event(0, 'counter'), asked(0), asked(0), 0);
  expect(you?.text).toBe('You choose a +1/+1 counter for SYNTHETIC Riot Goblin (riot).');
  expect(you?.rule).toBe('CR 702.136a');
  const them = describeEvent(event(1, 'haste'), asked(1), asked(1), 0);
  expect(them?.text).toBe('Opponent chooses haste for SYNTHETIC Riot Goblin (riot).');
});

test('the devour question: a prompt and a second line that follow what is chosen', () => {
  const index = lookupIndexFor([]);
  const devour: ChoosePermanentDecision = {
    id: 'd1',
    seat: 0,
    kind: 'choosePermanent',
    source: 'o9',
    subject: 'o9',
    purpose: 'devour',
    min: 0,
    max: 2,
    legal: ['o1', 'o2'],
  };
  expect(choosePermanentPrompt(devour, index)).toMatch(
    /^Choose any number of creatures to sacrifice as .+ enters \(devour\)\. None is fine\.$/,
  );
  expect(permanentsDetail([], devour)).toBe(
    'Click the creatures to sacrifice, or confirm to sacrifice none.',
  );
  expect(permanentsDetail(['o1'], devour)).toBe(
    '1 chosen: it enters with that many sets of +1/+1 counters.',
  );
});

test('Encore: the activation reads "Encore {3}{R}", the cost line says the exile, the stack says what it does', () => {
  const face = faceOf(syntheticCard('SYNTHETIC Encore Pilferer'));
  expect(activationCostPart({ kind: 'exileThis' })).toBe('Exile this card from your graveyard');
  const expanded = {
    kind: 'activated',
    cost: [{ kind: 'mana', symbols: ['3', 'R'] }, { kind: 'exileThis' }],
    effect: { kind: 'encore' },
    timing: 'sorcery',
    functionsIn: 'graveyard',
  } as const;
  expect(activationLabel(undefined, { abilityIndex: 2, ability: expanded })).toBe('Encore {3}{R}');
  expect(
    triggerGist(expanded as unknown as StackAbility, { types: face.types } as never),
  ).toContain("For each opponent, create a token that's a copy of this card");
});

test('the chips: Encore with its cost, Devour with its number, Riot', () => {
  const chips = (keywords: string[], oracleText: string) =>
    chipsOf({ keywords, restrictions: [], oracleText }).map((c) => c.short);
  expect(chips(['encore'], 'Encore {3}{R} (reminder)')).toEqual(['Enc']);
  expect(chips(['devour'], 'Devour 2 (As this enters ...)')).toEqual(['Dev 2']);
  expect(chips(['riot'], 'Riot')).toEqual(['Riot']);
  expect(
    chipsOf({ keywords: ['devour'], restrictions: [], oracleText: 'Devour 2' })[0]?.full,
  ).toContain(
    'Devour 2 (As this enters, you may sacrifice any number of creatures. It enters with 2 +1/+1 counters',
  );
});

test('the static abilities of the enchantment: the group "can\'t be countered" and the riot grant', () => {
  const words = lordWordings(faceOf(syntheticCard('SYNTHETIC Rhythm of the Wild')).abilities, {
    noun: 'enchantment',
    subtypes: [],
  });
  expect(words).toContain("Creature spells you control can't be countered.");
  expect(words.join(' | ')).toContain('have riot');
});

test('a token with devour says its number', () => {
  const brood = faceOf(syntheticCard('SYNTHETIC Dragon Broodmother'));
  const trigger = brood.abilities.find(
    (a): a is Ability & { kind: 'triggered' } => a.kind === 'triggered',
  );
  if (trigger === undefined) throw new Error('no trigger');
  expect(triggerGist(trigger as unknown as StackAbility, { types: brood.types } as never)).toBe(
    'Create a 1/1 red and green Dragon creature token with flying and devour 2',
  );
});
