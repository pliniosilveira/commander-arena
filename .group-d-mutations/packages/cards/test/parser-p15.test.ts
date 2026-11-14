// Stage P15 (M6): a second class-T sweep of reports/template-replay.md, the wordings of what the
// engine already runs (D-089 to D-099 and the stages before). Each line is read through the whole
// pipeline and compared with the engine AST it must produce, and each near miss says where it stops or
// why it is dropped. The lines are the real example lines of the replay (the owner's run) unless a note
// says SYNTHETIC; no real card is marked supported here. That the engine runs what is lowered is in
// convert-grammar-engine-p15.test.ts; that a missing engine feature is named, not guessed at, is in
// parser-p15-needs.test.ts.
import { existsSync, readFileSync } from 'node:fs';
import type { Ability, Effect, TargetSpec } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  OTHER_SUBTYPES,
  PLANESWALKER_TYPES,
  subtypeOf,
} from '../src/convert/parser/rules/noun/subtypes';
import { CR_PATH } from './cr-file';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const abilities = (text: string, type: FaceType = 'creature'): readonly Ability[] =>
  readAll(text, type).abilities;

const spell = (text: string) => {
  const parsed = readAll(text, 'instant').spell;
  if (parsed === undefined || parsed === null) throw new Error(`"${text}" has no spell text`);
  return parsed;
};

const T1 = { kind: 'target', id: 't1' } as const;
const target = (filter: Record<string, unknown>, extra: Record<string, unknown> = {}): TargetSpec =>
  ({
    id: 't1',
    what: { kind: 'object', filter: { zone: 'battlefield', ...filter } },
    ...extra,
  }) as TargetSpec;

// The Comprehensive Rules are Wizards' text and are not committed (D-246): these checks run where `pnpm rules:fetch` has put the file, and skip elsewhere.

describe.skipIf(!existsSync(CR_PATH))(
  'subtype words come from the lists of the Comprehensive Rules (CR 205.3)',
  () => {
    const cr = existsSync(CR_PATH) ? readFileSync(CR_PATH, 'utf8') : '';
    const line = (id: string) => cr.split('\n').find((l) => l.startsWith(`${id} `)) ?? '';

    test('every listed artifact, enchantment and land type is in the CR rule it comes from', () => {
      const rules = [line('205.3g'), line('205.3h'), line('205.3i')].join('\n');
      for (const word of OTHER_SUBTYPES) expect(rules, word).toContain(word);
    });

    test('the planeswalker types are the ones of CR 205.3j, all of them (stage P34, D-152)', () => {
      const rule = line('205.3j');
      // The rule lists them after "The planeswalker types are", ending at the final period, the last after ", and ".
      const listed = rule
        .slice(rule.indexOf('The planeswalker types are ') + 'The planeswalker types are '.length)
        .replace(/\.\s*$/, '')
        .split(/,\s+(?:and\s+)?/)
        .map((word) => word.trim());
      expect([...PLANESWALKER_TYPES].sort()).toEqual(listed.sort());
    });

    test.each([
      ['Elf', 'Elf', false],
      ['Elves', 'Elf', true],
      ['Zombies', 'Zombie', true],
      ['Equipment', 'Equipment', null],
      ['Plains', 'Plains', null],
      ['Treasure', 'Treasure', false],
      ['Treasures', 'Treasure', true],
      ['Foods', 'Food', true],
      ['Gates', 'Gate', true],
      ['Forests', 'Forest', true],
      ['Sheep', 'Sheep', null],
    ] as const)('"%s" is the subtype %s (plural: %s)', (word, subtype, plural) => {
      expect(subtypeOf(word)).toEqual({ subtype, plural });
    });

    test.each(['Banana', 'Mousse', 'Legendary', 'Historic', 'Creature', 'elf', 'Urza’s'])(
      '"%s" is not read as a subtype',
      (word) => {
        expect(subtypeOf(word)).toBeUndefined();
      },
    );
  },
);

