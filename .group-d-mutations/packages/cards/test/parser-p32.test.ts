// Stage P32 (M9): the Dinosaurs slice of the engine (D-145, ENGINE_VERSION 32) read by the grammar (D-147). The lines of `REAL` are the real
// Oracle text of the twenty cards that the golden corpus added for the Dinosaurs precon (packages/cards/test/fixtures/corpus/golden.jsonl,
// the lines after the Artifacts slice), names replaced by ~, each with the nodes the grammar produces; every other line is SYNTHETIC: the same
// shapes over other types, numbers and filters, the near misses and the lines the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-p32.test.ts; a missing engine feature is named in parser-p32-needs.test.ts.
//
// Differences of detail from "The Dinosaurs slice (D-145)" in docs/MECHANICS.md, all of them the same thing to the engine: a filter of a
// creature type alone ("another Dinosaur") has no `types: ['creature']` (the grammar has always read a group named by a creature type so, as
// in stage P31); a target or an `each` filter carries `zone: 'battlefield'`; the host of "Equipped creature" is `attached` with the type
// `creature`; and "At the beginning of each combat" is the step trigger of `whose: 'each'` (the turn of every player, CR 507.1).
import { describe, expect, test } from 'vitest';
import { selfNames } from '../src/convert/parser/normalize';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const T2 = { kind: 'target', id: 't2' } as const;

/** The abilities of a permanent text that read completely. */
const abilities = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  readAll(text, type, subtypes).abilities;

const spellOf = (text: string, type: 'instant' | 'sorcery' = 'sorcery') =>
  readAll(text, type).spell;

const drop = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  dropped(text, type, subtypes);

