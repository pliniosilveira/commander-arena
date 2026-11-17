/**
 * The words of "{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way." (D-583, D-585) as pure
 * models: the cost, the label of the ability, the prompt of the sacrifice question, read from the engine's SYNTHETIC cards so a wording that drifts from the AST fails here. No DOM.
 */
import {
  type ActivatedAbility,
  type ObjectView,
  type PlayerSelector,
  syntheticCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { chosenColorManaText } from '../src/game/chosen-color-text';
import { activationCostText, sacrificeWhat } from '../src/game/cost-text';
import { activationLabel } from '../src/ui/decisions/ability-label';
import { namedOptionPrompt } from '../src/ui/decisions/option-names';
import { activationSacrifice, choosePermanentPrompt } from '../src/ui/decisions/permanents';

const face = (name: string) => {
  const f = syntheticCard(name).faces[0];
  if (f === undefined) throw new Error(`no card ${name}`);
  return f;
};
const activated = (name: string): ActivatedAbility => {
  const a = face(name).abilities.find((x) => x.kind === 'activated');
  if (a?.kind !== 'activated') throw new Error(`no activated ability on ${name}`);
  return a;
};
const artifact = { name: 'Lotus', types: ['artifact'] } as unknown as ObjectView;

describe('the cost', () => {
  test('"Sacrifice one or more artifacts", with the tap before it', () => {
    expect(sacrificeWhat({ types: ['artifact'] }, 1, false, true)).toBe('one or more artifacts');
    expect(sacrificeWhat({ types: ['creature'], other: true }, 1, false, true)).toBe(
      'one or more other creatures',
    );
    expect(activationCostText(activated('SYNTHETIC Lotus Engine').cost)).toBe(
      '{T}, Sacrifice one or more artifacts',
    );
  });
});

describe('the label of the ability', () => {
  test('the Lotus: choose a color, the target player adds three mana of it for each permanent sacrificed', () => {
    expect(
      activationLabel(artifact, { abilityIndex: 0, ability: activated('SYNTHETIC Lotus Engine') }),
    ).toBe(
      '{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of that color for each permanent sacrificed this way',
    );
  });

  test('the Reader: the player draws a card for each permanent sacrificed as a cost', () => {
    const label = activationLabel(artifact, {
      abilityIndex: 0,
      ability: activated('SYNTHETIC Lotus Reader'),
    });
    expect(label).toContain('{T}, Sacrifice one or more artifacts:');
    expect(label).toContain('draws');
  });

  test('another shape of choice keeps its words (nothing is guessed)', () => {
    const lotus = activated('SYNTHETIC Lotus Engine').effect;
    if (lotus.kind !== 'chooseOne') throw new Error('expected chooseOne');
    const who = (_p: PlayerSelector) => 'target player';
    expect(chosenColorManaText(lotus, who)).not.toBeNull();
    // Four colors only.
    expect(chosenColorManaText({ ...lotus, options: lotus.options.slice(0, 4) }, who)).toBeNull();
    // The options are in another order.
    expect(
      chosenColorManaText({ ...lotus, options: [...lotus.options].reverse() }, who),
    ).toBeNull();
    // The player who chooses is not the controller.
    expect(chosenColorManaText({ ...lotus, chooser: { kind: 'you' } }, who)).toBeNull();
  });
});

describe('the prompt of the sacrifice question', () => {
  test('names what the cost sacrifices: one or more artifacts, to pay for the Lotus', () => {
    const lotus = {
      id: 's1',
      name: 'Lotus',
      zone: 'stack',
      abilitySource: 'p1',
      ability: activated('SYNTHETIC Lotus Engine'),
    } as unknown as ObjectView;
    const index = new Map<string, ObjectView>([['s1', lotus]]);
    const decision = {
      purpose: 'sacrifice',
      forCost: true,
      min: 1,
      max: 4,
      source: 's1',
      legal: [],
      seat: 0,
    } as never;
    expect(activationSacrifice(decision, index as never)).toBe('one or more artifacts');
    expect(choosePermanentPrompt(decision, index as never)).toBe(
      'Sacrifice one or more artifacts to pay for Lotus.',
    );
  });
});

describe('the question of the color', () => {
  test('the five colors are one color to choose; other offers keep the list', () => {
    expect(
      namedOptionPrompt({
        purpose: 'effect',
        options: ['white', 'blue', 'black', 'red', 'green'],
        sourceName: 'Lotus',
      }),
    ).toBe('Choose a color for Lotus.');
    expect(
      namedOptionPrompt({
        purpose: 'effect',
        options: ['draw a card', 'gain 3 life'],
        sourceName: 'Lotus',
      }),
    ).toBe('Choose one for Lotus: draw a card or gain 3 life.');
  });
});
