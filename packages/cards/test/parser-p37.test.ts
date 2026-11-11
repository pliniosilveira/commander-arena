// Stage P37 (M52): the Korvold deck's triggers and small statics slice, read by the grammar (D-180; the engine's `cycled`, `colorsAmong`,
// `opponentsCantCastOnYourTurn`, `groupEntersUntapped`, `requireAttack`, `controlledBy`, `putFromBattlefieldThisTurn`, D-179, ENGINE_VERSION 38). The
// lines of `REAL` are the real Oracle text of the seven cards of the slice (the owner's request file of 2026-10-29), names replaced by ~, each with
// the nodes the grammar produces for it; the other tests read lines that say the same things over other numbers, types and counts, and the lines a
// rule must not read (flagged, never half run). Every sibling and refused line is SYNTHETIC. The engine runs what is lowered in
// convert-grammar-engine-p37.test.ts; a missing engine feature is named in parser-p37-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const drop = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  dropped(text, type, subtypes);

/** The real Oracle text of the seven cards, as the nodes the engine runs. */
const REAL: readonly (readonly [
  string,
  string,
  FaceType,
  readonly string[],
  { abilities?: unknown; spell?: unknown },
])[] = [
  [
    'The Balrog of Moria',
    'When ~ dies, you may exile it. When you do, for each opponent, exile up to one target creature that player controls.\nCycling {3}{R}\nWhen you cycle this card, create two Treasure tokens.',
    'creature',
    ['Avatar', 'Demon'],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'may', effect: { kind: 'exile', objects: { kind: 'thisCard' } } },
              {
                kind: 'reflexive',
                targets: [
                  {
                    id: 't1',
                    what: {
                      kind: 'object',
                      filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
                    },
                    onePerOpponent: true,
                  },
                ],
                effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
              },
            ],
          },
        },
        {
          kind: 'keyword',
          keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['3', 'R'] }] },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'cycled' },
          effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 2 },
        },
      ],
    },
  ],
  [
    'Kaervek the Merciless',
    "Whenever an opponent casts a spell, ~ deals damage equal to that spell's mana value to any target.",
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
          targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
          effect: {
            kind: 'dealDamage',
            amount: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
            to: { kind: 'target', id: 't1' },
          },
        },
      ],
    },
  ],
  [
    'Lavalanche',
    "~ deals X damage to target player or planeswalker and each creature that player or that planeswalker's controller controls.",
    'sorcery',
    [],
    {
      spell: {
        // D-200: "target player or planeswalker" is the engine's `playerOrObject`, and "that player or that planeswalker's controller" names the
        // player the target is or the controller of the planeswalker it is.
        targets: [
          {
            id: 't1',
            what: { kind: 'playerOrObject', player: 'any', filter: { types: ['planeswalker'] } },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'dealDamage', amount: { kind: 'x' }, to: { kind: 'target', id: 't1' } },
            {
              kind: 'dealDamage',
              amount: { kind: 'x' },
              to: {
                kind: 'each',
                filter: {
                  zone: 'battlefield',
                  types: ['creature'],
                  controlledBy: {
                    kind: 'all',
                    of: [
                      { kind: 'target', id: 't1' },
                      { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
                    ],
                  },
                },
              },
            },
          ],
        },
        x: true,
      },
    },
  ],
  [
    'Lobelia Sackville-Baggins',
    "When ~ enters, exile target creature card from an opponent's graveyard that was put there from the battlefield this turn, then create X Treasure tokens, where X is the exiled card's power.",
    'creature',
    [],
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
                filter: {
                  zone: 'graveyard',
                  types: ['creature'],
                  controller: 'opponent',
                  putFromBattlefieldThisTurn: true,
                },
              },
            },
          ],
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'exile', objects: { kind: 'target', id: 't1' } },
              {
                kind: 'createToken',
                token: { kind: 'preset', preset: 'Treasure' },
                count: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Spelunking',
    'When ~ enters, draw a card, then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way, you gain 4 life.\nLands you control enter untapped.',
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'draw', player: { kind: 'you' }, count: 1 },
              {
                kind: 'moveToZone',
                objects: {
                  kind: 'choose',
                  filter: { zone: 'hand', types: ['land'], controller: 'you' },
                  optional: true,
                },
                to: 'battlefield',
              },
              {
                kind: 'conditional',
                condition: {
                  kind: 'objectMatches',
                  of: { kind: 'moved' },
                  filter: { subtypes: ['Cave'] },
                },
                effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 4 },
              },
            ],
          },
        },
        {
          kind: 'replacement',
          replacement: {
            kind: 'groupEntersUntapped',
            what: { types: ['land'], controller: 'you' },
          },
        },
      ],
    },
  ],
  [
    'Kardur, Doomscourge',
    'When ~ enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able.\nWhenever an attacking creature dies, each opponent loses 1 life and you gain 1 life.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'requireAttack',
            creatures: { types: ['creature'], controller: 'opponent' },
            duration: 'untilYourNextTurn',
            awayFromYou: true,
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { types: ['creature'], attacking: true } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
              { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
            ],
          },
        },
      ],
    },
  ],
  [
    "Conqueror's Flail",
    "Equipped creature gets +1/+1 for each color among permanents you control.\nAs long as ~ is attached to a creature, your opponents can't cast spells during your turn.\nEquip {2}",
    'artifact',
    ['Equipment'],
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'attached', types: ['creature'] },
            power: { kind: 'colorsAmong', filter: { controller: 'you' } },
            toughness: { kind: 'colorsAmong', filter: { controller: 'you' } },
          },
        },
        {
          kind: 'static',
          static: { kind: 'opponentsCantCastOnYourTurn' },
          condition: {
            kind: 'objectMatches',
            of: { kind: 'attached' },
            filter: { types: ['creature'] },
          },
        },
        { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['2'] }] } },
      ],
    },
  ],
];

