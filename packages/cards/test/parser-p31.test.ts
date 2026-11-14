// Stage P31 (M15): the Artifacts slice of the engine (D-139, ENGINE_VERSION 31) read by the grammar (D-140). The lines of `REAL` are the
// real Oracle text of the twenty cards that the golden corpus added for the Artifacts precon (packages/cards/test/fixtures/corpus/
// golden.jsonl, the last lines), each with the node shape of docs/MECHANICS.md, "The Artifacts slice (D-139)"; every other line is
// SYNTHETIC: the same shapes over other types, numbers and filters, the near misses and the lines the grammar must not read. The engine
// runs what is lowered in convert-grammar-engine-p31.test.ts; a missing engine feature is named in parser-p31-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, read, readAll } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

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
    'Nettlecyst',
    'Living weapon (When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this to it.)\nEquipped creature gets +1/+1 for each artifact and/or enchantment you control.\nEquip {2}',
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
            power: {
              kind: 'countOf',
              filter: {
                controller: 'you',
                anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
              },
            },
            toughness: {
              kind: 'countOf',
              filter: {
                controller: 'you',
                anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
              },
            },
          },
        },
        { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['2'] }] } },
      ],
    },
  ],
  [
    'Padeem, Consul of Innovation',
    "Artifacts you control have hexproof. (They can't be the targets of spells or abilities your opponents control.)\nAt the beginning of your upkeep, if you control the artifact with the greatest mana value or tied for the greatest mana value, draw a card.",
    'creature',
    ['Vedalken', 'Artificer'],
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'filter', filter: { types: ['artifact'], controller: 'you' } },
            keyword: { kind: 'hexproof' },
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'upkeep', whose: 'you' },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          interveningIf: {
            kind: 'controlsGreatest',
            filter: { types: ['artifact'] },
            stat: 'manaValue',
          },
        },
      ],
    },
  ],
  [
    'All Is Dust',
    'Each player sacrifices all permanents they control that are one or more colors.',
    'sorcery',
    ['Eldrazi'],
    {
      spell: {
        effect: {
          kind: 'sacrifice',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', colorCount: { cmp: 'atLeast', value: 1 } },
          },
        },
      },
    },
  ],
  [
    'Soul-Guide Lantern',
    "When this artifact enters, exile target card from a graveyard.\n{T}, Sacrifice this artifact: Exile each opponent's graveyard.\n{1}, {T}, Sacrifice this artifact: Draw a card.",
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
          effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
        },
        {
          kind: 'activated',
          cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
          effect: {
            kind: 'exile',
            objects: {
              kind: 'each',
              filter: { zone: 'graveyard', owner: { kind: 'eachOpponent' } },
            },
          },
        },
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['1'] },
            { kind: 'tap' },
            { kind: 'sacrifice', what: { kind: 'this' } },
          ],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    },
  ],
  [
    'Thopter Spy Network',
    'At the beginning of your upkeep, if you control an artifact, create a 1/1 colorless Thopter artifact creature token with flying.\nWhenever one or more artifact creatures you control deal combat damage to a player, draw a card.',
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
                name: 'Thopter',
                manaCost: null,
                supertypes: [],
                types: ['artifact', 'creature'],
                subtypes: ['Thopter'],
                colors: [],
                power: 1,
                toughness: 1,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
              },
            },
            count: 1,
          },
          interveningIf: { kind: 'controlsAtLeast', filter: { types: ['artifact'] }, count: 1 },
        },
        {
          kind: 'triggered',
          trigger: {
            kind: 'combatDamageBatch',
            what: { types: ['artifact', 'creature'], controller: 'you' },
            to: 'player',
          },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    },
  ],
  [
    'Steel Hellkite',
    'Flying\n{2}: This creature gets +1/+0 until end of turn.\n{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by this creature this turn. Activate only once each turn.',
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['2'] }],
          effect: {
            kind: 'modifyPt',
            objects: { kind: 'this' },
            power: 1,
            toughness: 0,
            duration: 'untilEndOfTurn',
          },
        },
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['X'] }],
          effect: {
            kind: 'destroy',
            objects: {
              kind: 'each',
              filter: {
                zone: 'battlefield',
                notTypes: ['land'],
                manaValueX: true,
                controllerDealtDamageBySource: true,
              },
            },
          },
          oncePerTurn: true,
        },
      ],
    },
  ],
  [
    'Forsaken Monument',
    'Colorless creatures you control get +2/+2.\nWhenever you tap a permanent for {C}, add an additional {C}.\nWhenever you cast a colorless spell, you gain 2 life.',
    'artifact',
    [],
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
            power: 2,
            toughness: 2,
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'tappedForMana', what: {}, by: 'you', mana: 'C' },
          effect: { kind: 'addMana', mana: { kind: 'fixed', mana: ['C'] } },
        },
        {
          kind: 'triggered',
          trigger: {
            kind: 'castSpell',
            filter: { colorless: true, stackKind: 'spell' },
            by: 'you',
          },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
        },
      ],
    },
  ],
  [
    'Aetherize',
    "Return all attacking creatures to their owner's hand.",
    'instant',
    [],
    {
      spell: {
        effect: {
          kind: 'moveToZone',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], attacking: true },
          },
          to: 'hand',
        },
      },
    },
  ],
  [
    'Mazemind Tome',
    '{T}, Put a page counter on this artifact: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\n{2}, {T}, Put a page counter on this artifact: Draw a card.\nWhen there are four or more page counters on this artifact, exile it. If you do, you gain 4 life.',
    'artifact',
    ['Book'],
    {
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'tap' }, { kind: 'putCounters', counter: 'page', count: 1 }],
          effect: { kind: 'scry', count: 1 },
        },
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['2'] },
            { kind: 'tap' },
            { kind: 'putCounters', counter: 'page', count: 1 },
          ],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
        {
          kind: 'triggered',
          trigger: {
            kind: 'state',
            condition: {
              kind: 'amountIs',
              amount: { kind: 'countersOn', of: { kind: 'this' }, counter: 'page' },
              compare: { cmp: 'atLeast', value: 4 },
            },
          },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'exile', objects: { kind: 'this' } },
              {
                kind: 'conditional',
                condition: { kind: 'didPrevious' },
                effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 4 },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Thirst for Knowledge',
    'Draw three cards. Then discard two cards unless you discard an artifact card.',
    'instant',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: { kind: 'you' }, count: 3 },
            { kind: 'discard', player: { kind: 'you' }, count: 2, unless: { types: ['artifact'] } },
          ],
        },
      },
    },
  ],
  [
    "Nevinyrral's Disk",
    'This artifact enters tapped.\n{1}, {T}: Destroy all artifacts, creatures, and enchantments.',
    'artifact',
    [],
    {
      abilities: [
        { kind: 'replacement', replacement: { kind: 'entersTapped' } },
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
          effect: {
            kind: 'destroy',
            objects: {
              kind: 'each',
              filter: {
                zone: 'battlefield',
                anyOf: [
                  { types: ['artifact'] },
                  { types: ['creature'] },
                  { types: ['enchantment'] },
                ],
              },
            },
          },
        },
      ],
    },
  ],
  [
    'Graaz, Unstoppable Juggernaut',
    "Juggernauts you control attack each combat if able.\nJuggernauts you control can't be blocked by Walls.\nOther creatures you control have base power and toughness 5/3 and are Juggernauts in addition to their other creature types.",
    'creature',
    ['Juggernaut'],
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'restriction',
            subject: { kind: 'filter', filter: { subtypes: ['Juggernaut'], controller: 'you' } },
            restriction: 'attacksEachCombat',
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'cantBeBlockedBy',
            subject: { kind: 'filter', filter: { subtypes: ['Juggernaut'], controller: 'you' } },
            blockers: { subtypes: ['Wall'] },
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'setPt',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], controller: 'you' },
              other: true,
            },
            power: 5,
            toughness: 3,
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'setTypes',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], controller: 'you' },
              other: true,
            },
            additive: true,
            subtypes: ['Juggernaut'],
          },
        },
      ],
    },
  ],
  [
    'Myr Battlesphere',
    "When this creature enters, create four 1/1 colorless Myr artifact creature tokens.\nWhenever this creature attacks, you may tap X untapped Myr you control. If you do, this creature gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking.",
    'creature',
    ['Myr', 'Construct'],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'createToken',
            token: {
              kind: 'custom',
              definition: {
                name: 'Myr',
                manaCost: null,
                supertypes: [],
                types: ['artifact', 'creature'],
                subtypes: ['Myr'],
                colors: [],
                power: 1,
                toughness: 1,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities: [],
              },
            },
            count: 4,
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'tap',
                objects: {
                  kind: 'choose',
                  filter: { subtypes: ['Myr'], controller: 'you' },
                  anyNumber: true,
                },
              },
              {
                kind: 'conditional',
                condition: { kind: 'didPrevious' },
                effect: {
                  kind: 'sequence',
                  effects: [
                    {
                      kind: 'modifyPt',
                      objects: { kind: 'this' },
                      power: { kind: 'thisWay', what: 'tapped' },
                      toughness: 0,
                      duration: 'untilEndOfTurn',
                    },
                    {
                      kind: 'dealDamage',
                      amount: { kind: 'thisWay', what: 'tapped' },
                      to: { kind: 'attackedBy', of: { kind: 'this' } },
                    },
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
    "Tamiyo's Logbook",
    '{5}{U}, {T}: Draw a card. This ability costs {1} less to activate for each other artifact you control.',
    'artifact',
    ['Book'],
    {
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['5', 'U'] }, { kind: 'tap' }],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          costReducedBy: {
            amount: {
              kind: 'countOf',
              filter: { types: ['artifact'], other: true, controller: 'you' },
            },
          },
        },
      ],
    },
  ],
  [
    'Master Transmuter',
    "{U}, {T}, Return an artifact you control to its owner's hand: You may put an artifact card from your hand onto the battlefield.",
    'creature',
    ['Human', 'Artificer'],
    {
      abilities: [
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['U'] },
            { kind: 'tap' },
            { kind: 'returnToHand', what: { types: ['artifact'], controller: 'you' } },
          ],
          effect: {
            kind: 'moveToZone',
            objects: {
              kind: 'choose',
              filter: { zone: 'hand', types: ['artifact'], controller: 'you' },
              optional: true,
            },
            to: 'battlefield',
          },
        },
      ],
    },
  ],
  [
    'Shimmer Myr',
    'Flash\nYou may cast artifact spells as though they had flash.',
    'creature',
    ['Myr'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flash' } },
        {
          kind: 'static',
          static: { kind: 'castAsThoughFlash', spells: { types: ['artifact'], controller: 'you' } },
        },
      ],
    },
  ],
  [
    'Fall from Favor',
    "Enchant creature\nWhen this Aura enters, tap enchanted creature and you become the monarch.\nEnchanted creature doesn't untap during its controller's untap step unless that player is the monarch.",
    'enchantment',
    ['Aura'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'tap', objects: { kind: 'attached' } },
              { kind: 'becomeMonarch', player: { kind: 'you' } },
            ],
          },
        },
        {
          kind: 'static',
          static: {
            kind: 'restriction',
            subject: { kind: 'attached', types: ['creature'] },
            restriction: 'doesntUntap',
          },
          condition: {
            kind: 'not',
            term: {
              kind: 'playerHasDesignation',
              player: { kind: 'controllerOf', of: { kind: 'attached' } },
              designation: 'monarch',
            },
          },
        },
      ],
    },
  ],
  [
    'Adaptive Omnitool',
    'Equipped creature gets +1/+1 for each artifact you control.\nWhenever equipped creature attacks, look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\nEquip {3}',
    'artifact',
    ['Equipment'],
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'attached', types: ['creature'] },
            power: { kind: 'countOf', filter: { types: ['artifact'], controller: 'you' } },
            toughness: { kind: 'countOf', filter: { types: ['artifact'], controller: 'you' } },
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'attached' } },
          effect: {
            kind: 'lookAtTop',
            count: 6,
            take: { filter: { types: ['artifact'] }, max: 1 },
            rest: 'bottomRandom',
          },
        },
        { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['3'] }] } },
      ],
    },
  ],
  [
    'Duplicant',
    "Imprint \u2014 When this creature enters, you may exile target nontoken creature.\nAs long as a card exiled with this creature is a creature card, this creature has the power, toughness, and creature types of the last creature card exiled with it. It's still a Shapeshifter.",
    'creature',
    ['Shapeshifter'],
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
          effect: { kind: 'exile', objects: { kind: 'target', id: 't1' }, linked: true },
          optional: true,
        },
        {
          kind: 'static',
          static: {
            kind: 'takeFromLinkedExile',
            subject: { kind: 'this' },
            from: { types: ['creature'] },
            alsoSubtypes: ['Shapeshifter'],
          },
        },
      ],
    },
  ],
  [
    'Misleading Signpost',
    "Flash\nWhen this artifact enters during the declare attackers step, you may reselect which player or permanent target attacking creature is attacking. (It can't attack its controller or their permanents.)\n{T}: Add {U}.",
    'artifact',
    [],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flash' } },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', types: ['creature'], attacking: true },
              },
            },
          ],
          effect: { kind: 'reselectAttack', objects: { kind: 'target', id: 't1' } },
          optional: true,
          interveningIf: { kind: 'duringStep', step: 'declareAttackers' },
        },
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['U'] } },
      ],
    },
  ],
];

