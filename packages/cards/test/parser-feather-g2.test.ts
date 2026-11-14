// The Feather deck (issue 27), group 2 (D-1310 to D-1315): the lines of Bastion Protector, Fall of the Hammer, Reckless Rage, Giggling Skitterspike, Light the Way and Hall of Oracles.
// The first lines of each block are the real Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and
// the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-feather-g2.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'instant') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell ?? null, text).toBeNull();
  expect(parsed.unparsed, text).toHaveLength(1);
};

const COMMANDER_CREATURES = { types: ['creature'], controller: 'you', commander: true };

describe('Bastion Protector: "Commander creatures you control get +2/+2 and have indestructible" (D-1310, CR 903.3)', () => {
  test('the real line: two static abilities of the group of the commanders you control', () => {
    const parsed = readAll(
      'Commander creatures you control get +2/+2 and have indestructible.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: COMMANDER_CREATURES },
          power: 2,
          toughness: 2,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: COMMANDER_CREATURES },
          keyword: { kind: 'indestructible' },
        },
      },
    ]);
  });

  test.each([
    ['Other commander creatures you control get +1/+1.', true],
    ['Commander creatures get +1/+1.', false],
  ])('the same group in other statics (SYNTHETIC): %s', (text, other) => {
    const parsed = readAll(text, 'creature');
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], commander: true },
            ...(other ? { other: true } : {}),
          },
        },
      },
    ]);
  });

  test('the old "target commander" rule is untouched ("target commander creature" is not read: that rule takes "target commander" first)', () => {
    NOT_READ('Destroy target commander creature.', 'sorcery');
    const old = readAll('Exile target commander.', 'sorcery');
    expect(old.spell).toMatchObject({
      targets: [{ what: { kind: 'object', filter: { commander: true } } }],
    });
  });

  test.each([
    'Commander spells you cast get +1/+1.',
    'Commander you control gets +2/+2.',
    'Commanders you control get +2/+2.',
    'Your commander creatures get +2/+2.',
    'Commander creature you control gets +2/+2.',
    'Commander creatures you control get +2/+2 and have.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'creature');
  });

  test('"commander" is not a modifier of the spell phrases', () => {
    NOT_READ('Counter target commander spell.');
  });
});

describe('Fall of the Hammer: "another target creature" after the target that deals the damage (D-1313, CR 115.3)', () => {
  test('the real line: the second target differs from the first, which deals the damage', () => {
    const parsed = readAll(
      'Target creature you control deals damage equal to its power to another target creature.',
    );
    expect(parsed.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
        },
        {
          id: 't2',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          differentFrom: 't1',
        },
      ],
      effect: {
        kind: 'dealDamage',
        amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
        to: { kind: 'target', id: 't2' },
        from: { kind: 'target', id: 't1' },
      },
    });
  });

  test.each([
    'Target creature you control deals 3 damage to another target creature.',
    "Target creature you control deals damage equal to its power to another target creature you don't control.",
  ])('the same shape with another amount or another filter (SYNTHETIC): %s', (text) => {
    const parsed = readAll(text);
    expect(parsed.spell).toMatchObject({
      targets: [{ id: 't1' }, { id: 't2', differentFrom: 't1' }],
      effect: { kind: 'dealDamage', from: { kind: 'target', id: 't1' }, to: { id: 't2' } },
    });
  });

  test.each([
    'Target creature you control deals damage equal to its power to another creature.',
    'Target creature you control deals damage equal to its power to another target.',
    'Target creature you control deals damage equal to its power to other target creatures.',
    'Target creature you control deals damage equal to its power to another target creature and another target creature.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('"another" still means "not the source" for a damage that has no target to differ from: not read for the creature of a trigger', () => {
    NOT_READ(
      'Whenever a creature you control enters, it deals damage equal to its power to another target creature.',
      'creature',
    );
  });
});