describe('the seven real cards of the slice read as the engine runs them (D-179, D-180)', () => {
  test.each(REAL)('%s', (_name, text, type, subtypes, expected) => {
    const parsed = readAll(text, type, subtypes);
    if (expected.abilities !== undefined) expect(parsed.abilities).toEqual(expected.abilities);
    else expect(parsed.abilities).toEqual([]);
    if (expected.spell !== undefined) expect(parsed.spell).toEqual(expected.spell);
    else expect(parsed.spell ?? undefined).toBeUndefined();
  });
});

// ---- The siblings of each new reading

const json = (parsed: ReturnType<typeof readAll>) => JSON.stringify(parsed.abilities);

describe('"When you cycle this card" (CR 702.29c)', () => {
  test('this card, or the name of the card', () => {
    for (const who of ['this card', '~']) {
      const parsed = readAll(`Cycling {2}\nWhen you cycle ${who}, draw a card.`, 'creature');
      expect(parsed.abilities[1]).toMatchObject({ kind: 'triggered', trigger: { kind: 'cycled' } });
    }
  });

  test.each([
    'Whenever you cycle a card, draw a card.',
    'Whenever you cycle or discard a card, draw a card.',
    'When you cycle another card, draw a card.',
    'When an opponent cycles a card, draw a card.',
  ])('"%s" is not read', (text) => {
    expect(drop(`Cycling {2}\n${text}`).text).toContain('cycle');
  });
});

describe('"that spell\'s mana value" of a cast trigger (CR 202.3, 601.2i)', () => {
  test('whoever casts the spell', () => {
    const parsed = readAll(
      "Whenever you cast a spell, ~ deals damage equal to that spell's mana value to each opponent.",
      'creature',
    );
    expect(json(parsed)).toContain(
      '"amount":{"kind":"manaValueOf","of":{"kind":"triggerSubject"}}',
    );
    expect(json(parsed)).toContain('"by":"you"');
  });

  test('a gain of life reads it too', () => {
    const parsed = readAll(
      "Whenever an opponent casts a spell, you gain life equal to that spell's mana value.",
      'creature',
    );
    expect(json(parsed)).toContain('"kind":"manaValueOf"');
  });

  test('the power of a spell is not read: a spell has none', () => {
    expect(
      drop(
        "Whenever an opponent casts a spell, ~ deals damage equal to that spell's power to any target.",
      ).reason,
    ).not.toBe(undefined);
  });
});

