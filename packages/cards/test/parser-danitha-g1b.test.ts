// The Danitha deck (issue 26), group 1b (D-1210 to D-1214 provisional): Cosmic Rebirth ("Choose target permanent card in your graveyard. If it has mana value 3 or less, you may put it
// onto the battlefield. If you don't put it onto the battlefield, put it into your hand."), Danitha, New Benalia's Light ("Once during each of your turns, you may cast an Aura or
// Equipment spell from your graveyard."), Spirit Mantle ("Enchanted creature gets +1/+1 and has protection from creatures.") and Season of Growth ("Whenever you cast a spell that targets a
// creature you control, draw a card."). The first line of each describe is the real Oracle text of the acceptance card of the golden corpus read through the whole pipeline; the other lines
// are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-danitha-g1b.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const YOU = { kind: 'you' } as const;

const CHOOSE = 'Choose target permanent card in your graveyard.';
const OFFER = 'If it has mana value 3 or less, you may put it onto the battlefield.';
const ELSE = "If you don't put it onto the battlefield, put it into your hand.";
const REAL = `${CHOOSE} ${OFFER} ${ELSE}`;

const PERMANENT_CARD_TARGET = {
  id: 't1',
  what: {
    kind: 'object',
    filter: {
      zone: 'graveyard',
      controller: 'you',
      anyOf: [
        { types: ['artifact'] },
        { types: ['creature'] },
        { types: ['enchantment'] },
        { types: ['land'] },
        { types: ['planeswalker'] },
        { types: ['battle'] },
      ],
    },
  },
} as const;
const PUT = { kind: 'moveToZone', objects: T1, to: 'battlefield', controller: 'you' } as const;
const TO_HAND = { kind: 'moveToZone', objects: T1, to: 'hand' } as const;
const MV3 = {
  kind: 'objectMatches',
  of: T1,
  filter: { manaValue: { cmp: 'atMost', value: 3 } },
} as const;
const NOT_DONE = { kind: 'not', term: { kind: 'didPrevious' } } as const;

const spellOf = (text: string) => {
  const spell = readAll(text, 'instant').spell;
  if (spell === null) throw new Error(`"${text}" has no spell`);
  return spell;
};

