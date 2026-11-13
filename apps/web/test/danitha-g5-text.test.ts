/**
 * The words of group 5 of the Danitha deck (D-1250 to D-1253, provisional) as pure models: the blight cost, the exile of the enchanted creature, the attach to the
 * creature that entered, and the spell that has flash if it targets a commander (read from the engine's SYNTHETIC cards, so a wording
 * that drifts from the AST fails here). No DOM.
 */
import { type Ability, type StackAbility, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationCostText } from '../src/game/cost-text';
import { conditionalWording } from '../src/game/static-text';
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
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: [],
    oracleText: '',
    keywords: [],
    isToken: false,
    power: null,
    toughness: null,
    zone: 'battlefield',
    tapped: false,
  }) as never;

const label = (name: string) => {
  const index = abilitiesOf(name).findIndex((a) => a.kind === 'activated');
  const ability = abilitiesOf(name)[index];
  if (ability?.kind !== 'activated') throw new Error(`no activated ability on ${name}`);
  return activationLabel(view(name), { abilityIndex: index, ability });
};

const stackTrigger = (name: string): StackAbility => {
  const ability = abilitiesOf(name).find((a) => a.kind === 'triggered');
  if (ability?.kind !== 'triggered') throw new Error(`no trigger on ${name}`);
  return ability as unknown as StackAbility;
};

describe('the blight cost and the exile of the enchanted creature (D-1252)', () => {
  test('the cost is worded as Oracle text prints it', () => {
    expect(activationCostText([{ kind: 'blight', count: 1 }])).toBe('Blight 1');
    expect(
      activationCostText([
        { kind: 'mana', symbols: ['1', 'W'] },
        { kind: 'blight', count: 2 },
        { kind: 'sacrifice', what: { kind: 'this' } },
      ]),
    ).toBe('{1}{W}, Blight 2, Sacrifice this');
  });

  test('the chooser names the cost and what it does', () => {
    // The Aura's enchant filter is not on the ability, so the permanent is "enchanted permanent" (true of any Aura).
    expect(label('SYNTHETIC Blighting Aura')).toBe(
      '{1}{W}, Blight 1, Sacrifice this: Exile enchanted permanent',
    );
  });
});

describe('the attach to the creature that entered (D-1251)', () => {
  test('the trigger says which creature it is about', () => {
    expect(triggerGist(stackTrigger('SYNTHETIC Wandering Aura'), view('x'))).toBe(
      'Attach this enchantment to that creature',
    );
  });
});

describe('the spell that has flash if it targets a commander (D-1253)', () => {
  test('its own permission, with the condition after it', () => {
    const [flash] = abilitiesOf('SYNTHETIC Warding Aura');
    if (flash?.kind !== 'static') throw new Error('no static ability');
    expect(conditionalWording(flash, { noun: 'Aura' } as never)).toBe(
      'You may cast this spell as though it had flash if it targets a commander',
    );
  });

  test('a condition that is not about the targets', () => {
    const flash = abilitiesOf('SYNTHETIC Crowd Aura')[0];
    if (flash?.kind !== 'static') throw new Error('no static ability');
    expect(conditionalWording(flash, { noun: 'Aura' } as never)).toBe(
      'You may cast this spell as though it had flash if you control 2 or more creatures',
    );
  });
});
