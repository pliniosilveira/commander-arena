// Stage P36 (M51): the Korvold deck's fetch lands, reflexive sacrifice and Treasure grants slice, read by the grammar (D-178; the engine's `search`
// that leaves `moved`, `sacrificed`, `spellOnly`, D-177, ENGINE_VERSION 37). The lines of `REAL` are the real Oracle text of the nine cards of the slice
// (the owner's request file of 2026-10-29), names replaced by ~, each with the nodes the grammar produces for it; the other tests read lines that say
// the same things over other numbers, types and counts, and the lines a rule must not read (flagged, never half run). Every sibling and refused line is
// SYNTHETIC. The engine runs what is lowered in convert-grammar-engine-p36.test.ts; a missing engine feature is named in parser-p36-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { namesItselfInQuotes } from '../src/convert/parser/index';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const drop = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  dropped(text, type, subtypes);

/** The real Oracle text of the nine cards, as the nodes the engine runs. */
const REAL: readonly (readonly [
  string,
  string,
  FaceType,
  readonly string[],
  { abilities?: unknown; spell?: unknown },
])[] = [
  [
    'Cabaretti Courtyard',
    'When ~ enters, sacrifice it. When you do, search your library for a basic Mountain, Forest, or Plains card, put it onto the battlefield tapped, then shuffle and you gain 1 life.',
    'land',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'sacrifice', objects: { kind: 'this' } },
              {
                kind: 'reflexive',
                effect: {
                  kind: 'sequence',
                  effects: [
                    {
                      kind: 'search',
                      player: { kind: 'you' },
                      filter: {
                        supertypes: ['basic'],
                        anyOf: [
                          { subtypes: ['Mountain'] },
                          { subtypes: ['Forest'] },
                          { subtypes: ['Plains'] },
                        ],
                      },
                      max: 1,
                      destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
                      reveal: false,
                      shuffle: true,
                    },
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
    'Maestros Theater',
    'When ~ enters, sacrifice it. When you do, search your library for a basic Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle and you gain 1 life.',
    'land',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'sacrifice', objects: { kind: 'this' } },
              {
                kind: 'reflexive',
                effect: {
                  kind: 'sequence',
                  effects: [
                    {
                      kind: 'search',
                      player: { kind: 'you' },
                      filter: {
                        supertypes: ['basic'],
                        anyOf: [
                          { subtypes: ['Island'] },
                          { subtypes: ['Swamp'] },
                          { subtypes: ['Mountain'] },
                        ],
                      },
                      max: 1,
                      destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
                      reveal: false,
                      shuffle: true,
                    },
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
    'Riveteers Overlook',
    'When ~ enters, sacrifice it. When you do, search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield tapped, then shuffle and you gain 1 life.',
    'land',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'sacrifice', objects: { kind: 'this' } },
              {
                kind: 'reflexive',
                effect: {
                  kind: 'sequence',
                  effects: [
                    {
                      kind: 'search',
                      player: { kind: 'you' },
                      filter: {
                        supertypes: ['basic'],
                        anyOf: [
                          { subtypes: ['Swamp'] },
                          { subtypes: ['Mountain'] },
                          { subtypes: ['Forest'] },
                        ],
                      },
                      max: 1,
                      destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
                      reveal: false,
                      shuffle: true,
                    },
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
    'Jund Panorama',
    '{T}: Add {C}.\n{1}, {T}, Sacrifice ~: Search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield tapped, then shuffle.',
    'land',
    [],
    {
      abilities: [
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['1'] },
            { kind: 'tap' },
            { kind: 'sacrifice', what: { kind: 'this' } },
          ],
          effect: {
            kind: 'search',
            player: { kind: 'you' },
            filter: {
              supertypes: ['basic'],
              anyOf: [
                { subtypes: ['Swamp'] },
                { subtypes: ['Mountain'] },
                { subtypes: ['Forest'] },
              ],
            },
            max: 1,
            destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
            reveal: false,
            shuffle: true,
          },
        },
      ],
    },
  ],
  [
    'Fabled Passage',
    '{T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.',
    'land',
    [],
    {
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'search',
                player: { kind: 'you' },
                filter: { types: ['land'], supertypes: ['basic'] },
                max: 1,
                destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
                reveal: false,
                shuffle: true,
              },
              {
                kind: 'conditional',
                condition: { kind: 'controlsAtLeast', filter: { types: ['land'] }, count: 4 },
                effect: { kind: 'untap', objects: { kind: 'moved' } },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Far Wanderings',
    'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nThreshold \u2014 If there are seven or more cards in your graveyard, instead search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'amountIs',
            amount: { kind: 'countOf', filter: { zone: 'graveyard', controller: 'you' } },
            compare: { cmp: 'atLeast', value: 7 },
          },
          effect: {
            kind: 'search',
            player: { kind: 'you' },
            filter: { types: ['land'], supertypes: ['basic'] },
            max: 3,
            destinations: [{ zone: 'battlefield', tapped: true, count: 3 }],
            reveal: false,
            shuffle: true,
          },
          else: {
            kind: 'search',
            player: { kind: 'you' },
            filter: { types: ['land'], supertypes: ['basic'] },
            max: 1,
            destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
            reveal: false,
            shuffle: true,
          },
        },
      },
    },
  ],
  [
    'Ziatora, the Incinerator',
    "Flying\nAt the beginning of your end step, you may sacrifice another creature. When you do, ~ deals damage equal to that creature's power to any target and you create three Treasure tokens.",
    'creature',
    [],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        {
          kind: 'triggered',
          trigger: { kind: 'endStep', whose: 'you' },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'may',
                effect: {
                  kind: 'sacrifice',
                  objects: { kind: 'choose', filter: { types: ['creature'], other: true } },
                },
              },
              {
                kind: 'reflexive',
                targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
                effect: {
                  kind: 'sequence',
                  effects: [
                    {
                      kind: 'dealDamage',
                      amount: { kind: 'powerOf', of: { kind: 'sacrificed' } },
                      to: { kind: 'target', id: 't1' },
                    },
                    {
                      kind: 'createToken',
                      token: { kind: 'preset', preset: 'Treasure' },
                      count: 3,
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
    'Goldspan Dragon',
    'Flying, haste\nWhenever ~ attacks or becomes the target of a spell, create a Treasure token.\nTreasures you control have "{T}, Sacrifice ~: Add two mana of any one color."',
    'creature',
    [],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'keyword', keyword: { kind: 'haste' } },
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'becomesTarget', what: { kind: 'this' }, by: 'any', spellOnly: true },
          effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
        },
        {
          kind: 'static',
          static: {
            kind: 'grantAbility',
            subject: { kind: 'filter', filter: { subtypes: ['Treasure'], controller: 'you' } },
            ability: {
              kind: 'mana',
              cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
              production: { kind: 'anyColor', count: 2 },
            },
          },
        },
      ],
    },
  ],
  [
    "Bootleggers' Stash",
    'Lands you control have "{T}: Create a Treasure token."',
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'grantAbility',
            subject: { kind: 'filter', filter: { types: ['land'], controller: 'you' } },
            ability: {
              kind: 'activated',
              cost: [{ kind: 'tap' }],
              effect: {
                kind: 'createToken',
                token: { kind: 'preset', preset: 'Treasure' },
                count: 1,
              },
            },
          },
        },
      ],
    },
  ],
];