describe('subtypes in a noun phrase (CR 205.3m, 205.3g, 205.3i)', () => {
  test.each([
    ['Destroy target Elf.', { subtypes: ['Elf'] }],
    [
      'Destroy target Plant creature you control.',
      { types: ['creature'], subtypes: ['Plant'], controller: 'you' },
    ],
    [
      'Destroy target legendary Elf creature.',
      { types: ['creature'], supertypes: ['legendary'], subtypes: ['Elf'] },
    ],
    ['Destroy target Equipment you control.', { subtypes: ['Equipment'], controller: 'you' }],
    ['Untap target Forest.', { subtypes: ['Forest'] }],
  ] as const)('%s', (text, filter) => {
    expect(spell(text).targets).toEqual([target(filter)]);
  });

  test.each([
    [
      'Destroy each Plant creature you control.',
      { types: ['creature'], subtypes: ['Plant'], controller: 'you' },
    ],
    ['Destroy all Elves.', { subtypes: ['Elf'] }],
    [
      'Destroy all Elf creatures your opponents control.',
      { types: ['creature'], subtypes: ['Elf'], controller: 'opponent' },
    ],
    ['Destroy all Equipment.', { subtypes: ['Equipment'] }],
  ] as const)('%s', (text, filter) => {
    expect(spell(text).effect).toEqual({
      kind: 'destroy',
      objects: { kind: 'each', filter: { zone: 'battlefield', ...filter } },
    });
  });

  test('two subtype words are read together: "Elf Warrior creature"', () => {
    expect(spell('Destroy target Elf Warrior creature.').targets).toEqual([
      target({ types: ['creature'], subtypes: ['Elf', 'Warrior'] }),
    ]);
  });

  test.each([
    'Destroy target Banana.',
    'Destroy target Elves.',
    'Destroy all Elf.',
    'Destroy target elf.',
    'Destroy target Elf Banana.',
    'Destroy target Jace.',
    'Destroy two target Elf.',
    'Destroy all Plains you control.',
  ])('%s is not read', (text) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised' });
  });

  test('a count of a subtype: "for each Elf you control" and "equal to the number of Treasures you control"', () => {
    expect(spell('You gain 1 life for each Elf you control.').effect).toEqual({
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: { kind: 'countOf', filter: { subtypes: ['Elf'], controller: 'you' } },
    });
    expect(spell('You gain life equal to the number of Treasures you control.').effect).toEqual({
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: { kind: 'countOf', filter: { subtypes: ['Treasure'], controller: 'you' } },
    });
  });

  test.each([
    ['~ enters tapped unless you control a Dragon.', { subtypes: ['Dragon'] }, 1],
    ['~ enters tapped unless you control two or more Dragons.', { subtypes: ['Dragon'] }, 2],
  ] as const)('a condition: %s', (text, filter, count) => {
    expect(abilities(text, 'land')).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersTapped',
          unless: { kind: 'controlsAtLeast', filter, count },
        },
      },
    ]);
  });

  test('the basic land types stay with their own condition rule (a Forest, not a "permanent")', () => {
    expect(abilities('~ enters tapped unless you control a Forest.', 'land')).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersTapped',
          unless: { kind: 'controlsAtLeast', filter: { subtypes: ['Forest'] }, count: 1 },
        },
      },
    ]);
  });

  test('as the subject of a static ability, with or without "other"', () => {
    const group = (filter: Record<string, unknown>) => ({ kind: 'filter', filter });
    expect(abilities('Elves you control get +1/+1.', 'enchantment')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: group({ subtypes: ['Elf'], controller: 'you' }),
          power: 1,
          toughness: 1,
        },
      },
    ]);
    expect(abilities('Plant creatures you control have haste.', 'enchantment')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: group({ types: ['creature'], subtypes: ['Plant'], controller: 'you' }),
          keyword: { kind: 'haste' },
        },
      },
    ]);
    expect(abilities('All Slivers have flying.', 'enchantment')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: group({ subtypes: ['Sliver'] }),
          keyword: { kind: 'flying' },
        },
      },
    ]);
  });

  test('"All creatures have haste." has no controller in its filter (CR 611.3a)', () => {
    expect(abilities('All creatures have haste.', 'enchantment')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'] } },
          keyword: { kind: 'haste' },
        },
      },
    ]);
  });

  test.each([
    ['All creature have haste.', 'All creature have haste.'],
    ['All creatures has haste.', 'has haste.'],
    ['All creatures have flash.', 'flash.'],
    ['All creatures get +1/+1 until end of turn.', 'until end of turn.'],
  ])('%s is not read (stops at "%s")', (text, stoppedAt) => {
    expect(dropped(text, 'enchantment')).toMatchObject({ stoppedAt });
  });
});

