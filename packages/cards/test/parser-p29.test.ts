// Stage P29 (M11): the filtered-subjects slice of the engine (D-133, ENGINE_VERSION 29) read by the grammar. The lines are the real
// wordings of the blockers of the owner's five decks (reports/decks.md, parser version 33), whose numbers the report keeps as N:
// the numbers written here are SYNTHETIC, the wording around them is the report's. Every other line is SYNTHETIC: the variants of
// the same families that the report does not show, the near misses and the lines the grammar must not read. The engine runs what
// is lowered in convert-grammar-engine-p29.test.ts; a missing engine feature is named in parser-p29-needs.test.ts; each line as a
// whole card is in convert-grammar-corpus-p29.test.ts; the creature types of the table of CR 205.3m (and their plurals) are in
// parser-p29-types.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

/** The real lines of the report (numbers SYNTHETIC) and the engine node each one reads as: abilities or the text of a spell. */
const REAL: readonly (readonly [string, FaceType, { abilities?: unknown; spell?: unknown }])[] = [
  [
    'Whenever you cast a noncreature or Dragon spell, ~ deals 1 damage to each opponent.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: {
            kind: 'castSpell',
            filter: {
              stackKind: 'spell',
              anyOf: [{ notTypes: ['creature'] }, { subtypes: ['Dragon'] }],
            },
            by: 'you',
          },
          effect: { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } },
        },
      ],
    },
  ],
  [
    "Whenever ~ or another artifact you control enters, put a +1/+1 counter on ~. It can't be blocked this turn.",
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
              {
                kind: 'restrict',
                objects: { kind: 'this' },
                restriction: 'cantBeBlocked',
                duration: 'untilEndOfTurn',
              },
            ],
          },
        },
        {
          kind: 'triggered',
          trigger: {
            kind: 'entersBattlefield',
            what: { types: ['artifact'], other: true, controller: 'you' },
          },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
              {
                kind: 'restrict',
                objects: { kind: 'this' },
                restriction: 'cantBeBlocked',
                duration: 'untilEndOfTurn',
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Whenever a Dragon you control enters, put a +1/+1 counter on ~. Until end of turn, ~ becomes a Dragon in addition to his other types and gains flying.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { subtypes: ['Dragon'], controller: 'you' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
              {
                kind: 'setTypes',
                objects: { kind: 'this' },
                subtypes: ['Dragon'],
                additive: true,
                duration: 'untilEndOfTurn',
              },
              {
                kind: 'grantKeyword',
                objects: { kind: 'this' },
                keyword: { kind: 'flying' },
                duration: 'untilEndOfTurn',
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Other Zombie creatures get +1/+1.',
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], subtypes: ['Zombie'] },
              other: true,
            },
            power: 1,
            toughness: 1,
          },
        },
      ],
    },
  ],
  [
    'Skeletons you control and other Zombies you control get +1/+1 and have deathtouch.',
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: {
              kind: 'filter',
              filter: {
                anyOf: [
                  { subtypes: ['Skeleton'], controller: 'you' },
                  { subtypes: ['Zombie'], other: true, controller: 'you' },
                ],
              },
            },
            power: 1,
            toughness: 1,
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: {
              kind: 'filter',
              filter: {
                anyOf: [
                  { subtypes: ['Skeleton'], controller: 'you' },
                  { subtypes: ['Zombie'], other: true, controller: 'you' },
                ],
              },
            },
            keyword: { kind: 'deathtouch' },
          },
        },
      ],
    },
  ],
  [
    '{2}{B}, {T}: All Zombies gain menace until end of turn.',
    'creature',
    {
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['2', 'B'] }, { kind: 'tap' }],
          effect: {
            kind: 'grantKeyword',
            objects: { kind: 'each', filter: { zone: 'battlefield', subtypes: ['Zombie'] } },
            keyword: { kind: 'menace' },
            duration: 'untilEndOfTurn',
          },
        },
      ],
    },
  ],
  [
    'Whenever ~ attacks, each creature you control with power 4 or greater gets +1/+1 and gains trample until end of turn.',
    'creature',
    {
      abilities: [
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
    '{R}: Dragons you control get +1/+1 until end of turn.',
    'creature',
    {
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['R'] }],
          effect: {
            kind: 'modifyPt',
            objects: {
              kind: 'each',
              filter: { zone: 'battlefield', subtypes: ['Dragon'], controller: 'you' },
            },
            power: 1,
            toughness: 1,
            duration: 'untilEndOfTurn',
          },
        },
      ],
    },
  ],
  [
    'Whenever a Dragon you control becomes the target of a spell or ability an opponent controls, ~ deals 3 damage to that player.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: {
            kind: 'becomesTarget',
            what: { subtypes: ['Dragon'], controller: 'you' },
            by: 'opponent',
          },
          effect: { kind: 'dealDamage', amount: 3, to: { kind: 'triggerPlayer' } },
        },
      ],
    },
  ],
  [
    'Whenever a creature attacks you or a planeswalker you control, investigate.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { types: ['creature'] }, at: 'youOrPlaneswalkers' },
          effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' }, count: 1 },
        },
      ],
    },
  ],
  [
    "Whenever a creature attacks you or a planeswalker you control, that creature's controller loses 1 life.",
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { types: ['creature'] }, at: 'youOrPlaneswalkers' },
          effect: {
            kind: 'loseLife',
            player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
            amount: 1,
          },
        },
      ],
    },
  ],
  [
    'Whenever a creature you control with flying enters, it gains haste until end of turn.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: {
            kind: 'entersBattlefield',
            what: { types: ['creature'], keywords: ['flying'], controller: 'you' },
          },
          effect: {
            kind: 'grantKeyword',
            objects: { kind: 'triggerSubject' },
            keyword: { kind: 'haste' },
            duration: 'untilEndOfTurn',
          },
        },
      ],
    },
  ],
  [
    'Whenever a nontoken creature you control dies, create a 2/2 black Zombie creature token.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { types: ['creature'], token: false, controller: 'you' } },
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
                oracleText: '',
                abilities: [],
              },
            },
            count: 1,
          },
        },
      ],
    },
  ],
  [
    'Whenever a nontoken creature you control dies, ~ deals 1 damage to you and you draw a card.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { types: ['creature'], token: false, controller: 'you' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'dealDamage', amount: 1, to: { kind: 'you' } },
              { kind: 'draw', player: { kind: 'you' }, count: 1 },
            ],
          },
        },
      ],
    },
  ],
  [
    'Whenever an opponent draws a card, that player loses 1 life.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'drawn', who: 'opponent' },
          effect: { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
        },
      ],
    },
  ],
  [
    'Whenever another nontoken creature you control enters, put a +1/+1 counter on it. It gains haste until end of turn.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: {
            kind: 'entersBattlefield',
            what: { types: ['creature'], token: false, other: true, controller: 'you' },
          },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'addCounters',
                objects: { kind: 'triggerSubject' },
                counter: '+1/+1',
                count: 1,
              },
              {
                kind: 'grantKeyword',
                objects: { kind: 'triggerSubject' },
                keyword: { kind: 'haste' },
                duration: 'untilEndOfTurn',
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Whenever ~ deals combat damage to a player, that player discards a card and you create a tapped 2/2 black Zombie creature token.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'discard', player: { kind: 'triggerPlayer' }, count: 1 },
              {
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
                    oracleText: '',
                    abilities: [],
                  },
                },
                count: 1,
                tapped: true,
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Whenever ~ is dealt damage, draw a card.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dealtDamage', what: { kind: 'this' } },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    },
  ],
  [
    'Whenever ~ or another Zombie enters, all non-Zombie creatures get -1/-1 until end of turn.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'modifyPt',
            objects: {
              kind: 'each',
              filter: { zone: 'battlefield', types: ['creature'], notSubtypes: ['Zombie'] },
            },
            power: -1,
            toughness: -1,
            duration: 'untilEndOfTurn',
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { subtypes: ['Zombie'], other: true } },
          effect: {
            kind: 'modifyPt',
            objects: {
              kind: 'each',
              filter: { zone: 'battlefield', types: ['creature'], notSubtypes: ['Zombie'] },
            },
            power: -1,
            toughness: -1,
            duration: 'untilEndOfTurn',
          },
        },
      ],
    },
  ],
  [
    'Whenever ~ or another nontoken Zombie you control dies, create a 2/2 black Zombie creature token.',
    'creature',
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
                oracleText: '',
                abilities: [],
              },
            },
            count: 1,
          },
        },
        {
          kind: 'triggered',
          trigger: {
            kind: 'dies',
            what: { subtypes: ['Zombie'], token: false, other: true, controller: 'you' },
          },
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
                oracleText: '',
                abilities: [],
              },
            },
            count: 1,
          },
        },
      ],
    },
  ],
  [
    'Whenever a nontoken creature you control dies, investigate.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { types: ['creature'], token: false, controller: 'you' } },
          effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' }, count: 1 },
        },
      ],
    },
  ],
  [
    'Whenever another nontoken Dragon you control enters, create a 4/4 red Dragon creature token with flying.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: {
            kind: 'entersBattlefield',
            what: { subtypes: ['Dragon'], token: false, other: true, controller: 'you' },
          },
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
                power: 4,
                toughness: 4,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
              },
            },
            count: 1,
          },
        },
      ],
    },
  ],
  [
    'Whenever you cast a colorless spell, you gain 1 life.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: {
            kind: 'castSpell',
            filter: { colorless: true, stackKind: 'spell' },
            by: 'you',
          },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        },
      ],
    },
  ],
  [
    'Whenever ~ is dealt damage, you gain that much life.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dealtDamage', what: { kind: 'this' } },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'triggerDamage' } },
        },
      ],
    },
  ],
  [
    'As long as you control your commander, ~ gets +2/+2 and creatures you control have vigilance.',
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 2, toughness: 2 },
          condition: { kind: 'controlCommander', yours: true },
        },
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
            keyword: { kind: 'vigilance' },
          },
          condition: { kind: 'controlCommander', yours: true },
        },
      ],
    },
  ],
  [
    'As long as you have at least 7 life more than your starting life total, creatures you control get +1/+1.',
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
            power: 1,
            toughness: 1,
          },
          condition: {
            kind: 'lifeTotal',
            compare: { cmp: 'atLeast', value: 7 },
            aboveStarting: true,
          },
        },
      ],
    },
  ],
  [
    "Each creature you control with power 4 or greater can't be blocked by more than one creature.",
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'restriction',
            subject: {
              kind: 'filter',
              filter: {
                types: ['creature'],
                controller: 'you',
                power: { cmp: 'atLeast', value: 4 },
              },
            },
            restriction: 'cantBeBlockedByMoreThanOne',
          },
        },
      ],
    },
  ],
  [
    'Nontoken creatures you control get +1/+1 and have vigilance.',
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], token: false, controller: 'you' },
            },
            power: 1,
            toughness: 1,
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], token: false, controller: 'you' },
            },
            keyword: { kind: 'vigilance' },
          },
        },
      ],
    },
  ],
  [
    'Other nontoken creatures you control get +1/+1 and have vigilance.',
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], token: false, controller: 'you' },
              other: true,
            },
            power: 1,
            toughness: 1,
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], token: false, controller: 'you' },
              other: true,
            },
            keyword: { kind: 'vigilance' },
          },
        },
      ],
    },
  ],
  [
    "~ has hexproof as long as it's untapped.",
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'this' },
            keyword: { kind: 'hexproof' },
          },
          condition: { kind: 'thisMatches', filter: { tapped: false } },
        },
      ],
    },
  ],
  [
    'As long as you control 3 or more artifacts, ~ has hexproof.',
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'this' },
            keyword: { kind: 'hexproof' },
          },
          condition: { kind: 'controlsAtLeast', filter: { types: ['artifact'] }, count: 3 },
        },
      ],
    },
  ],
  [
    "As long as ~ is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {2} for each of those creatures.",
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'attackTax',
            cost: [{ kind: 'mana', symbols: ['2'] }],
            planeswalkers: true,
          },
          condition: { kind: 'thisMatches', filter: { tapped: false } },
        },
      ],
    },
  ],
  [
    'Colorless creatures you control get +1/+1.',
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], colorless: true, controller: 'you' },
            },
            power: 1,
            toughness: 1,
          },
        },
      ],
    },
  ],
  [
    '~ gets +3/+3 as long as you have 30 or more life.',
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 3, toughness: 3 },
          condition: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 30 } },
        },
      ],
    },
  ],
  [
    'Tap three untapped Zombies you control: You draw a card and lose 1 life.',
    'creature',
    {
      abilities: [
        {
          kind: 'activated',
          cost: [
            {
              kind: 'tapPermanents',
              filter: { subtypes: ['Zombie'], controller: 'you' },
              count: 3,
            },
          ],
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'draw', player: { kind: 'you' }, count: 1 },
              { kind: 'loseLife', player: { kind: 'you' }, amount: 1 },
            ],
          },
        },
      ],
    },
  ],
  [
    "Tap two untapped artifacts you control: Target creature can't be blocked this turn.",
    'creature',
    {
      abilities: [
        {
          kind: 'activated',
          cost: [
            { kind: 'tapPermanents', filter: { types: ['artifact'], controller: 'you' }, count: 2 },
          ],
          targets: [
            {
              id: 't1',
              what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
            },
          ],
          effect: {
            kind: 'restrict',
            objects: { kind: 'target', id: 't1' },
            restriction: 'cantBeBlocked',
            duration: 'untilEndOfTurn',
          },
        },
      ],
    },
  ],
  [
    'Tap two untapped artifacts you control: Draw a card.',
    'creature',
    {
      abilities: [
        {
          kind: 'activated',
          cost: [
            { kind: 'tapPermanents', filter: { types: ['artifact'], controller: 'you' }, count: 2 },
          ],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    },
  ],
  [
    '{1}, Sacrifice 2 artifacts: Draw a card.',
    'creature',
    {
      abilities: [
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['1'] },
            { kind: 'sacrifice', what: { types: ['artifact'] }, count: 2 },
          ],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    },
  ],
  [
    "{1}{B}, {T}, Sacrifice another creature: Create X 2/2 black Zombie creature tokens, where X is the sacrificed creature's power.",
    'creature',
    {
      abilities: [
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['1', 'B'] },
            { kind: 'tap' },
            { kind: 'sacrifice', what: { types: ['creature'], other: true } },
          ],
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
                oracleText: '',
                abilities: [],
              },
            },
            count: { kind: 'powerOf', of: { kind: 'sacrificedCost' } },
          },
        },
      ],
    },
  ],
  [
    'If a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie creature token.',
    'creature',
    {
      abilities: [
        {
          kind: 'replacement',
          replacement: {
            kind: 'wouldDie',
            what: { types: ['creature'], token: false, controller: 'opponent' },
            instead: 'exile',
            alsoCreate: {
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
                  oracleText: '',
                  abilities: [],
                },
              },
              count: 1,
            },
          },
        },
      ],
    },
  ],
  [
    'You may cast this card from your graveyard as long as you control a Zombie.',
    'creature',
    {
      abilities: [
        {
          kind: 'static',
          static: { kind: 'castFromGraveyard' },
          condition: { kind: 'controlsAtLeast', filter: { subtypes: ['Zombie'] }, count: 1 },
        },
      ],
    },
  ],
  [
    'When ~ enters, destroy all creatures with flying. Put a +1/+1 counter on ~ for each creature destroyed this way.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'destroy',
                objects: {
                  kind: 'each',
                  filter: { zone: 'battlefield', types: ['creature'], keywords: ['flying'] },
                },
              },
              {
                kind: 'addCounters',
                objects: { kind: 'this' },
                counter: '+1/+1',
                count: { kind: 'thisWay', what: 'destroyed' },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    '~ deals 2 damage to each non-Dragon creature.',
    'sorcery',
    {
      spell: {
        effect: {
          kind: 'dealDamage',
          amount: 2,
          to: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], notSubtypes: ['Dragon'] },
          },
        },
      },
    },
  ],
  [
    '~ deals X damage to each creature without flying and each planeswalker.',
    'sorcery',
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'dealDamage',
              amount: { kind: 'x' },
              to: {
                kind: 'each',
                filter: { zone: 'battlefield', types: ['creature'], notKeywords: ['flying'] },
              },
            },
            {
              kind: 'dealDamage',
              amount: { kind: 'x' },
              to: { kind: 'each', filter: { zone: 'battlefield', types: ['planeswalker'] } },
            },
          ],
        },
        x: true,
      },
    },
  ],
  [
    'When ~ enters, you may exile target nontoken creature.',
    'creature',
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', types: ['creature'], token: false },
              },
            },
          ],
          effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
          optional: true,
        },
      ],
    },
  ],
  [
    '{T}: Create a 4/4 white Angel creature token with flying. Activate only if you have at least 7 life more than your starting life total and only as a sorcery.',
    'creature',
    {
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'tap' }],
          effect: {
            kind: 'createToken',
            token: {
              kind: 'custom',
              definition: {
                name: 'Angel',
                manaCost: null,
                supertypes: [],
                types: ['creature'],
                subtypes: ['Angel'],
                colors: ['W'],
                power: 4,
                toughness: 4,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
              },
            },
            count: 1,
          },
          timing: 'sorcery',
          activateOnlyIf: {
            kind: 'lifeTotal',
            compare: { cmp: 'atLeast', value: 7 },
            aboveStarting: true,
          },
        },
      ],
    },
  ],
];