describe('the nine real cards of the slice read as the engine runs them (D-177, D-178)', () => {
  test.each(REAL)('%s', (_name, text, type, subtypes, expected) => {
    const parsed = readAll(text, type, subtypes);
    if (expected.abilities !== undefined) expect(parsed.abilities).toEqual(expected.abilities);
    else expect(parsed.abilities).toEqual([]);
    if (expected.spell !== undefined) expect(parsed.spell).toEqual(expected.spell);
    else expect(parsed.spell ?? undefined).toBeUndefined();
  });
});

// ---- The siblings of each new reading

const search = (parsed: ReturnType<typeof readAll>) => JSON.stringify(parsed.abilities);

describe('a list of basic land types (CR 205.4, 701.23)', () => {
  test.each([
    ['Plains or Island', 'a basic Plains or Island card'],
    ['Forest, Island, or Swamp', 'a basic Forest, Island, or Swamp card'],
  ])('%s', (list, noun) => {
    const parsed = readAll(
      `{T}, Sacrifice ~: Search your library for ${noun}, put it onto the battlefield, then shuffle.`,
      'land',
    );
    const subtypes = list.split(/, or |, | or /u);
    expect(search(parsed)).toContain(
      JSON.stringify({ supertypes: ['basic'], anyOf: subtypes.map((s) => ({ subtypes: [s] })) }),
    );
  });

  test('without "basic" the list has no supertype, as before', () => {
    const parsed = readAll(
      '{T}, Sacrifice ~: Search your library for a Plains or Island card, put it onto the battlefield, then shuffle.',
      'land',
    );
    expect(search(parsed)).toContain(
      JSON.stringify({ anyOf: [{ subtypes: ['Plains'] }, { subtypes: ['Island'] }] }),
    );
  });
});

