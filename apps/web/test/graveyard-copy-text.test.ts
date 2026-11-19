/**
 * The words of the token copy of a card exiled from a graveyard (issue 104): "you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card, except
 * it's a 4/4 black Zombie. It gains haste until end of turn", read from the engine's SYNTHETIC cards (so a wording that drifts from the AST fails here). No DOM.
 */
import { type Ability, type StackAbility, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { triggerGist } from '../src/ui/decisions/ability-label';

const face = (name: string) => {
  const found = syntheticCard(name).faces[0];
  if (found === undefined) throw new Error(`no face for ${name}`);
  return found;
};

const abilityOf = (name: string, kind: 'triggered' | 'activated'): StackAbility => {
  const ability = face(name).abilities.find((a) => a.kind === kind) as Ability | undefined;
  if (ability === undefined) throw new Error(`no ${kind} ability on ${name}`);
  return ability as unknown as StackAbility;
};

describe('the effect, worded as the cards print it', () => {
  test('the offer, the copy of the card exiled and the haste of the token', () => {
    expect(triggerGist(abilityOf('SYNTHETIC Grave Idol', 'triggered'), undefined)).toBe(
      "You may exile a creature card from your graveyard. If you do, create a token that's a copy of it, except it's a 4/4 black Zombie. It gains haste until end of turn",
    );
  });

  test('the activated ability exiles the target and copies it', () => {
    expect(triggerGist(abilityOf('SYNTHETIC Grave Scarab', 'activated'), undefined)).toBe(
      "Exile target creature card from a graveyard. Create a token that's a copy of target creature card from a graveyard, except it's a 4/4 black Zombie",
    );
  });
});