describe('Reckless Rage: "~ deals 4 damage to target creature you don\'t control and 2 damage to target creature you control" (D-1313)', () => {
  const LINE =
    "~ deals 4 damage to target creature you don't control and 2 damage to target creature you control.";

  test('the real line: two damage instructions of the spell, each to its own target', () => {
    const parsed = readAll(LINE);
    expect(parsed.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
          },
        },
        {
          id: 't2',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDamage', amount: 4, to: { kind: 'target', id: 't1' } },
          { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't2' } },
        ],
      },
    });
  });

  test.each([
    ['~ deals 3 damage to target creature and 1 damage to you.', [3, 1]],
    ['~ deals 5 damage to any target and 2 damage to each opponent.', [5, 2]],
    ['~ deals 2 damage to target player and 1 damage to target creature.', [2, 1]],
  ])('other recipients (SYNTHETIC): %s', (text, [first, second]) => {
    const parsed = readAll(text);
    expect(parsed.spell).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDamage', amount: first },
          { kind: 'dealDamage', amount: second },
        ],
      },
    });
  });

  test.each([
    '~ deals 4 damage to target creature and 2 damage.',
    '~ deals 4 damage to target creature and 2 damage to.',
    '~ deals 4 damage to target creature and 2 damage to it.',
    '~ deals 4 damage to target creature and 2 to target creature.',
    '~ deals 4 damage to target creature and damage to you.',
    '~ deals 4 damage to target creature and 2 damage each to you.',
    '2 damage to target creature you control.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('a damage that is not the second instruction of a sentence of the spell has no source: not read alone', () => {
    // "2 damage to ..." with no subject is the rule's own text; the lowering refuses it where no damage of the same sentence comes before.
    const parsed = read('Draw a card and 2 damage to target creature.');
    expect(parsed.spell ?? null).toBeNull();
  });
});

describe('Giggling Skitterspike: "Whenever ~ attacks, blocks, or becomes the target of a spell, it deals damage equal to its power to each opponent" (D-1315, CR 603.2c)', () => {
  const LINE =
    'Whenever ~ attacks, blocks, or becomes the target of a spell, it deals damage equal to its power to each opponent.';
  const DAMAGE = {
    kind: 'dealDamage',
    amount: { kind: 'powerOf', of: { kind: 'this' } },
    to: { kind: 'eachOpponent' },
  };

  test('the real line: one ability for each event, the same body', () => {
    const parsed = readAll(LINE, 'creature');
    expect(parsed.abilities).toEqual([
      { kind: 'triggered', trigger: { kind: 'attacks', what: { kind: 'this' } }, effect: DAMAGE },
      { kind: 'triggered', trigger: { kind: 'blocks', what: { kind: 'this' } }, effect: DAMAGE },
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTarget', what: { kind: 'this' }, by: 'any', spellOnly: true },
        effect: DAMAGE,
      },
    ]);
  });

  test.each([
    [
      'Whenever ~ attacks or becomes the target of a spell, it deals damage equal to its power to each opponent.',
      2,
    ],
    [
      'Whenever ~ becomes the target of a spell, it deals damage equal to its power to each opponent.',
      1,
    ],
  ])(
    '"it" is the creature itself for a trigger of becoming the target (SYNTHETIC): %s',
    (text, n) => {
      const parsed = readAll(text, 'creature');
      expect(parsed.abilities).toHaveLength(n);
      expect(parsed.abilities.at(-1)).toMatchObject({
        kind: 'triggered',
        trigger: { kind: 'becomesTarget', spellOnly: true },
        effect: DAMAGE,
      });
    },
  );

  test.each([
    ['Whenever ~ enters, attacks, or dies, draw a card.', 3],
    ['Whenever ~ attacks, blocks, or becomes blocked, draw a card.', 3],
    ['Whenever ~ attacks, blocks, becomes blocked, or dies, draw a card.', 4],
  ])('a list of events with commas, the last joined by ", or" (SYNTHETIC): %s', (text, n) => {
    const parsed = readAll(text, 'creature');
    expect(parsed.abilities).toHaveLength(n);
  });

  test.each([
    'Whenever ~ attacks, blocks, or becomes the target of a spell or ability, it deals damage equal to its power to each opponent.',
    'Whenever ~ attacks, blocks or becomes the target of a spell, it deals damage equal to its power to each opponent.',
    'Whenever ~ attacks, blocks, it deals damage equal to its power to each opponent.',
    'Whenever ~ attacks, or blocks, it deals damage equal to its power to each opponent.',
    'Whenever ~ attacks, blocks, or attacks, it deals damage equal to its power to each opponent.',
    'Whenever ~ attacks, blocks, or becomes the target of a spell it deals damage equal to its power to each opponent.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'creature');
  });

  test('the line names the features the engine lacks (D-068)', () => {
    const target = withoutFeature('trigger:becomesTargetSpell', LINE, 'creature');
    expect(target).toMatchObject({ reason: 'notRunnable' });
    expect(target.needs).toContain('trigger:becomesTargetSpell');
  });
});