describe('"another target ...", "each of up to two target creatures", "all other ..." (CR 115.1, 109.1)', () => {
  test('"another" is `other` on the target, and the engine leaves out the source', () => {
    expect(abilities('{T}: Untap another target permanent.')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [target({ other: true })],
        effect: { kind: 'untap', objects: T1 },
      },
    ]);
  });

  test('"each of up to two target creatures" is the one slot of zero to two (CR 115.2)', () => {
    expect(spell('Put a +1/+1 counter on each of up to two target creatures.')).toEqual({
      targets: [target({ types: ['creature'] }, { min: 0, max: 2 })],
      effect: { kind: 'addCounters', objects: T1, counter: '+1/+1', count: 1 },
    });
    expect(spell('Put a +1/+1 counter on each of two target creatures.').targets).toEqual([
      target({ types: ['creature'] }, { min: 2, max: 2 }),
    ]);
  });

  test('"all other creatures" and "each other creature you control" are every one but the source', () => {
    expect(spell('Destroy all other creatures.').effect).toEqual({
      kind: 'destroy',
      objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'], other: true } },
    });
    expect(abilities('{T}: Put a +1/+1 counter on each other creature you control.')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'addCounters',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you', other: true },
          },
          counter: '+1/+1',
          count: 1,
        },
      },
    ]);
  });

  test.each([
    ['Destroy another target creatures.', 'creatures.'],
    ['Destroy another two target creatures.', 'another two target creatures.'],
    ['Destroy another creature.', 'another creature.'],
    ['Destroy all other creature.', 'creature.'],
    ['Put a +1/+1 counter on each of target creature.', 'target creature.'],
    ['Put a +1/+1 counter on each of up to one target creatures.', 'creatures.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('a choice of types, each with its own modifiers, and a card of a choice of types (CR 205.2a)', () => {
  test('"noncreature artifact or noncreature enchantment"', () => {
    expect(spell('Exile target noncreature artifact or noncreature enchantment.').targets).toEqual([
      target({
        anyOf: [
          { types: ['artifact'], notTypes: ['creature'] },
          { types: ['enchantment'], notTypes: ['creature'] },
        ],
      }),
    ]);
  });

  test('the controller of the whole choice, and three members', () => {
    expect(
      spell(
        'Destroy target noncreature artifact, nonland enchantment, or nonartifact creature you control.',
      ).targets,
    ).toEqual([
      target({
        controller: 'you',
        anyOf: [
          { types: ['artifact'], notTypes: ['creature'] },
          { types: ['enchantment'], notTypes: ['land'] },
          { types: ['creature'], notTypes: ['artifact'] },
        ],
      }),
    ]);
  });

  test.each([
    ['Destroy target tapped creature or planeswalker.', 'or planeswalker.'],
    ['Destroy target noncreature artifact or enchantment.', 'or enchantment.'],
    ['Destroy target noncreature artifact or noncreature enchantment, or land.', 'land.'],
  ])('%s stops at "%s" (a modifier on one member is ambiguous)', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ stoppedAt });
  });

  test.each([
    [
      'Return target instant or sorcery card from your graveyard to your hand.',
      {
        zone: 'graveyard',
        controller: 'you',
        anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
      },
    ],
    [
      'Return target Zombie creature card from your graveyard to your hand.',
      { zone: 'graveyard', controller: 'you', types: ['creature'], subtypes: ['Zombie'] },
    ],
  ] as const)('a graveyard card: %s', (text, filter) => {
    expect(spell(text)).toEqual({
      targets: [{ id: 't1', what: { kind: 'object', filter } }],
      effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
    });
  });

  test('"another target artifact card from your graveyard" leaves out the card itself', () => {
    expect(
      abilities(
        'When ~ dies, return another target artifact card from your graveyard to your hand.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', types: ['artifact'], controller: 'you', other: true },
            },
          },
        ],
        effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
      },
    ]);
  });

  test.each([
    [
      'Return target instant or sorcery cards from your graveyard to your hand.',
      'cards from your graveyard to your hand.',
    ],
    ['Exile all instant or sorcery cards from a graveyard.', 'or sorcery cards from a graveyard.'],
    ['Exile target Banana card from a graveyard.', 'Banana card from a graveyard.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ stoppedAt });
  });

  test('"all graveyards" and "from all graveyards" name no owner', () => {
    expect(spell('Exile all graveyards.').effect).toEqual({
      kind: 'exile',
      objects: { kind: 'each', filter: { zone: 'graveyard' } },
    });
    expect(
      spell('Put all creature cards from all graveyards onto the battlefield under your control.')
        .effect,
    ).toEqual({
      kind: 'moveToZone',
      objects: { kind: 'each', filter: { zone: 'graveyard', types: ['creature'] } },
      to: 'battlefield',
      controller: 'you',
    });
  });
});