describe('"target player or planeswalker" and "each creature that player controls" (CR 109.4, 306.1)', () => {
  test("a player or planeswalker target, any player or an opponent (D-200: the engine's playerOrObject)", () => {
    for (const [words, filter] of [
      ['target player or planeswalker', 'any'],
      ['target opponent or planeswalker', 'opponent'],
    ] as const) {
      const parsed = readAll(`~ deals 3 damage to ${words}.`, 'instant');
      expect(parsed.spell?.targets).toEqual([
        {
          id: 't1',
          what: { kind: 'playerOrObject', player: filter, filter: { types: ['planeswalker'] } },
        },
      ]);
    }
  });

  test("each creature, artifact or permanent that player controls is the engine's controlledBy", () => {
    for (const kind of ['creature', 'artifact', 'nonland permanent']) {
      const parsed = readAll(
        `~ deals 2 damage to target player and each ${kind} that player controls.`,
        'sorcery',
      );
      expect(JSON.stringify(parsed.spell)).toContain('"controlledBy":{"kind":"target","id":"t1"}');
    }
  });

  test('without "or that planeswalker\'s controller" too', () => {
    const parsed = readAll(
      '~ deals 2 damage to target opponent and each creature that player controls.',
      'sorcery',
    );
    expect(JSON.stringify(parsed.spell)).toContain('"controlledBy"');
  });

  test.each([
    '~ deals 2 damage to target player or planeswalkers.',
    '~ deals 2 damage to target player and each other creature that player controls.',
    '~ deals 2 damage to target player and each creature they control.',
  ])('"%s" is not read', (text) => {
    expect(drop(text, 'sorcery').reason).toBe('unrecognised');
  });

  test('"that player" with no player before it has nothing to refer to', () => {
    expect(
      drop(
        '~ deals 2 damage to target creature or planeswalker and each creature that player controls.',
        'sorcery',
      ).reason,
    ).toBe('unboundReference');
  });

  test('"or planeswalker" belongs to damage: another instruction does not take it', () => {
    expect(drop('Target player or planeswalker draws a card.', 'sorcery').reason).toBe(
      'unrecognised',
    );
  });
});

describe('"that was put there from the battlefield this turn" and "the exiled card\'s power" (CR 700.4, 400.7j)', () => {
  test("a graveyard card of the kind, from any graveyard or the opponent's", () => {
    const parsed = readAll(
      "Exile target artifact card from an opponent's graveyard that was put there from the battlefield this turn.",
      'sorcery',
    );
    expect(parsed.spell?.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: {
            zone: 'graveyard',
            types: ['artifact'],
            controller: 'opponent',
            putFromBattlefieldThisTurn: true,
          },
        },
      },
    ]);
  });

  test('it is a card of a graveyard: nothing else about the suffix is read', () => {
    expect(
      drop(
        "Exile target creature from an opponent's graveyard that was put there from the battlefield this turn.",
        'sorcery',
      ).reason,
    ).toBe('unrecognised');
    expect(
      drop(
        "Exile target creature card from an opponent's graveyard that was put there from the battlefield.",
        'sorcery',
      ).reason,
    ).toBe('unrecognised');
  });

  test('the toughness of the exiled card is read the same way', () => {
    const parsed = readAll(
      "Exile target creature card from an opponent's graveyard, then create X Treasure tokens, where X is the exiled card's toughness.",
      'sorcery',
    );
    expect(JSON.stringify(parsed.spell)).toContain('"kind":"toughnessOf"');
  });
});

describe('"If you put a Cave onto the battlefield this way" (CR 608.2c, 400.7j)', () => {
  test('a land type, a card type or modifiers', () => {
    for (const kind of ['a Cave', 'a land', 'an Island']) {
      const parsed = readAll(
        `When ~ enters, draw a card, then you may put a land card from your hand onto the battlefield. If you put ${kind} onto the battlefield this way, you gain 4 life.`,
        'creature',
      );
      expect(json(parsed)).toContain('"condition":{"kind":"objectMatches","of":{"kind":"moved"}');
    }
  });

  test.each([
    'When ~ enters, draw a card, then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield, you gain 4 life.',
    "When ~ enters, draw a card, then you may put a land card from your hand onto the battlefield. If you don't put a Cave onto the battlefield this way, you gain 4 life.",
    'When ~ enters, draw a card, then you may put a land card from your hand onto the battlefield. If you put Caves onto the battlefield this way, you gain 4 life.',
  ])('"%s" is not read', (text) => {
    expect(drop(text).reason).toBe('unrecognised');
  });
});

describe('"Lands you control enter untapped." (CR 614.12)', () => {
  test("a group of the controller's own, on a permanent that is not one of them", () => {
    const parsed = readAll('Creatures you control enter untapped.', 'enchantment');
    expect(parsed.abilities).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'groupEntersUntapped',
          what: { types: ['creature'], controller: 'you' },
        },
      },
    ]);
  });

  test('a permanent that is one of the group itself is read and not run', () => {
    expect(drop('Lands you control enter untapped.', 'land').reason).toBe('notRunnable');
  });

  test.each([
    'Lands enter untapped.',
    'Lands your opponents control enter untapped.',
    'Other lands you control enter untapped.',
    'Lands you control enter tapped.',
  ])('"%s" is not read', (text) => {
    expect(drop(text, 'enchantment').reason).toBe('unrecognised');
  });
});