/** The real Oracle text of the twenty cards of the golden corpus, as the nodes the engine runs. */
const REAL: readonly (readonly [
  string,
  string,
  FaceType,
  readonly string[],
  { abilities?: unknown; spell?: unknown },
])[] = [
  [
    'Arachnogenesis',
    'Create X 1/2 green Spider creature tokens with reach, where X is the number of creatures attacking you. Prevent all combat damage that would be dealt this turn by non-Spider creatures.',
    'instant',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'createToken',
              token: {
                kind: 'custom',
                definition: {
                  name: 'Spider',
                  manaCost: null,
                  supertypes: [],
                  types: ['creature'],
                  subtypes: ['Spider'],
                  colors: ['G'],
                  power: 1,
                  toughness: 2,
                  loyalty: null,
                  defense: null,
                  oracleText: '',
                  abilities: [{ kind: 'keyword', keyword: { kind: 'reach' } }],
                },
              },
              count: { kind: 'countOf', filter: { types: ['creature'], attackingYou: true } },
            },
            {
              kind: 'preventDamage',
              scope: 'combat',
              amount: 'all',
              duration: 'untilEndOfTurn',
              to: { kind: 'any' },
              byFilter: { types: ['creature'], notSubtypes: ['Spider'] },
            },
          ],
        },
      },
    },
  ],
  [
    'Clifftop Lookout',
    'Reach\nWhen ~ enters, reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order.',
    'creature',
    ['Frog', 'Scout'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'reach' } },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'revealUntil',
            filter: { types: ['land'] },
            put: 'battlefield',
            tapped: true,
          },
        },
      ],
    },
  ],
  [
    'Collective Resistance',
    'Escalate {G}\nChoose one or more —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Target creature gains hexproof and indestructible until end of turn.',
    'instant',
    [],
    {
      abilities: [
        {
          kind: 'keyword',
          keyword: { kind: 'escalate', cost: [{ kind: 'mana', symbols: ['G'] }] },
        },
      ],
      spell: {
        modes: [
          {
            text: 'Destroy target artifact.',
            targets: [
              {
                id: 't1',
                what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
              },
            ],
            effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
          },
          {
            text: 'Destroy target enchantment.',
            targets: [
              {
                id: 't2',
                what: { kind: 'object', filter: { zone: 'battlefield', types: ['enchantment'] } },
              },
            ],
            effect: { kind: 'destroy', objects: { kind: 'target', id: 't2' } },
          },
          {
            text: 'Target creature gains hexproof and indestructible until end of turn.',
            targets: [
              {
                id: 't3',
                what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
              },
            ],
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'grantKeyword',
                  objects: { kind: 'target', id: 't3' },
                  keyword: { kind: 'hexproof' },
                  duration: 'untilEndOfTurn',
                },
                {
                  kind: 'grantKeyword',
                  objects: { kind: 'target', id: 't3' },
                  keyword: { kind: 'indestructible' },
                  duration: 'untilEndOfTurn',
                },
              ],
            },
          },
        ],
        chooseModes: { min: 1, max: 3 },
      },
    },
  ],
  [
    "Ezuri's Predation",
    'For each creature your opponents control, create a 4/4 green Phyrexian Beast creature token. Each of those tokens fights a different one of those creatures.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'createToken',
              token: {
                kind: 'custom',
                definition: {
                  name: 'Phyrexian Beast',
                  manaCost: null,
                  supertypes: [],
                  types: ['creature'],
                  subtypes: ['Phyrexian', 'Beast'],
                  colors: ['G'],
                  power: 4,
                  toughness: 4,
                  loyalty: null,
                  defense: null,
                  oracleText: '',
                  abilities: [],
                },
              },
              count: { kind: 'countOf', filter: { types: ['creature'], controller: 'opponent' } },
            },
            {
              kind: 'fight',
              fighters: { kind: 'moved' },
              against: { kind: 'each', filter: { types: ['creature'], controller: 'opponent' } },
              pairing: 'differentChosen',
            },
          ],
        },
      },
    },
  ],
  [
    'Goreclaw, Terror of Qal Sisma',
    'Creature spells you cast with power 4 or greater cost {2} less to cast.\nWhenever ~ attacks, each creature you control with power 4 or greater gets +1/+1 and gains trample until end of turn.',
    'creature',
    ['Bear'],
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'costReduction',
            spells: { types: ['creature'], controller: 'you', power: { cmp: 'atLeast', value: 4 } },
            amount: 2,
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'modifyPt',
                objects: {
                  kind: 'each',
                  filter: {
                    zone: 'battlefield',
                    types: ['creature'],
                    controller: 'you',
                    power: { cmp: 'atLeast', value: 4 },
                  },
                },
                power: 1,
                toughness: 1,
                duration: 'untilEndOfTurn',
              },
              {
                kind: 'grantKeyword',
                objects: {
                  kind: 'each',
                  filter: {
                    zone: 'battlefield',
                    types: ['creature'],
                    controller: 'you',
                    power: { cmp: 'atLeast', value: 4 },
                  },
                },
                keyword: { kind: 'trample' },
                duration: 'untilEndOfTurn',
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Ilysian Caryatid',
    '{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color instead.',
    'creature',
    ['Plant'],
    {
      abilities: [
        {
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'anyColor' },
          instead: {
            condition: {
              kind: 'controlsAtLeast',
              filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
              count: 1,
            },
            production: { kind: 'anyColor', count: 2 },
          },
        },
      ],
    },
  ],
  [
    "Kenrith's Transformation",
    'Enchant creature\nWhen ~ enters, draw a card.\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
    'enchantment',
    ['Aura'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
        { kind: 'static', static: { kind: 'loseAllAbilities', subject: { kind: 'attached' } } },
        {
          kind: 'static',
          static: {
            kind: 'setTypes',
            subject: { kind: 'attached' },
            types: ['creature'],
            subtypes: ['Elk'],
          },
        },
        {
          kind: 'static',
          static: { kind: 'setColors', subject: { kind: 'attached' }, colors: ['G'] },
        },
        {
          kind: 'static',
          static: { kind: 'setPt', subject: { kind: 'attached' }, power: 3, toughness: 3 },
        },
      ],
    },
  ],
  [
    'Loot, Exuberant Explorer',
    'You may play an additional land on each of your turns.\n{4}{G}{G}, {T}: Look at the top six cards of your library. You may reveal a creature card with mana value less than or equal to the number of lands you control from among them and put it onto the battlefield. Put the rest on the bottom in a random order.',
    'creature',
    ['Beast', 'Noble'],
    {
      abilities: [
        { kind: 'static', static: { kind: 'additionalLandDrops', count: 1 } },
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['4', 'G', 'G'] }, { kind: 'tap' }],
          effect: {
            kind: 'lookAtTop',
            count: 6,
            take: {
              filter: { types: ['creature'] },
              max: 1,
              to: 'battlefield',
              manaValueAtMost: { kind: 'countOf', filter: { types: ['land'], controller: 'you' } },
            },
            rest: 'bottomRandom',
          },
        },
      ],
    },
  ],
  [
    'Monstrous Onslaught',
    '~ deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as you cast ~.',
    'sorcery',
    [],
    {
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
            divide: {
              total: {
                kind: 'aggregate',
                how: 'greatest',
                stat: 'power',
                filter: { types: ['creature'], controller: 'you' },
              },
            },
          },
        ],
        effect: { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
      },
    },
  ],
  [
    'Mosswort Bridge',
    'Hideaway 4\n~ enters tapped.\n{T}: Add {G}.\n{G}, {T}: You may play the exiled card without paying its mana cost if creatures you control have total power 10 or greater.',
    'land',
    [],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'hideaway', count: 4 } },
        { kind: 'replacement', replacement: { kind: 'entersTapped' } },
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['G'] }, { kind: 'tap' }],
          effect: {
            kind: 'conditional',
            condition: {
              kind: 'amountIs',
              amount: {
                kind: 'aggregate',
                how: 'total',
                stat: 'power',
                filter: { types: ['creature'], controller: 'you' },
              },
              compare: { cmp: 'atLeast', value: 10 },
            },
            effect: { kind: 'castFree', objects: { kind: 'linkedExile' }, play: true },
          },
        },
      ],
    },
  ],
  [
    'Pugnacious Hammerskull',
    "Whenever ~ attacks while you don't control another Dinosaur, put a stun counter on it.",
    'creature',
    ['Dinosaur'],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: 'stun', count: 1 },
          triggerCondition: {
            kind: 'not',
            term: {
              kind: 'controlsAtLeast',
              filter: { subtypes: ['Dinosaur'], other: true },
              count: 1,
            },
          },
        },
      ],
    },
  ],
  [
    'Ram Through',
    "Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead.",
    'instant',
    [],
    {
      spell: {
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
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
            },
          },
        ],
        effect: {
          kind: 'dealDamage',
          amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
          to: { kind: 'target', id: 't2' },
          from: { kind: 'target', id: 't1' },
          trampleExcess: true,
        },
      },
    },
  ],
  [
    'Rhonas the Indomitable',
    "Deathtouch, indestructible\n~ can't attack or block unless you control another creature with power 4 or greater.\n{2}{G}: Another target creature gets +2/+0 and gains trample until end of turn.",
    'creature',
    ['God'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'deathtouch' } },
        { kind: 'keyword', keyword: { kind: 'indestructible' } },
        {
          kind: 'static',
          static: {
            kind: 'restrictionUnless',
            subject: { kind: 'this' },
            restrictions: ['cantAttack', 'cantBlock'],
            unless: {
              kind: 'controlsAtLeast',
              filter: { types: ['creature'], other: true, power: { cmp: 'atLeast', value: 4 } },
              count: 1,
            },
          },
        },
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['2', 'G'] }],
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', types: ['creature'], other: true },
              },
            },
          ],
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'modifyPt',
                objects: { kind: 'target', id: 't1' },
                power: 2,
                toughness: 0,
                duration: 'untilEndOfTurn',
              },
              {
                kind: 'grantKeyword',
                objects: { kind: 'target', id: 't1' },
                keyword: { kind: 'trample' },
                duration: 'untilEndOfTurn',
              },
            ],
          },
        },
      ],
    },
  ],
  [
    "Rishkar's Expertise",
    'Draw cards equal to the greatest power among creatures you control.\nYou may cast a spell with mana value 5 or less from your hand without paying its mana cost.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'draw',
              player: { kind: 'you' },
              count: {
                kind: 'aggregate',
                how: 'greatest',
                stat: 'power',
                filter: { types: ['creature'], controller: 'you' },
              },
            },
            {
              kind: 'castFree',
              objects: {
                kind: 'choose',
                filter: {
                  zone: 'hand',
                  notTypes: ['land'],
                  manaValue: { cmp: 'atMost', value: 5 },
                },
              },
            },
          ],
        },
      },
    },
  ],
  [
    'Rishkar, Peema Renegade',
    'When ~ enters, put a +1/+1 counter on each of up to two target creatures.\nEach creature you control with a counter on it has "{T}: Add {G}."',
    'creature',
    ['Elf', 'Druid'],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          targets: [
            {
              id: 't1',
              what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
              min: 0,
              max: 2,
            },
          ],
          effect: {
            kind: 'addCounters',
            objects: { kind: 'target', id: 't1' },
            counter: '+1/+1',
            count: 1,
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'grantAbility',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], controller: 'you', hasCounter: true },
            },
            ability: {
              kind: 'mana',
              cost: [{ kind: 'tap' }],
              production: { kind: 'fixed', mana: ['G'] },
            },
          },
        },
      ],
    },
  ],
  [
    'Scavenging Ooze',
    '{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on ~ and you gain 1 life.',
    'creature',
    ['Ooze'],
    {
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['G'] }],
          targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'exile', objects: { kind: 'target', id: 't1' } },
              {
                kind: 'conditional',
                condition: {
                  kind: 'objectMatches',
                  of: { kind: 'target', id: 't1' },
                  filter: { types: ['creature'] },
                },
                effect: {
                  kind: 'sequence',
                  effects: [
                    { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
                    { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Tangleweave Armor',
    'Living weapon\nEquipped creature gets +X/+X, where X is the greatest mana value among your commanders.\nEquip {4}',
    'artifact',
    ['Equipment'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'livingWeapon' } },
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'attached', types: ['creature'] },
            power: { kind: 'commanderManaValue' },
            toughness: { kind: 'commanderManaValue' },
          },
        },
        { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['4'] }] } },
      ],
    },
  ],
  [
    'Thickest in the Thicket',
    "When ~ enters, put X +1/+1 counters on target creature, where X is that creature's power.\nAt the beginning of your end step, draw two cards if you control the creature with the greatest power or tied for the greatest power.",
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
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
            count: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'endStep', whose: 'you' },
          effect: {
            kind: 'conditional',
            condition: { kind: 'controlsGreatest', filter: { types: ['creature'] }, stat: 'power' },
            effect: { kind: 'draw', player: { kind: 'you' }, count: 2 },
          },
        },
      ],
    },
  ],
  [
    'Unnatural Growth',
    'At the beginning of each combat, double the power and toughness of each creature you control until end of turn.',
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'step', step: 'beginCombat', whose: 'each' },
          effect: {
            kind: 'modifyPt',
            objects: {
              kind: 'each',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
            },
            power: { kind: 'affected', stat: 'power' },
            toughness: { kind: 'affected', stat: 'toughness' },
            duration: 'untilEndOfTurn',
          },
        },
      ],
    },
  ],
  [
    "Witch's Clinic",
    '{T}: Add {C}.\n{2}, {T}: Target commander gains lifelink until end of turn.',
    'land',
    [],
    {
      abilities: [
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
          targets: [{ id: 't1', what: { kind: 'object', filter: { commander: true } } }],
          effect: {
            kind: 'grantKeyword',
            objects: { kind: 'target', id: 't1' },
            keyword: { kind: 'lifelink' },
            duration: 'untilEndOfTurn',
          },
        },
      ],
    },
  ],
];