describe('token.custom: a token with the keywords of the engine (CR 111.4, 702)', () => {
  const token = (text: string, type: FaceType = 'sorcery'): Effect => {
    const effect = readAll(text, type).spell?.effect;
    if (effect === undefined) throw new Error(`"${text}" has no effect`);
    return effect;
  };

  test.each([
    ['Create a 1/1 white Spirit creature token with flying.', ['flying']],
    ['Create a 1/1 black Snake creature token with deathtouch.', ['deathtouch']],
    [
      'Create a 2/2 white Knight creature token with first strike and vigilance.',
      ['firstStrike', 'vigilance'],
    ],
    [
      'Create a 3/3 green Beast creature token with trample, reach, and haste.',
      ['trample', 'reach', 'haste'],
    ],
  ] as const)('%s', (text, kinds) => {
    expect(token(text)).toMatchObject({
      kind: 'createToken',
      count: 1,
      token: {
        kind: 'custom',
        definition: { abilities: kinds.map((kind) => ({ kind: 'keyword', keyword: { kind } })) },
      },
    });
  });

  test('the keywords come after "token" and several tokens each have them', () => {
    expect(
      token('Create two 1/1 colorless Thopter artifact creature tokens with flying.'),
    ).toMatchObject({
      kind: 'createToken',
      count: 2,
      token: {
        definition: {
          types: ['artifact', 'creature'],
          subtypes: ['Thopter'],
          abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
        },
      },
    });
  });

  test.each([
    ['Create a 1/1 white Soldier creature token with changeling.', 'with changeling.'],
    ['Create a 1/1 white Soldier creature token with flash.', 'with flash.'],
    [
      'Create a 1/1 white Soldier creature token with flying and flying.',
      'with flying and flying.',
    ],
    ['Create a 1/1 white Soldier creature token with ward {2}.', 'with ward {2}.'],
    [
      'Create a 1/1 white Soldier creature token with "Sacrifice this creature: You gain 1 life".',
      'with "Sacrifice ~: You gain 1 life".',
    ],
    [
      'Create a 1/1 white Soldier creature token with "Sacrifice this creature: Foretell the top card."',
      'with "Sacrifice ~: Foretell the top card."',
    ],
    [
      'Create a 1/1 white Soldier creature token with flying tapped and attacking.',
      'tapped and attacking.',
    ],
  ])('%s stops at "%s": a token is never made without an ability it has', (text, stoppedAt) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });

  test('"its controller creates a ... token with flying" gives it to the controller of the target', () => {
    expect(
      token(
        'Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.',
        'instant',
      ),
    ).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'counter' },
        {
          kind: 'createToken',
          controller: { kind: 'controllerOf', of: T1 },
          token: {
            definition: {
              subtypes: ['Bird'],
              abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
            },
          },
        },
      ],
    });
  });
});

describe('effect.create-token: a single token counted "for each", and "Investigate"', () => {
  test('"a 0/1 green Plant creature token for each land you control" counts as the instruction runs', () => {
    expect(
      readAll('Create a 0/1 green Plant creature token for each land you control.', 'sorcery').spell
        ?.effect,
    ).toMatchObject({
      kind: 'createToken',
      count: { kind: 'countOf', filter: { types: ['land'], controller: 'you' } },
      token: { definition: { name: 'Plant', power: 0, toughness: 1 } },
    });
  });

  test('a predefined token is counted too', () => {
    expect(
      readAll('Create a Treasure token for each creature you control.', 'sorcery').spell?.effect,
    ).toEqual({
      kind: 'createToken',
      token: { kind: 'preset', preset: 'Treasure' },
      count: { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
    });
  });

  test.each([
    ['Create a Treasure token for each land.', '.'],
    ['Create a Treasure token for each creature you control with flying or reach.', 'or reach.'],
    ['Create X Treasure tokens for each land you control.', 'for each land you control.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ stoppedAt });
  });

  test('"Investigate, then draw a card." joins like every other instruction', () => {
    expect(readAll('Investigate, then draw a card.', 'sorcery').spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' }, count: 1 },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    });
  });

  test('"Investigate." is "Create a Clue token" (CR 701.16a)', () => {
    expect(readAll('Investigate.', 'sorcery').spell?.effect).toEqual({
      kind: 'createToken',
      token: { kind: 'preset', preset: 'Clue' },
      count: 1,
    });
    expect(abilities('Whenever a land you control enters, investigate.')).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'landfall' },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' }, count: 1 },
      },
    ]);
  });

  test.each([
    ['Investigate twice.', 'twice.'],
    ['Investigates.', 'Investigates.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ stoppedAt });
  });
});

