// Validation of the player a permanent chooses as it enters and of what reads it (CR 614.12a, 607.2d; Stuffy Doll), of "deals damage to you" (`dealsDamage` to `you`, CR 120.2;
// Dissipation Field) and of returning the triggering permanent to its owner's hand (`moveToZone` of the `triggerSubject`, CR 400.7). Cards here are SYNTHETIC probes.
import { describe, expect, test } from 'vitest';
import { type Ability, type CardDefinition, validateCard } from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const CHOOSE_PLAYER: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'player' },
};
const HIT_CHOSEN: Ability = {
  kind: 'triggered',
  trigger: { kind: 'dealtDamage', what: { kind: 'this' } },
  effect: {
    kind: 'dealDamage',
    amount: { kind: 'triggerDamage' },
    to: { kind: 'enteredChosenPlayer' },
  },
};
const BOUNCE_SOURCE: Ability = {
  kind: 'triggered',
  trigger: { kind: 'dealsDamage', what: {}, to: 'you' },
  effect: { kind: 'moveToZone', objects: { kind: 'triggerSubject' }, to: 'hand' },
};

function card(...abilities: Ability[]): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Chosen Player Probe',
    manaCost: ['1'],
    types: ['enchantment'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    abilities,
  });
}
const issues = (c: CardDefinition) => validateCard(c).map((i) => `${i.path}: ${i.message}`);

describe('"As this enters, choose a player"', () => {
  test('a card that chooses a player and reads the chosen player is valid', () => {
    expect(issues(card(CHOOSE_PLAYER, HIT_CHOSEN))).toEqual([]);
  });

  test('reading the chosen player without choosing one is refused (CR 607.2d)', () => {
    expect(issues(card(HIT_CHOSEN)).join('\n')).toContain('chosen player');
  });

  test('a face asks one question as it enters', () => {
    const second: Ability = {
      kind: 'replacement',
      replacement: { kind: 'asEntersChoose', what: 'color' },
    };
    expect(issues(card(CHOOSE_PLAYER, second))).not.toEqual([]);
  });
});

describe('"Whenever a permanent deals damage to you, return it to its owner\'s hand"', () => {
  test('is valid', () => {
    expect(issues(card(BOUNCE_SOURCE))).toEqual([]);
  });

  test('the triggering permanent is not put onto the battlefield', () => {
    const toBattlefield: Ability = {
      ...BOUNCE_SOURCE,
      effect: { kind: 'moveToZone', objects: { kind: 'triggerSubject' }, to: 'battlefield' },
    } as Ability;
    expect(issues(card(toBattlefield)).join('\n')).toContain('battlefield');
  });

  test('an unknown recipient of the damage is refused', () => {
    const bad = {
      ...BOUNCE_SOURCE,
      trigger: { kind: 'dealsDamage', what: {}, to: 'nobody' },
    } as unknown as Ability;
    expect(issues(card(bad)).join('\n')).toContain('unknown recipient');
  });
});
