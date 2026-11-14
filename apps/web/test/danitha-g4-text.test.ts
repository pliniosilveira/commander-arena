/**
 * The words of group 4 of the Danitha deck (D-1240 to D-1245) as pure models: Umbra armor (the ability, the log line and the question of its order with a regeneration shield or a
 * second Umbra Aura, CR 702.89a, 616.1). The ability is read from the engine's SYNTHETIC Aura, so a wording that drifts from the AST fails here. No DOM.
 */
import {
  type ChooseOptionDecision,
  type DestroyReplacementChoice,
  syntheticCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  destroyReplacementPrompt,
  destroyReplacementThen,
  umbraArmorUsedText,
  umbraArmorWording,
} from '../src/game/danitha-g4-text';
import { describeEvents } from '../src/game/describe';
import { replacementWording } from '../src/game/static-text';
import {
  isReplacementChoice,
  namedOptionPrompt,
  namedOptionRows,
  replacementTitle,
} from '../src/ui/decisions/option-names';

const umbra = () => {
  const ability = syntheticCard('SYNTHETIC Umbra Hide').faces[0]?.abilities.find(
    (a) => a.kind === 'replacement',
  );
  if (ability?.kind !== 'replacement') throw new Error('no replacement on the Aura');
  return ability.replacement;
};

const regenerate: DestroyReplacementChoice = {
  option: 'regenerate',
  kind: 'regenerate',
  text: 'Regenerate it instead: remove all damage from it, tap it and remove it from combat',
  outcome: { aura: null, tapped: true },
};
const umbraChoice: DestroyReplacementChoice = {
  option: 'umbra:o7',
  kind: 'umbra',
  text: 'Remove all damage from it and destroy SYNTHETIC Umbra Veil instead (Umbra armor)',
  object: 'o7',
  objectName: 'SYNTHETIC Umbra Veil',
  outcome: { aura: 'SYNTHETIC Umbra Veil', tapped: false },
};

const decision = (): Pick<
  ChooseOptionDecision,
  'purpose' | 'options' | 'sourceOracleText' | 'replacement' | 'sourceName'
> => ({
  purpose: 'replacement',
  options: [regenerate.option, umbraChoice.option],
  sourceName: 'SYNTHETIC Regenerating Troll',
  sourceOracleText: '',
  replacement: {
    destroy: { object: 'o1', objectName: 'SYNTHETIC Regenerating Troll', during: 'resolution' },
    choices: [regenerate, umbraChoice],
  },
});

describe('Umbra armor (CR 702.89a, D-1241)', () => {
  test('the ability of an Aura is worded from its AST', () => {
    expect(replacementWording(umbra())).toBe(umbraArmorWording());
    expect(umbraArmorWording()).toBe(
      'Umbra armor: if enchanted permanent would be destroyed, instead remove all damage from it and destroy this Aura',
    );
  });

  test('the log line names the creature and the Aura', () => {
    expect(umbraArmorUsedText('Grizzly Bears', 'Hyena Umbra')).toBe(
      'Grizzly Bears is not destroyed: Umbra armor removes all damage from it and Hyena Umbra is destroyed instead.',
    );
  });
});

describe('the log of a destruction that Umbra armor replaces', () => {
  test('the line says what happened, with its rule and the two permanents', () => {
    const g = scenario()
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .battlefield('Grizzly Bears')
      .battlefield('SYNTHETIC Umbra Veil', { attachedTo: 'Grizzly Bears' })
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand('Murder')
      .build();
    g.act(0).pass();
    const before = g.state;
    const mark = g.mark();
    g.act(1).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    const events = g.eventsSince(mark);
    const described = describeEvents(events, before, g.state, 0).find((d) =>
      d.text.includes('Umbra armor'),
    );
    expect(described?.text).toBe(
      'Grizzly Bears is not destroyed: Umbra armor removes all damage from it and SYNTHETIC Umbra Veil is destroyed instead.',
    );
    expect(described?.rule).toBe('CR 702.89a');
  });
});

describe('the question of the order of a regeneration shield and Umbra armor (CR 616.1, D-1242)', () => {
  test('it is the question of replacement effects, titled for the destruction', () => {
    expect(isReplacementChoice(decision())).toBe(true);
    expect(replacementTitle(decision())).toBe('Destruction replacement');
    expect(replacementTitle({})).toBe('Damage replacement');
  });

  test('the prompt names the creature that would be destroyed', () => {
    expect(destroyReplacementPrompt('Grizzly Bears')).toBe(
      'Grizzly Bears would be destroyed. Several effects apply. Choose which to apply first.',
    );
    expect(namedOptionPrompt(decision())).toBe(
      'SYNTHETIC Regenerating Troll would be destroyed. Several effects apply. Choose which to apply first.',
    );
  });

  test('one button for each effect: its words and, under them, what it leads to', () => {
    expect(destroyReplacementThen(regenerate.outcome)).toBe(
      'Then: it is tapped, removed from combat and its damage is removed',
    );
    expect(destroyReplacementThen(umbraChoice.outcome)).toBe(
      'Then: its damage is removed and SYNTHETIC Umbra Veil is destroyed',
    );
    expect(namedOptionRows(decision())).toEqual([
      {
        option: 'regenerate',
        label: regenerate.text,
        detail: destroyReplacementThen(regenerate.outcome),
      },
      {
        option: 'umbra:o7',
        label: umbraChoice.text,
        detail: destroyReplacementThen(umbraChoice.outcome),
      },
    ]);
  });
});
