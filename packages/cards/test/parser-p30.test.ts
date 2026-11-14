// Stage P30 (M12): the recursion slice of the engine (D-135, ENGINE_VERSION 30) read by the grammar. The lines are the real Oracle text of
// the nine cards that the golden corpus added for the Zombies precon (packages/cards/test/fixtures/corpus/golden.jsonl, the last lines,
// with the name replaced by ~); every other line is SYNTHETIC: the same shapes over other creature types, the near misses and the lines
// the grammar must not read. The engine runs what is lowered in convert-grammar-engine-p30.test.ts; a missing engine feature is named in
// parser-p30-needs.test.ts; each line as a whole card is in convert-grammar-corpus-p30.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const T2 = { kind: 'target', id: 't2' } as const;
const THIS_CARD = { kind: 'thisCard' } as const;
const MOVED = { kind: 'moved' } as const;

/** "Target creature card from your graveyard", as a target slot. */
const CREATURE_CARD_IN_YOUR_YARD = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'], controller: 'you' } },
} as const;

const drop = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  dropped(text, type, subtypes);

/** The abilities of a permanent text that read completely. */
const abilities = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  readAll(text, type, subtypes).abilities;

const spellOf = (text: string, type: 'instant' | 'sorcery' = 'sorcery') =>
  readAll(text, type).spell;

/** The effects of a spell text that is a sequence. */
function sequenceOf(text: string): { condition?: unknown }[] {
  const effect = spellOf(text)?.effect;
  if (effect?.kind !== 'sequence') throw new Error(`"${text}" is not a sequence`);
  return [...effect.effects] as { condition?: unknown }[];
}

const enters = { kind: 'entersBattlefield', what: THIS } as const;

/** The real Oracle text of the cards of the golden corpus (names replaced by ~), as the nodes the engine runs. */
const REAL: readonly (readonly [
  string,
  string,
  FaceType,
  readonly string[],
  { abilities?: unknown; spell?: unknown },
])[] = [
  [
    'Cemetery Recruitment',
    "Return target creature card from your graveyard to your hand. If it's a Zombie card, draw a card.",
    'sorcery',
    [],
    {
      spell: {
        targets: [CREATURE_CARD_IN_YOUR_YARD],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'moveToZone', objects: T1, to: 'hand' },
            {
              kind: 'conditional',
              condition: { kind: 'objectMatches', of: T1, filter: { subtypes: ['Zombie'] } },
              effect: { kind: 'draw', player: YOU, count: 1 },
            },
          ],
        },
      },
    },
  ],
  [
    'God-Eternal Bontu',
    "Menace\nWhen ~ enters, sacrifice any number of other permanents, then draw that many cards.\nWhen ~ dies or is put into exile from the battlefield, you may put her into her owner's library third from the top.",
    'creature',
    ['Zombie', 'God'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'menace' } },
        {
          kind: 'triggered',
          trigger: enters,
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'sacrifice',
                objects: { kind: 'choose', filter: { other: true }, anyNumber: true },
              },
              { kind: 'draw', player: YOU, count: { kind: 'thisWay', what: 'sacrificed' } },
            ],
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'leavesBattlefield', what: THIS, to: ['graveyard', 'exile'] },
          optional: true,
          effect: { kind: 'moveToZone', objects: THIS_CARD, to: 'library', position: 3 },
        },
      ],
    },
  ],
  [
    'Scrapshooter',
    'Gift a card\nReach\nWhen ~ enters, if the gift was promised, destroy target artifact or enchantment an opponent controls.',
    'creature',
    ['Raccoon', 'Archer'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'gift', gift: 'card' } },
        { kind: 'keyword', keyword: { kind: 'reach' } },
        {
          kind: 'triggered',
          trigger: enters,
          interveningIf: { kind: 'giftPromised' },
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: {
                  zone: 'battlefield',
                  controller: 'opponent',
                  anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
                },
              },
            },
          ],
          effect: { kind: 'destroy', objects: T1 },
        },
      ],
    },
  ],
  [
    'Undead Butler',
    'When ~ enters, mill three cards.\nWhen ~ dies, you may exile it. When you do, return target creature card from your graveyard to your hand.',
    'creature',
    ['Zombie'],
    {
      abilities: [
        { kind: 'triggered', trigger: enters, effect: { kind: 'mill', player: YOU, count: 3 } },
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: THIS },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'may', effect: { kind: 'exile', objects: THIS_CARD } },
              {
                kind: 'reflexive',
                targets: [CREATURE_CARD_IN_YOUR_YARD],
                effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Razorlash Transmogrant',
    "~ can't block.\n{4}{B}{B}: Return this card from your graveyard to the battlefield with a +1/+1 counter on it. This ability costs {4} less to activate if an opponent controls four or more nonbasic lands.",
    'creature',
    ['Zombie'],
    {
      abilities: [
        {
          kind: 'static',
          static: { kind: 'restriction', subject: THIS, restriction: 'cantBlock' },
        },
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['4', 'B', 'B'] }],
          functionsIn: 'graveyard',
          costReducedIf: {
            generic: 4,
            condition: {
              kind: 'opponentControlsAtLeast',
              filter: { types: ['land'], notSupertypes: ['basic'] },
              count: 4,
            },
          },
          effect: {
            kind: 'moveToZone',
            objects: THIS,
            to: 'battlefield',
            controller: 'owner',
            withCounters: { counter: '+1/+1', count: 1 },
          },
        },
      ],
    },
  ],
  [
    "Witch's Cottage",
    'This land enters tapped unless you control three or more other Swamps.\nWhen ~ enters untapped, you may put target creature card from your graveyard on top of your library.',
    'land',
    ['Swamp'],
    {
      abilities: [
        {
          kind: 'replacement',
          replacement: {
            kind: 'entersTapped',
            unless: {
              kind: 'controlsAtLeast',
              filter: { subtypes: ['Swamp'], other: true },
              count: 3,
            },
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: THIS, tapped: false },
          optional: true,
          targets: [CREATURE_CARD_IN_YOUR_YARD],
          effect: { kind: 'moveToZone', objects: T1, to: 'library', position: 'top' },
        },
      ],
    },
  ],
  [
    'War Room',
    "{T}: Add {C}.\n{3}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card.",
    'land',
    [],
    {
      abilities: [
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['3'] },
            { kind: 'tap' },
            { kind: 'payLife', amount: { kind: 'commanderColors' } },
          ],
          effect: { kind: 'draw', player: YOU, count: 1 },
        },
      ],
    },
  ],
  [
    'Zul Ashur, Lich Lord',
    'Ward—Pay 2 life.\n{T}: You may cast target Zombie creature card from your graveyard this turn.',
    'creature',
    ['Zombie', 'Warlock'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'payLife', amount: 2 }] } },
        {
          kind: 'activated',
          cost: [{ kind: 'tap' }],
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: {
                  zone: 'graveyard',
                  types: ['creature'],
                  subtypes: ['Zombie'],
                  controller: 'you',
                },
              },
            },
          ],
          effect: { kind: 'mayCast', objects: T1, duration: 'untilEndOfTurn' },
        },
      ],
    },
  ],
  [
    'Consumed by Greed',
    'Gift a card\nTarget opponent sacrifices a creature with the greatest power among creatures they control. If the gift was promised, return target creature card from your graveyard to your hand.',
    'instant',
    [],
    {
      abilities: [{ kind: 'keyword', keyword: { kind: 'gift', gift: 'card' } }],
      spell: {
        targets: [
          { id: 't1', what: { kind: 'player', filter: 'opponent' } },
          { ...CREATURE_CARD_IN_YOUR_YARD, id: 't2', ifGiftPromised: true },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'sacrifice',
              objects: { kind: 'choose', filter: { types: ['creature'] }, greatest: 'power' },
              player: T1,
            },
            {
              kind: 'conditional',
              condition: { kind: 'giftPromised' },
              effect: { kind: 'moveToZone', objects: T2, to: 'hand' },
            },
          ],
        },
      },
    },
  ],
];