describe('Cosmic Rebirth: "If it has mana value 3 or less, you may put it onto the battlefield. If you don\'t put it onto the battlefield, put it into your hand." (CR 608.2c, 608.2d, 400.3, 202.3)', () => {
  test('the real text: the test, the offer, and the card goes into the hand when it did not enter', () => {
    expect(spellOf(REAL)).toEqual({
      targets: [PERMANENT_CARD_TARGET],
      effect: {
        kind: 'conditional',
        condition: MV3,
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may', effect: PUT },
            { kind: 'conditional', condition: NOT_DONE, effect: TO_HAND },
          ],
        },
        else: TO_HAND,
      },
    });
  });

  test('"this way" after the battlefield, and the sentence after it, are the same (SYNTHETIC)', () => {
    const text = `${CHOOSE} ${OFFER} If you don't put it onto the battlefield this way, put it into your hand. You gain 3 life.`;
    const effects = (spellOf(text).effect as { effects: readonly unknown[] }).effects;
    expect(effects).toHaveLength(2);
    expect(effects[1]).toEqual({ kind: 'gainLife', player: YOU, amount: 3 });
  });

  test('with no test the offer is the first instruction: may, then the hand when it was not put (SYNTHETIC)', () => {
    expect(
      spellOf(
        `${CHOOSE} You may put it onto the battlefield. If you don't put it onto the battlefield, put it into your hand.`,
      ).effect,
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'may', effect: PUT },
        { kind: 'conditional', condition: NOT_DONE, effect: TO_HAND },
      ],
    });
  });

  test.each([
    ['it has mana value 3 or less', { cmp: 'atMost', value: 3 }],
    ['it has mana value 5 or greater', { cmp: 'atLeast', value: 5 }],
    ['it has mana value 0', { cmp: 'equal', value: 0 }],
  ])('%s: the comparison of the test (SYNTHETIC siblings)', (words, compare) => {
    const text = `${CHOOSE} If ${words}, you may put it onto the battlefield. ${ELSE}`;
    expect(spellOf(text).effect).toMatchObject({
      condition: { kind: 'objectMatches', of: T1, filter: { manaValue: compare } },
    });
  });

  test('the test of another object is the same one the older sentences read ("its mana value was ...") (SYNTHETIC)', () => {
    const text = `${CHOOSE} If its mana value is 3 or less, you may put it onto the battlefield. ${ELSE}`;
    expect(spellOf(text).effect).toMatchObject({ condition: MV3 });
  });

  test('a target that is a creature card only: the offer and the hand read the same (SYNTHETIC)', () => {
    const text = `Choose target creature card in your graveyard. ${OFFER} ${ELSE}`;
    expect(spellOf(text).targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
        },
      },
    ]);
  });

  test('"put it into your hand" alone, for a card of your graveyard (SYNTHETIC)', () => {
    expect(spellOf(`${CHOOSE} Put it into your hand.`).effect).toEqual(TO_HAND);
  });

  test('"Otherwise" after the offer is the older reading: the else branch of the test (SYNTHETIC)', () => {
    expect(spellOf(`${CHOOSE} ${OFFER} Otherwise, put it into your hand.`).effect).toEqual({
      kind: 'conditional',
      condition: MV3,
      effect: { kind: 'may', effect: PUT },
      else: TO_HAND,
    });
  });

  test('"put it onto the battlefield" alone, mandatory and optional (SYNTHETIC)', () => {
    expect(spellOf(`${CHOOSE} Put it onto the battlefield.`).effect).toEqual(PUT);
    expect(spellOf(`${CHOOSE} You may put it onto the battlefield.`).effect).toEqual({
      kind: 'may',
      effect: PUT,
    });
  });

  test.each([
    // the second sentence names another thing than the hand, or another zone of the first
    `${CHOOSE} ${OFFER} If you don't put it onto the battlefield, put it into your graveyard.`,
    `${CHOOSE} ${OFFER} If you don't put it onto the battlefield, put it on top of your library.`,
    `${CHOOSE} ${OFFER} If you don't put it onto the battlefield, draw a card.`,
    `${CHOOSE} ${OFFER} If you don't put it into your hand, put it onto the battlefield.`,
    `${CHOOSE} ${OFFER} If you don't, put it into your hand.`,
    `${CHOOSE} ${OFFER} If you do not put it onto the battlefield, put it into your hand.`,
    // the offer is another instruction, or has a rider
    `${CHOOSE} If it has mana value 3 or less, you may put it onto the battlefield tapped. ${ELSE}`,
    `${CHOOSE} If it has mana value 3 or less, put it onto the battlefield. ${ELSE}`,
    `${CHOOSE} If it has mana value 3 or less, you may put it into your hand. ${ELSE}`,
    `${CHOOSE} If it has mana value 3 or less, you may put it onto the battlefield and draw a card. ${ELSE}`,
    `${CHOOSE} If it has mana value 3 or less, you may put it onto the battlefield. You may put it into your hand.`,
    // the test: a word, a quality or a comparison the grammar does not read
    `${CHOOSE} If it has mana value three or less, you may put it onto the battlefield. ${ELSE}`,
    `${CHOOSE} If it has mana value 3 or more, you may put it onto the battlefield. ${ELSE}`,
    `${CHOOSE} If it has power 3 or less, you may put it onto the battlefield. ${ELSE}`,
    `${CHOOSE} If it has mana value 3 or less and is a creature, you may put it onto the battlefield. ${ELSE}`,
    // the sentence that depends on what was done, with nothing before it to depend on
    ELSE,
    `Draw a card. ${ELSE}`,
    // "it" of a card that is not a target card of your graveyard
    `Exile target creature. You may put it onto the battlefield. ${ELSE}`,
    "Choose target creature card in an opponent's graveyard. Put it into your hand.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'instant');
    expect(parsed.spell, text).toBeNull();
    expect(parsed.unparsed.length, text).toBeGreaterThan(0);
  });

  test('a creature that is not a card of the graveyard cannot be put into the hand with "it" (SYNTHETIC)', () => {
    const text = 'Put it into your hand.';
    expect(read(text, 'instant').spell).toBeNull();
    expect(read(`Destroy target creature. ${text}`, 'instant').spell).toBeNull();
  });

  test('a triggered ability reads the same two sentences (SYNTHETIC)', () => {
    const parsed = readAll(
      `At the beginning of your upkeep, choose target creature card in your graveyard. ${OFFER} ${ELSE}`,
      'enchantment',
    );
    expect(parsed.abilities).toHaveLength(1);
  });
});

