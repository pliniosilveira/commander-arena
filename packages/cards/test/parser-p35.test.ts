// Stage P35 (M50): the Korvold deck's text and token slice, read by the grammar (D-176; the engine's `chooseOne` and `chooseBackground`, D-175,
// ENGINE_VERSION 36). The lines of `REAL` are the real Oracle text of the twelve cards of the slice (the owner's request file of 2026-10-29),
// names replaced by ~, each with the nodes the grammar produces for it; `SIBLINGS` read lines that say the same things over other numbers, types
// and counts, and `REFUSED` lists the lines a rule must not read (flagged, never half run). Every sibling and refused line is SYNTHETIC. The engine
// runs what is lowered in convert-grammar-engine-p35.test.ts; a missing engine feature is named in parser-p35-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { normalizeOracleText } from '../src/convert/parser/index';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const drop = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  dropped(text, type, subtypes);

/** The real Oracle text of the twelve cards, as the nodes the engine runs. */
const REAL: readonly (readonly [
  string,
  string,
  FaceType,
  readonly string[],
  { abilities?: unknown; spell?: unknown },
])[] = [
  [
    'Awakening Zone',
    'At the beginning of your upkeep, you may create a 0/1 colorless Eldrazi Spawn creature token. It has "Sacrifice this token: Add {C}."',
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'upkeep', whose: 'you' },
          effect: {
            kind: 'createToken',
            token: {
              kind: 'custom',
              definition: {
                name: 'Eldrazi Spawn',
                manaCost: null,
                supertypes: [],
                types: ['creature'],
                subtypes: ['Eldrazi', 'Spawn'],
                colors: [],
                power: 0,
                toughness: 1,
                loyalty: null,
                defense: null,
                oracleText: 'Sacrifice this creature: Add {C}.',
                abilities: [
                  {
                    kind: 'mana',
                    cost: [{ kind: 'sacrifice', what: { kind: 'this' } }],
                    production: { kind: 'fixed', mana: ['C'] },
                  },
                ],
              },
            },
            count: 1,
          },
          optional: true,
        },
      ],
    },
  ],
  [
    'Beledros Witherbloom',
    'Flying\nAt the beginning of each upkeep, create a 1/1 black and green Pest creature token with "When this token dies, you gain 1 life."\nPay 10 life: Untap all lands you control. Activate only once each turn.',
    'creature',
    ['Elder', 'Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        {
          kind: 'triggered',
          trigger: { kind: 'upkeep', whose: 'each' },
          effect: {
            kind: 'createToken',
            token: {
              kind: 'custom',
              definition: {
                name: 'Pest',
                manaCost: null,
                supertypes: [],
                types: ['creature'],
                subtypes: ['Pest'],
                colors: ['B', 'G'],
                power: 1,
                toughness: 1,
                loyalty: null,
                defense: null,
                oracleText: 'When this creature dies, you gain 1 life.',
                abilities: [
                  {
                    kind: 'triggered',
                    trigger: { kind: 'dies', what: { kind: 'this' } },
                    effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
                  },
                ],
              },
            },
            count: 1,
          },
        },
        {
          kind: 'activated',
          cost: [{ kind: 'payLife', amount: 10 }],
          effect: {
            kind: 'untap',
            objects: {
              kind: 'each',
              filter: { zone: 'battlefield', types: ['land'], controller: 'you' },
            },
          },
          oncePerTurn: true,
        },
      ],
    },
  ],
  [
    'Cindervines',
    "Whenever an opponent casts a noncreature spell, ~ deals 1 damage to that player.\n{1}, Sacrifice ~: Destroy target artifact or enchantment. ~ deals 2 damage to that permanent's controller.",
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: {
            kind: 'castSpell',
            filter: { notTypes: ['creature'], stackKind: 'spell' },
            by: 'opponent',
          },
          effect: {
            kind: 'dealDamage',
            amount: 1,
            to: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
          },
        },
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['1'] },
            { kind: 'sacrifice', what: { kind: 'this' } },
          ],
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: {
                  zone: 'battlefield',
                  anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
                },
              },
            },
          ],
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
              {
                kind: 'dealDamage',
                amount: 2,
                to: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Ganax, Astral Hunter',
    'Flying\nWhenever ~ or another Dragon you control enters, create a Treasure token.\nChoose a Background',
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
        },
        {
          kind: 'triggered',
          trigger: {
            kind: 'entersBattlefield',
            what: { subtypes: ['Dragon'], other: true, controller: 'you' },
          },
          effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
        },
        { kind: 'keyword', keyword: { kind: 'chooseBackground' } },
      ],
    },
  ],
  [
    "Gilt-Leaf's Embrace",
    'Flash\nEnchant creature\nWhen ~ enters, enchanted creature gains trample and indestructible until end of turn.\nEnchanted creature gets +2/+0.',
    'enchantment',
    ['Aura'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flash' } },
        { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'grantKeyword',
                objects: { kind: 'attached' },
                keyword: { kind: 'trample' },
                duration: 'untilEndOfTurn',
              },
              {
                kind: 'grantKeyword',
                objects: { kind: 'attached' },
                keyword: { kind: 'indestructible' },
                duration: 'untilEndOfTurn',
              },
            ],
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'attached', types: ['creature'] },
            power: 2,
            toughness: 0,
          },
        },
      ],
    },
  ],
  [
    'Goldvein Hydra',
    'Vigilance, trample, haste\n~ enters with X +1/+1 counters on it.\nWhen ~ dies, create a number of tapped Treasure tokens equal to its power.',
    'creature',
    ['Hydra'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'vigilance' } },
        { kind: 'keyword', keyword: { kind: 'trample' } },
        { kind: 'keyword', keyword: { kind: 'haste' } },
        {
          kind: 'replacement',
          replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: { kind: 'x' } },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: {
            kind: 'createToken',
            token: { kind: 'preset', preset: 'Treasure' },
            count: { kind: 'powerOf', of: { kind: 'triggerSubject' } },
            tapped: true,
          },
        },
      ],
    },
  ],
  [
    'My Precious',
    "Equipped creature has hexproof and can't be blocked.\nEquip\u2014{2}, Pay 2 life.",
    'artifact',
    ['Equipment'],
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'attached', types: ['creature'] },
            keyword: { kind: 'hexproof' },
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'restriction',
            subject: { kind: 'attached', types: ['creature'] },
            restriction: 'cantBeBlocked',
          },
        },
        {
          kind: 'keyword',
          keyword: {
            kind: 'equip',
            cost: [
              { kind: 'mana', symbols: ['2'] },
              { kind: 'payLife', amount: 2 },
            ],
          },
        },
      ],
    },
  ],
  [
    'Nesting Dragon',
    'Flying\nLandfall \u2014 Whenever a land you control enters, create a 0/2 red Dragon Egg creature token with defender and "When this token dies, create a 2/2 red Dragon creature token with flying and \'{R}: This token gets +1/+0 until end of turn.\'"',
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        {
          kind: 'triggered',
          trigger: { kind: 'landfall' },
          effect: {
            kind: 'createToken',
            token: {
              kind: 'custom',
              definition: {
                name: 'Dragon Egg',
                manaCost: null,
                supertypes: [],
                types: ['creature'],
                subtypes: ['Dragon', 'Egg'],
                colors: ['R'],
                power: 0,
                toughness: 2,
                loyalty: null,
                defense: null,
                oracleText:
                  "Defender\nWhen this creature dies, create a 2/2 red Dragon creature token with flying and '{R}: This creature gets +1/+0 until end of turn.'",
                abilities: [
                  { kind: 'keyword', keyword: { kind: 'defender' } },
                  {
                    kind: 'triggered',
                    trigger: { kind: 'dies', what: { kind: 'this' } },
                    effect: {
                      kind: 'createToken',
                      token: {
                        kind: 'custom',
                        definition: {
                          name: 'Dragon',
                          manaCost: null,
                          supertypes: [],
                          types: ['creature'],
                          subtypes: ['Dragon'],
                          colors: ['R'],
                          power: 2,
                          toughness: 2,
                          loyalty: null,
                          defense: null,
                          oracleText: 'Flying\n{R}: This creature gets +1/+0 until end of turn.',
                          abilities: [
                            { kind: 'keyword', keyword: { kind: 'flying' } },
                            {
                              kind: 'activated',
                              cost: [{ kind: 'mana', symbols: ['R'] }],
                              effect: {
                                kind: 'modifyPt',
                                objects: { kind: 'this' },
                                power: 1,
                                toughness: 0,
                                duration: 'untilEndOfTurn',
                              },
                            },
                          ],
                        },
                      },
                      count: 1,
                    },
                  },
                ],
              },
            },
            count: 1,
          },
        },
      ],
    },
  ],
  [
    'Rancor',
    "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen ~ is put into a graveyard from the battlefield, return it to its owner's hand.",
    'enchantment',
    ['Aura'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'attached', types: ['creature'] },
            power: 2,
            toughness: 0,
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'attached', types: ['creature'] },
            keyword: { kind: 'trample' },
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: { kind: 'moveToZone', objects: { kind: 'thisCard' }, to: 'hand' },
        },
      ],
    },
  ],
  [
    'Temur Battle Rage',
    'Target creature gains double strike until end of turn.\nFerocious \u2014 That creature also gains trample until end of turn if you control a creature with power 4 or greater.',
    'instant',
    [],
    {
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'grantKeyword',
              objects: { kind: 'target', id: 't1' },
              keyword: { kind: 'doubleStrike' },
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'conditional',
              condition: {
                kind: 'controlsAtLeast',
                filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
                count: 1,
              },
              effect: {
                kind: 'grantKeyword',
                objects: { kind: 'target', id: 't1' },
                keyword: { kind: 'trample' },
                duration: 'untilEndOfTurn',
              },
            },
          ],
        },
      },
    },
  ],
  [
    'The Mending of Dominaria',
    '\nI, II \u2014 Mill two cards, then you may return a creature card from your graveyard to your hand.\nIII \u2014 Return all land cards from your graveyard to the battlefield, then shuffle your graveyard into your library.',
    'enchantment',
    ['Saga'],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 1, to: 2 },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'mill', player: { kind: 'you' }, count: 2 },
              {
                kind: 'moveToZone',
                objects: {
                  kind: 'choose',
                  filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
                  optional: true,
                },
                to: 'hand',
              },
            ],
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 3, to: 3 },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'moveToZone',
                objects: {
                  kind: 'each',
                  filter: { zone: 'graveyard', types: ['land'], controller: 'you' },
                },
                to: 'battlefield',
                controller: 'you',
              },
              {
                kind: 'moveToZone',
                objects: { kind: 'each', filter: { zone: 'graveyard', controller: 'you' } },
                to: 'library',
              },
              { kind: 'shuffle', player: { kind: 'you' } },
            ],
          },
        },
      ],
    },
  ],
  [
    'Tireless Provisioner',
    'Landfall \u2014 Whenever a land you control enters, create a Food token or a Treasure token.',
    'creature',
    ['Elf', 'Scout'],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'landfall' },
          effect: {
            kind: 'chooseOne',
            options: [
              {
                label: 'create a Food token',
                effect: {
                  kind: 'createToken',
                  token: { kind: 'preset', preset: 'Food' },
                  count: 1,
                },
              },
              {
                label: 'create a Treasure token',
                effect: {
                  kind: 'createToken',
                  token: { kind: 'preset', preset: 'Treasure' },
                  count: 1,
                },
              },
            ],
          },
        },
      ],
    },
  ],
];