describe('the real lines of reports/decks.md read as the nodes of D-133', () => {
  test.each(REAL)('%s', (text, type, expected) => {
    const parsed = readAll(text, type);
    if (expected.spell !== undefined) {
      expect(parsed.spell).toEqual(expected.spell);
      expect(parsed.abilities).toEqual([]);
    } else {
      expect(parsed.abilities).toEqual(expected.abilities);
    }
  });
});

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const SUBJECT = { kind: 'triggerSubject' } as const;
const PLAYER = { kind: 'triggerPlayer' } as const;
const END = 'untilEndOfTurn' as const;

/** The first ability of a face that did not read (a permanent, unless said). */
const drop = (text: string, type: FaceType = 'creature') => dropped(text, type);

/** The abilities of a permanent line that read completely. */
const abilities = (text: string, type: FaceType = 'creature') => readAll(text, type).abilities;

/** The static abilities of "gets +N/+N" over `subject`. */
const pt = (subject: object, power: number, toughness: number, extra: object = {}) => ({
  kind: 'static',
  static: { kind: 'modifyPt', subject, power, toughness },
  ...extra,
});
const keyword = (subject: object, name: string, extra: object = {}) => ({
  kind: 'static',
  static: { kind: 'grantKeyword', subject, keyword: { kind: name } },
  ...extra,
});