describe('Danitha: "Once during each of your turns, you may cast an Aura or Equipment spell from your graveyard." (CR 601.2a, 113.6, 604.1)', () => {
  const LINE =
    'Once during each of your turns, you may cast an Aura or Equipment spell from your graveyard.';
  const grave = (cast: unknown) => [
    { kind: 'static', static: { kind: 'playFromGraveyardOnceEachTurn', cast } },
  ];

  test('the real line: the engine permission for Auras and Equipment', () => {
    expect(readAll(LINE, 'creature', ['Human', 'Knight']).abilities).toEqual(
      grave({ anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }] }),
    );
  });

  test('one subtype, and three (SYNTHETIC)', () => {
    expect(
      readAll(
        'Once during each of your turns, you may cast an Aura spell from your graveyard.',
        'creature',
      ).abilities,
    ).toEqual(grave({ anyOf: [{ subtypes: ['Aura'] }] }));
    expect(
      readAll(
        'Once during each of your turns, you may cast an Aura, Equipment, or Vehicle spell from your graveyard.',
        'creature',
      ).abilities,
    ).toEqual(
      grave({
        anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }, { subtypes: ['Vehicle'] }],
      }),
    );
  });

  test('a mana value limit with the subtypes (SYNTHETIC)', () => {
    expect(
      readAll(
        'Once during each of your turns, you may cast an Aura or Equipment spell with mana value 3 or less from your graveyard.',
        'creature',
      ).abilities,
    ).toEqual(
      grave({
        anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
        manaValue: { cmp: 'atMost', value: 3 },
      }),
    );
  });

  test.each([
    'Once during each of your turns, you may cast an Aura or Equipment spell from your hand.',
    'Once during each of your turns, you may cast an Aura or Equipment spell from an opponent’s graveyard.',
    'Once during each of your turns, you may cast an Aura or Equipment spell from your graveyard. If you cast a spell this way, that artifact enters tapped.',
    // a subtype of a spell that is not a permanent's, of a land, or one that is not a subtype of the table
    'Once during each of your turns, you may cast an Aura or Arcane spell from your graveyard.',
    'Once during each of your turns, you may cast an Aura or Forest spell from your graveyard.',
    'Once during each of your turns, you may cast an Aura or Banana spell from your graveyard.',
    'Once during each of your turns, you may cast an Aura or Aura spell from your graveyard.',
    // the plural, "and", a missing article, another wording of the limit
    'Once during each of your turns, you may cast Aura or Equipment spells from your graveyard.',
    'Once during each of your turns, you may cast an Aura and Equipment spell from your graveyard.',
    'Once each turn, you may cast an Aura or Equipment spell from your graveyard.',
    'Once during each of your turns, you may cast an Aura or Equipment from your graveyard.',
    'You may cast an Aura or Equipment spell from your graveyard.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Human', 'Knight']);
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the lowering names the engine feature it needs', () => {
    const missing = withoutFeature('static:playFromGraveyardOnceEachTurn', LINE, 'creature', [
      'Human',
      'Knight',
    ]);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('static:playFromGraveyardOnceEachTurn');
  });
});

