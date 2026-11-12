/**
 * The words of a target slot of two zones (D-270): the gist of the enters trigger of the engine's SYNTHETIC 'SYNTHETIC Linked Banisher' and of the leaves trigger that returns
 * what it exiled (read from the AST, so a wording that drifts from it fails here). No DOM.
 */
import { type StackAbility, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { triggerGist } from '../src/ui/decisions/ability-label';

const triggers = (name: string): StackAbility[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities.filter((a) => a.kind === 'triggered') as StackAbility[];
};

describe('a slot of the battlefield and the graveyards, in words', () => {
  test('up to three other creatures and/or creature cards of graveyards', () => {
    const [enters] = triggers('SYNTHETIC Linked Banisher');
    if (enters === undefined) throw new Error('no trigger');
    expect(triggerGist(enters, undefined)).toBe(
      "Exile up to three other target creatures from the battlefield and/or creature cards from graveyards. It's exiled with this permanent",
    );
  });

  test('one target of either zone', () => {
    const [enters] = triggers('SYNTHETIC Mandatory Banisher');
    if (enters === undefined) throw new Error('no trigger');
    expect(triggerGist(enters, undefined)).toBe(
      "Exile another target creature from the battlefield or a creature card from a graveyard. It's exiled with this permanent",
    );
  });
});