describe('the twelve real cards of the slice read as the engine runs them (D-175, D-176)', () => {
  test.each(REAL)('%s', (_name, text, type, subtypes, expected) => {
    const parsed = readAll(text, type, subtypes);
    if (expected.abilities !== undefined) expect(parsed.abilities).toEqual(expected.abilities);
    else expect(parsed.abilities).toEqual([]);
    if (expected.spell !== undefined) expect(parsed.spell).toEqual(expected.spell);
    else expect(parsed.spell ?? undefined).toBeUndefined();
  });
});

const SIBLINGS: readonly (readonly [
  string,
  FaceType,
  readonly string[],
  { abilities?: unknown; spell?: unknown },
])[] = [
  [
    'When ~ dies, create a 2/2 black Zombie creature token with "{T}: You gain 1 life."',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: {
            kind: 'createToken',
            token: {
              kind: 'custom',
              definition: {
                name: 'Zombie',
                manaCost: null,
                supertypes: [],
                types: ['creature'],
                subtypes: ['Zombie'],
                colors: ['B'],
                power: 2,
                toughness: 2,
                loyalty: null,
                defense: null,
                oracleText: '{T}: You gain 1 life.',
                abilities: [
                  {
                    kind: 'activated',
                    cost: [{ kind: 'tap' }],
                    effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
                  },
                ],
              },
            },
            count: 1,
          },
        },
      ],
    },
  ],
  [
    'Create a 1/1 white Spirit creature token with flying and "When ~ dies, draw a card."',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: 'Spirit',
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Spirit'],
              colors: ['W'],
              power: 1,
              toughness: 1,
              loyalty: null,
              defense: null,
              oracleText: 'Flying\nWhen this creature dies, draw a card.',
              abilities: [
                { kind: 'keyword', keyword: { kind: 'flying' } },
                {
                  kind: 'triggered',
                  trigger: { kind: 'dies', what: { kind: 'this' } },
                  effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
                },
              ],
            },
          },
          count: 1,
        },
      },
    },
  ],
  [
    'Create a 1/1 colorless Servo artifact creature token. It has "Sacrifice ~: Add {C}."',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: 'Servo',
              manaCost: null,
              supertypes: [],
              types: ['artifact', 'creature'],
              subtypes: ['Servo'],
              colors: [],
              power: 1,
              toughness: 1,
              loyalty: null,
              defense: null,
              oracleText: 'Sacrifice this creature: Add {C}.',
              abilities: [
                {
                  kind: 'mana',
                  cost: [{ kind: 'sacrifice', what: { kind: 'this' } }],
                  production: { kind: 'fixed', mana: ['C'] },
                },
              ],
            },
          },
          count: 1,
        },
      },
    },
  ],
  [
    'When ~ dies, create a number of Treasure tokens equal to its power.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: {
            kind: 'createToken',
            token: { kind: 'preset', preset: 'Treasure' },
            count: { kind: 'powerOf', of: { kind: 'triggerSubject' } },
          },
        },
      ],
    },
  ],
  [
    'When ~ dies, create a number of 1/1 white Soldier creature tokens equal to its power.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: {
            kind: 'createToken',
            token: {
              kind: 'custom',
              definition: {
                name: 'Soldier',
                manaCost: null,
                supertypes: [],
                types: ['creature'],
                subtypes: ['Soldier'],
                colors: ['W'],
                power: 1,
                toughness: 1,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities: [],
              },
            },
            count: { kind: 'powerOf', of: { kind: 'triggerSubject' } },
          },
        },
      ],
    },
  ],
  [
    'Whenever a land you control enters, you may create a Food token or a Treasure token.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'landfall' },
          effect: {
            kind: 'chooseOne',
            options: [
              {
                label: 'create a Food token',
                effect: {
                  kind: 'createToken',
                  token: { kind: 'preset', preset: 'Food' },
                  count: 1,
                },
              },
              {
                label: 'create a Treasure token',
                effect: {
                  kind: 'createToken',
                  token: { kind: 'preset', preset: 'Treasure' },
                  count: 1,
                },
              },
            ],
          },
          optional: true,
        },
      ],
    },
  ],
  [
    'When ~ enters, enchanted creature gets +2/+2 until end of turn.',
    'enchantment',
    ['Aura'],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'modifyPt',
            objects: { kind: 'attached' },
            power: 2,
            toughness: 2,
            duration: 'untilEndOfTurn',
          },
        },
      ],
    },
  ],
  [
    'Target creature gets +2/+2 until end of turn.\nThat creature gains lifelink until end of turn.',
    'instant',
    [],
    {
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'modifyPt',
              objects: { kind: 'target', id: 't1' },
              power: 2,
              toughness: 2,
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'grantKeyword',
              objects: { kind: 'target', id: 't1' },
              keyword: { kind: 'lifelink' },
              duration: 'untilEndOfTurn',
            },
          ],
        },
      },
    },
  ],
  [
    'Equip\u2014{1}{W}, Pay 3 life.',
    'artifact',
    ['Equipment'],
    {
      abilities: [
        {
          kind: 'keyword',
          keyword: {
            kind: 'equip',
            cost: [
              { kind: 'mana', symbols: ['1', 'W'] },
              { kind: 'payLife', amount: 3 },
            ],
          },
        },
      ],
    },
  ],
  [
    'Return a creature card from your graveyard to your hand.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
          },
          to: 'hand',
        },
      },
    },
  ],
  [
    'When ~ enters, you may return a land card from your graveyard to your hand.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'moveToZone',
            objects: {
              kind: 'choose',
              filter: { zone: 'graveyard', types: ['land'], controller: 'you' },
            },
            to: 'hand',
          },
          optional: true,
        },
      ],
    },
  ],
  [
    'Shuffle your graveyard into your library.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'moveToZone',
              objects: { kind: 'each', filter: { zone: 'graveyard', controller: 'you' } },
              to: 'library',
            },
            { kind: 'shuffle', player: { kind: 'you' } },
          ],
        },
      },
    },
  ],
  [
    "Destroy target creature. ~ deals 3 damage to that creature's controller.",
    'sorcery',
    [],
    {
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
            {
              kind: 'dealDamage',
              amount: 3,
              to: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
            },
          ],
        },
      },
    },
  ],
  [
    "Whenever ~ attacks, return it to its owner's hand.",
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
        },
      ],
    },
  ],
  [
    'Flying\nChoose a Background',
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'keyword', keyword: { kind: 'chooseBackground' } },
      ],
    },
  ],
  [
    'Create a 1/1 white Soldier creature token with "When ~ dies, you gain 1 life." Then draw a card.',
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
                  name: 'Soldier',
                  manaCost: null,
                  supertypes: [],
                  types: ['creature'],
                  subtypes: ['Soldier'],
                  colors: ['W'],
                  power: 1,
                  toughness: 1,
                  loyalty: null,
                  defense: null,
                  oracleText: 'When this creature dies, you gain 1 life.',
                  abilities: [
                    {
                      kind: 'triggered',
                      trigger: { kind: 'dies', what: { kind: 'this' } },
                      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
                    },
                  ],
                },
              },
              count: 1,
            },
            { kind: 'draw', player: { kind: 'you' }, count: 1 },
          ],
        },
      },
    },
  ],
];

