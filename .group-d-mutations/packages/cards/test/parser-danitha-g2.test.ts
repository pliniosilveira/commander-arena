// The Danitha deck program (issue 26), group 2 (D-411, D-412): "Mill four cards. You may put a land card from among them into your hand." and its riders (Ainok
// Wayfarer, Blanchwood Prowler, Airlift Chaplain, Cache Grab, Something Worth Saving, Town Greeter, Midnight Tilling). The lines are the real Oracle text of the acceptance cards of
// the golden corpus, read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-danitha-g2.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { dropped, read, readAll, spellEffect, withoutFeature } from './parser-p5-helpers';

const PERMANENT = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].map(
  (t) => ({ types: [t] }),
);

const mill = (count: number) => ({ kind: 'mill', player: { kind: 'you' }, count });

/** The engine's choice among the cards the mill before it moved: none or one, put into the hand. */
const take = (filter: object) => ({
  kind: 'moveToZone',
  objects: {
    kind: 'choose',
    filter: { ...filter, zone: 'graveyard', controller: 'you' },
    optional: true,
    fromMoved: true,
  },
  to: 'hand',
});

const COUNTER = {
  kind: 'conditional',
  condition: { kind: 'not', term: { kind: 'didPrevious' } },
  effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
};

const SQUIRREL = { subtypes: ['Squirrel'] };

describe('the real lines', () => {
  test('Ainok Wayfarer and Blanchwood Prowler: a land card, or a +1/+1 counter', () => {
    for (const them of ['them', 'the cards milled this way']) {
      const parsed = readAll(
        `When this creature enters, mill three cards. You may put a land card from among ${them} into your hand. If you don't, put a +1/+1 counter on this creature.`,
        'creature',
      );
      expect(parsed.abilities, them).toEqual([
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: { kind: 'sequence', effects: [mill(3), take({ types: ['land'] }), COUNTER] },
        },
      ]);
    }
  });

  test('Airlift Chaplain: a Plains card or a creature card with mana value 3 or less', () => {
    const parsed = readAll(
      "When this creature enters, mill three cards. You may put a Plains card or a creature card with mana value 3 or less from among the cards milled this way into your hand. If you don't, put a +1/+1 counter on this creature.",
      'creature',
      ['Human', 'Cleric'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            mill(3),
            take({
              anyOf: [
                { subtypes: ['Plains'] },
                { types: ['creature'], manaValue: { cmp: 'atMost', value: 3 } },
              ],
            }),
            COUNTER,
          ],
        },
      },
    ]);
  });

  test('Cache Grab: a permanent card, then a Food token if a Squirrel is controlled or was returned', () => {
    expect(
      spellEffect(
        'Mill four cards. You may put a permanent card from among the cards milled this way into your hand. If you control a Squirrel or returned a Squirrel card to your hand this way, create a Food token.',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        mill(4),
        take({ anyOf: PERMANENT }),
        {
          kind: 'conditional',
          condition: {
            kind: 'or',
            terms: [
              { kind: 'controlsAtLeast', filter: SQUIRREL, count: 1 },
              { kind: 'objectMatches', of: { kind: 'moved' }, filter: SQUIRREL, inZone: 'hand' },
            ],
          },
          effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Food' }, count: 1 },
        },
      ],
    });
  });

  test('Something Worth Saving: a permanent card and 1 life, the life gain a sentence of its own', () => {
    expect(
      spellEffect(
        'Mill four cards. You may put a permanent card from among them into your hand. You gain 1 life.',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        mill(4),
        take({ anyOf: PERMANENT }),
        { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      ],
    });
  });

  test('Town Greeter: a land card, 2 life if it is a Town in the hand', () => {
    const parsed = readAll(
      'When this creature enters, mill four cards. You may put a land card from among them into your hand. If you put a Town card into your hand this way, you gain 2 life.',
      'creature',
      ['Human', 'Citizen'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            mill(4),
            take({ types: ['land'] }),
            {
              kind: 'conditional',
              condition: {
                kind: 'objectMatches',
                of: { kind: 'moved' },
                filter: { subtypes: ['Town'] },
                inZone: 'hand',
              },
              effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
            },
          ],
        },
      },
    ]);
  });

  test('Midnight Tilling: "then you may return" in the sentence of the mill', () => {
    expect(
      spellEffect(
        'Mill four cards, then you may return a permanent card from among them to your hand.',
      ),
    ).toEqual({ kind: 'sequence', effects: [mill(4), take({ anyOf: PERMANENT })] });
  });
});

