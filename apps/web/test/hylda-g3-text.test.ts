/**
 * The words of group 3 of the Hylda deck (issue 42) as pure models: the count of the tapped creatures of a target player, the X of an enters trigger, the label of the activated
 * ability that shuffles two permanents into their owners' libraries, the gist of the hexproof of a player, the optional choice of "tap or untap", and the words of a slot of targets
 * with different controllers (read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here). No DOM.
 */
import {
  type ActivatedAbility,
  type Effect,
  type ObjectView,
  type StackAbility,
  syntheticCard,
  type TargetChoiceSpec,
  type TriggeredAbility,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { amountPhrase, createDefinitions } from '../src/game/amount-text';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';
import { targetsWord } from '../src/ui/decisions/target-prompt';

const face = (name: string) => {
  const f = syntheticCard(name).faces[0];
  if (f === undefined) throw new Error(`no card ${name}`);
  return f;
};
const triggered = (name: string, index: number): TriggeredAbility => {
  const a = face(name).abilities.filter((x) => x.kind === 'triggered')[index];
  if (a?.kind !== 'triggered') throw new Error(`no triggered ability ${index} on ${name}`);
  return a;
};
const activated = (name: string): ActivatedAbility => {
  const a = face(name).abilities.find((x) => x.kind === 'activated');
  if (a?.kind !== 'activated') throw new Error(`no activated ability on ${name}`);
  return a;
};
const creature = { name: 'Creature', types: ['creature'] } as unknown as ObjectView;

describe('the amounts', () => {
  test('the tapped creatures a target player controls', () => {
    const effect = face('SYNTHETIC Dream Raider').spell?.effect;
    if (effect?.kind !== 'draw') throw new Error('not a draw');
    expect(amountPhrase(effect.count)).toBe('the number of tapped creatures that player controls');
  });

  test('a count whose player is not a target is not worded as one', () => {
    expect(
      amountPhrase({ kind: 'countOf', filter: { types: ['creature'], controlledBy: { kind: 'you' } } }),
    ).toBe('a number');
  });

  test('the X of an enters trigger is said as X and needs no definition', () => {
    expect(amountPhrase({ kind: 'enteredX' })).toBe('X');
    const defs = createDefinitions();
    expect(defs.say({ kind: 'enteredX' })).toBe('X');
    expect(defs.tail()).toBe('');
  });
});

describe('the labels of the abilities', () => {
  test('the enters trigger of Mana Scholar draws X cards', () => {
    const ability = triggered('SYNTHETIC Mana Scholar', 0) as unknown as StackAbility;
    expect(triggerGist(ability, creature)).toBe('You draw X cards');
  });

  test('the Shuffler: the cost and the two objects that go into the libraries', () => {
    const label = activationLabel(creature, {
      abilityIndex: 2,
      ability: activated('SYNTHETIC Tide Shuffler'),
    });
    expect(label.startsWith('{1}{U}, {T}:')).toBe(true);
    expect(label).not.toContain('undefined');
    expect(label).not.toContain('[object');
  });

  test('Landless Hound: the search with its intervening "if"', () => {
    const ability = triggered('SYNTHETIC Landless Hound', 0) as unknown as StackAbility;
    const gist = triggerGist(ability, creature);
    expect(gist).toContain('if');
    expect(gist).not.toContain('undefined');
  });

  test('Warding Prayer: the player has hexproof until end of turn', () => {
    const effect = face('SYNTHETIC Warding Prayer').spell?.effect;
    if (effect?.kind !== 'sequence') throw new Error('not a sequence');
    const grant: Effect | undefined = effect.effects[0];
    expect(grant?.kind).toBe('grantPlayerHexproof');
    const stand = {
      kind: 'triggered',
      trigger: { kind: 'landfall' },
      effect: grant,
    } as unknown as StackAbility;
    expect(triggerGist(stand, undefined)).toBe('You gain hexproof until end of turn');
  });

  test('the optional choice of tap or untap says it may be declined', () => {
    const modes = triggered('SYNTHETIC Tide Keeper', 0).modes;
    const choice = modes?.[0]?.effect;
    if (choice === undefined) throw new Error('no mode');
    const stand = {
      kind: 'triggered',
      trigger: { kind: 'landfall' },
      effect: choice,
    } as unknown as StackAbility;
    expect(triggerGist(stand, undefined)).toBe('You may choose one: Tap it; Untap it');
  });
});

describe('the words of a slot of targets with different controllers', () => {
  const slot = (extra: Partial<TargetChoiceSpec>): TargetChoiceSpec => ({
    specId: 't2',
    min: 0,
    max: 3,
    legal: [],
    ...extra,
  });

  test('any number, no two with the same controller', () => {
    expect(targetsWord(slot({ onePerGroup: true, eachController: true }))).toBe(
      'any number of targets, no two with the same controller',
    );
  });

  test('the slot for each opponent is worded as before', () => {
    expect(targetsWord(slot({ onePerGroup: true }))).toBe('up to one target for each opponent');
  });
});
