// Stage P18 (M6): the trigger slice of the engine (D-108, D-111; ENGINE_VERSION 18). Each line is read
// through the whole pipeline and compared with the engine AST it must produce; each near miss says
// where it stops or why it is dropped. The real lines are those of reports/template-replay.md (the
// owner's run) where the replay has one ("Whenever equipped creature dies, draw two cards.", "Whenever an
// opponent casts a spell, you may draw a card unless that player pays {1}.", "Whenever a creature you
// control with power 4 or greater enters, draw a card.", "When ~ enters, if you control a creature with
// power 4 or greater, draw a card.", "Whenever ~ deals combat damage to a player, draw a card.", "Whenever
// an opponent draws their second card each turn, you draw a card.", "At the beginning of combat on your
// turn, put a +1/+1 counter on target creature you control.", "At the beginning of your upkeep, sacrifice
// ~ unless you pay {U}.", "Counter target spell with mana value 1."); every other line is SYNTHETIC (the
// wordings of docs/MECHANICS.md, "Trigger slice (D-108, D-111)") and no real card is claimed supported
// here. That the engine runs what is lowered is in convert-grammar-engine-p18.test.ts; that a missing
// engine feature is named is in parser-p18-needs.test.ts.
import type { Ability, Trigger } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const GAIN = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } as const;
const DRAW = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;

function trigger(text: string, type: FaceType = 'enchantment', subtypes: string[] = []): Trigger {
  const [ability] = readAll(text, type, subtypes).abilities;
  if (ability?.kind !== 'triggered') throw new Error(`"${text}" is not a triggered ability`);
  return ability.trigger;
}

const abilities = (text: string, type: FaceType = 'enchantment', subtypes: string[] = []) =>
  readAll(text, type, subtypes).abilities as Ability[];

describe('the beginning of a step or phase (CR 603.2b, 500.2)', () => {
  test.each([
    ['At the beginning of combat on your turn', { step: 'beginCombat', whose: 'you' }],
    ['At the beginning of each combat', { step: 'beginCombat', whose: 'each' }],
    ['At the beginning of your draw step', { step: 'draw', whose: 'you' }],
    ['At the beginning of each draw step', { step: 'draw', whose: 'each' }],
    ["At the beginning of each player's draw step", { step: 'draw', whose: 'each' }],
    ["At the beginning of each opponent's draw step", { step: 'draw', whose: 'opponent' }],
    ["At the beginning of each opponent's upkeep", { step: 'upkeep', whose: 'opponent' }],
    ["At the beginning of each opponent's end step", { step: 'endStep', whose: 'opponent' }],
    ['At the beginning of your precombat main phase', { step: 'main1', whose: 'you' }],
    ['At the beginning of your first main phase', { step: 'main1', whose: 'you' }],
    ['At the beginning of your postcombat main phase', { step: 'main2', whose: 'you' }],
    ['At the beginning of your second main phase', { step: 'main2', whose: 'you' }],
    ['At the beginning of the end of combat step', { step: 'combatEnd', whose: 'each' }],
    ['At end of combat', { step: 'combatEnd', whose: 'each' }],
    ['At end of combat on your turn', { step: 'combatEnd', whose: 'you' }],
  ] as const)('%s', (words, expected) => {
    expect(abilities(`${words}, you gain 1 life.`)).toEqual([
      { kind: 'triggered', trigger: { kind: 'step', ...expected }, effect: GAIN },
    ]);
  });

  test.each([
    ['At the beginning of your upkeep', { kind: 'upkeep', whose: 'you' }],
    ['At the beginning of each upkeep', { kind: 'upkeep', whose: 'each' }],
    ["At the beginning of each player's upkeep", { kind: 'upkeep', whose: 'each' }],
    ['At the beginning of your end step', { kind: 'endStep', whose: 'you' }],
    ['At the beginning of each end step', { kind: 'endStep', whose: 'each' }],
    ['At the beginning of the end step', { kind: 'endStep', whose: 'each' }],
  ] as const)('%s keeps the engine kind of its own', (words, expected) => {
    expect(trigger(`${words}, you gain 1 life.`)).toEqual(expected);
  });

  test('the real line "At the beginning of combat on your turn, put a +1/+1 counter on target creature you control."', () => {
    expect(
      abilities(
        'At the beginning of combat on your turn, put a +1/+1 counter on target creature you control.',
      ),
    ).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        targets: [{ id: 't1' }],
        effect: { kind: 'addCounters', counter: '+1/+1', count: 1 },
      },
    ]);
  });

  test.each([
    ['At the beginning of the draw step, you gain 1 life.', 'draw step, you gain 1 life.'],
    [
      'At the beginning of your next draw step, you gain 1 life.',
      'next draw step, you gain 1 life.',
    ],
    ['At the beginning of combat, you gain 1 life.', 'combat, you gain 1 life.'],
    [
      "At the beginning of combat on each opponent's turn, you gain 1 life.",
      "combat on each opponent's turn, you gain 1 life.",
    ],
    ['At the beginning of your main phase, you gain 1 life.', 'main phase, you gain 1 life.'],
    [
      'At the beginning of the next end of combat step, you gain 1 life.',
      'next end of combat step, you gain 1 life.',
    ],
    ['At the end of combat, you gain 1 life.', 'At the end of combat, you gain 1 life.'],
    [
      'Whenever the beginning of your draw step, you gain 1 life.',
      'the beginning of your draw step, you gain 1 life.',
    ],
  ])('%s stays unread', (text, stoppedAt) => {
    expect(dropped(text, 'enchantment')).toMatchObject({
      reason: 'unrecognised',
      slot: 'trigger',
      stoppedAt,
    });
  });

  test('"At" goes with a step: "At ~ enters" and "Whenever end of combat" are not triggers', () => {
    expect(dropped('At ~ enters, you gain 1 life.', 'enchantment')).toMatchObject({
      reason: 'unrecognised',
    });
    expect(dropped('Whenever end of combat, you gain 1 life.', 'enchantment')).toMatchObject({
      reason: 'unrecognised',
    });
  });
});