describe('the siblings of the new rules read', () => {
  test.each(SIBLINGS)('%s', (text, type, subtypes, expected) => {
    const parsed = readAll(text, type, subtypes);
    const shape = JSON.parse(
      JSON.stringify({
        ...(parsed.abilities.length > 0 ? { abilities: parsed.abilities } : {}),
        ...(parsed.spell === null || parsed.spell === undefined ? {} : { spell: parsed.spell }),
      }),
    );
    expect(shape).toEqual(expected);
  });
});

// ---- Refusals: a line that says more or less than the rule reads is flagged, never half run

const REFUSED: readonly (readonly [string, FaceType, readonly string[], string])[] = [
  [
    'Create a 1/1 white Soldier creature token with "This creature gets +1/+1 for each artifact you control."',
    'sorcery',
    [],
    'unrecognised',
  ],
  ['It has "Sacrifice ~: Add {C}."', 'sorcery', [], 'notRunnable'],
  ['Create a Clue token. It has "Sacrifice ~: Draw a card."', 'sorcery', [], 'notRunnable'],
  ["Destroy target creature. Return it to its owner's hand.", 'sorcery', [], 'notRunnable'],
  ["Whenever you cast a spell, return it to its owner's hand.", 'creature', [], 'notRunnable'],
  ['Create a Food token or two Treasure tokens.', 'sorcery', [], 'unrecognised'],
  ['When ~ dies, create a number of tapped Treasure tokens.', 'creature', [], 'unrecognised'],
  [
    'Target creature gets +2/+2 until end of turn.\nIt gains trample until end of turn.',
    'instant',
    [],
    'unboundReference',
  ],
  [
    'Draw a card.\nThat creature gains trample until end of turn.',
    'instant',
    [],
    'unboundReference',
  ],
  ['Equip\u2014{2}, Sacrifice a creature', 'artifact', ['Equipment'], 'unrecognised'],
  ['Return two creature cards from your graveyard to your hand.', 'sorcery', [], 'unrecognised'],
  ["Shuffle target player's graveyard into their library.", 'sorcery', [], 'unrecognised'],
  [
    'Create a 1/1 white Soldier creature token. It has "Sacrifice ~: Add {C}." Draw a card.',
    'sorcery',
    [],
    'unrecognised',
  ],
  [
    'Create a 2/2 red Dragon creature token with "{R}: ~ gets +1/+0 until end of turn." and haste.',
    'sorcery',
    [],
    'unrecognised',
  ],
  [
    'Create a 1/1 white Soldier creature token. That creature has "Sacrifice ~: Add {C}."',
    'sorcery',
    [],
    'unrecognised',
  ],
];