describe('other shapes (SYNTHETIC)', () => {
  test('a creature card, with no rider', () => {
    expect(
      spellEffect(
        'Mill five cards. You may put a creature card from among the cards milled this way into your hand.',
      ),
    ).toEqual({ kind: 'sequence', effects: [mill(5), take({ types: ['creature'] })] });
  });

  test('a mana value limit on both sides, and on one side only', () => {
    const effect = spellEffect(
      'Mill four cards. You may put a creature card with mana value 2 or less or a land card from among them into your hand.',
    );
    expect(effect).toEqual({
      kind: 'sequence',
      effects: [
        mill(4),
        take({
          anyOf: [
            { types: ['creature'], manaValue: { cmp: 'atMost', value: 2 } },
            { types: ['land'] },
          ],
        }),
      ],
    });
  });

  test('a Town card of the library, in a spell, with the life gain', () => {
    expect(
      spellEffect(
        'Mill four cards. You may put a land card from among them into your hand. If you put a Town card into your hand this way, you gain 2 life.',
      ),
    ).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'mill' },
        { kind: 'moveToZone' },
        { kind: 'conditional', condition: { kind: 'objectMatches', inZone: 'hand' } },
      ],
    });
  });
});

describe('what is not read stays unsupported (a card is supported or unsupported, never partly)', () => {
  test.each([
    // The card anywhere but the hand, or another place to look.
    'Mill four cards. You may put a land card from among them onto the battlefield.',
    'Mill four cards. You may put a land card from among them into your graveyard.',
    'Mill four cards. You may put a land card from your graveyard into your hand.',
    // More than one card, "up to".
    'Mill four cards. You may put two land cards from among them into your hand.',
    'Mill four cards. You may put up to two land cards from among them into your hand.',
    // "Them" after anything but the mill of your own library.
    'Exile the top four cards of your library. You may put a land card from among them into your hand.',
    'Target player mills four cards. You may put a land card from among them into your hand.',
    'Each player mills four cards. You may put a land card from among them into your hand.',
    'You may put a land card from among them into your hand.',
    'Draw a card. You may put a land card from among them into your hand.',
    'Mill four cards. You gain 1 life. You may put a land card from among them into your hand.',
    // A rider that reads something else.
    "Mill four cards. If you don't, you gain 1 life.",
    "Mill four cards. You gain 1 life. If you don't, draw a card.",
    "Mill four cards. You may put a land card from among them into your hand. If you do, you gain 1 life. If you don't, draw a card.",
    'Mill four cards. You may put a land card from among them into your hand. If you put a Town card onto the battlefield this way, you gain 2 life.',
    'Mill four cards. You may put a land card from among them into your hand. If you control a Squirrel and returned a Squirrel card to your hand this way, create a Food token.',
    // A choice by a player other than you.
    'Mill four cards. Target opponent may put a land card from among them into their hand.',
  ])('%s', (text) => {
    const parsed = read(text, 'instant');
    expect(parsed.spell ?? null, text).toBeNull();
    expect(parsed.unparsed.length, text).toBeGreaterThan(0);
  });

  test('"If you don\'t" after a choice that is not from among the cards milled is not read', () => {
    const parsed = read(
      "You may return a creature card from your graveyard to your hand. If you don't, you gain 1 life.",
      'instant',
    );
    expect(parsed.spell ?? null).toBeNull();
  });

  test('a dropped line says it was not recognised', () => {
    expect(
      dropped('Mill four cards. You may put a land card from among them into exile.', 'instant'),
    ).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('the line names the feature the engine lacks (D-068)', () => {
  const TILLING =
    'Mill four cards, then you may return a permanent card from among them to your hand.';

  test('without ability:chooseAmongMoved', () => {
    const missing = withoutFeature('ability:chooseAmongMoved', TILLING, 'instant');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('ability:chooseAmongMoved');
  });

  test('a blocked line leaves the face with no spell (never half-executed)', () => {
    BLOCKED.clear();
    BLOCKED.add('ability:chooseAmongMoved');
    try {
      expect(read(TILLING, 'instant').spell ?? null).toBeNull();
    } finally {
      BLOCKED.clear();
    }
  });

  test('the feature is declared', () => {
    expect(DECLARED_NEEDS).toContain('ability:chooseAmongMoved');
  });
});
