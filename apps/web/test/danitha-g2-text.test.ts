/**
 * The words of group 2 of the Danitha deck (D-411, D-412): "Mill four cards. You may put a land card from among them into your hand." and its riders, read from
 * the engine's SYNTHETIC cards (so a wording that drifts from the AST fails here), and the question of the cards put into the graveyard. No DOM.
 */
import {
  type Ability,
  type ChooseCardsDecision,
  type ObjectView,
  type StackAbility,
  syntheticCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { cardsPrompt } from '../src/ui/decisions/cards-picker';
import { lookupIndexFor } from './decisions-helpers';

const face = (name: string) => {
  const found = syntheticCard(name).faces[0];
  if (found === undefined) throw new Error(`no face for ${name}`);
  return found;
};

const triggerOf = (name: string): StackAbility => {
  const ability = face(name).abilities.find((a) => a.kind === 'triggered') as Ability | undefined;
  if (ability?.kind !== 'triggered') throw new Error(`no trigger on ${name}`);
  return ability as unknown as StackAbility;
};

describe('the effect, worded as the cards print it', () => {
  test.each([
    [
      'SYNTHETIC Mill Three Scout',
      "You mill 3 cards. You may put a land card from among them into your hand. If you don't, put a +1/+1 counter on this permanent",
    ],
    [
      'SYNTHETIC Mill Three Chaplain',
      "You mill 3 cards. You may put a Plains card or a creature card with mana value 3 or less from among them into your hand. If you don't, put a +1/+1 counter on this permanent",
    ],
    [
      'SYNTHETIC Mill Four Greeter',
      'You mill 4 cards. You may put a land card from among them into your hand. If you put a Town card into your hand this way, you gain 2 life',
    ],
  ])('%s', (name, words) => {
    expect(triggerGist(triggerOf(name), undefined)).toBe(words);
  });
});

describe('the question of the cards put into the graveyard', () => {
  const trigger = triggerOf('SYNTHETIC Mill Four Greeter');
  const source = {
    id: 'o2',
    name: 'SYNTHETIC Mill Four Greeter',
    zone: 'stack',
    types: [],
    subtypes: [],
    controller: 0,
    owner: 0,
    abilitySource: 'o3',
    ability: trigger,
  } as unknown as ObjectView;
  const decision: ChooseCardsDecision = {
    id: 'd1',
    seat: 0,
    kind: 'chooseCards',
    source: source.id,
    purpose: 'move',
    zone: 'graveyard',
    legal: ['o20', 'o22'],
    min: 0,
    max: 1,
    reveal: true,
    prompt:
      'Choose up to 1 card from among the cards put into your graveyard to put into your hand',
  };

  test('an ability on the stack: the words of the effect, from the AST', () => {
    expect(cardsPrompt(decision, lookupIndexFor([source]))).toBe(
      "You may put a land card from among them into your hand (SYNTHETIC Mill Four Greeter's ability).",
    );
  });

  test('a spell: the engine words are kept', () => {
    const spell = {
      id: 'o4',
      name: 'SYNTHETIC Mill Four Tilling',
      zone: 'stack',
      types: ['instant'],
      subtypes: [],
      controller: 0,
      owner: 0,
    } as unknown as ObjectView;
    expect(cardsPrompt({ ...decision, source: spell.id }, lookupIndexFor([spell]))).toBe(
      'Choose up to 1 card from among the cards put into your graveyard to put into your hand (SYNTHETIC Mill Four Tilling).',
    );
  });
});