describe('a card drawn (CR 121.1, 603.2c)', () => {
  test.each([
    ['Whenever you draw a card', { kind: 'drawn', who: 'you' }],
    ['Whenever an opponent draws a card', { kind: 'drawn', who: 'opponent' }],
    ['Whenever a player draws a card', { kind: 'drawn', who: 'any' }],
    ['Whenever you draw your second card each turn', { kind: 'drawn', who: 'you', nth: 2 }],
    ['Whenever you draw your first card each turn', { kind: 'drawn', who: 'you', nth: 1 }],
    [
      'Whenever an opponent draws their second card each turn',
      { kind: 'drawn', who: 'opponent', nth: 2 },
    ],
    ['Whenever a player draws their third card each turn', { kind: 'drawn', who: 'any', nth: 3 }],
  ] as const)('%s', (words, expected) => {
    expect(trigger(`${words}, you gain 1 life.`)).toEqual(expected);
  });

  test('the real line "Whenever an opponent draws their second card each turn, you draw a card."', () => {
    expect(
      abilities('Whenever an opponent draws their second card each turn, you draw a card.'),
    ).toEqual([
      { kind: 'triggered', trigger: { kind: 'drawn', who: 'opponent', nth: 2 }, effect: DRAW },
    ]);
  });

  test('"~" in the body is the permanent itself: "Whenever you draw a card, put a +1/+1 counter on ~."', () => {
    expect(abilities('Whenever you draw a card, put a +1/+1 counter on ~.', 'creature')).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'drawn', who: 'you' },
        effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
      },
    ]);
  });

  test.each([
    [
      'Whenever an opponent draws a card except the first one they draw in each of their draw steps, you gain 1 life.',
      'except the first one they draw in each of their draw steps, you gain 1 life.',
    ],
    ['Whenever you draw two cards, you gain 1 life.', 'two cards, you gain 1 life.'],
    ['Whenever you draw your second card, you gain 1 life.', 'your second card, you gain 1 life.'],
    [
      'Whenever you draw your sixth card each turn, you gain 1 life.',
      'your sixth card each turn, you gain 1 life.',
    ],
    [
      'Whenever each opponent draws a card, you gain 1 life.',
      'Whenever each opponent draws a card, you gain 1 life.',
    ],
  ])('%s stays unread', (text, stoppedAt) => {
    expect(dropped(text, 'enchantment')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('combat damage dealt (CR 120.2a, 510.2, 603.2)', () => {
  test.each([
    ['Whenever ~ deals combat damage to a player', { kind: 'this' }, 'player'],
    ['Whenever ~ deals combat damage to an opponent', { kind: 'this' }, 'opponent'],
    ['Whenever ~ deals combat damage to a creature', { kind: 'this' }, 'creature'],
    ['Whenever ~ deals combat damage', { kind: 'this' }, 'any'],
    [
      'Whenever a creature you control deals combat damage to a player',
      { types: ['creature'], controller: 'you' },
      'player',
    ],
    [
      'Whenever another creature you control deals combat damage to an opponent',
      { types: ['creature'], controller: 'you', other: true },
      'opponent',
    ],
  ] as const)('%s', (words, what, to) => {
    expect(trigger(`${words}, you gain 1 life.`, 'creature')).toEqual({
      kind: 'dealsCombatDamage',
      what,
      to,
    });
  });

  test('the real line "Whenever ~ deals combat damage to a player, draw a card."', () => {
    expect(
      abilities('Whenever ~ deals combat damage to a player, draw a card.', 'creature'),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        effect: DRAW,
      },
    ]);
  });

  test('"it" in the body is the creature that dealt the damage: "put a +1/+1 counter on it"', () => {
    expect(
      abilities(
        'Whenever ~ deals combat damage to a player, put a +1/+1 counter on it.',
        'creature',
      ),
    ).toMatchObject([
      { effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 } },
    ]);
  });

  test.each([
    [
      'Whenever ~ deals damage to a player, you gain 1 life.',
      'deals damage to a player, you gain 1 life.',
    ],
    [
      'Whenever ~ deals combat damage to a player or planeswalker, you gain 1 life.',
      'or planeswalker, you gain 1 life.',
    ],
    ['Whenever ~ deals combat damage to you, you gain 1 life.', 'to you, you gain 1 life.'],
    [
      'Whenever enchanted creature deals damage to an opponent, you gain 1 life.',
      'deals damage to an opponent, you gain 1 life.',
    ],
  ])('%s stays unread', (text, stoppedAt) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });

  test('"that player" after a hit is the engine\'s `triggerPlayer` (stage P29, D-133)', () => {
    expect(
      readAll(
        'Whenever ~ deals combat damage to a player, that player discards a card.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        effect: { kind: 'discard', player: { kind: 'triggerPlayer' }, count: 1 },
      },
    ]);
  });
});