describe('"When you do" after a sacrifice that is not an offer (CR 603.12)', () => {
  test('a reflexive ability of any instruction the engine can tell was done, as the first of its body', () => {
    const parsed = readAll('When ~ enters, sacrifice it. When you do, draw a card.', 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'sacrifice', objects: { kind: 'this' } },
            { kind: 'reflexive', effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
          ],
        },
      },
    ]);
  });

  test('the reflexive ability has targets of its own', () => {
    const parsed = readAll(
      'At the beginning of your end step, sacrifice another creature. When you do, ~ deals 2 damage to any target.',
      'creature',
    );
    expect(JSON.stringify(parsed.abilities)).toContain(
      '"reflexive","targets":[{"id":"t1","what":{"kind":"anyTarget"}}]',
    );
  });

  test('"that creature" and "its" read the permanent that was sacrificed, in the reflexive ability and after it', () => {
    for (const text of [
      "When ~ enters, you may sacrifice another creature. When you do, you gain life equal to that creature's power.",
      "When ~ enters, sacrifice another creature. When you do, you gain life equal to that creature's power.",
      "When ~ enters, sacrifice another creature. You gain life equal to that creature's power.",
    ]) {
      const parsed = readAll(text, 'creature');
      expect(JSON.stringify(parsed.abilities), text).toContain(
        '"amount":{"kind":"powerOf","of":{"kind":"sacrificed"}}',
      );
    }
  });
});

describe('"that land" and "it" after a search name what it found (CR 400.7j)', () => {
  test.each([
    ['Untap that land.', 'untap'],
    ['Untap it.', 'untap'],
    ['Tap that land.', 'tap'],
  ])('%s', (tail, verb) => {
    const parsed = readAll(
      `Search your library for a basic land card, put it onto the battlefield, then shuffle. ${tail}`,
      'sorcery',
    );
    expect(JSON.stringify(parsed.spell)).toContain(`{"kind":"${verb}","objects":{"kind":"moved"}}`);
  });

  test('"that creature" after something else keeps naming the target of the sentence before', () => {
    const parsed = readAll('Target creature gets +1/+1 until end of turn. Untap that creature.');
    expect(JSON.stringify(parsed.spell)).toContain(
      '{"kind":"untap","objects":{"kind":"target","id":"t1"}}',
    );
  });
});