describe('filter parts: nontoken, non-<type>, colorless, with and without a keyword (CR 111.1, 205.3d, 105.2c, 702)', () => {
  test.each([
    [
      'Nontoken creatures you control get +1/+1.',
      { types: ['creature'], token: false, controller: 'you' },
    ],
    [
      'Colorless creatures you control get +1/+1.',
      { types: ['creature'], colorless: true, controller: 'you' },
    ],
    [
      'Non-Zombie creatures you control get +1/+1.',
      { types: ['creature'], notSubtypes: ['Zombie'], controller: 'you' },
    ],
    [
      'Non-Time Lord creatures you control get +1/+1.',
      { types: ['creature'], notSubtypes: ['Time Lord'], controller: 'you' },
    ],
    [
      'Nontoken Wolves you control get +1/+1.',
      { subtypes: ['Wolf'], token: false, controller: 'you' },
    ],
  ])('%s', (text, filter) => {
    expect(abilities(text)).toEqual([pt({ kind: 'filter', filter }, 1, 1)]);
  });

  test.each([
    [
      'Destroy target nontoken creature.',
      { zone: 'battlefield', types: ['creature'], token: false },
    ],
    [
      'Destroy target creature with flying.',
      { zone: 'battlefield', types: ['creature'], keywords: ['flying'] },
    ],
    [
      'Destroy target creature without flying.',
      { zone: 'battlefield', types: ['creature'], notKeywords: ['flying'] },
    ],
    [
      'Destroy target colorless creature.',
      { zone: 'battlefield', types: ['creature'], colorless: true },
    ],
    [
      'Destroy target non-Zombie creature.',
      { zone: 'battlefield', types: ['creature'], notSubtypes: ['Zombie'] },
    ],
  ])('%s is a target with the part in its filter', (text, filter) => {
    expect(readAll(text, 'sorcery').spell?.targets).toEqual([
      { id: 't1', what: { kind: 'object', filter } },
    ]);
  });

  test('a keyword in the subject of a static ability is read and refused (CR 613.8: layer 6)', () => {
    for (const text of [
      'Creatures with flying you control get +1/+1.',
      'Creatures without flying you control get +1/+1.',
    ]) {
      expect(drop(text, 'enchantment')).toMatchObject({ reason: 'notRunnable' });
    }
  });

  // Stage P33 (D-149, D-150): the engine reads a keyword in the subject of a keyword grant after the effects that do not read keywords.
  test('a keyword in the subject of a keyword grant is read (CR 613.8)', () => {
    expect(readAll('All creatures with flying have haste.', 'enchantment').abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], keywords: ['flying'] } },
          keyword: { kind: 'haste' },
        },
      },
    ]);
  });

  test('a list of keywords says more than one thing and is not read', () => {
    expect(drop('Destroy target creature with flying or reach.', 'sorcery')).toMatchObject({
      stoppedAt: 'or reach.',
    });
  });

  test('"noncreature or Dragon spell": a choice of a modifier and a subtype, one spell', () => {
    expect(
      abilities('Whenever you cast a noncreature or Wizard spell, you gain 1 life.'),
    ).toMatchObject([
      {
        trigger: {
          kind: 'castSpell',
          filter: {
            stackKind: 'spell',
            anyOf: [{ notTypes: ['creature'] }, { subtypes: ['Wizard'] }],
          },
          by: 'you',
        },
      },
    ]);
    expect(
      abilities('Whenever you cast a Dragon or colorless spell, you gain 1 life.'),
    ).toMatchObject([
      {
        trigger: {
          filter: { anyOf: [{ subtypes: ['Dragon'] }, { colorless: true }] },
        },
      },
    ]);
  });
});