describe('the twenty cards of the Dinosaurs precon read as the nodes of D-145', () => {
  test.each(REAL)('%s', (_name, text, type, subtypes, expected) => {
    const parsed = readAll(text, type, subtypes);
    if (expected.abilities !== undefined) expect(parsed.abilities).toEqual(expected.abilities);
    else expect(parsed.abilities).toEqual([]);
    if (expected.spell !== undefined) expect(parsed.spell).toEqual(expected.spell);
    else expect(parsed.spell ?? null).toBeNull();
  });
});

const CREATURE = { types: ['creature'] } as const;
const EACH_OF_MINE = {
  kind: 'each',
  filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
} as const;

describe('"~ can\'t attack or block unless ..." (CR 508.1a, 509.1a): the restriction of the permanent, lifted by a condition', () => {
  test.each([
    [
      "~ can't attack unless you control a Dragon.",
      ['cantAttack'],
      { kind: 'controlsAtLeast', filter: { subtypes: ['Dragon'] }, count: 1 },
    ],
    [
      "~ can't block unless you control another creature with power 2 or greater.",
      ['cantBlock'],
      {
        kind: 'controlsAtLeast',
        filter: { types: ['creature'], other: true, power: { cmp: 'atLeast', value: 2 } },
        count: 1,
      },
    ],
    [
      "~ can't attack or block unless you control a commander.",
      ['cantAttack', 'cantBlock'],
      { kind: 'controlCommander' },
    ],
    [
      "~ can't attack or block unless you have 30 or more life.",
      ['cantAttack', 'cantBlock'],
      { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 30 } },
    ],
    [
      "~ can't block unless creatures you control have total power 10 or greater.",
      ['cantBlock'],
      {
        kind: 'amountIs',
        amount: {
          kind: 'aggregate',
          how: 'total',
          stat: 'power',
          filter: { types: ['creature'], controller: 'you' },
        },
        compare: { cmp: 'atLeast', value: 10 },
      },
    ],
  ])('%s', (text, restrictions, unless) => {
    expect(abilities(text)).toEqual([
      {
        kind: 'static',
        static: { kind: 'restrictionUnless', subject: THIS, restrictions, unless },
      },
    ]);
  });

  test.each([
    "~ can't attack or block unless it is raining.",
    "~ can't block or attack unless you control a Dragon.",
    "Creatures you control can't attack unless you control a Dragon.",
    "~ can't be blocked unless you control a Dragon.",
    "~ can't attack or block unless an opponent controls a Dragon.",
    "~ can't attack or block unless you control a Plains.",
  ])('stays unread: %s', (text) => {
    expect(drop(text)).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"Enchanted creature loses all abilities and is a ... creature with base power and toughness N/N." (CR 613.1d to 613.1f, 613.4b)', () => {
  const ATTACHED = { kind: 'attached' } as const;

  test.each([
    [
      'Enchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1.',
      [
        { kind: 'loseAllAbilities', subject: ATTACHED },
        { kind: 'setTypes', subject: ATTACHED, types: ['creature'], subtypes: ['Frog'] },
        { kind: 'setColors', subject: ATTACHED, colors: ['U'] },
        { kind: 'setPt', subject: ATTACHED, power: 1, toughness: 1 },
      ],
    ],
    ['Enchanted creature loses all abilities.', [{ kind: 'loseAllAbilities', subject: ATTACHED }]],
    [
      'Enchanted creature is a red Goblin Warrior creature.',
      [
        {
          kind: 'setTypes',
          subject: ATTACHED,
          types: ['creature'],
          subtypes: ['Goblin', 'Warrior'],
        },
        { kind: 'setColors', subject: ATTACHED, colors: ['R'] },
      ],
    ],
    [
      'Enchanted creature is a colorless Construct artifact creature with base power and toughness 2/2.',
      [
        {
          kind: 'setTypes',
          subject: ATTACHED,
          types: ['artifact', 'creature'],
          subtypes: ['Construct'],
        },
        { kind: 'setColors', subject: ATTACHED, colors: [] },
        { kind: 'setPt', subject: ATTACHED, power: 2, toughness: 2 },
      ],
    ],
  ])('%s', (text, statics) => {
    expect(abilities(text, 'enchantment', ['Aura'])).toEqual(
      statics.map((s) => ({ kind: 'static', static: s })),
    );
  });

  test('an Equipment gives the same to the creature it is attached to', () => {
    expect(
      abilities(
        'Equipped creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
        'artifact',
        ['Equipment'],
      ),
    ).toHaveLength(4);
  });

  test.each([
    'Enchanted creature loses all abilities and is a green Elk.',
    'Enchanted creature loses all abilities and is a green creature.',
    'Enchanted creature loses all abilities and is green.',
    'Enchanted creature loses all abilities and is a green Elk creature in addition to its other types.',
    'Enchanted creature loses all abilities and is a green Elk creature with power and toughness 3/3.',
    'Enchanted creature is a green Banana creature.',
    'Enchanted creature loses flying.',
  ])('stays unread: %s', (text) => {
    expect(drop(text, 'enchantment', ['Aura'])).toMatchObject({ reason: 'unrecognised' });
  });

  test('on a face that is not an Aura or an Equipment nothing is attached to anything', () => {
    expect(drop('Enchanted creature loses all abilities.', 'creature')).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });
});

describe('"Equipped creature gets +X/+X, where X is ..." (CR 613.4c, 611.3a, 107.3c): an amount that follows the board', () => {
  const MV = { kind: 'commanderManaValue' } as const;

  test.each([
    [
      'Equipped creature gets +X/+X, where X is the greatest mana value among your commanders.',
      MV,
      MV,
    ],
    [
      'Equipped creature gets +X/+0, where X is the greatest mana value among your commanders.',
      MV,
      0,
    ],
    [
      'Equipped creature gets +0/+X, where X is the greatest mana value among your commanders.',
      0,
      MV,
    ],
  ])('%s', (text, power, toughness) => {
    expect(abilities(text, 'artifact', ['Equipment'])).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'attached', types: ['creature'] },
          power,
          toughness,
        },
      },
    ]);
  });

  test('a count of permanents is the same bonus as "for each"', () => {
    const count = { kind: 'countOf', filter: { types: ['artifact'], controller: 'you' } };
    expect(abilities('~ gets +X/+X, where X is the number of artifacts you control.')).toEqual([
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: THIS, power: count, toughness: count },
      },
    ]);
  });

  test.each([
    'Equipped creature gets +X/+X, where X is the greatest mana value among your commanders',
    'Equipped creature gets +X/+X where X is the greatest mana value among your commanders.',
    'Equipped creature gets +0/+0, where X is the greatest mana value among your commanders.',
    'Equipped creature gets -X/-X, where X is the greatest mana value among your commanders.',
    'Equipped creature gets +X/+X until end of turn, where X is the greatest mana value among your commanders.',
    'Creatures you control get +X/+X, where X is the greatest mana value among your commanders.',
  ])('stays unread: %s', (text) => {
    expect(drop(text, 'artifact', ['Equipment'])).toMatchObject({ reason: 'unrecognised' });
  });

  test('an amount a static ability cannot read is read and not run (CR 613.8)', () => {
    expect(
      drop('~ gets +X/+X, where X is the greatest power among creatures you control.'),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('spells that cost less by their power, toughness or mana value (CR 118.7a, 202.3, 208.1)', () => {
  test.each([
    [
      'Creature spells you cast with power 4 or greater cost {2} less to cast.',
      { types: ['creature'], controller: 'you', power: { cmp: 'atLeast', value: 4 } },
      2,
    ],
    [
      'Spells you cast with mana value 5 or greater cost {1} less to cast.',
      { controller: 'you', manaValue: { cmp: 'atLeast', value: 5 } },
      1,
    ],
    [
      'Creature spells you cast with toughness 3 or less cost {1} less to cast.',
      { types: ['creature'], controller: 'you', toughness: { cmp: 'atMost', value: 3 } },
      1,
    ],
  ])('%s', (text, spells, amount) => {
    expect(abilities(text)).toEqual([
      { kind: 'static', static: { kind: 'costReduction', spells, amount } },
    ]);
  });

  test.each([
    'Creature spells you cast with flying cost {2} less to cast.',
    'Creature spells you cast with power greater than 3 cost {2} less to cast.',
    'Creature spells you cast with power 4 or greater cost {2} less to cast for each creature you control.',
  ])('stays unread: %s', (text) => {
    expect(drop(text)).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"with a counter on it" and "target commander" (CR 122.1, 903.3)', () => {
  test.each([
    ['Each creature you control with a +1/+1 counter on it gets +1/+1.', '+1/+1'],
    ['Creatures you control with +1/+1 counters on them get +1/+1.', '+1/+1'],
    ['Each creature you control with a stun counter on it gets +1/+1.', 'stun'],
    ['Each creature you control with a counter on it gets +1/+1.', true],
  ])('%s', (text, hasCounter) => {
    expect(abilities(text)).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', hasCounter },
          },
          power: 1,
          toughness: 1,
        },
      },
    ]);
  });

  test('a group with a counter can be given a mana ability, in any kind of counter', () => {
    expect(
      abilities('Each creature you control with a +1/+1 counter on it has "{T}: Add {R}."'),
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', hasCounter: '+1/+1' },
          },
          ability: {
            kind: 'mana',
            cost: [{ kind: 'tap' }],
            production: { kind: 'fixed', mana: ['R'] },
          },
        },
      },
    ]);
  });

  test.each([
    ['{3}, {T}: Target commander gains haste until end of turn.', { commander: true }, 'haste'],
    [
      '{3}, {T}: Target creature commander gains vigilance until end of turn.',
      { types: ['creature'], commander: true },
      'vigilance',
    ],
  ])('%s', (text, filter, keyword) => {
    expect(abilities(text, 'land')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['3'] }, { kind: 'tap' }],
        targets: [{ id: 't1', what: { kind: 'object', filter } }],
        effect: {
          kind: 'grantKeyword',
          objects: T1,
          keyword: { kind: keyword },
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test('a commander is a target of the other verbs that take a permanent', () => {
    expect(spellOf('Destroy target commander.')).toEqual({
      targets: [{ id: 't1', what: { kind: 'object', filter: { commander: true } } }],
      effect: { kind: 'destroy', objects: T1 },
    });
    expect(spellOf('Target commander gets +2/+2 until end of turn.', 'instant')?.effect).toEqual({
      kind: 'modifyPt',
      objects: T1,
      power: 2,
      toughness: 2,
      duration: 'untilEndOfTurn',
    });
  });

  test.each([
    'Target commanders gain lifelink until end of turn.',
    'Target commander you control gains lifelink until end of turn.',
    'Target nonland commander gains lifelink until end of turn.',
    'Each creature you control with a counter gets +1/+1.',
  ])('stays unread: %s', (text) => {
    expect(drop(text, 'instant')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"Whenever ~ attacks while ..." (CR 603.2): a condition of the event, read once', () => {
  test.each([
    [
      "Whenever ~ attacks while you don't control another Dinosaur, put a stun counter on it.",
      {
        kind: 'not',
        term: {
          kind: 'controlsAtLeast',
          filter: { subtypes: ['Dinosaur'], other: true },
          count: 1,
        },
      },
    ],
    [
      "Whenever ~ attacks while you don't control a creature with power 4 or greater, put a stun counter on it.",
      {
        kind: 'not',
        term: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
          count: 1,
        },
      },
    ],
    [
      'Whenever ~ attacks while you control a Dragon, put a stun counter on it.',
      { kind: 'controlsAtLeast', filter: { subtypes: ['Dragon'] }, count: 1 },
    ],
    [
      'Whenever ~ attacks while you control a commander, put a stun counter on it.',
      { kind: 'controlCommander' },
    ],
  ])('%s', (text, triggerCondition) => {
    expect(abilities(text)).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS },
        effect: { kind: 'addCounters', objects: THIS, counter: 'stun', count: 1 },
        triggerCondition,
      },
    ]);
  });

  test('"if" is the intervening condition of CR 603.4, which is another node', () => {
    const [ability] = abilities(
      "Whenever ~ attacks, if you don't control another Dinosaur, put a stun counter on it.",
    );
    expect(ability).toMatchObject({ interveningIf: { kind: 'not' } });
    expect(ability).not.toHaveProperty('triggerCondition');
  });

  test.each([
    'Whenever ~ attacks while it is raining, put a stun counter on it.',
    'Whenever ~ attacks while you control a Dragon or dies, put a stun counter on it.',
    "Whenever ~ attacks you while you don't control another Dinosaur, put a stun counter on it.",
    'Whenever ~ blocks while you control a Dragon, put a stun counter on it.',
  ])('stays unread: %s', (text) => {
    expect(drop(text)).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"Double the power and toughness of ..." (CR 701.10)', () => {
  const doubled = (power: boolean, toughness: boolean, objects: unknown) => ({
    kind: 'modifyPt',
    objects,
    power: power ? { kind: 'affected', stat: 'power' } : 0,
    toughness: toughness ? { kind: 'affected', stat: 'toughness' } : 0,
    duration: 'untilEndOfTurn',
  });

  test.each([
    [
      'Double the power and toughness of each creature you control until end of turn.',
      doubled(true, true, EACH_OF_MINE),
    ],
    ['Double the power of target creature until end of turn.', doubled(true, false, T1)],
    [
      'Double the toughness of target creature you control until end of turn.',
      doubled(false, true, T1),
    ],
    [
      'Double the power and toughness of creatures you control until end of turn.',
      doubled(true, true, EACH_OF_MINE),
    ],
  ])('%s', (text, effect) => {
    expect(spellOf(text, 'instant')?.effect).toEqual(effect);
  });

  test('at the beginning of each combat, from a permanent', () => {
    expect(
      abilities(
        'At the beginning of each combat, double the power and toughness of each creature you control until end of turn.',
        'enchantment',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'each' },
        effect: doubled(true, true, EACH_OF_MINE),
      },
    ]);
  });

  test.each([
    'Double the power and toughness of each creature you control.',
    'Double the power and toughness of each creature you control until your next turn.',
    'Double the power and toughness of target creatures until end of turn.',
    'Double the power and mana value of target creature until end of turn.',
    'Double the number of counters on target creature.',
  ])('stays unread: %s', (text) => {
    expect(dropped(text, 'instant')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('fights (CR 701.14)', () => {
  test('two single creatures: the first fights the second', () => {
    expect(
      spellOf("Target creature you control fights target creature you don't control."),
    ).toEqual({
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
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
          },
        },
      ],
      effect: { kind: 'fight', fighters: T1, against: T2 },
    });
  });

  test('a creature of the ability fights a target', () => {
    expect(
      abilities("{2}{G}: ~ fights target creature you don't control.", 'creature')[0],
    ).toMatchObject({
      kind: 'activated',
      effect: { kind: 'fight', fighters: THIS, against: T1 },
    });
  });

  test('each token just made fights a different creature of those counted', () => {
    expect(
      spellOf(
        'For each creature your opponents control, create a 2/2 white Soldier creature token. Each of those tokens fights a different one of those creatures.',
      )?.effect,
    ).toMatchObject({
      kind: 'sequence',
      effects: [
        {
          kind: 'createToken',
          count: { kind: 'countOf', filter: { types: ['creature'], controller: 'opponent' } },
        },
        {
          kind: 'fight',
          fighters: { kind: 'moved' },
          against: { kind: 'each', filter: { types: ['creature'], controller: 'opponent' } },
          pairing: 'differentChosen',
        },
      ],
    });
  });

  test('"those tokens" needs the tokens an instruction before it made', () => {
    expect(
      dropped('Each of those tokens fights a different one of those creatures.', 'sorcery'),
    ).toMatchObject({ reason: 'notRunnable' });
    expect(
      dropped(
        'Draw a card. Each of those tokens fights a different one of those creatures.',
        'sorcery',
      ),
    ).toMatchObject({ reason: 'notRunnable' });
  });

  test('"those creatures" must be the creatures the tokens were counted for', () => {
    expect(
      dropped(
        'For each artifact your opponents control, create a 2/2 white Soldier creature token. Each of those tokens fights a different one of those creatures.',
        'sorcery',
      ),
    ).toMatchObject({ reason: 'notRunnable' });
  });

  test.each([
    'Target creature fights.',
    'Target creatures fight each other.',
    'Target creature you control fights up to one target creature.',
    'Target creature you control fights each creature.',
    'Each of those tokens fights one of those creatures.',
    'Each of those tokens fights a different one of them.',
    'Each token fights a different one of those creatures.',
  ])('stays unread: %s', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"... excess damage is dealt to that creature\'s controller instead." (CR 702.19b, 120.3, 614.1a)', () => {
  const BITE =
    "Target creature you control deals damage equal to its power to target creature you don't control.";

  test('joined to the bite before it as `trampleExcess`', () => {
    const effect = spellOf(
      `${BITE} If the creature you control has trample, excess damage is dealt to that creature's controller instead.`,
    )?.effect;
    expect(effect).toEqual({
      kind: 'dealDamage',
      amount: { kind: 'powerOf', of: T1 },
      to: T2,
      from: T1,
      trampleExcess: true,
    });
  });

  test('the damage of a creature that is not a target (the creature that entered) is not joined to the sentence', () => {
    expect(
      drop(
        "Whenever a creature you control enters, it deals damage equal to its power to target creature you don't control. If it has trample, excess damage is dealt to that creature's controller instead.",
      ),
    ).toMatchObject({ reason: expect.stringMatching(/notRunnable|unrecognised|unboundReference/) });
  });

  test.each([
    // Another keyword, a recipient that is not the controller of the creature bitten, and no bite before it.
    `${BITE} If the creature you control has deathtouch, excess damage is dealt to that creature's controller instead.`,
    `${BITE} If the creature you control has trample, excess damage is dealt to you instead.`,
    "~ deals 3 damage to target creature. If that creature has trample, excess damage is dealt to that creature's controller instead.",
    "If the creature you control has trample, excess damage is dealt to that creature's controller instead.",
    `${BITE} If the creature you control has trample, excess damage is dealt to that creature's controller.`,
    `${BITE} You gain 2 life. If the creature you control has trample, excess damage is dealt to that creature's controller instead.`,
  ])('is not run: %s', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised|unboundReference/),
    });
  });
});