describe('"If <test>, instead ..." on the line after the one it replaces (CR 608.2c, 614.1a)', () => {
  test('a leading "instead" says the same as a trailing one', () => {
    const leading = readAll(
      'Draw a card.\nIf you control four or more lands, instead draw three cards.',
      'sorcery',
    );
    const trailing = readAll(
      'Draw a card. If you control four or more lands, draw three cards instead.',
      'sorcery',
    );
    expect(leading.spell).toEqual(trailing.spell);
    expect(leading.spell?.effect).toMatchObject({
      kind: 'conditional',
      effect: { kind: 'draw', count: 3 },
      else: { kind: 'draw', count: 1 },
    });
  });

  test('a trailing "instead" on a line of its own replaces the line before it too', () => {
    const lines = readAll(
      'Draw a card.\nIf you control four or more lands, draw three cards instead.',
      'sorcery',
    );
    expect(lines.spell?.effect).toMatchObject({ kind: 'conditional' });
  });

  test('the condition may count the cards in your graveyard ("there are seven or more")', () => {
    const parsed = readAll(
      'Draw a card.\nIf there are seven or more cards in your graveyard, instead draw three cards.',
      'sorcery',
    );
    expect(parsed.spell?.effect).toMatchObject({
      condition: {
        kind: 'amountIs',
        amount: { kind: 'countOf', filter: { zone: 'graveyard', controller: 'you' } },
        compare: { cmp: 'atLeast', value: 7 },
      },
    });
  });

  test('a keyword line is not what the test replaces', () => {
    expect(drop('Kicker {2}\nIf ~ was kicked, draw a card instead.', 'instant').reason).toBe(
      'notRunnable',
    );
  });

  test('"instead of" is not a replacement of the line before', () => {
    expect(
      drop(
        'Draw a card.\nIf you control four or more lands, instead of that, draw two cards.',
        'sorcery',
      ).reason,
    ).toBe('unrecognised');
  });
});

describe('"becomes the target of a spell" (CR 603.2)', () => {
  test('alone it is a spell only; "or ability" is both', () => {
    const spell = readAll('Whenever ~ becomes the target of a spell, you gain 1 life.', 'creature');
    expect(spell.abilities).toMatchObject([
      { trigger: { kind: 'becomesTarget', what: { kind: 'this' }, by: 'any', spellOnly: true } },
    ]);
    const both = readAll(
      'Whenever ~ becomes the target of a spell or ability, you gain 1 life.',
      'creature',
    );
    expect(JSON.stringify(both.abilities)).not.toContain('spellOnly');
  });

  test('a spell an opponent controls, and "attacks or becomes the target of a spell", are each an ability of their own', () => {
    expect(
      readAll(
        'Whenever ~ becomes the target of a spell an opponent controls, you gain 1 life.',
        'creature',
      ).abilities,
    ).toMatchObject([{ trigger: { kind: 'becomesTarget', by: 'opponent', spellOnly: true } }]);
    expect(
      readAll('Whenever ~ attacks or becomes the target of a spell, you gain 1 life.', 'creature')
        .abilities,
    ).toMatchObject([
      { trigger: { kind: 'attacks' } },
      { trigger: { kind: 'becomesTarget', spellOnly: true } },
    ]);
  });
});

describe('abilities given to a group (CR 613.1f, 602, 605.1a)', () => {
  test('an activated ability, with its cost, is given to each permanent the group names', () => {
    const parsed = readAll('Creatures you control have "{T}: You gain 1 life."', 'enchantment');
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          ability: { kind: 'activated', cost: [{ kind: 'tap' }] },
        },
      },
    ]);
  });

  test('a mana ability that sacrifices its permanent is given to a group, one mana of any color or two', () => {
    for (const [text, production] of [
      [
        'Treasures you control have "{T}, Sacrifice ~: Add one mana of any color."',
        { kind: 'anyColor' },
      ],
      [
        'Artifacts you control have "{T}, Sacrifice ~: Add two mana of any one color."',
        { kind: 'anyColor', count: 2 },
      ],
    ] as const) {
      expect(readAll(text, 'enchantment').abilities, text).toMatchObject([
        {
          static: {
            ability: { kind: 'mana', cost: [{ kind: 'tap' }, { kind: 'sacrifice' }], production },
          },
        },
      ]);
    }
  });
});