describe('lords: one grammar for every creature type (CR 205.3m, 611.3a, 613.4c)', () => {
  test.each([
    ['Other Zombie creatures get +1/+1.', { types: ['creature'], subtypes: ['Zombie'] }, true],
    ['Other Zombies get +1/+1.', { subtypes: ['Zombie'] }, true],
    ['Other Elves you control get +1/+1.', { subtypes: ['Elf'], controller: 'you' }, true],
    ['Other Merfolk you control get +1/+1.', { subtypes: ['Merfolk'], controller: 'you' }, true],
    ['Other Time Lords get +1/+1.', { subtypes: ['Time Lord'] }, true],
    ['Other Mice you control get +1/+1.', { subtypes: ['Mouse'], controller: 'you' }, true],
    ['Wolves you control get +1/+1.', { subtypes: ['Wolf'], controller: 'you' }, false],
    [
      'Other nontoken Goblins you control get +1/+1.',
      { subtypes: ['Goblin'], token: false, controller: 'you' },
      true,
    ],
  ])('%s', (text, filter, other) => {
    expect(abilities(text)).toEqual([
      pt({ kind: 'filter', filter, ...(other ? { other: true } : {}) }, 1, 1),
    ]);
  });

  test('"of the chosen type" is the same rule over the type the permanent chose', () => {
    const chosen = { types: ['creature'], controller: 'you', chosenType: true };
    expect(abilities('Creatures you control of the chosen type get +1/+1.', 'enchantment')).toEqual(
      [pt({ kind: 'filter', filter: chosen }, 1, 1)],
    );
    expect(
      abilities('Other creatures you control of the chosen type get +1/+1.', 'enchantment'),
    ).toEqual([pt({ kind: 'filter', filter: chosen, other: true }, 1, 1)]);
  });

  test('two groups of types are one set; "other" belongs to the group it stands before', () => {
    const members = [
      { subtypes: ['Elf'], controller: 'you' },
      { subtypes: ['Wolf'], other: true, controller: 'you' },
    ];
    const subject = { kind: 'filter', filter: { anyOf: members } };
    expect(
      abilities('Elves you control and other Wolves you control get +2/+2 and have trample.'),
    ).toEqual([pt(subject, 2, 2), keyword(subject, 'trample')]);
  });

  test('an Equipment or a group that is not about a type is not a union', () => {
    expect(
      drop('Creatures you control and other Zombies you control get +1/+1.', 'enchantment'),
    ).toMatchObject({ reason: 'unrecognised' });
    expect(drop('Other Zombie creature get +1/+1.')).toMatchObject({
      reason: 'unrecognised',
    });
    expect(drop('Nontoken creature you control get +1/+1.')).toMatchObject({
      reason: 'unrecognised',
    });
  });
});