describe('the twenty real cards of the Artifacts precon read as the nodes of D-139', () => {
  test.each(REAL.map((row) => [row[0], row] as const))(
    '%s',
    (_name, [, text, type, subtypes, want]) => {
      const parsed = readAll(text, type, subtypes);
      if (want.abilities !== undefined) expect(parsed.abilities).toEqual(want.abilities);
      else expect(parsed.abilities).toEqual([]);
      if (want.spell !== undefined) expect(parsed.spell).toEqual(want.spell);
      else expect(parsed.spell).toBeNull();
    },
  );
});

describe("filters: attacking, a count of colors, a union of plural card types, each opponent's graveyard (CR 508.1k, 105.2, 205.2a, 404.1)", () => {
  test('"target attacking creature" and "all attacking creatures"', () => {
    expect(spellOf('Destroy target attacking creature.', 'instant')).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], attacking: true },
          },
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    });
  });

  test.each([
    ['two or more colors', { cmp: 'atLeast', value: 2 }],
    ['exactly one color', { cmp: 'equal', value: 1 }],
    ['one or more colors', { cmp: 'atLeast', value: 1 }],
  ])('"... they control that are %s"', (words, colorCount) => {
    expect(
      spellOf(`Each player sacrifices all permanents they control that are ${words}.`),
    ).toEqual({
      effect: {
        kind: 'sacrifice',
        objects: { kind: 'each', filter: { zone: 'battlefield', colorCount } },
      },
    });
  });

  test('"each opponent sacrifices all creatures they control": the opponents\' creatures, each by its controller', () => {
    expect(spellOf('Each opponent sacrifices all creatures they control.')).toEqual({
      effect: {
        kind: 'sacrifice',
        objects: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
        },
      },
    });
  });

  test('"monocolored" and "multicolored" are counts of colors', () => {
    expect(spellOf('Destroy all monocolored creatures.')).toEqual({
      effect: {
        kind: 'destroy',
        objects: {
          kind: 'each',
          filter: {
            zone: 'battlefield',
            types: ['creature'],
            colorCount: { cmp: 'equal', value: 1 },
          },
        },
      },
    });
    expect(
      abilities('Whenever you cast a multicolored spell, draw a card.', 'enchantment'),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', colorCount: { cmp: 'atLeast', value: 2 } },
          by: 'you',
        },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ]);
  });

  test('"Destroy all artifacts and enchantments.": two plural types', () => {
    expect(spellOf('Destroy all artifacts and enchantments.')).toEqual({
      effect: {
        kind: 'destroy',
        objects: {
          kind: 'each',
          filter: {
            zone: 'battlefield',
            anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
          },
        },
      },
    });
  });

  test('"Exile each player\'s graveyard.": every owner', () => {
    expect(spellOf("Exile each player's graveyard.")).toEqual({
      effect: {
        kind: 'exile',
        objects: { kind: 'each', filter: { zone: 'graveyard', owner: { kind: 'eachPlayer' } } },
      },
    });
  });

  test.each([
    ['Each player sacrifices all permanents they control that are zero or more colors.', 'sorcery'],
    ['Each player sacrifices all creatures they control of their choice.', 'sorcery'],
    ['Target player sacrifices all creatures they control.', 'sorcery'],
    ['Destroy all artifacts, creatures and enchantments.', 'sorcery'],
    ['Destroy target creature with mana value X or less.', 'sorcery'],
    ['Destroy target creature with mana value X.', 'sorcery'],
  ] as const)('"%s" is not run', (text, type) => {
    expect(drop(text, type)).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });
});