describe('effect.tap and effect.untap: "it" (CR 701.26)', () => {
  test('after a target: the same target', () => {
    expect(
      spell(
        'Target creature you control gets +1/+1 and gains hexproof until end of turn. Untap it.',
      ).effect,
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'modifyPt', objects: T1, power: 1, toughness: 1, duration: 'untilEndOfTurn' },
        {
          kind: 'grantKeyword',
          objects: T1,
          keyword: { kind: 'hexproof' },
          duration: 'untilEndOfTurn',
        },
        { kind: 'untap', objects: T1 },
      ],
    });
  });

  test('in a trigger about ~ that is still on the battlefield, ~ itself', () => {
    expect(abilities('When ~ enters, untap it.')).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'untap', objects: { kind: 'this' } },
      },
    ]);
  });

  test.each([
    ['Untap it.', 'unboundReference'],
    ['Exile target creature. Tap it.', 'notRunnable'],
    ['Destroy target creature. Untap it.', 'notRunnable'],
    ["Return target creature to its owner's hand. Untap it.", 'notRunnable'],
    ['Untap target land. Untap them.', 'unrecognised'],
    ['Untap itself.', 'unrecognised'],
  ])('%s is %s', (text, reason) => {
    expect(dropped(text)).toMatchObject({ reason });
  });

  test('after the creature died "it" is a card in the graveyard: no ability, no feature to name', () => {
    expect(dropped('When ~ dies, untap it.', 'creature')).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('triggers: "put into a graveyard from the battlefield", "a player sacrifices", "becomes the target"', () => {
  test.each([
    ['When ~ is put into a graveyard from the battlefield, draw a card.', { kind: 'this' }],
    [
      'Whenever another creature or artifact you control is put into a graveyard from the battlefield, draw a card.',
      { other: true, controller: 'you', anyOf: [{ types: ['creature'] }, { types: ['artifact'] }] },
    ],
  ] as const)('%s is the engine dies trigger (CR 700.4)', (text, what) => {
    expect(abilities(text)).toMatchObject([{ kind: 'triggered', trigger: { kind: 'dies', what } }]);
  });

  test.each([
    'When ~ is put into a graveyard from anywhere, draw a card.',
    'When ~ is put into a graveyard, draw a card.',
    'When ~ is put into your graveyard from the battlefield, draw a card.',
  ])('%s is not "dies"', (text) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised' });
  });

  test('dying and attacking are two events of one ability (CR 603.2c)', () => {
    expect(
      abilities('When ~ is put into a graveyard from the battlefield or attacks, draw a card.'),
    ).toMatchObject([
      { trigger: { kind: 'dies', what: { kind: 'this' } } },
      { trigger: { kind: 'attacks', what: { kind: 'this' } } },
    ]);
  });

  test('"a player sacrifices" is by any player, "you sacrifice" by you', () => {
    expect(
      abilities('Whenever a player sacrifices a permanent, ~ deals 1 damage to any target.'),
    ).toMatchObject([{ kind: 'triggered', trigger: { kind: 'permanentSacrificed', by: 'any' } }]);
    expect(abilities('Whenever a player sacrifices a creature, draw a card.')).toMatchObject([
      { trigger: { kind: 'permanentSacrificed', by: 'any', filter: { types: ['creature'] } } },
    ]);
    expect(abilities('Whenever you sacrifice a Clue, put a +1/+1 counter on ~.')).toMatchObject([
      { trigger: { kind: 'permanentSacrificed', by: 'you', filter: { subtypes: ['Clue'] } } },
    ]);
  });

  test.each([
    'Whenever an opponent sacrifices a permanent, draw a card.',
    'Whenever a player sacrifices a creature you control, draw a card.',
    'Whenever a player sacrifices ~, draw a card.',
    'Whenever a player sacrificed a permanent, draw a card.',
  ])('%s is not read', (text) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised' });
  });

  test.each([
    ['~ becomes the target of a spell or ability', { kind: 'this' }, 'any'],
    [
      '~ becomes the target of a spell or ability an opponent controls',
      { kind: 'this' },
      'opponent',
    ],
    ['~ becomes the target of a spell or ability you control', { kind: 'this' }, 'you'],
    [
      'a creature you control becomes the target of a spell or ability an opponent controls',
      { types: ['creature'], controller: 'you' },
      'opponent',
    ],
  ] as const)('"Whenever %s" is the engine becomesTarget', (condition, what, by) => {
    expect(abilities(`Whenever ${condition}, you gain 1 life.`)).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'becomesTarget', what, by } },
    ]);
  });

  test.each([
    [
      'Whenever ~ becomes the target of an ability, you gain 1 life.',
      'becomes the target of an ability, you gain 1 life.',
    ],
    [
      'Whenever ~ becomes the target of a spell or ability your opponents control, you gain 1 life.',
      'your opponents control, you gain 1 life.',
    ],
    ['Whenever ~ becomes the target of a spell or ability, counter it.', 'it.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ stoppedAt });
  });

  test('a creature of mine becoming a target is read of any controller', () => {
    expect(
      abilities(
        'Whenever another creature you control becomes the target of a spell or ability, you gain 1 life.',
      ),
    ).toMatchObject([
      {
        trigger: {
          kind: 'becomesTarget',
          what: { other: true, types: ['creature'], controller: 'you' },
          by: 'any',
        },
      },
    ]);
  });
});