describe('conditional static abilities (CR 611.3a, 613.8)', () => {
  const commander = { kind: 'controlCommander', yours: true };

  test('"as long as" first or last, one condition for every effect of the statement', () => {
    expect(abilities('~ gets +1/+1 and has flying as long as you control your commander.')).toEqual(
      [
        pt(THIS_SUBJECT(), 1, 1, { condition: commander }),
        keyword(THIS_SUBJECT(), 'flying', { condition: commander }),
      ],
    );
    expect(
      abilities('As long as you control your commander, ~ gets +1/+1 and has flying.'),
    ).toEqual([
      pt(THIS_SUBJECT(), 1, 1, { condition: commander }),
      keyword(THIS_SUBJECT(), 'flying', { condition: commander }),
    ]);
  });

  test('a group gets it under a count of permanents of a type of the table', () => {
    expect(
      abilities('Zombies you control get +1/+1 as long as you control three or more Zombies.'),
    ).toEqual([
      pt({ kind: 'filter', filter: { subtypes: ['Zombie'], controller: 'you' } }, 1, 1, {
        condition: { kind: 'controlsAtLeast', filter: { subtypes: ['Zombie'] }, count: 3 },
      }),
    ]);
  });

  test.each([
    ['you have 30 or more life', { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 30 } }],
    ['you have at least 30 life', { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 30 } }],
    ['you have 5 or less life', { kind: 'lifeTotal', compare: { cmp: 'atMost', value: 5 } }],
    [
      'you have at least 7 life more than your starting life total',
      { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 7 }, aboveStarting: true },
    ],
    ["it's untapped", { kind: 'thisMatches', filter: { tapped: false } }],
    ['~ is tapped', { kind: 'thisMatches', filter: { tapped: true } }],
    ['you control your commander', commander],
    ["you're the monarch", { kind: 'playerHasDesignation', player: YOU, designation: 'monarch' }],
  ])('as long as %s', (condition, expected) => {
    expect(abilities(`~ gets +1/+1 as long as ${condition}.`)).toEqual([
      pt(THIS_SUBJECT(), 1, 1, { condition: expected }),
    ]);
  });

  test('the attack tax keeps its condition', () => {
    expect(
      abilities(
        'As long as ~ is untapped, creatures can’t attack you unless their controller pays {1} for each creature they control that’s attacking you.',
      ),
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'attackTax', cost: [{ kind: 'mana', symbols: ['1'] }] },
        condition: { kind: 'thisMatches', filter: { tapped: false } },
      },
    ]);
  });

  test('a condition that names a keyword is read and refused (CR 613.8)', () => {
    expect(
      drop('As long as you control a creature with flying, ~ gets +1/+1.', 'creature'),
    ).toMatchObject({ reason: 'notRunnable' });
  });

  test('"Activate only if" and "only as a sorcery" in one sentence are one node with both', () => {
    expect(
      abilities(
        '{T}: Draw a card. Activate only if you have at least 7 life more than your starting life total and only as a sorcery.',
      ),
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: { kind: 'draw', player: YOU, count: 1 },
        timing: 'sorcery',
        activateOnlyIf: {
          kind: 'lifeTotal',
          compare: { cmp: 'atLeast', value: 7 },
          aboveStarting: true,
        },
      },
    ]);
  });

  test.each([
    ['As long as you control your commander ~ gets +1/+1.', '~ gets +1/+1.'],
    ['As long as you control a banana, ~ gets +1/+1.', 'banana, ~ gets +1/+1.'],
    ['~ gets +1/+1 as long as you have 30 life.', 'life.'],
    [
      '~ gets +1/+1 as long as you have 30 or more life and you control a Zombie.',
      'and you control a Zombie.',
    ],
    [
      'You may cast this card from your hand as long as you control a Zombie.',
      'You may cast this card from your hand as long as you control a Zombie.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(drop(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

function THIS_SUBJECT() {
  return THIS_SUBJECT_VALUE;
}
const THIS_SUBJECT_VALUE = THIS;

describe('a limit on blockers (CR 509.1b)', () => {
  test('the same words for ~ and for each creature of a kind', () => {
    expect(abilities("~ can't be blocked by more than one creature.")).toEqual([
      {
        kind: 'static',
        static: { kind: 'restriction', subject: THIS, restriction: 'cantBeBlockedByMoreThanOne' },
      },
    ]);
    expect(
      abilities("Each Zombie you control can't be blocked by more than one creature."),
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: { kind: 'filter', filter: { subtypes: ['Zombie'], controller: 'you' } },
          restriction: 'cantBeBlockedByMoreThanOne',
        },
      },
    ]);
  });

  test.each([
    ["~ can't be blocked by more than two creatures.", 'by more than two creatures.'],
    [
      "Each creature you control can't be blocked by more than one creature this turn.",
      'this turn.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(drop(text)).toMatchObject({ stoppedAt });
  });
});

describe('grants to a filter, until end of turn (CR 611.2c, 613.1f)', () => {
  const each = (filter: object) => ({ kind: 'each', filter: { zone: 'battlefield', ...filter } });

  test.each([
    ['All Zombies gain menace until end of turn.', { subtypes: ['Zombie'] }],
    ['All Time Lords gain menace until end of turn.', { subtypes: ['Time Lord'] }],
    ['Elves you control gain menace until end of turn.', { subtypes: ['Elf'], controller: 'you' }],
    [
      'Wolves you control gain menace until end of turn.',
      { subtypes: ['Wolf'], controller: 'you' },
    ],
  ])('%s', (text, filter) => {
    expect(readAll(text, 'sorcery').spell?.effect).toEqual({
      kind: 'grantKeyword',
      objects: each(filter),
      keyword: { kind: 'menace' },
      duration: END,
    });
  });

  test('each creature of a kind gets and gains in one sentence', () => {
    expect(
      readAll('Each Zombie you control gets +1/+1 and gains menace until end of turn.', 'sorcery')
        .spell?.effect,
    ).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'modifyPt',
          objects: each({ subtypes: ['Zombie'], controller: 'you' }),
          power: 1,
          toughness: 1,
          duration: END,
        },
        {
          kind: 'grantKeyword',
          objects: each({ subtypes: ['Zombie'], controller: 'you' }),
          keyword: { kind: 'menace' },
          duration: END,
        },
      ],
    });
  });

  test('creatures without flying can not block this turn: a part of the filter, no static subject', () => {
    expect(
      readAll("Creatures without flying can't block this turn.", 'sorcery').spell?.effect,
    ).toEqual({
      kind: 'restrict',
      objects: each({ types: ['creature'], notKeywords: ['flying'] }),
      restriction: 'cantBlock',
      duration: END,
    });
  });
});