describe('leaving the battlefield (CR 603.6c, 603.10a)', () => {
  test.each([
    ['Whenever ~ leaves the battlefield', { kind: 'this' }],
    ['When ~ leaves the battlefield', { kind: 'this' }],
    [
      'Whenever a creature you control leaves the battlefield',
      { types: ['creature'], controller: 'you' },
    ],
    [
      'Whenever another creature you control leaves the battlefield',
      { types: ['creature'], controller: 'you', other: true },
    ],
    ['Whenever a permanent you control leaves the battlefield', { controller: 'you' }],
  ] as const)('%s', (words, what) => {
    expect(trigger(`${words}, you gain 1 life.`, 'creature')).toEqual({
      kind: 'leavesBattlefield',
      what,
    });
  });

  test('~ has left when the effect runs, so an effect on ~ as a permanent is read and not run', () => {
    expect(dropped('When ~ leaves the battlefield, tap ~.', 'creature')).toMatchObject({
      reason: 'notRunnable',
      stoppedAt: 'tap ~.',
    });
  });

  test.each([
    ['When ~ leaves the battlefield and dies, you gain 1 life.', 'and dies, you gain 1 life.'],
    ['When ~ leaves your graveyard, you gain 1 life.', 'leaves your graveyard, you gain 1 life.'],
    [
      'Whenever one or more creatures you control leave the battlefield, you gain 1 life.',
      'Whenever one or more creatures you control leave the battlefield, you gain 1 life.',
    ],
  ])('%s stays unread', (text, stoppedAt) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });

  test('"When ~ is put into a graveyard from the battlefield" is still "dies" (CR 700.4)', () => {
    expect(
      trigger('When ~ is put into a graveyard from the battlefield, you gain 1 life.', 'creature'),
    ).toEqual({ kind: 'dies', what: { kind: 'this' } });
  });
});