describe('reveal cards until one of a kind (CR 701.20, 401.4)', () => {
  test.each([
    [
      'Reveal cards from the top of your library until you reveal a nonland card. Put that card into your hand and the rest on the bottom of your library in a random order.',
      { kind: 'revealUntil', filter: { notTypes: ['land'] }, put: 'hand' },
    ],
    [
      'Reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.',
      { kind: 'revealUntil', filter: { types: ['creature'] }, put: 'battlefield' },
    ],
    [
      'Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order.',
      { kind: 'revealUntil', filter: { types: ['land'] }, put: 'battlefield', tapped: true },
    ],
  ])('%s', (text, effect) => {
    expect(spellOf(text)?.effect).toEqual(effect);
  });

  test.each([
    'Reveal cards from the top of your library until you reveal a land card.',
    'Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped.',
    'Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest into your graveyard.',
    'Reveal cards from the top of your library until you reveal two land cards. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order.',
  ])('stays unread: %s', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('the look at the top cards that puts a card onto the battlefield (CR 401.2, 701.20a)', () => {
  const LOOK = 'Look at the top six cards of your library.';

  test.each([
    [
      `${LOOK} You may reveal a land card from among them and put it onto the battlefield. Put the rest on the bottom of your library in a random order.`,
      { filter: { types: ['land'] }, max: 1, to: 'battlefield' },
      'bottomRandom',
    ],
    [
      `${LOOK} You may reveal an artifact card with mana value less than or equal to the number of lands you control from among them and put it into your hand. Put the rest into your graveyard.`,
      {
        filter: { types: ['artifact'] },
        max: 1,
        manaValueAtMost: { kind: 'countOf', filter: { types: ['land'], controller: 'you' } },
      },
      'graveyard',
    ],
    [
      `${LOOK} You may reveal a creature card from among them and put it onto the battlefield. Put the rest on the bottom in a random order.`,
      { filter: { types: ['creature'] }, max: 1, to: 'battlefield' },
      'bottomRandom',
    ],
  ])('%s', (text, take, rest) => {
    expect(spellOf(text)?.effect).toEqual({ kind: 'lookAtTop', count: 6, take, rest });
  });

  test.each([
    `${LOOK} You may reveal a land card from among them and put it onto the battlefield tapped. Put the rest on the bottom of your library in a random order.`,
    `${LOOK} You may reveal a land card from among them and put it into your library. Put the rest on the bottom of your library in a random order.`,
    `${LOOK} You may reveal a land card with mana value less than or equal to 3 from among them and put it into your hand. Put the rest on the bottom of your library in a random order.`,
    `${LOOK} You may reveal a land card from among them and put it onto the battlefield. Put the rest on the bottom of your library in any order.`,
  ])('stays unread: %s', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('casting or playing a card without paying its mana cost (CR 608.2g, 118.9, 305.1)', () => {
  test.each([
    [
      'You may cast a spell with mana value 3 or less from your hand without paying its mana cost.',
      { zone: 'hand', notTypes: ['land'], manaValue: { cmp: 'atMost', value: 3 } },
    ],
    [
      'You may cast a creature spell from your hand without paying its mana cost.',
      { zone: 'hand', types: ['creature'] },
    ],
    [
      'You may cast a spell from your hand without paying its mana cost.',
      { zone: 'hand', notTypes: ['land'] },
    ],
  ])('%s', (text, filter) => {
    expect(spellOf(text)?.effect).toEqual({
      kind: 'castFree',
      objects: { kind: 'choose', filter },
    });
  });

  test.each([
    ['You may play the exiled card without paying its mana cost.', true],
    ['You may cast the exiled card without paying its mana cost.', false],
  ])('%s', (text, play) => {
    expect(abilities(`{T}: ${text}`, 'land')[0]).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'castFree',
        objects: { kind: 'linkedExile' },
        ...(play ? { play: true } : {}),
      },
    });
  });

  test('a test of the game may end the sentence', () => {
    expect(
      abilities(
        '{G}, {T}: You may play the exiled card without paying its mana cost if you control two or more Dinosaurs.',
        'land',
      )[0],
    ).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'conditional',
        condition: { kind: 'controlsAtLeast', filter: { subtypes: ['Dinosaur'] }, count: 2 },
        effect: { kind: 'castFree', objects: { kind: 'linkedExile' }, play: true },
      },
    });
  });

  test.each([
    'You may cast a spell with mana value 3 or less from your hand.',
    'You may cast a spell with mana value 3 or less from your graveyard without paying its mana cost.',
    'You may cast two spells from your hand without paying their mana costs.',
    'You may cast target spell from your hand without paying its mana cost.',
    'You may play the exiled card.',
    'You may play the exiled cards without paying their mana costs.',
  ])('stays unread: %s', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"~ deals X damage divided as you choose among ..." (CR 601.2d, 120.3)', () => {
  const SLOT = {
    id: 't1',
    what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
  };

  test('any number of target creatures, the total read as the spell is cast', () => {
    expect(
      spellOf(
        '~ deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as you cast ~.',
      ),
    ).toEqual({
      targets: [
        {
          ...SLOT,
          divide: {
            total: {
              kind: 'aggregate',
              how: 'greatest',
              stat: 'power',
              filter: { types: ['creature'], controller: 'you' },
            },
          },
        },
      ],
      effect: { kind: 'dealDividedDamage', to: T1 },
    });
  });

  test('a number, and up to some targets', () => {
    expect(
      spellOf(
        '~ deals 4 damage divided as you choose among up to three target creatures.',
        'instant',
      ),
    ).toEqual({
      targets: [{ ...SLOT, min: 0, max: 3, divide: { total: 4 } }],
      effect: { kind: 'dealDividedDamage', to: T1 },
    });
  });

  test('another kind of creature', () => {
    expect(
      spellOf(
        '~ deals 3 damage divided as you choose among any number of target creatures you don’t control.',
        'instant',
      )?.targets?.[0],
    ).toMatchObject({
      what: { filter: { types: ['creature'], controller: 'opponent' } },
      divide: { total: 3 },
    });
  });

  test.each([
    '~ deals X damage divided as you choose among any number of target creatures.',
    '~ deals 3 damage divided among any number of target creatures.',
    '~ deals 3 damage divided as you choose among any number of creatures.',
    '~ deals 3 damage divided as you choose among target creature.',
    '~ deals 3 damage divided as you choose among any target.',
    '~ deals damage divided as you choose among any number of target creatures.',
  ])('is not run, or not read: %s', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });

  test('the total as the spell is cast is read nowhere else', () => {
    expect(
      dropped(
        '~ deals X damage to target creature, where X is the greatest power among creatures you control as you cast ~.',
        'sorcery',
      ),
    ).toMatchObject({ reason: 'notRunnable' });
    expect(
      dropped(
        '{T}: ~ deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as you cast ~.',
        'creature',
      ),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('prevention by a group of sources (CR 615.1, 609.7)', () => {
  test.each([
    [
      'Prevent all combat damage that would be dealt this turn by non-Spider creatures.',
      'combat',
      { types: ['creature'], notSubtypes: ['Spider'] },
    ],
    [
      "Prevent all combat damage that would be dealt this turn by creatures you don't control.",
      'combat',
      { types: ['creature'], controller: 'opponent' },
    ],
    [
      'Prevent all damage that would be dealt by Dragons this turn.',
      'all',
      { subtypes: ['Dragon'] },
    ],
  ])('%s', (text, scope, byFilter) => {
    expect(spellOf(text, 'instant')?.effect).toEqual({
      kind: 'preventDamage',
      scope,
      amount: 'all',
      to: { kind: 'any' },
      byFilter,
      duration: 'untilEndOfTurn',
    });
  });
});

describe('mana: "two mana of any one color" and "instead" (CR 106.1b, 605.3b, 608.2c)', () => {
  test('two mana of any one color alone', () => {
    expect(abilities('{T}: Add two mana of any one color.')).toEqual([
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'anyColor', count: 2 } },
    ]);
  });

  test.each([
    [
      '{T}: Add {G}. If you control a Dragon, add {R}{R} instead.',
      { kind: 'fixed', mana: ['G'] },
      { kind: 'controlsAtLeast', filter: { subtypes: ['Dragon'] }, count: 1 },
      { kind: 'fixed', mana: ['R', 'R'] },
    ],
    [
      '{T}: Add one mana of any color. If you control a commander, add two mana of any one color instead.',
      { kind: 'anyColor' },
      { kind: 'controlCommander' },
      { kind: 'anyColor', count: 2 },
    ],
  ])('%s', (text, production, condition, instead) => {
    expect(abilities(text)).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production,
        instead: { condition, production: instead },
      },
    ]);
  });

  test.each([
    '{T}: Add {G}. If you control a Dragon, add {R}.',
    '{T}: Add {G}. If you control a Dragon, add {R} instead and draw a card.',
    '{T}: Add {G}. If you control a banana, add {R} instead.',
    '{T}: Add two mana of one color.',
  ])('is not read as a mana ability: %s', (text) => {
    expect(drop(text)).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });
});

