/**
 * The words of group 9 of the Hashaton deck (D-390 to D-395) as pure models: the activation with a Phyrexian symbol in its cost, the transform, the exile of a random
 * card from a hand, and the free cast (read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here). No DOM.
 */
import { type Ability, type StackAbility, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationCostText } from '../src/game/cost-text';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';

const abilitiesOf = (name: string, face = 0): readonly Ability[] => {
  const f = syntheticCard(name).faces[face];
  if (f === undefined) throw new Error(`no face ${face} for ${name}`);
  return f.abilities;
};

const view = (name: string) =>
  ({
    id: 'o1',
    name,
    controller: 0,
    owner: 0,
    types: ['creature'],
    subtypes: [],
    colors: [],
    oracleText: '',
    keywords: [],
    isToken: false,
    power: null,
    toughness: null,
    zone: 'battlefield',
    tapped: false,
  }) as never;

const label = (name: string, face = 0) => {
  const ability = abilitiesOf(name, face).find((a) => a.kind === 'activated');
  if (ability?.kind !== 'activated') throw new Error(`no activated ability on ${name}`);
  return activationLabel(view(name), { abilityIndex: 0, ability });
};

const stackTrigger = (name: string): StackAbility => {
  const ability = abilitiesOf(name).find((a) => a.kind === 'triggered');
  if (ability?.kind !== 'triggered') throw new Error(`no trigger on ${name}`);
  return ability as unknown as StackAbility;
};

describe('the activation with a Phyrexian symbol in its cost', () => {
  test('the cost keeps the symbol as it is printed', () => {
    expect(activationCostText([{ kind: 'mana', symbols: ['5', 'B/P'] }])).toBe('{5}{B/P}');
    expect(activationCostText([{ kind: 'mana', symbols: ['B/P'] }])).toBe('{B/P}');
  });

  test('the chooser names the cost and what it does', () => {
    expect(label('SYNTHETIC Phyrexian Scribe')).toBe('{B/P}: You draw a card');
  });

  test('the transform is worded, at sorcery speed', () => {
    expect(label('SYNTHETIC Phyrexian Seer // Phyrexian Colossus')).toBe(
      '{5}{B/P}: Transform this creature (sorcery speed)',
    );
  });
});

describe('the exile of a random card from a hand', () => {
  test('the player of the trigger, and a target', () => {
    expect(triggerGist(stackTrigger('SYNTHETIC Chaos Obelisk'), view('x'))).toBe(
      'That player exiles a card from their hand at random',
    );
    expect(label('SYNTHETIC Chaos Pointer')).toBe(
      '{T}: Target player exiles a card from their hand at random',
    );
  });

  test('the whole body of the real card: the exile, then the land or the free cast', () => {
    expect(triggerGist(stackTrigger('SYNTHETIC Chaos Obliterator'), view('x'))).toBe(
      "That player exiles a card from their hand at random. If it's a land card, you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost",
    );
  });
});