describe('effect.restrict-all: "creatures your opponents control attack this turn if able" (CR 508.1d, 611.2c)', () => {
  test.each([
    ['Creatures your opponents control attack this turn if able.', 'attacksEachCombat', 'opponent'],
    ["Creatures you control can't be blocked this turn.", 'cantBeBlocked', 'you'],
    ["Creatures your opponents control can't block this turn.", 'cantBlock', 'opponent'],
  ] as const)('%s', (text, restriction, controller) => {
    expect(spell(text).effect).toEqual({
      kind: 'restrict',
      objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'], controller } },
      restriction,
      duration: 'untilEndOfTurn',
    });
  });

  test.each([
    ['Creatures your opponents control attacks this turn if able.', 'attacks this turn if able.'],
    ["Creatures you control can't be blocked.", "can't be blocked."],
    ["Creatures without flying or reach can't block this turn.", "or reach can't block this turn."],
    ["Artifacts you control can't be blocked this turn.", "can't be blocked this turn."],
    [
      "Other creatures you control can't be blocked this turn.",
      "Other creatures you control can't be blocked this turn.",
    ],
    ["Creatures you control can't attack this turn.", "can't attack this turn."],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ stoppedAt });
  });
});

describe('the choice made as a permanent enters and what reads it (D-100; CR 614.12, 607.2d, 613.1d)', () => {
  test.each([
    ['As ~ enters, choose a creature type.', 'creatureType'],
    ['As ~ enters, choose a color.', 'color'],
    ['As ~ enters the battlefield, choose a creature type.', 'creatureType'],
  ] as const)('%s', (text, what) => {
    expect(abilities(text)).toEqual([
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what } },
    ]);
  });

  test('two replacement effects in one line: "~ enters tapped. As it enters, choose a color."', () => {
    expect(abilities('~ enters tapped. As it enters, choose a color.', 'land')).toEqual([
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'color' } },
    ]);
  });

  test.each([
    ['As ~ enters, choose a color other than white.', ', choose a color other than white.'],
    ['As ~ enters, choose two colors.', ', choose two colors.'],
    ['As ~ enters, choose a basic land type.', ', choose a basic land type.'],
    ['As ~ enters, choose a card name.', ', choose a card name.'],
    // Group 4 of the Vraska deck reads "you may" as the lead of the reveal replacement.
    ['As ~ enters, you may choose a color.', 'choose a color.'],
    [
      '~ enters tapped. As it enters, choose a color other than white.',
      'As it enters, choose a color other than white.',
    ],
    ['~ enters tapped. Draw a card.', 'Draw a card.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ stoppedAt });
  });

  const GROUP = (extra: Record<string, unknown>) => ({
    kind: 'filter',
    filter: { types: ['creature'], controller: 'you', ...extra },
  });

  test.each([
    [
      'Creatures you control of the chosen type get +1/+1.',
      { subject: GROUP({ chosenType: true }), power: 1, toughness: 1 },
    ],
    [
      'Creatures you control of the chosen color get +1/+0.',
      { subject: GROUP({ chosenColor: true }), power: 1, toughness: 0 },
    ],
    [
      'Creatures of the chosen type you control get +1/+1.',
      { subject: GROUP({ chosenType: true }), power: 1, toughness: 1 },
    ],
  ] as const)('%s is a filter of the choice', (text, expected) => {
    expect(abilities(text, 'enchantment')).toEqual([
      { kind: 'static', static: { kind: 'modifyPt', ...expected } },
    ]);
  });

  test('"Other ... of the chosen type" leaves out the source', () => {
    expect(
      abilities('Other creatures you control of the chosen type get +1/+1.', 'enchantment'),
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { ...GROUP({ chosenType: true }), other: true },
          power: 1,
          toughness: 1,
        },
      },
    ]);
  });

  test('"~ is the chosen type in addition to its other types." is the static setTypes of the engine', () => {
    expect(abilities('~ is the chosen type in addition to its other types.')).toEqual([
      {
        kind: 'static',
        static: { kind: 'setTypes', subject: { kind: 'this' }, chosenType: true, additive: true },
      },
    ]);
  });

  test.each([
    [
      '~ is the chosen type in addition to its other types',
      'is the chosen type in addition to its other types',
    ],
    [
      '~ is the chosen color in addition to its other colors.',
      'is the chosen color in addition to its other colors.',
    ],
    [
      'Each creature you control is the chosen type in addition to its other types.',
      'is the chosen type in addition to its other types.',
    ],
    ['Creatures you control of the chosen player get +1/+1.', 'of the chosen player get +1/+1.'],
    ['Creatures you control of that type get +1/+1.', 'of that type get +1/+1.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'enchantment')).toMatchObject({ stoppedAt });
  });

  test.each([
    [
      'Creature spells you cast of the chosen type cost {1} less to cast.',
      { types: ['creature'], controller: 'you', chosenType: true },
    ],
    [
      'Creature spells of the chosen type you cast cost {1} less to cast.',
      { types: ['creature'], controller: 'you', chosenType: true },
    ],
    [
      'Spells you cast of the chosen type cost {1} less to cast.',
      { controller: 'you', chosenType: true },
    ],
    [
      'Red spells you cast of the chosen color cost {1} less to cast.',
      { colors: ['R'], controller: 'you', chosenColor: true },
    ],
  ] as const)('%s', (text, spells) => {
    expect(abilities(text, 'enchantment')).toEqual([
      { kind: 'static', static: { kind: 'costReduction', spells, amount: 1 } },
    ]);
  });

  test.each([
    // 'Creature spells of the chosen type cost {2} less to cast.' is read since D-255 (every player's spells).
    [
      'Creature spells you cast of the chosen type of the chosen color cost {1} less to cast.',
      'none',
    ],
  ])('%s stays unread (stops at the whole line)', (text) => {
    expect(dropped(text, 'enchantment').stoppedAt).toBe(text);
  });

  test('triggers: a spell of the chosen type, and a creature of the chosen type entering or attacking', () => {
    expect(
      abilities('Whenever you cast a creature spell of the chosen type, draw a card.'),
    ).toMatchObject([
      {
        trigger: {
          kind: 'castSpell',
          filter: { types: ['creature'], stackKind: 'spell', chosenType: true },
          by: 'you',
        },
      },
    ]);
    expect(
      abilities(
        'Whenever a creature you control of the chosen type enters or attacks, draw a card.',
      ),
    ).toMatchObject([
      { trigger: { kind: 'entersBattlefield', what: { chosenType: true, controller: 'you' } } },
      { trigger: { kind: 'attacks', what: { chosenType: true, controller: 'you' } } },
    ]);
  });

  test('counts: "for each creature you control of the chosen type"', () => {
    expect(
      readAll(
        'You gain life equal to the number of creatures you control of the chosen type.',
        'instant',
      ).spell?.effect,
    ).toEqual({
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: {
        kind: 'countOf',
        filter: { types: ['creature'], controller: 'you', chosenType: true },
      },
    });
  });
});