describe('a test of the game may end or begin a sentence (CR 608.2c)', () => {
  test('ending: after one instruction', () => {
    expect(
      abilities(
        'At the beginning of your end step, draw two cards if you control a Dragon.',
        'enchantment',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'conditional',
          condition: { kind: 'controlsAtLeast', filter: { subtypes: ['Dragon'] }, count: 1 },
          effect: { kind: 'draw', player: YOU, count: 2 },
        },
      },
    ]);
  });

  test('ending: the greatest of a stat, power or toughness', () => {
    const [ability] = abilities(
      'At the beginning of your end step, draw a card if you control the creature with the greatest toughness or tied for the greatest toughness.',
      'enchantment',
    );
    expect(ability).toMatchObject({
      effect: { condition: { kind: 'controlsGreatest', filter: CREATURE, stat: 'toughness' } },
    });
  });

  test('beginning: of a spell and of an activated ability', () => {
    expect(spellOf('If you control two or more creatures, draw a card.')?.effect).toMatchObject({
      kind: 'conditional',
      condition: { kind: 'controlsAtLeast', count: 2 },
    });
    expect(
      abilities(
        '{T}: Exile target card from a graveyard. If it was a Zombie card, you gain 1 life.',
      )[0],
    ).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile' },
          {
            kind: 'conditional',
            condition: { kind: 'objectMatches', filter: { subtypes: ['Zombie'] } },
          },
        ],
      },
    });
  });

  test.each([
    'Draw a card and gain 1 life if you control a Dragon.',
    'Draw a card if you control a banana.',
    'Draw a card if it is raining.',
  ])('stays unread: %s', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('Hideaway and Escalate (CR 702.75a, 702.120a)', () => {
  test.each([1, 4, 6])('Hideaway %i', (count) => {
    expect(abilities(`Hideaway ${count}`, 'land')).toEqual([
      { kind: 'keyword', keyword: { kind: 'hideaway', count } },
    ]);
  });

  test.each(['Hideaway', 'Hideaway 0', 'Hideaway X', 'Hideaway 4.'])('%s stays unread', (text) => {
    expect(drop(text, 'land')).toMatchObject({ reason: 'unrecognised' });
  });

  test.each([
    ['Escalate {G}', ['G']],
    ['Escalate {1}{R}', ['1', 'R']],
  ])('%s', (text, symbols) => {
    expect(abilities(text, 'instant')).toEqual([
      { kind: 'keyword', keyword: { kind: 'escalate', cost: [{ kind: 'mana', symbols }] } },
    ]);
  });

  test.each(['Escalate', 'Escalate {X}', 'Escalate—Discard a card.', 'Escalate {G}, flying'])(
    '%s stays unread',
    (text) => {
      expect(drop(text, 'instant')).toMatchObject({ reason: 'unrecognised' });
    },
  );

  test('"choose one or more" with Escalate is the spell with up to as many modes as there are', () => {
    const parsed = readAll(
      'Escalate {W}\nChoose one or more —\n• Draw a card.\n• You gain 3 life.',
      'instant',
    );
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'escalate', cost: [{ kind: 'mana', symbols: ['W'] }] } },
    ]);
    expect(parsed.spell).toMatchObject({ chooseModes: { min: 1, max: 2 } });
  });
});