describe('costs and restrictions (CR 118.3, 601.2f, 602.5b)', () => {
  test('"Put two +1/+1 counters on ~" and "Return ~ to its owner\'s hand" as costs', () => {
    expect(
      abilities('{T}, Put two +1/+1 counters on ~: Draw a card.', 'artifact')[0],
    ).toMatchObject({
      cost: [{ kind: 'tap' }, { kind: 'putCounters', counter: '+1/+1', count: 2 }],
    });
    expect(
      abilities("{2}, Return ~ to its owner's hand: Draw a card.", 'artifact')[0],
    ).toMatchObject({
      cost: [
        { kind: 'mana', symbols: ['2'] },
        { kind: 'returnToHand', what: THIS },
      ],
    });
    expect(
      abilities(
        "{U}, Return two Islands you control to their owner's hand: Draw a card.",
        'creature',
      )[0],
    ).toMatchObject({
      cost: [
        { kind: 'mana', symbols: ['U'] },
        { kind: 'returnToHand', what: { subtypes: ['Island'], controller: 'you' }, count: 2 },
      ],
    });
  });

  test('"Activate only once each turn." and "costs {2} less to activate for each creature you control"', () => {
    expect(
      abilities('{1}: Draw a card. Activate only once each turn.', 'artifact')[0],
    ).toMatchObject({
      oncePerTurn: true,
    });
    expect(
      abilities(
        '{4}, {T}: Draw a card. This ability costs {2} less to activate for each creature you control.',
        'artifact',
      )[0],
    ).toMatchObject({
      costReducedBy: {
        amount: {
          kind: 'multiple',
          factor: 2,
          of: { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
        },
      },
    });
  });

  test.each([
    ['{T}: Add {G}. Activate only once each turn.', 'land'],
    [
      '{T}: Add {G}. This ability costs {1} less to activate for each creature you control.',
      'land',
    ],
    ['Put a page counter on ~: Draw a card.', 'artifact'],
    ["{1}, Return an artifact to its owner's hand: Draw a card.", 'artifact'],
    ["{1}, Return an artifact an opponent controls to its owner's hand: Draw a card.", 'artifact'],
    [
      '{1}: Draw a card. This ability costs {G} less to activate for each creature you control.',
      'artifact',
    ],
  ] as const)('"%s" is not run', (text, type) => {
    expect(drop(text, type)).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });
});

describe('triggers: a batch of combat damage, tapping for mana, a state, entering in a step (CR 603.2c, 605.1b, 603.8, 506.1)', () => {
  test('"one or more Zombies you control deal combat damage to an opponent" and "two or more creatures"', () => {
    expect(
      abilities(
        'Whenever one or more Zombies you control deal combat damage to an opponent, draw a card.',
        'enchantment',
      )[0],
    ).toMatchObject({
      trigger: {
        kind: 'combatDamageBatch',
        what: { subtypes: ['Zombie'], controller: 'you' },
        to: 'opponent',
      },
    });
    expect(
      abilities(
        'Whenever two or more creatures you control deal combat damage to a player, draw a card.',
        'enchantment',
      )[0],
    ).toMatchObject({ trigger: { kind: 'combatDamageBatch', atLeast: 2, to: 'player' } });
  });

  test('"that player" after a batch is the player damaged', () => {
    expect(
      abilities(
        'Whenever one or more creatures you control deal combat damage to a player, that player loses 1 life.',
        'enchantment',
      )[0],
    ).toMatchObject({ effect: { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 } });
  });

  test('"you tap a land for mana" and "a Forest for {G}"', () => {
    expect(
      abilities('Whenever you tap a land for mana, add an additional {G}.', 'enchantment'),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'tappedForMana', what: { types: ['land'] }, by: 'you' },
        effect: { kind: 'addMana', mana: { kind: 'fixed', mana: ['G'] } },
      },
    ]);
    expect(
      abilities('Whenever you tap a Forest for {G}, add an additional {G}.', 'enchantment')[0],
    ).toMatchObject({
      trigger: { kind: 'tappedForMana', what: { subtypes: ['Forest'] }, mana: 'G' },
    });
  });

  test('"there are three or more +1/+1 counters on ~": a state trigger of another counter', () => {
    expect(
      abilities(
        'When there are three or more +1/+1 counters on ~, sacrifice it. If you do, draw two cards.',
        'creature',
      )[0],
    ).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'state',
        condition: {
          kind: 'amountIs',
          amount: { kind: 'countersOn', of: THIS, counter: '+1/+1' },
          compare: { cmp: 'atLeast', value: 3 },
        },
      },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'sacrifice', objects: THIS },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: { kind: 'draw', player: YOU, count: 2 },
          },
        ],
      },
    });
  });

  test('"enters during the declare blockers step" is the intervening "if" of the step', () => {
    expect(
      abilities('When ~ enters during the declare blockers step, draw a card.', 'artifact')[0],
    ).toMatchObject({
      trigger: { kind: 'entersBattlefield', what: THIS },
      interveningIf: { kind: 'duringStep', step: 'declareBlockers' },
    });
  });

  test.each([
    [
      'Whenever one or more creatures you control leave the battlefield, you gain 1 life.',
      'enchantment',
    ],
    ['Whenever one or more creatures deal combat damage to a player, draw a card.', 'enchantment'],
    ['Whenever you tap a permanent for {C}, add an additional {C}. Draw a card.', 'artifact'],
    ['Whenever you tap a permanent for {C}, you gain 1 life.', 'artifact'],
    ['Add an additional {C}.', 'instant'],
    ['When ~ enters during your turn, draw a card.', 'artifact'],
    ['When there are four or more page counters on target artifact, draw a card.', 'artifact'],
  ] as const)('"%s" is not run', (text, type) => {
    expect(drop(text, type)).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });
});