describe('the real cards of the Zombies precon read as the nodes of D-135', () => {
  test.each(REAL)('%s', (_name, text, type, subtypes, expected) => {
    const parsed = readAll(text, type, subtypes);
    if (expected.abilities !== undefined) expect(parsed.abilities).toEqual(expected.abilities);
    if (expected.spell !== undefined) expect(parsed.spell).toEqual(expected.spell);
    else expect(parsed.spell ?? undefined).toBeUndefined();
  });
});

describe('"If it\'s a <type> card" over every creature type (CR 608.2c, 113.7a, 205.3)', () => {
  test.each([
    ['Zombie', { subtypes: ['Zombie'] }],
    ['Goblin', { subtypes: ['Goblin'] }],
    ['Angel', { subtypes: ['Angel'] }],
    ['Time Lord', { subtypes: ['Time Lord'] }],
    ['Elf Warrior', { subtypes: ['Elf', 'Warrior'] }],
    ['Zombie creature', { subtypes: ['Zombie'], types: ['creature'] }],
  ])('a %s card: the same condition over the type of the table', (words, filter) => {
    const text = `Return target creature card from your graveyard to your hand. If it's a ${words} card, draw a card.`;
    expect(spellOf(text)?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'moveToZone', objects: T1, to: 'hand' },
        {
          kind: 'conditional',
          condition: { kind: 'objectMatches', of: T1, filter },
          effect: { kind: 'draw', player: YOU, count: 1 },
        },
      ],
    });
  });

  test.each([
    ["it's an Angel", { subtypes: ['Angel'] }],
    ["it's a creature card", { types: ['creature'] }],
    ["it's a nonland card", { notTypes: ['land'] }],
    ["it's a legendary creature", { supertypes: ['legendary'], types: ['creature'] }],
    ['it’s a Zombie', { subtypes: ['Zombie'] }],
  ])('%s: with or without the word "card", with modifiers and card types', (words, filter) => {
    const text = `Return target creature card from your graveyard to your hand. If ${words}, you gain 2 life.`;
    const effects = sequenceOf(text);
    expect(effects[1]?.condition).toEqual({ kind: 'objectMatches', of: T1, filter });
  });

  test('after a return to the battlefield the card is "the object that was moved", for the condition and the counters', () => {
    expect(
      spellOf(
        "Return target creature card from your graveyard to the battlefield. If it's an Angel, put two +1/+1 counters on it.",
      )?.effect,
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'moveToZone', objects: T1, to: 'battlefield', controller: 'you' },
        {
          kind: 'conditional',
          condition: { kind: 'objectMatches', of: MOVED, filter: { subtypes: ['Angel'] } },
          effect: { kind: 'addCounters', objects: MOVED, counter: '+1/+1', count: 2 },
        },
      ],
    });
  });

  test('a target that was destroyed is read as it was: the condition names the target', () => {
    const effects = sequenceOf("Destroy target creature. If it's a Zombie, you gain 2 life.");
    expect(effects[1]?.condition).toEqual({
      kind: 'objectMatches',
      of: { kind: 'target', id: 't1' },
      filter: { subtypes: ['Zombie'] },
    });
  });

  test('a triggered ability reads it too, with the trigger subject as the antecedent kept apart from the target', () => {
    const [ability] = abilities(
      "When ~ enters, return target creature card from your graveyard to your hand. If it's a Zombie card, draw a card.",
      'creature',
      ['Zombie'],
    );
    expect(ability).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', objects: T1, to: 'hand' },
          { kind: 'conditional', condition: { kind: 'objectMatches', of: T1 } },
        ],
      },
    });
  });

  test.each([
    ["Return target creature card from your graveyard to your hand. If it's a card, draw a card."],
    [
      "Return target creature card from your graveyard to your hand. If it's not a Zombie card, draw a card.",
    ],
    [
      "Return target creature card from your graveyard to your hand. If it's a Banana card, draw a card.",
    ],
    [
      "Return target creature card from your graveyard to your hand. If it's a Zombie or a Goblin, draw a card.",
    ],
    [
      "Return target creature card from your graveyard to your hand. If it's a Zombie card from your graveyard, draw a card.",
    ],
  ])('%s is not read', (text) => {
    expect(drop(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });

  test('"it" with nothing to refer to is not run', () => {
    expect(drop("Draw a card. If it's a Zombie card, gain 2 life.", 'sorcery')).toMatchObject({
      reason: 'unboundReference',
    });
  });

  test('"it" after a group has no single object to mean: not run', () => {
    expect(
      drop("Destroy all creatures. If it's a Zombie, you gain 2 life.", 'sorcery'),
    ).toMatchObject({ reason: 'unboundReference' });
  });
});

