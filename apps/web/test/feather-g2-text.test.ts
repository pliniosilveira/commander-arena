/**
 * The words of group 2 of the Feather deck (D-443 to D-448) as pure models: the static ability of commander creatures, the condition of the spells cast this turn by
 * card type and the activation that uses it, "Monstrosity 5" (the ability and the log line of the permanent that became monstrous), the trigger with three events and the
 * modal spell. Read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here. No DOM.
 */
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvents } from '../src/game/describe';
import { lordWordings } from '../src/game/static-text';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

describe('commander creatures you control', () => {
  test('the static abilities say "creature commanders you control" (the words of the commander filter since D-145)', () => {
    expect(
      lordWordings(abilitiesOf('SYNTHETIC Commander Guard'), {
        noun: 'creature',
        subtypes: ['Human', 'Soldier'],
      }),
    ).toEqual([
      'Creature commanders you control get +2/+2.',
      'Creature commanders you control have indestructible.',
    ]);
  });
});

describe('the condition of the spells cast this turn, by card type (D-444)', () => {
  test('one spell of one or two types', () => {
    expect(
      gameConditionWords({
        kind: 'spellsCastThisTurn',
        atLeast: 1,
        ofTypes: ['instant', 'sorcery'],
      }),
    ).toBe('you have cast an instant or sorcery spell this turn');
    expect(
      gameConditionWords({ kind: 'spellsCastThisTurn', atLeast: 1, ofTypes: ['creature'] }),
    ).toBe('you have cast a creature spell this turn');
  });

  test('negated, with a count, and without a type (the older words)', () => {
    expect(
      gameConditionWords({
        kind: 'not',
        term: { kind: 'spellsCastThisTurn', atLeast: 1, ofTypes: ['artifact'] },
      }),
    ).toBe("you haven't cast an artifact spell this turn");
    expect(
      gameConditionWords({
        kind: 'spellsCastThisTurn',
        atLeast: 2,
        ofTypes: ['instant', 'sorcery'],
      }),
    ).toBe('you have cast 2 or more instant or sorcery spells this turn');
    expect(gameConditionWords({ kind: 'spellsCastThisTurn', atLeast: 3 })).toBe(
      'you have cast 3 or more spells this turn',
    );
  });

  test('the chooser label of the activation of the Hall says both restrictions', () => {
    const ability = abilitiesOf('SYNTHETIC Oracle Hall').find((a) => a.kind === 'activated');
    if (ability?.kind !== 'activated') throw new Error('no activated ability');
    expect(activationLabel(undefined, { abilityIndex: 2, ability })).toContain(
      '(sorcery speed). Activate only if you have cast an instant or sorcery spell this turn.',
    );
  });
});

describe('Monstrosity and the permanent that became monstrous', () => {
  test('the label of "{5}: Monstrosity 5"', () => {
    const ability = abilitiesOf('SYNTHETIC Spike Toy').find((a) => a.kind === 'activated');
    if (ability?.kind !== 'activated') throw new Error('no activated ability');
    expect(activationLabel(undefined, { abilityIndex: 4, ability })).toBe('{5}: Monstrosity 5');
  });

  test('the log says the permanent became monstrous, with the rule and the counters', () => {
    const g = scenario()
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .battlefield('SYNTHETIC Spike Toy')
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();
    const before = g.state;
    const mark = g.mark();
    g.act(0).activate('SYNTHETIC Spike Toy', { pay: true });
    g.passAll();
    const described = describeEvents(g.eventsSince(mark), before, g.state, 0);
    const monstrous = described.find((d) => d.text.includes('became monstrous'));
    expect(monstrous?.text).toBe('SYNTHETIC Spike Toy became monstrous.');
    expect(monstrous?.rule).toBe('CR 701.37');
    expect(described.some((d) => d.text.includes('5 +1/+1 counters on SYNTHETIC Spike Toy'))).toBe(
      true,
    );
  });
});

describe('the trigger of three events', () => {
  test('each ability is worded by its own event; the gist is the same damage', () => {
    const triggered = abilitiesOf('SYNTHETIC Spike Toy').filter((a) => a.kind === 'triggered');
    expect(triggered).toHaveLength(3);
    for (const a of triggered) {
      expect(triggerGist(a as never, undefined)).toBe(
        "Deal damage equal to this permanent's power to each opponent",
      );
    }
  });
});