describe('the attached permanent as a trigger subject (CR 301.5a, 303.4b)', () => {
  test.each([
    ['Whenever equipped creature dies', { kind: 'dies', what: { kind: 'attached' } }],
    ['Whenever equipped creature attacks', { kind: 'attacks', what: { kind: 'attached' } }],
    [
      'Whenever equipped creature becomes tapped',
      { kind: 'becomesTapped', what: { kind: 'attached' } },
    ],
    [
      'Whenever equipped creature becomes the target of a spell or ability',
      { kind: 'becomesTarget', what: { kind: 'attached' }, by: 'any' },
    ],
    [
      'Whenever equipped creature deals combat damage to a player',
      { kind: 'dealsCombatDamage', what: { kind: 'attached' }, to: 'player' },
    ],
    [
      'Whenever equipped creature leaves the battlefield',
      { kind: 'leavesBattlefield', what: { kind: 'attached' } },
    ],
  ] as const)('on an Equipment: %s', (words, expected) => {
    expect(trigger(`${words}, you gain 1 life.`, 'artifact', ['Equipment'])).toEqual(expected);
  });

  test.each([
    ['Whenever enchanted creature dies', { kind: 'dies', what: { kind: 'attached' } }],
    ['Whenever enchanted creature attacks', { kind: 'attacks', what: { kind: 'attached' } }],
    [
      'Whenever enchanted creature deals combat damage to a player',
      { kind: 'dealsCombatDamage', what: { kind: 'attached' }, to: 'player' },
    ],
  ] as const)('on an Aura: %s', (words, expected) => {
    expect(trigger(`${words}, you gain 1 life.`, 'enchantment', ['Aura'])).toEqual(expected);
  });

  test('the real line "Whenever equipped creature dies, draw two cards."', () => {
    expect(
      abilities('Whenever equipped creature dies, draw two cards.', 'artifact', ['Equipment']),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'attached' } },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 2 },
      },
    ]);
  });

  test.each([
    // An Aura could be on a land the engine's subject does not tell from a creature.
    ['Whenever enchanted creature becomes tapped, you gain 1 life.', 'enchantment', ['Aura']],
    [
      'Whenever enchanted creature leaves the battlefield, you gain 1 life.',
      'enchantment',
      ['Aura'],
    ],
    [
      'Whenever enchanted creature becomes the target of a spell or ability, you gain 1 life.',
      'enchantment',
      ['Aura'],
    ],
    // The host must be a creature and have no supertype to check.
    ['Whenever enchanted land dies, you gain 1 life.', 'enchantment', ['Aura']],
    ['Whenever enchanted permanent dies, you gain 1 life.', 'enchantment', ['Aura']],
    ['Whenever enchanted legendary creature dies, you gain 1 life.', 'enchantment', ['Aura']],
    // Nothing is attached to anything on another kind of card.
    ['Whenever equipped creature dies, you gain 1 life.', 'enchantment', ['Aura']],
    ['Whenever enchanted creature dies, you gain 1 life.', 'artifact', ['Equipment']],
    ['Whenever equipped creature dies, you gain 1 life.', 'creature', []],
  ] as const)('%s is read and not run on a %s %j', (text, type, subtypes) => {
    expect(dropped(text, type, [...subtypes])).toMatchObject({ reason: 'notRunnable' });
  });

  test('an enters trigger has no attached subject (a permanent is not attached as it enters)', () => {
    expect(
      dropped('Whenever equipped creature enters, you gain 1 life.', 'artifact', ['Equipment']),
    ).toMatchObject({
      reason: 'unrecognised',
    });
  });
});

