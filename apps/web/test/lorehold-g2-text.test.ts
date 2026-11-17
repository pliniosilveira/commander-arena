// The words of group 2 of the Lorehold Spirit deck (issue 86) as pure models: the target "noncreature, nonland card from your graveyard" and "card exiled with this permanent", the gist of
// the end step ability (exile with a link, a Spirit token), the label of the activated ability that casts a card without paying its mana cost and puts the spell on the bottom of the
// library, and the gist of the vote spell (the votes counted by "for each", damage for the milled value, the exile of the top cards for each vote). Read from the engine's SYNTHETIC
// cards, so a wording that drifts from the AST fails here. No DOM.
import { type Ability, type Effect, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { exileTopText } from '../src/game/dragons-text';
import { activationLabel, targetText, triggerGist } from '../src/ui/decisions/ability-label';

const ELEPHANT = 'SYNTHETIC Lore Elephant';
const TEMPEST = 'SYNTHETIC Verdict Tempest';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

describe('the targets', () => {
  const [, trigger, activated] = abilitiesOf(ELEPHANT);

  test('a card of your graveyard that is none of two types says the types it is not', () => {
    if (trigger?.kind !== 'triggered') throw new Error('no trigger');
    expect(targetText(trigger.targets?.[0])).toBe(
      'target noncreature, nonland card from your graveyard',
    );
  });

  test('a card of the graveyard that is a nonland card says it with one "non"', () => {
    expect(
      targetText({
        id: 't1',
        what: { kind: 'object', filter: { zone: 'graveyard', notTypes: ['land'], controller: 'you' } },
      }),
    ).toBe('target nonland card from your graveyard');
  });

  test('a card exiled with this permanent', () => {
    if (activated?.kind !== 'activated') throw new Error('no ability');
    expect(targetText(activated.targets?.[0])).toBe('target card exiled with this permanent');
  });

  test('a card of the graveyard of any kind is still "card"', () => {
    expect(
      targetText({
        id: 't1',
        what: { kind: 'object', filter: { zone: 'graveyard', controller: 'you' } },
      }),
    ).toBe('target card from your graveyard');
  });
});

describe('the abilities of the Elephant', () => {
  const [, trigger, activated] = abilitiesOf(ELEPHANT);

  test('the end step: exile a card with a link and create a Spirit', () => {
    if (trigger?.kind !== 'triggered') throw new Error('no trigger');
    expect(triggerGist(trigger as never, undefined)).toBe(
      "Exile target noncreature, nonland card from your graveyard. It's exiled with this permanent. Create a 3/2 red and white Spirit creature token",
    );
  });

  test('the label of the free cast says it without paying the mana cost and where the spell goes', () => {
    if (activated?.kind !== 'activated') throw new Error('no ability');
    const label = activationLabel(undefined, { abilityIndex: 2, ability: activated });
    expect(label).toContain('{1}{R}{W}, {T}, Sacrifice a Spirit');
    expect(label).toContain(
      'You may cast target card exiled with this permanent this turn without paying its mana cost',
    );
    expect(label).toContain(
      "If that spell would be put into a graveyard, put it on the bottom of its owner's library instead",
    );
  });

  test('without the rider and without the free cast the label says neither', () => {
    if (activated?.kind !== 'activated') throw new Error('no ability');
    const plain = {
      ...activated,
      effect: { ...activated.effect, free: undefined, bottomInstead: undefined },
    } as never;
    const label = activationLabel(undefined, { abilityIndex: 2, ability: plain });
    expect(label).toContain('You may cast target card exiled with this permanent this turn');
    expect(label).not.toContain('without paying');
    expect(label).not.toContain('bottom of its owner');
  });
});

describe('the vote spell', () => {
  const effect = syntheticCard(TEMPEST).faces[0]?.spell?.effect;
  if (effect === undefined) throw new Error('no spell');
  const gist = triggerGist(
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect,
    } as never,
    undefined,
  );

  test('the whole spell, sentence by sentence', () => {
    expect(gist).toBe(
      'Starting with you, each player votes for past or present. You mill a card for each past vote. Deal damage equal to the total mana value of the cards milled this way to each opponent. Exile the top card of your library for each present vote. Until the end of your next turn, you may play those cards',
    );
  });

  test('the exile of the top cards for each vote', () => {
    const exile = (count: Extract<Effect, { kind: 'exileTop' }>['count']) =>
      exileTopText({ kind: 'exileTop', count }, () => 'X');
    expect(exile({ kind: 'votesFor', option: 'present' })).toBe(
      'Exile the top card of your library for each present vote',
    );
    expect(exile(1)).toBe('Exile the top card of your library');
    expect(exile(2)).toBe('Exile the top two cards of your library');
  });
});