describe('Spirit Mantle: "Enchanted creature gets +1/+1 and has protection from creatures." (CR 702.16a, 205.2a, 303.4, 613.1f)', () => {
  const ATTACHED = { kind: 'attached', types: ['creature'] } as const;
  const aura = (line: string) =>
    readAll(`Enchant creature\n${line}`, 'enchantment', ['Aura']).abilities.slice(1);
  const PROTECTION = (types: readonly string[]) => ({
    kind: 'static',
    static: {
      kind: 'grantKeyword',
      subject: ATTACHED,
      keyword: { kind: 'protection', from: 'cardType', types },
    },
  });

  test('the real line: +1/+1, then a protection from the card type', () => {
    expect(aura('Enchanted creature gets +1/+1 and has protection from creatures.')).toEqual([
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: ATTACHED, power: 1, toughness: 1 },
      },
      PROTECTION(['creature']),
    ]);
  });

  test.each([
    ['artifacts', ['artifact']],
    ['enchantments', ['enchantment']],
    ['lands', ['land']],
    ['planeswalkers', ['planeswalker']],
    ['instants', ['instant']],
    ['sorceries', ['sorcery']],
    ['artifacts and from creatures', ['artifact', 'creature']],
  ])('has protection from %s (SYNTHETIC siblings)', (words, types) => {
    expect(aura(`Enchanted creature has protection from ${words}.`)).toEqual([PROTECTION(types)]);
  });

  test('a group of creatures has it too (SYNTHETIC)', () => {
    expect(
      readAll('Creatures you control have protection from artifacts.', 'enchantment').abilities,
    ).toMatchObject([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          keyword: { kind: 'protection', from: 'cardType', types: ['artifact'] },
        },
      },
    ]);
  });

  test('colors are still read as before: red and a color after a card type are not mixed (SYNTHETIC)', () => {
    expect(aura('Enchanted creature has protection from red.')).toMatchObject([
      { static: { keyword: { kind: 'protection', from: 'color', colors: ['R'] } } },
    ]);
    const parsed = read(
      'Enchant creature\nEnchanted creature has protection from creatures and from red.',
      'enchantment',
      ['Aura'],
    );
    expect(parsed.abilities).toHaveLength(1);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test.each([
    // the singular, a modifier, another quality
    'Enchanted creature has protection from creature.',
    'Enchanted creature has protection from nonblack creatures.',
    'Enchanted creature has protection from red creatures.',
    'Enchanted creature has protection from Goblins.',
    'Enchanted creature has protection from everything.',
    'Enchanted creature has protection from monocolored.',
    'Enchanted creature has protection from players.',
    // a type twice, a type that is not a type, "and" with no "from"
    'Enchanted creature has protection from creatures and from creatures.',
    'Enchanted creature has protection from creatures and artifacts.',
    'Enchanted creature has protection from tribals.',
    'Enchanted creature has protection from.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (line) => {
    const parsed = read(`Enchant creature\n${line}`, 'enchantment', ['Aura']);
    expect(parsed.unparsed.length, line).toBe(1);
    expect(parsed.abilities.length, line).toBe(1);
  });

  test('the lowering names the engine feature it needs', () => {
    const missing = withoutFeature(
      'keyword:protection',
      'Enchanted creature has protection from creatures.',
      'enchantment',
      ['Aura'],
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('keyword:protection');
  });
});

describe('Season of Growth: "Whenever you cast a spell that targets a creature you control, draw a card." (CR 601.2i, 603.2, 115.1, 109.4)', () => {
  const trigger = (text: string) => readAll(text, 'enchantment').abilities;
  const CAST = (targetsObject: unknown, by = 'you') => ({
    kind: 'triggered',
    trigger: {
      kind: 'castSpell',
      filter: { stackKind: 'spell', targetsObject },
      by,
    },
    effect: { kind: 'draw', player: YOU, count: 1 },
  });

  test('the real line: the spell has a target that is a creature on the battlefield you control', () => {
    expect(
      trigger('Whenever you cast a spell that targets a creature you control, draw a card.'),
    ).toEqual([CAST({ types: ['creature'], controller: 'you' })]);
  });

  test('the older reading is the same without "you control" (D-206)', () => {
    expect(trigger('Whenever you cast a spell that targets a creature, draw a card.')).toEqual([
      CAST({ types: ['creature'] }),
    ]);
  });

  test('a permanent you control, another card type, and an opponent casting (SYNTHETIC)', () => {
    expect(
      trigger('Whenever you cast a spell that targets a permanent you control, draw a card.'),
    ).toEqual([CAST({ controller: 'you' })]);
    expect(
      trigger('Whenever you cast an Aura spell that targets an artifact you control, draw a card.'),
    ).toMatchObject([
      {
        trigger: {
          filter: {
            subtypes: ['Aura'],
            targetsObject: { types: ['artifact'], controller: 'you' },
          },
        },
      },
    ]);
    expect(
      trigger(
        'Whenever an opponent casts a spell that targets a creature you control, draw a card.',
      ),
    ).toEqual([CAST({ types: ['creature'], controller: 'you' }, 'opponent')]);
  });

  test.each([
    'Whenever you cast a spell that targets a creature you do not control, draw a card.',
    "Whenever you cast a spell that targets a creature you don't control, draw a card.",
    'Whenever you cast a spell that targets a creature an opponent controls, draw a card.',
    'Whenever you cast a spell that targets a creature you controlled, draw a card.',
    'Whenever you cast a spell that targets creatures you control, draw a card.',
    'Whenever you cast a spell that targets a Dragon you control, draw a card.',
    'Whenever you cast a spell that targets you control, draw a card.',
    'Whenever you cast a spell that targets a creature you control or a player, draw a card.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'enchantment');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('without the engine feature of what a spell targets the line is dropped, never half read', () => {
    BLOCKED.clear();
    BLOCKED.add('selector:targetsObject');
    try {
      const parsed = read(
        'Whenever you cast a spell that targets a creature you control, draw a card.',
        'enchantment',
      );
      expect(parsed.abilities).toEqual([]);
      expect(parsed.unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });
});

describe('a line whose engine feature is not listed names it (D-068)', () => {
  const CASES = [
    ['effect:may', REAL],
    ['effect:conditional', REAL],
    ['condition:didPrevious', REAL],
    ['condition:not', REAL],
    ['condition:objectMatches', REAL],
    ['effect:moveToZone', REAL],
    ['selector:target', REAL],
  ] as const;

  test.each(CASES)('without %s', (ref, text) => {
    const missing = withoutFeature(ref, text, 'instant');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no spell (never half-executed)', () => {
    for (const [ref, text] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        expect(read(text, 'instant').spell, `${ref}: ${text}`).toBeNull();
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'effect:may',
      'effect:conditional',
      'condition:didPrevious',
      'condition:not',
      'condition:objectMatches',
      'effect:moveToZone',
      'selector:target',
      'static:playFromGraveyardOnceEachTurn',
      'static:grantKeyword',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
