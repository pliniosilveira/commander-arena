/**
 * The words of group 3 of the Galadriel deck (issue 43) as pure models: the trigger "whenever you roll a die's highest natural result", the gists of the abilities that roll and scry, exchange
 * control, remove counters after a revealed draw, stop the activated abilities of a permanent, counter a spell unless its controller pays an amount, the static ability of the Pilot
 * ("saddles Mounts and crews Vehicles as though its power were 2 greater"), the buyback chip and the buyback question. Read from the engine's SYNTHETIC cards, so a wording that
 * drifts from the AST fails here. No DOM.
 */
import {
  type Ability,
  type ActivatedAbility,
  type Cost,
  syntheticCard,
  type Trigger,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { staticWording } from '../src/game/play-rule-text';
import { triggerWording } from '../src/game/trigger-text';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';
import { buybackPrompt } from '../src/ui/decisions/optional';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

const triggered = (name: string) =>
  abilitiesOf(name).flatMap((a) => (a.kind === 'triggered' ? [a] : []));
const activated = (name: string): ActivatedAbility[] =>
  abilitiesOf(name).flatMap((a, abilityIndex) =>
    a.kind === 'activated' ? [{ ...a, abilityIndex } as unknown as ActivatedAbility] : [],
  );

const say = (trigger: Trigger) => triggerWording(trigger, { self: 'X' });
const label = (name: string, nth = 0) => {
  const ability = activated(name)[nth];
  if (ability === undefined) throw new Error(`no activated ability ${nth} of ${name}`);
  return activationLabel(undefined, { abilityIndex: 0, ability });
};

describe('the die', () => {
  test('"Whenever you roll a die\'s highest natural result", for each player', () => {
    const [, highest] = triggered('SYNTHETIC Die Ward');
    if (highest === undefined) throw new Error('no trigger');
    expect(say(highest.trigger)).toBe("Whenever you roll a die's highest natural result");
    expect(say({ kind: 'rollsHighest', who: 'opponent' })).toBe(
      "Whenever an opponent rolls a die's highest natural result",
    );
    expect(say({ kind: 'rollsHighest', who: 'any' })).toBe(
      "Whenever a player rolls a die's highest natural result",
    );
  });

  test('the draw it triggers, and the roll and scry of the upkeep', () => {
    const [upkeep, highest] = triggered('SYNTHETIC Die Ward');
    if (upkeep === undefined || highest === undefined) throw new Error('no trigger');
    expect(triggerGist(highest as never, undefined)).toBe('You draw a card');
    expect(triggerGist(upkeep as never, undefined)).toContain('Roll a 4-sided die');
  });

  test('the result as an amount', () => {
    expect(amountPhrase({ kind: 'dieResult' })).toBe('the result');
  });
});

describe('exchanging control and stopping abilities', () => {
  test('"Exchange control of this permanent and target nonland permanent" (the Eyes)', () => {
    // No card is in view here, so the permanent is "this permanent"; with the card it is "this enchantment".
    expect(label('SYNTHETIC Swap Eyes')).toContain(
      'Exchange control of this permanent and target nonland permanent',
    );
    expect(label('SYNTHETIC Swap Eyes')).toContain('(sorcery speed)');
  });

  test('"Target permanent\'s activated abilities can\'t be activated this turn", after the tap', () => {
    const mode = activated('SYNTHETIC Coil Titan')[0]?.modes?.[0];
    if (mode?.effect.kind !== 'sequence') throw new Error('no first mode');
    const [, restrict] = mode.effect.effects;
    const fake = {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1'] }],
      effect: restrict,
      targets: mode.targets,
    } as unknown as ActivatedAbility;
    expect(activationLabel(undefined, { abilityIndex: 0, ability: fake })).toBe(
      "{1}: Target permanent's activated abilities can't be activated this turn",
    );
  });
});

describe('the Walker: draw a card and reveal it, remove loyalty equal to its mana value', () => {
  test('the gist of the 0 ability', () => {
    const zero = activated('SYNTHETIC Mirror Walker').find((a) =>
      a.cost.some((c) => c.kind === 'loyalty' && c.change === 0),
    );
    if (zero === undefined) throw new Error('no 0 ability');
    const text = activationLabel(undefined, { abilityIndex: 3, ability: zero });
    expect(text).toBe(
      "0: You draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from this permanent",
    );
  });
});

describe('the counterspell that asks for an amount', () => {
  test('the gist of the spell says what the controller pays', () => {
    const face = syntheticCard('SYNTHETIC Mutation Counter').faces[0];
    const effect = face?.spell?.effect;
    if (effect?.kind !== 'sequence') throw new Error('no sequence');
    const [, counter] = effect.effects;
    if (counter?.kind !== 'counterUnlessPays') throw new Error('no counter');
    const fake = {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1'] }],
      effect: counter,
      targets: face?.spell?.targets,
    } as unknown as ActivatedAbility;
    expect(activationLabel(undefined, { abilityIndex: 0, ability: fake })).toContain(
      'unless its controller pays mana equal to the greatest power among creatures you control',
    );
  });
});

describe('static abilities and keywords', () => {
  test('the crew bonus of the Pilot', () => {
    expect(staticWording({ kind: 'crewSaddleBonus', amount: 2 })).toBe(
      'This creature saddles Mounts and crews Vehicles as though its power were 2 greater',
    );
  });

  test('the buyback question names the cost', () => {
    const cost: Cost[] = [{ kind: 'mana', symbols: ['2'] }];
    expect(buybackPrompt(cost)).toBe('Pay the buyback cost {2}?');
    expect(buybackPrompt([])).toBe('Pay the buyback cost?');
  });
});