describe('"you may ... If you do, ..." (CR 608.2c, 603.12, 701.48a)', () => {
  const triggered = (body: string) => abilities(`When ~ enters, ${body}`, 'creature', ['Goblin']);

  test.each([
    [
      'you may discard a card. If you do, draw two cards.',
      { kind: 'discard', player: YOU, count: 1 },
      { kind: 'draw', player: YOU, count: 2 },
    ],
    [
      'you may sacrifice another creature. If you do, you gain 3 life.',
      {
        kind: 'sacrifice',
        objects: { kind: 'choose', filter: { types: ['creature'], other: true } },
      },
      { kind: 'gainLife', player: YOU, amount: 3 },
    ],
    [
      'you may mill two cards. If you do, draw a card.',
      { kind: 'mill', player: YOU, count: 2 },
      { kind: 'draw', player: YOU, count: 1 },
    ],
    [
      'you may draw a card. If you do, discard a card.',
      { kind: 'draw', player: YOU, count: 1 },
      { kind: 'discard', player: YOU, count: 1 },
    ],
  ])('%s', (body, offered, bought) => {
    expect(triggered(body)).toEqual([
      {
        kind: 'triggered',
        trigger: enters,
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may', effect: offered },
            { kind: 'conditional', condition: { kind: 'didPrevious' }, effect: bought },
          ],
        },
      },
    ]);
  });

  test('the same words after a spell is cast and in the middle of a longer text', () => {
    expect(
      abilities(
        'Whenever you cast a creature spell, you may discard a card. If you do, draw a card.',
        'artifact',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', types: ['creature'] },
          by: 'you',
        },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may', effect: { kind: 'discard', player: YOU, count: 1 } },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: { kind: 'draw', player: YOU, count: 1 },
            },
          ],
        },
      },
    ]);
    const [ability] = triggered('gain 1 life. You may discard a card. If you do, draw a card.');
    expect(ability).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainLife' },
          { kind: 'may' },
          { kind: 'conditional', condition: { kind: 'didPrevious' } },
        ],
      },
    });
  });

  test('"you may pay {N}. If you do" stays the engine\'s mayPay', () => {
    const [ability] = abilities(
      'At the beginning of your upkeep, you may pay {1}. If you do, draw a card.',
      'creature',
    );
    expect(ability).toMatchObject({
      effect: { kind: 'mayPay', cost: [{ kind: 'mana', symbols: ['1'] }] },
    });
  });

  test.each([
    [
      'you may gain 2 life. If you do, draw a card.',
      'the engine cannot tell whether a gain was done',
    ],
    [
      'you may discard a card and draw a card. If you do, draw a card.',
      'one instruction is offered',
    ],
    ['you may discard a card. If you do, you may draw a card.', 'what is bought is not optional'],
    [
      'you may discard a card. If you do, draw a card instead.',
      'an "instead" is another statement',
    ],
    ['If you do, draw a card.', 'nothing was offered'],
    // ("Exile it. If you do, ..." after an instruction the engine can tell was done is read since stage P31, D-140.)
    ['gain 2 life. If you do, draw a card.', 'a sentence that is not an offer'],
    ['you may discard a card. If you do, draw a card. Gain 1 life if you do.', 'a second one'],
  ])('%s is read and not run (%s)', (body) => {
    expect(drop(`When ~ enters, ${body}`, 'creature', ['Goblin'])).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });

  test('a "you may" of the whole ability beside an offer would be two questions: not run', () => {
    expect(
      drop(
        'When ~ enters, you may draw a card. You may discard a card. If you do, draw a card.',
        'creature',
      ),
    ).toMatchObject({ reason: 'notRunnable' });
  });

  test('a spell reads the offer to discard (stage P56, D-214: Improvised Act) and no other "you may"', () => {
    expect(drop('You may draw a card. If you do, draw a card.', 'sorcery')).toMatchObject({
      reason: 'unrecognised',
    });
    expect(drop('You may scry 1. If you do, draw a card.', 'sorcery')).toMatchObject({
      reason: 'unrecognised',
    });
  });
});