describe('"Whenever an opponent casts ..." (CR 601.2i; D-111: by an opponent)', () => {
  test.each([
    ['Whenever an opponent casts a spell', { stackKind: 'spell' }],
    [
      'Whenever an opponent casts a noncreature spell',
      { notTypes: ['creature'], stackKind: 'spell' },
    ],
    [
      'Whenever an opponent casts an instant or sorcery spell',
      { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }], stackKind: 'spell' },
    ],
    [
      'Whenever an opponent casts a spell with mana value 3 or less',
      { stackKind: 'spell', manaValue: { cmp: 'atMost', value: 3 } },
    ],
  ] as const)('%s', (words, filter) => {
    expect(trigger(`${words}, you gain 1 life.`)).toEqual({
      kind: 'castSpell',
      filter,
      by: 'opponent',
    });
  });

  test.each([
    [
      'Whenever an opponent casts their first spell each turn, you gain 1 life.',
      'their first spell each turn, you gain 1 life.',
    ],
    [
      'Whenever an opponent cast a spell, you gain 1 life.',
      'Whenever an opponent cast a spell, you gain 1 life.',
    ],
  ])('%s stays unread', (text) => {
    expect(dropped(text, 'enchantment')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('power, toughness and mana value in a filter (CR 202.3, 208.1)', () => {
  const OPPONENT = (cmp: 'atLeast' | 'atMost' | 'equal', value: number) => ({ cmp, value });

  test.each([
    [
      'Whenever a creature you control with power 4 or greater enters, draw a card.',
      { types: ['creature'], controller: 'you', power: OPPONENT('atLeast', 4) },
    ],
    [
      'Whenever a creature with power 4 or greater enters, draw a card.',
      { types: ['creature'], power: OPPONENT('atLeast', 4) },
    ],
    [
      'Whenever a creature with power 4 or greater you control enters, draw a card.',
      { types: ['creature'], controller: 'you', power: OPPONENT('atLeast', 4) },
    ],
    [
      'Whenever another creature you control with toughness 2 or less enters, draw a card.',
      { types: ['creature'], controller: 'you', toughness: OPPONENT('atMost', 2) },
    ],
    [
      'Whenever a nonland permanent you control with mana value 3 enters, draw a card.',
      { notTypes: ['land'], controller: 'you', manaValue: OPPONENT('equal', 3) },
    ],
  ] as const)('%s', (text, filter) => {
    const [ability] = abilities(text);
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: expect.objectContaining(filter) },
    });
  });

  test('"another creature ... with power 2 or less" keeps "other" on the filter', () => {
    expect(
      trigger('Whenever another creature you control with power 2 or less dies, draw a card.'),
    ).toEqual({
      kind: 'dies',
      what: {
        types: ['creature'],
        controller: 'you',
        other: true,
        power: { cmp: 'atMost', value: 2 },
      },
    });
  });

  test('the same words name targets, "each", counts and the graveyard', () => {
    const target = (filter: object) => ({ id: 't1', what: { kind: 'object', filter } });
    expect(
      readAll('Destroy target creature with toughness 5 or greater.', 'instant').spell,
    ).toMatchObject({
      targets: [
        target({
          zone: 'battlefield',
          types: ['creature'],
          toughness: { cmp: 'atLeast', value: 5 },
        }),
      ],
    });
    expect(
      readAll('Destroy target nonland permanent with mana value 3 or less.', 'instant').spell,
    ).toMatchObject({
      targets: [
        target({ zone: 'battlefield', notTypes: ['land'], manaValue: { cmp: 'atMost', value: 3 } }),
      ],
    });
    expect(
      readAll('Destroy all creatures with mana value 3 or less.', 'instant').spell?.effect,
    ).toEqual({
      kind: 'destroy',
      objects: {
        kind: 'each',
        filter: {
          zone: 'battlefield',
          types: ['creature'],
          manaValue: { cmp: 'atMost', value: 3 },
        },
      },
    });
    expect(
      readAll('Draw a card for each creature you control with power 4 or greater.', 'instant').spell
        ?.effect,
    ).toEqual({
      kind: 'draw',
      player: { kind: 'you' },
      count: {
        kind: 'countOf',
        filter: { types: ['creature'], controller: 'you', power: { cmp: 'atLeast', value: 4 } },
      },
    });
    expect(
      readAll(
        'Return target creature card with mana value 3 or less from your graveyard to your hand.',
        'instant',
      ).spell,
    ).toMatchObject({
      targets: [
        target({
          zone: 'graveyard',
          types: ['creature'],
          controller: 'you',
          manaValue: { cmp: 'atMost', value: 3 },
        }),
      ],
    });
  });

  test('a spell has a mana value on the stack, and no power or toughness', () => {
    expect(readAll('Counter target spell with mana value 1.', 'instant').spell).toMatchObject({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'stack', stackKind: 'spell', manaValue: { cmp: 'equal', value: 1 } },
          },
        },
      ],
    });
    expect(
      trigger('Whenever you cast a spell with mana value 4 or greater, you gain 1 life.'),
    ).toEqual({
      kind: 'castSpell',
      filter: { stackKind: 'spell', manaValue: { cmp: 'atLeast', value: 4 } },
      by: 'you',
    });
    expect(dropped('Counter target spell with power 4 or greater.', 'instant')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt: 'with power 4 or greater.',
    });
  });

  test('conditions read it: "if you control a creature with power 4 or greater" (the real line)', () => {
    expect(
      abilities(
        'When ~ enters, if you control a creature with power 4 or greater, draw a card.',
        'creature',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        interveningIf: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
          count: 1,
        },
        effect: DRAW,
      },
    ]);
    expect(
      abilities(
        '{T}: Add {G}{G}{G}{G}. Activate only if you control a creature with power 4 or greater.',
        'creature',
      ),
    ).toMatchObject([
      {
        kind: 'mana',
        activateOnlyIf: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
          count: 1,
        },
      },
    ]);
  });

  test('a +1/+1 effect may name its creatures by power; a keyword may name them by mana value only (CR 613.8)', () => {
    expect(abilities('Creatures you control with power 2 or less get +1/+1.')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', power: { cmp: 'atMost', value: 2 } },
          },
          power: 1,
          toughness: 1,
        },
      },
    ]);
    expect(abilities('Creatures you control with mana value 3 or less have flying.')).toMatchObject(
      [{ kind: 'static', static: { kind: 'grantKeyword' } }],
    );
    expect(
      dropped('Creatures you control with power 2 or less have flying.', 'enchantment'),
    ).toMatchObject({
      reason: 'notRunnable',
    });
  });

  test.each([
    ['Destroy target creature with power greater than 3.', 'with power greater than 3.'],
    ['Destroy target creature with power 3 or less and flying.', 'flying.'],
    ['Destroy target creature with mana value X or less.', 'with mana value X or less.'],
    ['Destroy target creature with power 3 or more.', 'or more.'],
    [
      'Destroy target creature with converted mana cost 3 or less.',
      'with converted mana cost 3 or less.',
    ],
    ["Destroy target creature with power less than ~'s power.", "with power less than ~'s power."],
  ])('%s stays unread', (text, stoppedAt) => {
    expect(dropped(text, 'instant')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('"unless that player pays {1}" (CR 118.12a)', () => {
  const unless = (player: object, effect: object, cost: string[], optional = false): Ability =>
    ({
      kind: 'triggered',
      trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
      effect: {
        kind: 'unlessPays',
        player,
        cost: [{ kind: 'mana', symbols: cost }],
        effect,
        ...(optional ? { optional: true } : {}),
      },
    }) as Ability;

  const CASTER = { kind: 'controllerOf', of: { kind: 'triggerSubject' } };

  test('the real line "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}."', () => {
    expect(
      abilities(
        'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
      ),
    ).toEqual([unless(CASTER, DRAW, ['1'], true)]);
  });

  test.each([
    [
      'Whenever an opponent casts a spell, draw a card unless that player pays {1}.',
      unless(CASTER, DRAW, ['1']),
    ],
    [
      'Whenever an opponent casts a spell, draw a card unless they pay {2}.',
      unless(CASTER, DRAW, ['2']),
    ],
    [
      'Whenever an opponent casts a spell, you may draw a card unless that player pays {2}{U}.',
      unless(CASTER, DRAW, ['2', 'U'], true),
    ],
  ])('%s', (text, expected) => {
    expect(abilities(text)).toEqual([expected]);
  });

  test('"you may" covers the one instruction: other sentences of the ability stay unconditional', () => {
    expect(
      abilities(
        'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}. You gain 1 life.',
      ),
    ).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [{ kind: 'unlessPays', optional: true }, GAIN],
        },
      },
    ]);
  });

  test('"sacrifice ~ unless you pay {U}" asks you (the real line)', () => {
    expect(
      abilities('At the beginning of your upkeep, sacrifice ~ unless you pay {U}.', 'creature'),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: {
          kind: 'unlessPays',
          player: { kind: 'you' },
          cost: [{ kind: 'mana', symbols: ['U'] }],
          effect: { kind: 'sacrifice', objects: { kind: 'this' } },
        },
      },
    ]);
  });

  test('"that player" of a trigger that names no player is read and refused naming the selector', () => {
    expect(
      dropped(
        "At the beginning of each opponent's upkeep, draw a card unless that player pays {1}.",
        'enchantment',
      ),
    ).toMatchObject({ reason: 'notRunnable', needs: ['selector:triggerActor'] });
  });

  test.each([
    [
      'Whenever an opponent casts a spell, draw a card unless that player pays {X}.',
      '{X}.',
      'condition.unless-pays',
    ],
    [
      'Whenever an opponent casts a spell, draw a card unless that player pays 2 life.',
      '2 life.',
      'condition.unless-pays',
    ],
    [
      'Whenever an opponent casts a spell, you may draw a card unless any opponent pays {1}.',
      'any opponent pays {1}.',
      'condition.unless-pays',
    ],
    [
      'Whenever an opponent casts a spell, draw a card and lose 1 life unless that player pays {1}.',
      'unless that player pays {1}.',
      'ability.triggered',
    ],
    [
      'Whenever an opponent casts a spell, draw a card unless that player pays {R/W}.',
      '{R/W}.',
      'condition.unless-pays',
    ],
    [
      "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is ~'s power.",
      "their first noncreature spell each turn, draw a card unless that player pays {X}, where X is ~'s power.",
      'trigger.cast',
    ],
  ])('%s stops at "%s"', (text, stoppedAt, closestRule) => {
    expect(dropped(text, 'enchantment')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt,
      closestRule,
    });
  });

  test('a spell or an activated ability has no "unless that player pays" (only a trigger body)', () => {
    expect(dropped('Draw a card unless that player pays {1}.', 'instant')).toMatchObject({
      reason: 'unrecognised',
    });
    expect(dropped('{T}: Draw a card unless you pay {1}.', 'artifact')).toMatchObject({
      reason: 'unrecognised',
    });
  });

  test("an intervening if beside it is the ability's own and does not change it (CR 603.4)", () => {
    expect(
      abilities(
        'Whenever an opponent casts a spell, if you control a creature, you may draw a card unless that player pays {1}.',
      ),
    ).toMatchObject([
      {
        interveningIf: { kind: 'controlsAtLeast', count: 1 },
        effect: { kind: 'unlessPays', optional: true },
      },
    ]);
  });

  test('"that player" after the words of another player is not the caster: read, and refused', () => {
    // "you gain 1 life unless that player pays": the player said last is you, not the one who cast.
    expect(
      dropped(
        'Whenever an opponent casts a spell, you gain 1 life unless that player pays {1}.',
        'enchantment',
      ),
    ).toMatchObject({ reason: 'notRunnable', needs: ['selector:bound'] });
  });
});

describe('"its controller" and "its owner" of the creature that caused a trigger (CR 608.2h)', () => {
  test.each([
    ['Whenever another creature dies, its controller gains 2 life.', 'controllerOf'],
    ["Whenever another creature dies, that creature's controller gains 2 life.", 'controllerOf'],
  ] as const)('%s', (text, kind) => {
    expect(abilities(text)).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { types: ['creature'], other: true } },
        effect: {
          kind: 'gainLife',
          player: { kind, of: { kind: 'triggerSubject' } },
          amount: 2,
        },
      },
    ]);
  });

  test('about ~ itself it is ~', () => {
    expect(abilities('Whenever ~ attacks, its controller gains 2 life.', 'creature')).toMatchObject(
      [
        {
          effect: { player: { kind: 'controllerOf', of: { kind: 'this' } } },
        },
      ],
    );
  });
});
