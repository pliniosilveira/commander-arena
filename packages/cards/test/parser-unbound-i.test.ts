// "Double the value of X" and "copy that spell or ability" (Quandrix Unlimited deck, group I): the REAL Oracle wordings of Unbound Flourishing (name replaced by ~ where it said its own)
// lower to the engine's `doubleSpellX`, `castSpell` with `xInManaCost` and `activatesAbility` with `xCost`, and the near misses are dropped. The engine runs what is lowered in
// convert-grammar-engine-unbound-i.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const abilities = (text: string) => readAll(text, 'enchantment').abilities;

const COPY = { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' };
const CAST_X = { stackKind: 'spell', xInManaCost: true };

describe('double the value of X', () => {
  test('a permanent spell with {X} in its mana cost (real)', () => {
    expect(
      abilities(
        'Whenever you cast a permanent spell with a mana cost that contains {X}, double the value of X.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            ...CAST_X,
            anyOf: expect.arrayContaining([{ types: ['creature'] }, { types: ['artifact'] }]),
          },
          by: 'you',
        },
        effect: { kind: 'doubleSpellX', spell: { kind: 'triggerSubject' } },
      },
    ]);
  });

  test('a trigger that is not about a spell with {X} has no X to double', () => {
    expect(
      dropped('Whenever you cast a creature spell, double the value of X.', 'enchantment').reason,
    ).toBe('notRunnable');
    expect(dropped('When ~ enters, double the value of X.', 'enchantment').reason).toBe(
      'unboundReference',
    );
  });
});

describe('copy that spell or ability', () => {
  test('one ability for each event: the cast and the activation, each with its {X} (real)', () => {
    expect(
      abilities(
        "Whenever you cast an instant or sorcery spell or activate an ability, if that spell's mana cost or that ability's activation cost contains {X}, copy that spell or ability. You may choose new targets for the copy.",
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            ...CAST_X,
            anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
          },
          by: 'you',
        },
        effect: COPY,
      },
      {
        kind: 'triggered',
        trigger: { kind: 'activatesAbility', who: 'you', xCost: true, anySource: true },
        effect: COPY,
      },
    ]);
  });

  test('without the sentence about new targets the copy keeps the targets', () => {
    const [cast] = abilities(
      "Whenever you cast a spell or activate an ability, if that spell's mana cost or that ability's activation cost contains {X}, copy that spell or ability.",
    );
    expect(cast).toMatchObject({ effect: { ...COPY, newTargets: 'no' } });
  });

  test('the trigger alone reads (no condition on the cost)', () => {
    const [cast, activate] = abilities(
      'Whenever you cast an instant or sorcery spell or activate an ability, you gain 1 life.',
    );
    expect(cast).toMatchObject({ trigger: { kind: 'castSpell', by: 'you' } });
    expect(cast).not.toMatchObject({ trigger: { filter: { xInManaCost: true } } });
    expect(activate).toMatchObject({
      trigger: { kind: 'activatesAbility', who: 'you', anySource: true },
    });
    expect(activate).not.toMatchObject({ trigger: { xCost: true } });
  });

  test('"that spell or ability" needs an activation among the events', () => {
    expect(
      dropped('Whenever you cast a spell, copy that spell or ability.', 'enchantment').reason,
    ).toBe('notRunnable');
  });

  test('the condition on both costs needs both events', () => {
    expect(
      dropped(
        "Whenever you cast an instant or sorcery spell, if that spell's mana cost or that ability's activation cost contains {X}, you gain 1 life.",
        'enchantment',
      ).reason,
    ).toBe('notRunnable');
  });
});