describe('"When you do, ..." is a reflexive triggered ability (CR 603.12)', () => {
  test.each([
    [
      'you may sacrifice another creature. When you do, ~ deals 3 damage to any target.',
      {
        kind: 'sacrifice',
        objects: { kind: 'choose', filter: { types: ['creature'], other: true } },
      },
      {
        targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
        effect: { kind: 'dealDamage', amount: 3, to: T1 },
      },
    ],
    [
      'you may exile it. When you do, draw a card.',
      { kind: 'exile', objects: THIS },
      { effect: { kind: 'draw', player: YOU, count: 1 } },
    ],
  ])('%s', (body, offered, reflexive) => {
    const [ability] = abilities(`When ~ enters, ${body}`, 'creature', ['Goblin']);
    expect(ability).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'may', effect: offered },
          { kind: 'reflexive', ...reflexive },
        ],
      },
    });
  });

  test('"it" in the offer of a dying creature is the card it became, over every creature type', () => {
    for (const type of ['Zombie', 'Goblin', 'Angel']) {
      const [ability] = abilities(
        'When ~ dies, you may exile it. When you do, return target creature card from your graveyard to your hand.',
        'creature',
        [type],
      );
      expect(ability).toMatchObject({
        trigger: { kind: 'dies', what: THIS },
        effect: {
          effects: expect.arrayContaining([
            { kind: 'may', effect: { kind: 'exile', objects: THIS_CARD } },
          ]),
        },
      });
    }
  });

  test('the targets of the reflexive ability are its own, and the ability that made it has none', () => {
    const [ability] = abilities(
      'When ~ enters, you may exile it. When you do, destroy target artifact.',
      'creature',
      ['Zombie'],
    );
    expect(ability).not.toHaveProperty('targets');
    expect(ability).toMatchObject({
      effect: {
        effects: [
          { kind: 'may' },
          { kind: 'reflexive', targets: [{ id: 't1' }], effect: { kind: 'destroy', objects: T1 } },
        ],
      },
    });
  });

  test.each([
    ['When you do, draw a card.', 'nothing was offered'],
    [
      'you may exile it. When you do, draw a card. Gain 1 life.',
      'the reflexive ability is the last effect',
    ],
    ['you may exile it. When you do, you may draw a card.', 'what follows is not optional'],
    [
      'you may gain 1 life. When you do, draw a card.',
      'the engine cannot tell whether a gain was done',
    ],
    ['you may exile it. When you do, draw a card instead.', 'an "instead" is another statement'],
  ])('%s is read and not run (%s)', (body) => {
    expect(drop(`When ~ enters, ${body}`, 'creature', ['Goblin'])).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });

  test('a spell has no reflexive ability in the grammar', () => {
    expect(
      drop('You may exile target card from a graveyard. When you do, draw a card.', 'sorcery'),
    ).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"enters untapped" and "enters tapped" (CR 603.6a, 614.1c)', () => {
  test.each([
    ['~ enters untapped', THIS, false],
    ['~ enters the battlefield untapped', THIS, false],
    ['~ enters tapped', THIS, true],
  ])('When %s, draw a card.', (event, what, tapped) => {
    expect(abilities(`When ${event}, you gain 1 life.`, 'land')).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what, tapped },
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ]);
  });

  test.each([
    ['Zombie', 'Zombies'],
    ['Goblin', 'Goblins'],
    ['Angel', 'Angels'],
  ])('a %s you control that enters untapped: a filter in place of ~', (type) => {
    expect(abilities(`Whenever another ${type} you control enters untapped, draw a card.`)).toEqual(
      [
        {
          kind: 'triggered',
          trigger: {
            kind: 'entersBattlefield',
            what: { subtypes: [type], other: true, controller: 'you' },
            tapped: false,
          },
          effect: { kind: 'draw', player: YOU, count: 1 },
        },
      ],
    );
  });

  test('"it" in the body is the permanent that entered', () => {
    const [ability] = abilities(
      'Whenever another creature you control enters untapped, put a +1/+1 counter on it.',
    );
    expect(ability).toMatchObject({
      effect: { kind: 'addCounters', objects: { kind: 'triggerSubject' } },
    });
  });

  test.each([
    'When ~ enters untapped or attacks, draw a card.',
    'When ~ enters untap, draw a card.',
    'When ~ dies untapped, draw a card.',
    'Whenever a land you control enters untapped, draw a card.',
    'When ~ enters tapped and attacking, draw a card.',
  ])('%s is not read', (text) => {
    expect(drop(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"dies or is put into exile from the battlefield" (CR 700.4, 603.6c, 603.10a)', () => {
  test.each([
    ['~ dies or is put into exile from the battlefield', THIS, ['graveyard', 'exile']],
    ['~ is put into exile from the battlefield', THIS, 'exile'],
    [
      'another Zombie you control dies or is put into exile from the battlefield',
      { subtypes: ['Zombie'], other: true, controller: 'you' },
      ['graveyard', 'exile'],
    ],
    [
      'a Goblin dies or is put into exile from the battlefield',
      { subtypes: ['Goblin'] },
      ['graveyard', 'exile'],
    ],
  ])('Whenever %s, draw a card.', (event, what, to) => {
    expect(abilities(`Whenever ${event}, draw a card.`)).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'leavesBattlefield', what, to },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ]);
  });

  test('"it" is the card the permanent became when the trigger is about ~ itself, for exile and for the library', () => {
    expect(
      abilities('When ~ is put into exile from the battlefield, you may exile it.', 'creature'),
    ).toBeDefined();
    const [ability] = abilities(
      "When ~ dies or is put into exile from the battlefield, you may put it into its owner's library second from the top.",
    );
    expect(ability).toMatchObject({
      optional: true,
      effect: { kind: 'moveToZone', objects: THIS_CARD, to: 'library', position: 2 },
    });
  });

  test.each([
    '~ dies or is put into exile',
    '~ dies or is put into exile from the battlefield or attacks',
    '~ dies or is put into your graveyard from the battlefield',
    '~ is put into a graveyard or exile from the battlefield',
  ])('%s is not read', (event) => {
    expect(drop(`Whenever ${event}, draw a card.`, 'creature')).toMatchObject({
      reason: 'unrecognised',
    });
  });
});