describe('Giggling Skitterspike: "{5}: Monstrosity 5" (D-1312, CR 701.37)', () => {
  test("the real line: the activated ability of the engine's monstrosity effect", () => {
    const parsed = readAll('{5}: Monstrosity 5.', 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['5'] }],
        effect: { kind: 'monstrosity', count: 5 },
      },
    ]);
  });

  test.each([
    ['{3}{R}: Monstrosity 3.', 3],
    ['{2}{G}{G}: Monstrosity 1.', 1],
    ['{1}{U}: Monstrosity 12.', 12],
  ])('other numbers (SYNTHETIC): %s', (text, count) => {
    const parsed = readAll(text, 'creature');
    expect(parsed.abilities).toMatchObject([{ effect: { kind: 'monstrosity', count } }]);
  });

  test.each([
    '{5}: Monstrosity X.',
    '{5}: Monstrosity 0.',
    '{5}: Monstrosity five.',
    '{5}: Monstrosity.',
    '{5}: Monstrous 5.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'creature');
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('effect:monstrosity', '{5}: Monstrosity 5.', 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:monstrosity');
    expect(DECLARED_NEEDS).toContain('effect:monstrosity');
  });
});

describe('Light the Way: "target creature or Vehicle" (D-1314, CR 205.2a, 205.3g)', () => {
  const MODAL =
    "Choose one —\n• Put a +1/+1 counter on target creature or Vehicle. Untap it.\n• Return target permanent you control to its owner's hand.";

  test('the real text: two modes, the first with a target that is a creature or a Vehicle, and "untap it" for that target', () => {
    const parsed = readAll(MODAL);
    expect(parsed.spell).toMatchObject({
      chooseModes: { min: 1, max: 1 },
      modes: [
        {
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: {
                  zone: 'battlefield',
                  anyOf: [{ types: ['creature'] }, { subtypes: ['Vehicle'] }],
                },
              },
            },
          ],
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'addCounters', objects: { kind: 'target', id: 't1' } },
              { kind: 'untap', objects: { kind: 'target', id: 't1' } },
            ],
          },
        },
        {
          targets: [
            {
              id: 't2',
              what: { kind: 'object', filter: { zone: 'battlefield', controller: 'you' } },
            },
          ],
          effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't2' }, to: 'hand' },
        },
      ],
    });
  });

  test.each([
    ['Destroy target Vehicle or creature.', [{ subtypes: ['Vehicle'] }, { types: ['creature'] }]],
    ['Destroy target creature or Elf.', [{ types: ['creature'] }, { subtypes: ['Elf'] }]],
    [
      'Destroy target artifact or Equipment.',
      [{ types: ['artifact'] }, { subtypes: ['Equipment'] }],
    ],
  ])('a card type and a subtype in either order (SYNTHETIC): %s', (text, anyOf) => {
    const parsed = readAll(text, 'sorcery');
    expect(parsed.spell).toMatchObject({
      targets: [{ what: { kind: 'object', filter: { anyOf } } }],
    });
  });

  test('"you don\'t control" after the choice belongs to the whole choice (SYNTHETIC)', () => {
    const parsed = readAll("Destroy target creature or Vehicle you don't control.", 'sorcery');
    expect(parsed.spell).toMatchObject({
      targets: [{ what: { filter: { controller: 'opponent', anyOf: [{}, {}] } } }],
    });
  });

  test.each([
    'Destroy target creature or Dragon or Elf.',
    'Destroy target creature, Vehicle, or Elf.',
    'Destroy target creature or Vehicles.',
    'Destroy target creature and Vehicle.',
    'Destroy target creature or vehicle.',
    'Destroy target creature or Banana.',
    'Destroy target creature or',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'sorcery');
  });
});