describe('"until your next turn, creatures your opponents control attack each combat if able" (CR 508.1d, 611.2a)', () => {
  test('without the second requirement', () => {
    const parsed = readAll(
      'When ~ enters, until your next turn, creatures your opponents control attack each combat if able.',
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({
      effect: {
        kind: 'requireAttack',
        creatures: { types: ['creature'], controller: 'opponent' },
        duration: 'untilYourNextTurn',
      },
    });
    expect(json(parsed)).not.toContain('awayFromYou');
  });

  test.each([
    'When ~ enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you.',
    'When ~ enters, until your next turn, other creatures your opponents control attack each combat if able.',
    'When ~ enters, until your next turn, artifacts your opponents control attack each combat if able.',
    'When ~ enters, until your next turn, creatures attack each combat if able.',
    'When ~ enters, creatures your opponents control attack each combat if able and attack a player other than you if able.',
  ])('"%s" is not read', (text) => {
    expect(drop(text).reason).toBe('unrecognised');
  });
});

describe('"for each color among permanents you control" (CR 105.2)', () => {
  test('an Aura reads it as an Equipment does, the count over other permanents too', () => {
    const aura = readAll(
      'Enchant creature\nEnchanted creature gets +1/+1 for each color among permanents you control.',
      'enchantment',
      ['Aura'],
    );
    expect(JSON.stringify(aura.abilities)).toContain(
      '"power":{"kind":"colorsAmong","filter":{"controller":"you"}}',
    );
    const creatures = readAll(
      'Equipped creature gets +1/+1 for each color among creatures you control.\nEquip {2}',
      'artifact',
      ['Equipment'],
    );
    expect(JSON.stringify(creatures.abilities)).toContain('"types":["creature"]');
  });

  test('+1/+0 and +0/+1 read; another step than one is read and refused (the engine has no multiple of colors)', () => {
    const power = readAll(
      'Equipped creature gets +1/+0 for each color among permanents you control.\nEquip {2}',
      'artifact',
      ['Equipment'],
    );
    expect(JSON.stringify(power.abilities)).toContain('"toughness":0');
    expect(
      drop(
        'Equipped creature gets +2/+2 for each color among permanents you control.\nEquip {2}',
        'artifact',
        ['Equipment'],
      ).reason,
    ).toBe('notRunnable');
  });

  test.each([
    'Equipped creature gets +1/+1 for each color among permanents.',
    'Equipped creature gets +1/+1 for each color among cards in your hand.',
    'Equipped creature gets +1/+1 for each color among permanents your opponents control.',
    'Equipped creature gets +1/+1 for each color of mana.',
  ])('"%s" is not read', (text) => {
    expect(drop(`${text}\nEquip {2}`, 'artifact', ['Equipment']).reason).toBe('unrecognised');
  });
});

describe('"Your opponents can\'t cast spells during your turn." (CR 101.2, 604.1) and "as long as ~ is attached to a creature"', () => {
  test('alone, with no condition', () => {
    const parsed = readAll("Your opponents can't cast spells during your turn.", 'enchantment');
    expect(parsed.abilities).toEqual([
      { kind: 'static', static: { kind: 'opponentsCantCastOnYourTurn' } },
    ]);
  });

  test('the condition may come after it', () => {
    const parsed = readAll(
      "Your opponents can't cast spells during your turn as long as ~ is attached to a creature.\nEquip {1}",
      'artifact',
      ['Equipment'],
    );
    expect(parsed.abilities[0]).toMatchObject({
      static: { kind: 'opponentsCantCastOnYourTurn' },
      condition: { kind: 'objectMatches', of: { kind: 'attached' } },
    });
  });

  test.each([
    "Your opponents can't cast spells during their turn.",
    "Your opponents can't cast creature spells during your turn.",
    "Your opponents can't cast spells or activate abilities during your turn.",
    "Each opponent can't cast spells during your turn.",
    "As long as ~ is attached to a land, your opponents can't cast spells during your turn.",
    "As long as ~ isn't attached to a creature, your opponents can't cast spells during your turn.",
  ])('"%s" is not read', (text) => {
    expect(drop(text, 'artifact', ['Equipment']).reason).toBe('unrecognised');
  });
});