describe('a card put into a library "Nth from the top" (CR 401.7)', () => {
  test.each([
    ['second', 2],
    ['third', 3],
    ['fourth', 4],
    ['fifth', 5],
    ['tenth', 10],
  ])('%s from the top is position %i', (word, position) => {
    expect(
      spellOf(`Put target creature into its owner's library ${word} from the top.`)?.effect,
    ).toEqual({
      kind: 'moveToZone',
      objects: T1,
      to: 'library',
      position,
    });
  });

  test.each([
    ['her', 'her'],
    ['him', 'his'],
    ['it', 'its'],
    ['it', 'their'],
  ])('"put %s into %s owner\'s library" for the card a permanent became', (pronoun, possessive) => {
    const [ability] = abilities(
      `When ~ dies, you may put ${pronoun} into ${possessive} owner's library third from the top.`,
    );
    expect(ability).toMatchObject({
      optional: true,
      effect: { kind: 'moveToZone', objects: THIS_CARD, to: 'library', position: 3 },
    });
  });

  test.each([
    "Put target creature into its owner's library first from the top.",
    "Put target creature into its owner's library third from the bottom.",
    'Put target creature into your library third from the top.',
    "Put target creature card from your graveyard into its owner's library third from the top.",
    "Put target creature into its owner's library eleventh from the top.",
  ])('%s is not read', (text) => {
    expect(drop(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });

  test('"it" in a trigger that is not about the death of ~ is not the card it became', () => {
    expect(
      drop(
        "Whenever another creature you control dies, put it into its owner's library third from the top.",
        'creature',
      ),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('"sacrifice any number of ..., then draw that many cards" (CR 701.21)', () => {
  test.each([
    ['other permanents', { other: true }],
    ['permanents', {}],
    ['creatures', { types: ['creature'] }],
    ['other nonland permanents', { notTypes: ['land'], other: true }],
    ['Zombies you control', { subtypes: ['Zombie'], controller: 'you' }],
    ['other artifacts', { types: ['artifact'], other: true }],
  ])('any number of %s', (words, filter) => {
    expect(spellOf(`Sacrifice any number of ${words}, then draw that many cards.`)?.effect).toEqual(
      {
        kind: 'sequence',
        effects: [
          { kind: 'sacrifice', objects: { kind: 'choose', filter, anyNumber: true } },
          { kind: 'draw', player: YOU, count: { kind: 'thisWay', what: 'sacrificed' } },
        ],
      },
    );
  });

  test('"that many" after a sacrifice of a count is the count of what was sacrificed', () => {
    expect(spellOf('Sacrifice two creatures, then draw that many cards.')?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'sacrifice',
          objects: { kind: 'choose', filter: { types: ['creature'] }, count: 2 },
        },
        { kind: 'draw', player: YOU, count: { kind: 'thisWay', what: 'sacrificed' } },
      ],
    });
  });

  test('"that many" in the next sentence counts the same sacrifice', () => {
    expect(spellOf('Sacrifice any number of creatures. Draw that many cards.')?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'sacrifice',
          objects: { kind: 'choose', filter: { types: ['creature'] }, anyNumber: true },
        },
        { kind: 'draw', player: YOU, count: { kind: 'thisWay', what: 'sacrificed' } },
      ],
    });
  });

  test.each([
    ['Mill three cards, then draw that many cards.', 'sorcery'],
    ['Discard two cards, then draw that many cards.', 'sorcery'],
    ['Draw that many cards.', 'sorcery'],
    ['If you control a commander, sacrifice a creature, then draw that many cards.', 'sorcery'],
  ])('%s is not run: nothing before it sacrificed in the same list', (text, type) => {
    expect(drop(text, type as FaceType)).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });

  test.each([
    'Sacrifice any number of creatures an opponent controls.',
    'Sacrifice any number of target creatures.',
    'Sacrifice any number of cards.',
    'Sacrifice any number of other.',
    'Sacrifice any number of creature.',
  ])('%s is not read', (text) => {
    expect(drop(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"a creature with the greatest power among creatures they control" (CR 701.21a, 208.1, 202.3)', () => {
  test.each([
    ['creature', 'creatures', 'power', 'power', { types: ['creature'] }],
    ['creature', 'creatures', 'toughness', 'toughness', { types: ['creature'] }],
    ['artifact', 'artifacts', 'mana value', 'manaValue', { types: ['artifact'] }],
    ['permanent', 'permanents', 'mana value', 'manaValue', {}],
    ['nonland permanent', 'nonland permanents', 'mana value', 'manaValue', { notTypes: ['land'] }],
  ])('a %s with the greatest %s', (one, many, word, stat, filter) => {
    expect(
      spellOf(
        `Target opponent sacrifices a ${one} with the greatest ${word} among ${many} they control.`,
      )?.effect,
    ).toEqual({
      kind: 'sacrifice',
      objects: { kind: 'choose', filter, greatest: stat },
      player: T1,
    });
  });

  test('each opponent, and a player who sacrifices "of their choice" before it', () => {
    expect(
      spellOf(
        'Each opponent sacrifices a creature with the greatest power among creatures they control.',
      )?.effect,
    ).toEqual({
      kind: 'sacrifice',
      objects: { kind: 'choose', filter: { types: ['creature'] }, greatest: 'power' },
      player: { kind: 'eachOpponent' },
    });
  });

  test.each([
    'Target opponent sacrifices a creature with the greatest power among creatures you control.',
    'Target opponent sacrifices a creature with the greatest power among artifacts they control.',
    'Target opponent sacrifices a creature with the least power among creatures they control.',
    'Target opponent sacrifices a creature with the greatest power.',
    'Target opponent sacrifices creatures with the greatest power among creatures they control.',
    'Target opponent sacrifices a creature with the greatest loyalty among creatures they control.',
  ])('%s is not read', (text) => {
    expect(drop(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });

  test('the imperative "sacrifice" has no one else to say "they" of', () => {
    expect(
      drop('Sacrifice a creature with the greatest power among creatures they control.', 'sorcery'),
    ).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('Gift a card (CR 702.174)', () => {
  test('a permanent: the keyword, and an intervening "if the gift was promised"', () => {
    expect(
      abilities('Gift a card\nWhen ~ enters, if the gift was promised, draw a card.', 'creature', [
        'Dinosaur',
      ]),
    ).toEqual([
      { kind: 'keyword', keyword: { kind: 'gift', gift: 'card' } },
      {
        kind: 'triggered',
        trigger: enters,
        interveningIf: { kind: 'giftPromised' },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ]);
  });

  test('an instant with a sentence that begins "If the gift was promised"', () => {
    const parsed = readAll(
      'Gift a card\nDestroy target creature. If the gift was promised, you gain 4 life.',
      'instant',
    );
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'gift', gift: 'card' } },
    ]);
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: T1 },
        {
          kind: 'conditional',
          condition: { kind: 'giftPromised' },
          effect: { kind: 'gainLife', player: YOU, amount: 4 },
        },
      ],
    });
    expect(parsed.spell?.targets).toEqual([
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ]);
  });

  test('only a target of the sentence that says "if the gift was promised" exists only then (CR 702.174m)', () => {
    const parsed = readAll(
      'Gift a card\nDestroy target creature. If the gift was promised, destroy target artifact.',
      'sorcery',
    );
    expect(parsed.spell?.targets).toEqual([
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
      {
        id: 't2',
        ifGiftPromised: true,
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
      },
    ]);
  });

  test('a target of a sentence with another condition is an ordinary one', () => {
    const parsed = readAll(
      "Gift a card\nDestroy target creature. If you're the monarch, destroy target artifact.",
      'sorcery',
    );
    for (const target of parsed.spell?.targets ?? [])
      expect(target).not.toHaveProperty('ifGiftPromised');
  });

  test('a target of the intervening "if" of a permanent is an ordinary one (the ability exists only then)', () => {
    const [, trigger] = abilities(
      'Gift a card\nWhen ~ enters, if the gift was promised, destroy target creature.',
      'creature',
    );
    expect(trigger).toMatchObject({
      targets: [{ id: 't1' }],
      interveningIf: { kind: 'giftPromised' },
    });
    expect(trigger).not.toHaveProperty('targets.0.ifGiftPromised');
  });

  test.each([
    'Gift a Food',
    'Gift a Treasure',
    'Gift a tapped Fish',
    'Gift an extra turn',
    'Gift two cards',
  ])('%s is another gift, which the engine does not run: not read', (line) => {
    expect(drop(line, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test.each([
    "When ~ enters, if the gift wasn't promised, draw a card.",
    'When ~ enters, if the gift was not promised, draw a card.',
    'When ~ enters, if its gift cost was paid, draw a card.',
  ])('%s is not read', (text) => {
    expect(drop(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"You may cast target <type> card from your graveyard this turn" (CR 601.2, 611.2a, 514.2)', () => {
  test.each([
    ['Zombie creature', { types: ['creature'], subtypes: ['Zombie'] }],
    ['Goblin', { subtypes: ['Goblin'] }],
    ['Angel creature', { types: ['creature'], subtypes: ['Angel'] }],
    ['creature', { types: ['creature'] }],
    ['instant or sorcery', { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] }],
  ])('target %s card, over every type', (words, filter) => {
    expect(
      abilities(`{T}: You may cast target ${words} card from your graveyard this turn.`),
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'graveyard', ...filter, controller: 'you' } },
          },
        ],
        effect: { kind: 'mayCast', objects: T1, duration: 'untilEndOfTurn' },
      },
    ]);
  });

  test('"until end of turn" says the same', () => {
    const [ability] = abilities(
      '{2}, {T}: You may cast target creature card from your graveyard until end of turn.',
    );
    expect(ability).toMatchObject({ effect: { kind: 'mayCast', duration: 'untilEndOfTurn' } });
  });

  test.each([
    '{T}: You may cast target creature card from a graveyard this turn.',
    "{T}: You may cast target creature card from an opponent's graveyard this turn.",
    '{T}: You may cast two target creature cards from your graveyard this turn.',
    '{T}: You may cast up to one target creature card from your graveyard this turn.',
    '{T}: You may cast target creature card from your graveyard.',
    '{T}: You may cast target creature card from your graveyard without paying its mana cost.',
    '{T}: You may play target land card from your graveyard this turn.',
  ])('%s is not read', (text) => {
    expect(drop(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test('the "you may" of a triggered ability is an optional ability, not this permission', () => {
    expect(
      drop(
        'When ~ enters, you may cast target creature card from your graveyard this turn.',
        'creature',
      ),
    ).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('an ability of the card that works from the graveyard (CR 113.6b)', () => {
  test('a self-return from the graveyard enters the battlefield tapped', () => {
    expect(
      abilities('{2}: Return this card from your graveyard to the battlefield tapped.'),
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }],
        functionsIn: 'graveyard',
        effect: {
          kind: 'moveToZone',
          objects: THIS,
          to: 'battlefield',
          controller: 'owner',
          tapped: true,
        },
      },
    ]);
  });

  test.each([
    [
      'battlefield',
      'the battlefield with a +1/+1 counter on it',
      { withCounters: { counter: '+1/+1', count: 1 } },
    ],
    [
      'battlefield',
      'the battlefield with two +1/+1 counters on it',
      { withCounters: { counter: '+1/+1', count: 2 } },
    ],
    ['battlefield', 'the battlefield', {}],
  ])('{2}{B}: Return this card from your graveyard to %s', (_zone, where, extra) => {
    expect(abilities(`{2}{B}: Return this card from your graveyard to ${where}.`)).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2', 'B'] }],
        functionsIn: 'graveyard',
        effect: {
          kind: 'moveToZone',
          objects: THIS,
          to: 'battlefield',
          controller: 'owner',
          ...extra,
        },
      },
    ]);
  });

  test('to the hand, for any creature type of a card with the name in the text', () => {
    for (const type of ['Zombie', 'Goblin', 'Angel']) {
      expect(
        abilities('{3}: Return ~ from your graveyard to your hand.', 'creature', [type]),
      ).toEqual([
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['3'] }],
          functionsIn: 'graveyard',
          effect: { kind: 'moveToZone', objects: THIS, to: 'hand' },
        },
      ]);
    }
  });

  test.each([
    [
      '{T}: Return this card from your graveyard to the battlefield.',
      'it taps: nothing of the battlefield is paid from there',
    ],
    [
      '{2}, Sacrifice a creature: Return this card from your graveyard to the battlefield.',
      'it sacrifices',
    ],
    [
      '{2}: Return this card from your graveyard to the battlefield. Draw a card.',
      'more than one instruction',
    ],
    [
      '{2}: Draw a card. Return this card from your graveyard to the battlefield.',
      'more than one instruction',
    ],
    ['{2}: Return this card from a graveyard to the battlefield.', 'not your graveyard'],
    [
      '{2}: Return this card from your graveyard to your hand with a +1/+1 counter on it.',
      'a hand has no counters',
    ],
  ])('%s is not run (%s)', (text) => {
    expect(drop(text, 'creature', ['Zombie'])).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });

  test('a triggered ability, a spell and a static ability have no graveyard to work from: not run', () => {
    expect(
      drop('When ~ enters, return this card from your graveyard to the battlefield.', 'creature'),
    ).toMatchObject({ reason: 'notRunnable' });
    expect(
      drop('Return this card from your graveyard to the battlefield.', 'sorcery'),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('"This ability costs {N} less to activate if ..." (CR 601.2f, 602.2b)', () => {
  const returns = '{4}{B}{B}: Return this card from your graveyard to the battlefield.';

  test.each([
    [
      'an opponent controls four or more nonbasic lands',
      4,
      {
        kind: 'opponentControlsAtLeast',
        filter: { types: ['land'], notSupertypes: ['basic'] },
        count: 4,
      },
    ],
    [
      'an opponent controls two or more creatures',
      2,
      {
        kind: 'opponentControlsAtLeast',
        filter: { types: ['creature'] },
        count: 2,
      },
    ],
    [
      'an opponent controls three or more Zombies',
      3,
      {
        kind: 'opponentControlsAtLeast',
        filter: { subtypes: ['Zombie'] },
        count: 3,
      },
    ],
    ['you control a commander', 1, { kind: 'controlCommander' }],
    [
      'you control three or more other Zombies',
      1,
      {
        kind: 'controlsAtLeast',
        filter: { subtypes: ['Zombie'], other: true },
        count: 3,
      },
    ],
  ])('if %s', (words, generic, condition) => {
    const [ability] = abilities(
      `${returns} This ability costs {${generic}} less to activate if ${words}.`,
    );
    expect(ability).toMatchObject({
      kind: 'activated',
      functionsIn: 'graveyard',
      costReducedIf: { generic, condition },
    });
  });

  test('the reduction of an ability of the battlefield too, beside "Activate only as a sorcery"', () => {
    const [ability] = abilities(
      '{3}{B}: Draw a card. This ability costs {2} less to activate if you control a commander. Activate only as a sorcery.',
    );
    expect(ability).toMatchObject({
      kind: 'activated',
      timing: 'sorcery',
      costReducedIf: { generic: 2, condition: { kind: 'controlCommander' } },
    });
  });

  test.each([
    ['{2}: Draw a card. This ability costs {2} less to activate.', 'no condition'],
    [
      '{2}: Draw a card. This ability costs {G} less to activate if you control a commander.',
      'colored',
    ],
    ['{2}: Draw a card. This ability costs {X} less to activate if you control a commander.', 'X'],
    [
      '{2}: Draw a card. This ability costs {0} less to activate if you control a commander.',
      'zero',
    ],
    [
      '{2}: Draw a card. This ability costs {2}{B} less to activate if you control a commander.',
      'two symbols',
    ],
    [
      '{2}: Draw a card. This ability costs {2} more to activate if you control a commander.',
      'more',
    ],
    [
      '{2}: Draw a card. This ability costs {1} less to activate if you control a commander. This ability costs {1} less to activate if you control a commander.',
      'twice',
    ],
    // ("costs {1} less to activate for each creature you control" reads since stage P31, D-140: `costReducedBy`.)
  ])('%s is not read (%s)', (text) => {
    expect(drop(text, 'creature')).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });

  test('a mana ability has no reduction the engine runs', () => {
    expect(
      drop(
        '{1}, {T}: Add {G}{G}. This ability costs {1} less to activate if you control a commander.',
        'land',
      ),
    ).toMatchObject({ reason: expect.stringMatching(/notRunnable|unrecognised/) });
  });
});

describe('"Pay life equal to ..." as a cost (CR 119.4, 118.3, 601.2f)', () => {
  test.each([
    ["the number of colors in your commanders' color identity", { kind: 'commanderColors' }],
    [
      'the number of creatures you control',
      { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
    ],
    [
      'the number of Zombies you control',
      { kind: 'countOf', filter: { subtypes: ['Zombie'], controller: 'you' } },
    ],
    ['your devotion to black', { kind: 'devotion', colors: ['B'] }],
  ])('Pay life equal to %s', (words, amount) => {
    expect(abilities(`{T}, Pay life equal to ${words}: Draw a card.`, 'land')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }, { kind: 'payLife', amount }],
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ]);
  });

  test.each([
    ['Ward—Pay life equal to the number of creatures you control.', 'a keyword'],
    ['Cycling—Pay life equal to the number of creatures you control', 'a keyword'],
    ['{T}, Pay life equal to the number of creatures you control: Add {B}.', 'a mana ability'],
    ['{T}, Pay life equal to its power: Draw a card.', 'a value that is not a count'],
    [
      '{T}, Pay life equal to the number of creatures: Draw a card.',
      'a count with no one it is of',
    ],
  ])('%s is not run (%s)', (text) => {
    expect(drop(text, 'land')).toMatchObject({
      reason: expect.stringMatching(/notRunnable|unrecognised/),
    });
  });
});

describe('"nonbasic" (CR 205.4)', () => {
  test.each([
    [
      'Destroy target nonbasic land.',
      { zone: 'battlefield', types: ['land'], notSupertypes: ['basic'] },
    ],
    [
      'Destroy target nonbasic land you control.',
      { zone: 'battlefield', types: ['land'], notSupertypes: ['basic'], controller: 'you' },
    ],
  ])('%s is a part of a filter', (text, filter) => {
    expect(spellOf(text)?.targets).toEqual([{ id: 't1', what: { kind: 'object', filter } }]);
  });

  test('"nonbasic lands" is a plural group of a counted condition', () => {
    const [ability] = abilities(
      'Whenever you cast a spell, if you control four or more nonbasic lands, draw a card.',
    );
    expect(ability).toMatchObject({
      interveningIf: {
        kind: 'controlsAtLeast',
        filter: { types: ['land'], notSupertypes: ['basic'] },
        count: 4,
      },
    });
  });
});

describe('"her" and "him" for the card of a permanent named by a person (CR 109.1)', () => {
  test.each(['it', 'her', 'him'])(
    '"exile %s" in a trigger of a dying creature is the card it became',
    (pronoun) => {
      const [ability] = abilities(`When ~ dies, you may exile ${pronoun}.`);
      expect(ability).toMatchObject({
        optional: true,
        effect: { kind: 'exile', objects: THIS_CARD },
      });
    },
  );

  test('"exile it" of a target of the text is that target', () => {
    expect(spellOf('Exile target artifact. Draw a card.')).toBeDefined();
    expect(spellOf('Target creature gets +1/+1 until end of turn. Exile it.')?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'modifyPt',
          objects: T1,
          power: 1,
          toughness: 1,
          duration: 'untilEndOfTurn',
        },
        { kind: 'exile', objects: T1 },
      ],
    });
  });

  test('"exile it" after the target was destroyed names an object that is gone (CR 400.7): not run', () => {
    expect(drop('Destroy target artifact. Exile it.', 'sorcery')).toMatchObject({
      reason: 'notRunnable',
    });
  });

  test.each(['hers', 'himself', 'herd', 'its'])('"%s" is not a pronoun of an object', (word) => {
    expect(drop(`When ~ dies, you may exile ${word}.`, 'creature')).toMatchObject({
      reason: 'unrecognised',
    });
  });
});