describe('Hall of Oracles: "Activate only as a sorcery and only if you\'ve cast an instant or sorcery spell this turn" (D-1311, CR 602.5b, 602.5d)', () => {
  const ABILITY =
    "{T}: Put a +1/+1 counter on target creature. Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn.";

  test('the real line: an activated ability at sorcery timing with the condition of the spells cast this turn', () => {
    const parsed = readAll(ABILITY, 'land');
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'addCounters',
          objects: { kind: 'target', id: 't1' },
          counter: '+1/+1',
          count: 1,
        },
        timing: 'sorcery',
        activateOnlyIf: { kind: 'spellsCastThisTurn', atLeast: 1, ofTypes: ['instant', 'sorcery'] },
      },
    ]);
  });

  test.each([
    ["you've cast an instant or sorcery spell this turn", 1, ['instant', 'sorcery']],
    ['you’ve cast an instant or sorcery spell this turn', 1, ['instant', 'sorcery']],
    ['you have cast an instant or sorcery spell this turn', 1, ['instant', 'sorcery']],
    ["you've cast a creature spell this turn", 1, ['creature']],
    ["you've cast an artifact spell this turn", 1, ['artifact']],
    ["you've cast a creature or planeswalker spell this turn", 1, ['creature', 'planeswalker']],
  ])(
    'the condition in the other order, and for other types (SYNTHETIC): %s',
    (condition, atLeast, ofTypes) => {
      const parsed = readAll(`{T}: Draw a card. Activate only if ${condition}.`, 'land');
      expect(parsed.abilities).toMatchObject([
        { kind: 'activated', activateOnlyIf: { kind: 'spellsCastThisTurn', atLeast, ofTypes } },
      ]);
    },
  );

  test('the older reading of the same condition is untouched: a count of spells, with no type', () => {
    const parsed = readAll(
      "{T}: Draw a card. Activate only if you've cast three or more spells this turn.",
      'land',
    );
    expect(parsed.abilities).toMatchObject([
      { activateOnlyIf: { kind: 'spellsCastThisTurn', atLeast: 3 } },
    ]);
    expect(
      (parsed.abilities[0] as { activateOnlyIf: { ofTypes?: unknown } }).activateOnlyIf.ofTypes,
    ).toBeUndefined();
  });

  test.each([
    "{T}: Draw a card. Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn and only once each turn.",
    "{T}: Draw a card. Activate only as a sorcery and if you've cast an instant or sorcery spell this turn.",
    "{T}: Draw a card. Activate only as an instant and only if you've cast an instant or sorcery spell this turn.",
    "{T}: Draw a card. Activate only as a sorcery and only if you've cast a spell this turn.",
    "{T}: Draw a card. Activate only as a sorcery and only if you've cast a noncreature spell this turn.",
    "{T}: Draw a card. Activate only as a sorcery and only if you've cast an instant, sorcery spell this turn.",
    "{T}: Draw a card. Activate only as a sorcery and only if you've cast a instant or sorcery spell this turn.",
    "{T}: Draw a card. Activate only as a sorcery and only if you've cast an instant or sorcery spells this turn.",
    "{T}: Draw a card. Activate only as a sorcery and only if you've cast an instant or sorcery spell.",
    "{T}: Draw a card. Activate only if you've cast an instant or sorcery spell this turn and an opponent controls a creature.",
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'land');
  });

  test('the lines name the features the engine lacks (D-068)', () => {
    const missing = withoutFeature('condition:spellsCastThisTurn', ABILITY, 'land');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('condition:spellsCastThisTurn');
  });
});