describe('statics: blockers, base power and toughness, types in addition, flash, linked exile, the monarch (CR 509.1b, 613, 601.3b, 607.2a)', () => {
  test('only attacking creatures you control have deathtouch', () => {
    expect(abilities('Attacking creatures you control have deathtouch.', 'enchantment')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', attacking: true },
          },
          keyword: { kind: 'deathtouch' },
        },
      },
    ]);
  });

  test('"Elves you control can\'t be blocked by Walls" and "~ can\'t be blocked by creatures with power 2 or less"', () => {
    expect(abilities("Elves you control can't be blocked by Walls.", 'creature')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'cantBeBlockedBy',
          subject: { kind: 'filter', filter: { subtypes: ['Elf'], controller: 'you' } },
          blockers: { subtypes: ['Wall'] },
        },
      },
    ]);
    expect(abilities("~ can't be blocked by creatures with power 2 or less.", 'creature')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'cantBeBlockedBy',
          subject: THIS,
          blockers: { types: ['creature'], power: { cmp: 'atMost', value: 2 } },
        },
      },
    ]);
  });

  test('"Creatures you control are Zombies in addition to their other creature types."', () => {
    expect(
      abilities(
        'Creatures you control are Zombies in addition to their other creature types.',
        'enchantment',
      ),
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'setTypes',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          additive: true,
          subtypes: ['Zombie'],
        },
      },
    ]);
  });

  test('"You may cast creature spells as though they had flash." and "spells"', () => {
    expect(
      abilities('You may cast creature spells as though they had flash.', 'enchantment'),
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'castAsThoughFlash', spells: { types: ['creature'], controller: 'you' } },
      },
    ]);
    expect(abilities('You may cast spells as though they had flash.', 'enchantment')).toEqual([
      { kind: 'static', static: { kind: 'castAsThoughFlash', spells: { controller: 'you' } } },
    ]);
  });

  test('a linked exile with nothing that exiles is refused; the exile is marked linked only beside its reader', () => {
    const reader =
      "As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it. It's still a Shapeshifter.";
    const alone = read(reader, 'creature', ['Shapeshifter']);
    expect(alone.abilities).toEqual([]);
    expect(alone.unparsed[0]).toMatchObject({ reason: 'notRunnable' });
    const twice = read(
      `When ~ enters, you may exile target creature.\nWhen ~ dies, exile target card from a graveyard.\n${reader}`,
      'creature',
      ['Shapeshifter'],
    );
    expect(twice.unparsed).toHaveLength(1);
    expect(abilities('When ~ enters, exile target creature.', 'creature')[0]).toMatchObject({
      effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
    });
    expect(
      JSON.stringify(abilities('When ~ enters, exile target creature.', 'creature')),
    ).not.toContain('linked');
  });

  test.each([
    [
      "Enchanted creature doesn't untap during its controller's untap step unless that player is the monarch.",
      'enchantment',
      [],
    ],
    ['When ~ enters, tap enchanted creature.', 'creature', []],
    ['Living weapon', 'artifact', []],
    ["Creatures you control can't be blocked by Walls you control.", 'enchantment', []],
    [
      'Other creatures you control have base power and toughness 5/3 until end of turn.',
      'enchantment',
      [],
    ],
    ['You may cast artifact spells as though they had haste.', 'enchantment', []],
  ] as const)('"%s" is not run on that face', (text, type, subtypes) => {
    expect(drop(text, type, subtypes)).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });
});

