// Issue 89 (Silverquill Influence), Scriv, the Obligator: "create a white Aura enchantment token named Contract attached to target creature an opponent controls. The token has enchant
// creature and \"...\"" and "it gets +2/+0 until end of turn if it's attacking one of your opponents. Otherwise, its controller loses 2 life." (CR 303.4f, 508.1b) read through the
// whole pipeline: the node it lowers to, SYNTHETIC variants and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-contract-aura-token.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const create =
  'Whenever ~ enters, create a white Aura enchantment token named Contract attached to target creature an opponent controls.';
const quoted =
  ' The token has enchant creature and "Whenever enchanted creature attacks, you gain 1 life."';
const read = (text: string) => readAll(text, 'creature', ['Inkling', 'Bird']).abilities;

describe('"create a white Aura enchantment token ... attached to target creature" (CR 303.4f)', () => {
  test('lowers to a createToken of a custom Aura token attached to the target', () => {
    expect(read(create + quoted)[0]).toMatchObject({
      kind: 'triggered',
      targets: [{ id: 't1' }],
      effect: {
        kind: 'createToken',
        count: 1,
        attachTo: { kind: 'target', id: 't1' },
        token: {
          kind: 'custom',
          definition: {
            name: 'Contract',
            types: ['enchantment'],
            subtypes: ['Aura'],
            colors: ['W'],
            abilities: [
              { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
              { kind: 'triggered', trigger: { kind: 'attacks', what: { kind: 'attached' } } },
            ],
          },
        },
      },
    });
  });

  test('the token may have no ability of its own besides enchant creature', () => {
    const [ability] = read(`${create} The token has enchant creature.`);
    expect(ability).toMatchObject({
      effect: {
        kind: 'createToken',
        token: { definition: { abilities: [{ kind: 'keyword' }] } },
      },
    });
  });

  test.each([
    // No target to be attached to, or no sentence that says what it enchants: never an Aura token that enters attached to nothing.
    [
      'Whenever ~ enters, create a white Aura enchantment token named Contract. The token has enchant creature.',
    ],
    [`${create}`],
    [
      'Whenever ~ enters, create a white Aura enchantment token named Contract attached to target creature an opponent controls. The token has enchant land.',
    ],
    [
      'Whenever ~ enters, create two white Aura enchantment tokens named Contract attached to target creature an opponent controls. The token has enchant creature.',
    ],
    [
      'Whenever ~ enters, create a white Aura enchantment token named Contract attached to up to one target creature. The token has enchant creature.',
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature', ['Inkling', 'Bird']).stoppedAt).toBeDefined();
  });
});

describe('"it gets +2/+0 until end of turn if it\'s attacking one of your opponents. Otherwise, its controller loses 2 life." (CR 508.1b, 608.2c)', () => {
  const aura = (text: string) =>
    readAll(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities;
  const line =
    "Whenever enchanted creature attacks, it gets +2/+0 until end of turn if it's attacking one of your opponents. Otherwise, its controller loses 2 life.";

  test('the real line of the quoted ability', () => {
    expect(aura(line)[1]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'attached' } },
      effect: {
        kind: 'conditional',
        condition: {
          kind: 'objectMatches',
          of: { kind: 'attached' },
          filter: { types: ['creature'], attackingOpponents: 'players' },
        },
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'attached' },
          power: 2,
          toughness: 0,
          duration: 'untilEndOfTurn',
        },
        else: {
          kind: 'loseLife',
          player: { kind: 'controllerOf', of: { kind: 'attached' } },
          amount: 2,
        },
      },
    });
  });

  test.each([
    ["Whenever enchanted creature attacks, it gets +2/+0 until end of turn if it's attacking you."],
    [
      "Whenever enchanted creature attacks, it gets +2/+0 until end of turn if it's attacking an opponent.",
    ],
    [
      "Whenever enchanted creature attacks, it gets +2/+0 until end of turn if it's attacking one of your opponents and you control a land.",
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toBeDefined();
  });
});