describe('a legendary name "X the Y" is "X" in its own text', () => {
  const rhonas = (name: string) =>
    parseOnly(
      syntheticCard({
        name,
        typeLine: 'Legendary Creature — God',
        manaCost: '{2}{G}',
        oracleText:
          "Rhonas can't attack or block unless you control another creature with power 4 or greater.",
        power: '5',
        toughness: '5',
        colors: ['G'],
      }),
    );

  test('Rhonas the Indomitable', () => {
    const imported = rhonas('SYNTHETIC Rhonas the Indomitable');
    expect(imported.support.unparsed).toHaveLength(1);
    const real = rhonas('Rhonas the Indomitable');
    expect(real.support.unparsed).toEqual([]);
    expect(real.support.status).toBe('supported');
  });

  test('a name with "of the" is not cut at "the"', () => {
    expect(selfNames({ name: 'Gideon of the Trials', legendary: true })).toEqual([
      'Gideon of the Trials',
    ]);
    expect(selfNames({ name: 'Ob Nixilis the Fallen', legendary: true })).toEqual([
      'Ob Nixilis the Fallen',
      'Ob Nixilis',
    ]);
    expect(selfNames({ name: 'Ob Nixilis the Fallen', legendary: false })).toEqual([
      'Ob Nixilis the Fallen',
    ]);
  });
});