describe('subjects of triggers and the player an event is about (CR 603.2, 508.1b, 120.3)', () => {
  const trigger = (text: string) => {
    const [first, ...more] = abilities(text);
    expect(more, text).toEqual([]);
    if (first?.kind !== 'triggered') throw new Error(`"${text}" is not a triggered ability`);
    return first;
  };

  test.each([
    [
      'Whenever another nontoken Time Lord you control dies, you gain 1 life.',
      {
        kind: 'dies',
        what: { subtypes: ['Time Lord'], token: false, other: true, controller: 'you' },
      },
    ],
    [
      'Whenever a creature without flying you control enters, you gain 1 life.',
      {
        kind: 'entersBattlefield',
        what: { types: ['creature'], notKeywords: ['flying'], controller: 'you' },
      },
    ],
    [
      'Whenever a creature attacks you, you gain 1 life.',
      { kind: 'attacks', what: { types: ['creature'] }, at: 'you' },
    ],
    [
      'Whenever a creature you control is dealt combat damage, you gain 1 life.',
      { kind: 'dealtDamage', what: { types: ['creature'], controller: 'you' }, combat: true },
    ],
    ['Whenever ~ is dealt damage, you gain 1 life.', { kind: 'dealtDamage', what: THIS }],
    [
      'Whenever a Mouse you control is dealt damage, you gain 1 life.',
      { kind: 'dealtDamage', what: { subtypes: ['Mouse'], controller: 'you' } },
    ],
  ])('%s', (text, event) => {
    expect(trigger(text)).toMatchObject({ trigger: event, effect: { kind: 'gainLife' } });
  });

  test.each([
    ['Whenever a player draws a card, that player loses 1 life.', { kind: 'drawn', who: 'any' }],
    [
      'Whenever an opponent draws a card, that player loses 1 life.',
      { kind: 'drawn', who: 'opponent' },
    ],
    [
      'Whenever ~ deals combat damage to an opponent, that player loses 1 life.',
      { kind: 'dealsCombatDamage', what: THIS, to: 'opponent' },
    ],
    [
      'Whenever a Dragon you control becomes the target of a spell or ability an opponent controls, that player loses 1 life.',
      { kind: 'becomesTarget', what: { subtypes: ['Dragon'], controller: 'you' }, by: 'opponent' },
    ],
  ])('%s: "that player" is the engine\'s `triggerPlayer`', (text, event) => {
    expect(trigger(text)).toMatchObject({
      trigger: event,
      effect: { kind: 'loseLife', player: PLAYER, amount: 1 },
    });
  });

  test('"that creature\'s controller" is the controller of the attacker', () => {
    expect(
      trigger("Whenever a creature attacks you, that creature's controller loses 1 life.").effect,
    ).toEqual({
      kind: 'loseLife',
      player: { kind: 'controllerOf', of: SUBJECT },
      amount: 1,
    });
  });

  test('"that much" is the damage of the event', () => {
    expect(trigger('Whenever ~ is dealt damage, you gain that much life.').effect).toEqual({
      kind: 'gainLife',
      player: YOU,
      amount: { kind: 'triggerDamage' },
    });
    expect(trigger('Whenever ~ is dealt combat damage, you lose that much life.').effect).toEqual({
      kind: 'loseLife',
      player: YOU,
      amount: { kind: 'triggerDamage' },
    });
  });

  test('"it" is the permanent that entered, for a counter and for a continuous effect', () => {
    expect(
      trigger(
        'Whenever another nontoken Zombie you control enters, put a +1/+1 counter on it. It gains menace until end of turn.',
      ).effect,
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'addCounters', objects: SUBJECT, counter: '+1/+1', count: 1 },
        { kind: 'grantKeyword', objects: SUBJECT, keyword: { kind: 'menace' }, duration: END },
      ],
    });
  });

  test.each([
    [
      'Whenever a creature attacks you or a planeswalker, investigate.',
      'you or a planeswalker, investigate.',
    ],
    [
      'Whenever ~ is dealt damage by a creature, draw a card.',
      'is dealt damage by a creature, draw a card.',
    ],
    [
      'Whenever ~ is dealt noncombat damage, draw a card.',
      'is dealt noncombat damage, draw a card.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(drop(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });

  test('the player of a death and of a combat damage that hit a creature is not an event player; the player of a step is the active player', () => {
    for (const text of [
      'Whenever a nontoken creature you control dies, that player loses 1 life.',
      'Whenever ~ deals combat damage to a creature, that player discards a card.',
    ]) {
      expect(drop(text)).toMatchObject({ reason: 'unboundReference' });
    }
    expect(
      abilities(
        "At the beginning of each opponent's upkeep, that player loses 1 life.",
        'enchantment',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'upkeep', whose: 'opponent' },
        effect: { kind: 'loseLife', player: PLAYER, amount: 1 },
      },
    ]);
  });

  test('"it" after a cast is the spell, which a counter cannot be put on', () => {
    expect(drop('Whenever you cast a creature spell, put a +1/+1 counter on it.')).toMatchObject({
      reason: 'notRunnable',
    });
  });
});