describe('the lines the new rules must not read are flagged', () => {
  test.each(REFUSED)('%s', (text, type, subtypes, reason) => {
    expect(drop(text, type, subtypes).reason).toBe(reason);
  });
});

// ---- The words of the text

describe('"this token" in the quotes of a token is the token (CR 111.4)', () => {
  const NAME = { name: 'SYNTHETIC Card', legendary: false };

  test('it is rewritten to ~ inside quotes, and only there', () => {
    expect(
      normalizeOracleText(
        'Create a 1/1 Pest token with "When this token dies, you gain 1 life." Sacrifice this token.',
        NAME,
      ),
    ).toBe('Create a 1/1 Pest token with "When ~ dies, you gain 1 life." Sacrifice this token.');
  });

  test('a quote inside a quote is rewritten too', () => {
    expect(
      normalizeOracleText(
        `Create a Dragon token with "When this token dies, create a token with '{R}: This token gets +1/+0 until end of turn.'"`,
        NAME,
      ),
    ).toBe(
      `Create a Dragon token with "When ~ dies, create a token with '{R}: ~ gets +1/+0 until end of turn.'"`,
    );
  });
});

describe('the end of a sentence that ends with an ability in quotes', () => {
  test('the period inside the closing quote ends it, once the quote is the last thing', () => {
    const parsed = readAll(
      'At the beginning of each upkeep, create a 1/1 black and green Pest creature token with "When this token dies, you gain 1 life."',
      'creature',
    );
    expect(parsed.abilities).toHaveLength(1);
  });

  test('a quote that is not an ability the grammar reads leaves the line unread', () => {
    expect(
      drop(
        'Create a 1/1 white Soldier creature token with "Sacrifice this token: You gain 1 life".',
        'sorcery',
      ).reason,
    ).toBe('unrecognised');
  });
});