// ---- Refusals: a line that says more or less than the rule reads is flagged, never half run

const REFUSED: readonly (readonly [string, FaceType, readonly string[], string])[] = [
  // The reflexive ability is the last sentence, and the first of its body.
  [
    'At the beginning of your end step, you gain 1 life. Sacrifice another creature. When you do, you create three Treasure tokens.',
    'creature',
    [],
    'notRunnable',
  ],
  [
    'At the beginning of your end step, sacrifice another creature. When you do, you create three Treasure tokens. You gain 1 life.',
    'creature',
    [],
    'notRunnable',
  ],
  // "That creature" after two creatures is not one of them.
  [
    "At the beginning of your end step, sacrifice two creatures. When you do, you gain life equal to that creature's power.",
    'creature',
    [],
    'unboundReference',
  ],
  // A list of types that is not English, or mixes the kinds.
  [
    'Search your library for a basic Forest, or Island card, put it onto the battlefield, then shuffle.',
    'sorcery',
    [],
    'unrecognised',
  ],
  [
    'Search your library for a basic Forest or creature card, put it onto the battlefield, then shuffle.',
    'sorcery',
    [],
    'unrecognised',
  ],
  // A plural pronoun, or two lands, after a search for one.
  [
    'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Untap those lands.',
    'sorcery',
    [],
    'unrecognised',
  ],
  // An ability alone, or "or ability" after the "or".
  ['Whenever ~ becomes the target of an ability, you gain 1 life.', 'creature', [], 'unrecognised'],
  [
    'Whenever ~ attacks or becomes the target of a spell or ability, you gain 1 life.',
    'creature',
    [],
    'unrecognised',
  ],
  // A group whose granted ability the engine cannot carry stays unread (a rider after the mana).
  [
    'Lands you control have "{T}, Sacrifice ~: Add {C}. Draw a card."',
    'enchantment',
    [],
    'notRunnable',
  ],
];

describe('the lines the new readings must not read are flagged', () => {
  test.each(REFUSED)('%s', (text, type, subtypes, reason) => {
    expect(drop(text, type, subtypes).reason).toBe(reason);
  });
});

// ---- The words of the text

describe('the card that names itself inside a quotation (CR 113.1)', () => {
  const OPTIONS = { name: 'SYNTHETIC Card', legendary: false };

  test('it is told from the text, before the name is rewritten', () => {
    expect(
      namesItselfInQuotes(
        'Lands you control have "{T}, Sacrifice SYNTHETIC Card: Add {C}."',
        OPTIONS,
      ),
    ).toBe(true);
    expect(
      namesItselfInQuotes('Lands you control have "{T}, Sacrifice this land: Add {C}."', OPTIONS),
    ).toBe(false);
    // The name outside the quotes says nothing about what `~` means inside them.
    expect(
      namesItselfInQuotes(
        'SYNTHETIC Card deals 1 damage to you. Lands you control have "{T}: Add {C}."',
        OPTIONS,
      ),
    ).toBe(false);
  });

  test('a group is not given an ability from such a text, the card itself is', () => {
    const name = 'SYNTHETIC Card';
    const group = `Lands you control have "{T}, Sacrifice ${name}: Add {C}."`;
    expect(drop(group, 'enchantment').reason).toBe('notRunnable');
    // The same text with "this land" in the quotes is read: `~` is the land that has the ability.
    expect(
      readAll('Lands you control have "{T}, Sacrifice this land: Add {C}."', 'enchantment')
        .abilities,
    ).toHaveLength(1);
  });
});