describe('costs that tap or sacrifice other permanents (CR 118.3, 302.6, 701.21)', () => {
  const cost = (text: string) => {
    const [first] = abilities(text);
    if (first?.kind !== 'activated') throw new Error(`"${text}" is not an activated ability`);
    return first.cost;
  };

  test.each([
    [
      'Tap three untapped Zombies you control: Draw a card.',
      { subtypes: ['Zombie'], controller: 'you' },
      3,
    ],
    [
      'Tap two untapped Time Lords you control: Draw a card.',
      { subtypes: ['Time Lord'], controller: 'you' },
      2,
    ],
    [
      'Tap two untapped Wolves you control: Draw a card.',
      { subtypes: ['Wolf'], controller: 'you' },
      2,
    ],
    [
      'Tap an untapped creature you control: Draw a card.',
      { types: ['creature'], controller: 'you' },
      1,
    ],
    [
      'Tap another untapped creature you control: Draw a card.',
      { types: ['creature'], other: true, controller: 'you' },
      1,
    ],
    [
      'Tap two untapped nontoken artifacts you control: Draw a card.',
      { types: ['artifact'], token: false, controller: 'you' },
      2,
    ],
  ])('%s', (text, filter, count) => {
    expect(cost(text)).toEqual([{ kind: 'tapPermanents', filter, count }]);
  });

  test('a mana cost or {T} beside it is read and refused: the permanents could have been tapped for mana', () => {
    for (const text of [
      '{1}, Tap two untapped artifacts you control: Draw a card.',
      '{T}, Tap two untapped artifacts you control: Draw a card.',
    ]) {
      expect(drop(text)).toMatchObject({ reason: 'notRunnable' });
    }
  });

  test('"Sacrifice two artifacts" has a count; "where X is the sacrificed creature\'s power" reads the cost', () => {
    expect(cost('{1}, Sacrifice three Zombies: Draw a card.')).toEqual([
      { kind: 'mana', symbols: ['1'] },
      { kind: 'sacrifice', what: { subtypes: ['Zombie'] }, count: 3 },
    ]);
    const [gisa] = abilities(
      "{1}{B}, {T}, Sacrifice another creature: Create X 2/2 black Zombie creature tokens, where X is the sacrificed creature's power.",
    );
    expect(gisa).toMatchObject({
      cost: [
        { kind: 'mana', symbols: ['1', 'B'] },
        { kind: 'tap' },
        { kind: 'sacrifice', what: { types: ['creature'], other: true } },
      ],
      effect: { kind: 'createToken', count: { kind: 'powerOf', of: { kind: 'sacrificedCost' } } },
    });
    // Only "where X is ..." names it (the older "equal to its power" rules read no sacrificed creature).
    expect(
      drop("{1}, Sacrifice a creature: You gain life equal to the sacrificed creature's power."),
    ).toMatchObject({ stoppedAt: "equal to the sacrificed creature's power." });
  });

  test.each([
    ['Tap three Zombies you control: Draw a card.', 'Zombies you control: Draw a card.'],
    ['Tap three untapped Zombies: Draw a card.', ': Draw a card.'],
    [
      'Tap one untapped creature you control: Draw a card.',
      'one untapped creature you control: Draw a card.',
    ],
    [
      'Tap two untapped creatures you control with total power 4 or greater: Draw a card.',
      'with total power 4 or greater: Draw a card.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(drop(text)).toMatchObject({ stoppedAt });
  });
});

describe('a death replacement and casting from the graveyard (CR 614.1a, 700.4, 113.6b)', () => {
  const zombie = {
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
      oracleText: '',
      abilities: [],
    },
  };

  test.each([
    [
      'If a creature would die, instead exile that card.',
      { kind: 'wouldDie', what: { types: ['creature'] }, instead: 'exile' },
    ],
    [
      'If a creature would die, exile it instead.',
      { kind: 'wouldDie', what: { types: ['creature'] }, instead: 'exile' },
    ],
    [
      'If a Zombie you control would die, instead exile that card.',
      { kind: 'wouldDie', what: { subtypes: ['Zombie'], controller: 'you' }, instead: 'exile' },
    ],
    [
      'If a nontoken Time Lord would die, instead exile that card.',
      { kind: 'wouldDie', what: { subtypes: ['Time Lord'], token: false }, instead: 'exile' },
    ],
    [
      'If a nontoken creature an opponent controls would die, instead exile that card and create two 2/2 black Zombie creature tokens.',
      {
        kind: 'wouldDie',
        what: { types: ['creature'], token: false, controller: 'opponent' },
        instead: 'exile',
        alsoCreate: { token: zombie, count: 2 },
      },
    ],
  ])('%s', (text, replacement) => {
    expect(abilities(text)).toEqual([{ kind: 'replacement', replacement }]);
  });

  test.each([
    ['If a land would die, instead exile that card.', 'would die, instead exile that card.'],
    [
      'If a creature would be put into a graveyard from the battlefield, instead exile that card.',
      'would be put into a graveyard from the battlefield, instead exile that card.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(drop(text)).toMatchObject({ stoppedAt });
  });

  test('a card casts itself from the graveyard, with a condition or without', () => {
    expect(abilities('You may cast this card from your graveyard.')).toEqual([
      { kind: 'static', static: { kind: 'castFromGraveyard' } },
    ]);
    expect(
      abilities('You may cast this card from your graveyard as long as you control a Time Lord.'),
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'castFromGraveyard' },
        condition: { kind: 'controlsAtLeast', filter: { subtypes: ['Time Lord'] }, count: 1 },
      },
    ]);
  });
});

describe('becoming a creature type in addition to the others, and "it" that cannot be blocked (CR 205.1b, 509.1b)', () => {
  test('a type of two words and keywords, the duration first', () => {
    expect(
      abilities(
        'Whenever ~ attacks, until end of turn, ~ becomes a Time Lord in addition to its other types and gains flying and trample.',
      ),
    ).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'setTypes', subtypes: ['Time Lord'], additive: true, duration: END },
            { kind: 'grantKeyword', keyword: { kind: 'flying' }, duration: END },
            { kind: 'grantKeyword', keyword: { kind: 'trample' }, duration: END },
          ],
        },
      },
    ]);
  });

  test('"it can\'t be blocked this turn" is the source or the permanent that entered', () => {
    expect(abilities("Whenever ~ attacks, it can't be blocked this turn.")).toMatchObject([
      { effect: { kind: 'restrict', objects: THIS, restriction: 'cantBeBlocked', duration: END } },
    ]);
    expect(
      abilities("Whenever another Zombie you control enters, it can't be blocked this turn."),
    ).toMatchObject([
      {
        effect: { kind: 'restrict', objects: SUBJECT, restriction: 'cantBeBlocked', duration: END },
      },
    ]);
  });
});
