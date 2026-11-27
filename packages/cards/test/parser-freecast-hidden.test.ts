// Free casts from hidden zones (deck support issue 110): Evercoat Ursine and Sunbird's Invocation, read through the whole grammar. The first line of each describe is the real Oracle
// text of the acceptance card of the golden corpus (names replaced by ~); the other lines are SYNTHETIC near misses. The engine runs what is lowered in
// convert-grammar-engine-freecast-hidden.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

describe('Evercoat Ursine: "if there are cards exiled with it, you may play one of them without paying its mana cost" (CR 603.4, 607.2a, 608.2g, 118.9)', () => {
  test('the real text: the trigger counts the linked exile and plays one of the cards', () => {
    const parsed = readAll(
      'Whenever ~ deals combat damage to a player, if there are cards exiled with it, you may play one of them without paying its mana cost.',
      'creature',
    );
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        interveningIf: {
          kind: 'amountIs',
          amount: { kind: 'countOf', filter: { zone: 'exile', exiledWithSource: true } },
          compare: { cmp: 'atLeast', value: 1 },
        },
        effect: { kind: 'castFree', objects: { kind: 'linkedExile' }, play: true },
      },
    ]);
  });

  test('"cast" for a creature that hid a card away (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever ~ attacks, if there are cards exiled with it, you may cast one of them without paying its mana cost.',
      'creature',
    );
    expect(parsed.abilities).toMatchObject([
      { kind: 'triggered', effect: { kind: 'castFree', objects: { kind: 'linkedExile' } } },
    ]);
  });

  test.each([
    // "it" is another creature: the cards exiled with it are not this permanent's.
    'Whenever a creature deals combat damage to a player, if there are cards exiled with it, you may play one of them without paying its mana cost.',
    // "one of them" names nothing without the condition that counted the cards.
    'Whenever ~ deals combat damage to a player, you may play one of them without paying its mana cost.',
    'Whenever ~ deals combat damage to a player, if there are cards exiled with it, you may play two of them without paying their mana costs.',
    'Whenever ~ deals combat damage to a player, if there are cards exiled with it, you may play one of them.',
  ])('not read: %s', (text) => {
    expect(dropped(text, 'creature').reason).toBeDefined();
  });
});

describe('Sunbird\'s Invocation: "reveal the top X cards of your library, where X is that spell\'s mana value ... cast a spell from among cards revealed this way" (CR 701.20a, 608.2g, 202.3, 401.4)', () => {
  const MANA_VALUE = { kind: 'manaValueOf', of: { kind: 'triggerSubject' } } as const;
  const TRIGGER = 'Whenever you cast a spell from your hand, ';
  const REVEAL = "reveal the top X cards of your library, where X is that spell's mana value. ";
  const CAST =
    'You may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost. ';
  const REST = 'Put the rest on the bottom of your library in a random order.';

  test('the real text: a reveal of as many cards as the spell has mana value, then a free cast of one', () => {
    const parsed = readAll(`${TRIGGER}${REVEAL}${CAST}${REST}`, 'enchantment');
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', by: 'you', filter: { castFromHand: true } },
        effect: {
          kind: 'lookAtTop',
          count: MANA_VALUE,
          revealAll: true,
          take: {
            filter: { notTypes: ['land'] },
            max: 1,
            to: 'castFree',
            manaValueAtMost: MANA_VALUE,
          },
          rest: 'bottomRandom',
        },
      },
    ]);
  });

  test.each([
    // The rest goes elsewhere, or the sentence is missing.
    `${TRIGGER}${REVEAL}${CAST}Put the rest into your graveyard.`,
    `${TRIGGER}${REVEAL}${CAST.trim()}`,
    // A kind of spell: another card.
    `${TRIGGER}${REVEAL}You may cast a creature spell with mana value X or less from among cards revealed this way without paying its mana cost. ${REST}`,
    // A number that is not the mana value of the spell.
    `${TRIGGER}reveal the top X cards of your library, where X is the number of lands you control. ${CAST}${REST}`,
    // No spell was cast: there is no mana value to read.
    `At the beginning of your upkeep, ${REVEAL}${CAST}${REST}`,
  ])('not read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'enchantment').reason).toBeDefined();
  });
});