describe('effects: discard unless, look at the top, put from the hand, tap X, reselect, "Then", "If you do" (CR 701.9, 701.20a, 701.26a, 508.7)', () => {
  test('"Then discard a card unless you discard a creature card." over another card type', () => {
    expect(
      spellOf('Draw two cards. Then discard a card unless you discard a creature card.', 'instant'),
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count: 2 },
          { kind: 'discard', player: YOU, count: 1, unless: { types: ['creature'] } },
        ],
      },
    });
  });

  test('"Look at the top four cards ... a creature or land card ... Put the rest into your graveyard."', () => {
    expect(
      spellOf(
        'Look at the top four cards of your library. You may reveal a creature or land card from among them and put it into your hand. Put the rest into your graveyard.',
      ),
    ).toEqual({
      effect: {
        kind: 'lookAtTop',
        count: 4,
        take: { filter: { anyOf: [{ types: ['creature'] }, { types: ['land'] }] }, max: 1 },
        rest: 'graveyard',
      },
    });
  });

  test('"put a creature card from your graveyard onto the battlefield tapped"', () => {
    expect(
      abilities(
        '{2}, {T}: You may put a creature card from your graveyard onto the battlefield tapped.',
        'artifact',
      )[0],
    ).toMatchObject({
      effect: {
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
          optional: true,
        },
        to: 'battlefield',
        tapped: true,
      },
    });
  });

  test('"tap X untapped Zombies you control": the X of "If you do" is the number tapped', () => {
    expect(
      abilities(
        'Whenever ~ attacks, you may tap X untapped Zombies you control. If you do, ~ gets +X/+0 until end of turn.',
        'creature',
      )[0],
    ).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'tap',
            objects: {
              kind: 'choose',
              filter: { subtypes: ['Zombie'], controller: 'you' },
              anyNumber: true,
            },
          },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: {
              kind: 'modifyPt',
              objects: THIS,
              power: { kind: 'thisWay', what: 'tapped' },
              toughness: 0,
            },
          },
        ],
      },
    });
  });

  test('"~ deals 1 damage to the player or planeswalker it\'s attacking"', () => {
    expect(
      abilities(
        "Whenever ~ attacks, ~ deals 1 damage to the player or planeswalker it's attacking.",
        'creature',
      )[0],
    ).toMatchObject({
      effect: { kind: 'dealDamage', amount: 1, to: { kind: 'attackedBy', of: THIS } },
    });
  });

  test.each([
    [
      "Whenever ~ attacks, target creature gets +1/+0 until end of turn and deals 1 damage to the player or planeswalker it's attacking.",
      'creature',
    ],
    [
      "Whenever ~ attacks, you gain 1 life and deals 1 damage to the player or planeswalker it's attacking.",
      'creature',
    ],
    [
      "Whenever ~ attacks, deals 1 damage to the player or planeswalker it's attacking.",
      'creature',
    ],
    [
      'Whenever ~ attacks, you may tap two untapped Myr you control. If you do, draw a card.',
      'creature',
    ],
    ['Draw a card. X is the number of creatures you control.', 'instant'],

    [
      'Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand.',
      'sorcery',
    ],
    ['Reselect which player or permanent target creature is attacking.', 'instant'],
    ['When ~ enters, gain 2 life. If you do, draw a card.', 'creature'],
  ] as const)('"%s" is not run', (text, type) => {
    expect(drop(text, type)).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised|unboundReference/),
    });
  });
});

describe('conditions and keywords (CR 603.4, 702.92a)', () => {
  test('"the creature with the greatest toughness or tied for the greatest toughness"', () => {
    expect(
      abilities(
        'At the beginning of your upkeep, if you control the creature with the greatest toughness or tied for the greatest toughness, draw a card.',
        'creature',
      )[0],
    ).toMatchObject({
      interveningIf: {
        kind: 'controlsGreatest',
        filter: { types: ['creature'] },
        stat: 'toughness',
      },
    });
  });

  test('"Living weapon" on another Equipment', () => {
    expect(abilities('Living weapon\nEquip {4}', 'artifact', ['Equipment'])).toEqual([
      { kind: 'keyword', keyword: { kind: 'livingWeapon' } },
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['4'] }] } },
    ]);
  });

  test.each([
    'At the beginning of your upkeep, if you control the artifact with the greatest mana value, draw a card.',
    'At the beginning of your upkeep, if you control the creature with the greatest power or tied for the greatest toughness, draw a card.',
  ])('"%s" is not read', (text) => {
    expect(drop(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});
