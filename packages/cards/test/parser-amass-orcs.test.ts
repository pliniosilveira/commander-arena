// The Hosts of Mordor deck (issue 150), amass group: the four Orc Army cards. The first line of each describe is the real Oracle text of the acceptance card of the golden corpus
// read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs the lowered effects in
// packages/engine/test/scenario-xx-discarded-cost-amass.test.ts and scenario-xx-amass-mill-cast.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

const ORC = (count: unknown) => ({ kind: 'amass', subtype: 'Orc', count });

describe('"..., mill five cards, then return a creature card from your graveyard to the battlefield" (Sauron, Lord of the Rings; CR 608.2c)', () => {
  test('the real text: amass, mill and return in the order written', () => {
    const parsed = readAll(
      'When you cast this spell, amass Orcs 5, mill five cards, then return a creature card from your graveyard to the battlefield.',
      'creature',
      ['Avatar'],
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell', self: true },
      effect: {
        kind: 'sequence',
        effects: [
          ORC(5),
          { kind: 'mill', player: { kind: 'you' }, count: 5 },
          {
            kind: 'moveToZone',
            objects: { kind: 'choose', filter: { zone: 'graveyard', types: ['creature'] } },
            to: 'battlefield',
          },
        ],
      },
    });
  });

  test('a list that closes with "then" reads, in a spell too (SYNTHETIC)', () => {
    const spell = readAll('Amass Orcs 2, draw a card, then gain 3 life.', 'sorcery');
    expect(spell.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [ORC(2), { kind: 'draw' }, { kind: 'gainLife' }],
    });
  });

  test('a bare comma that closes with nothing is still not an instruction list (SYNTHETIC)', () => {
    expect(read('Amass Orcs 2, draw a card, gain 3 life.', 'sorcery').unparsed).toHaveLength(1);
  });
});

describe('"If the discarded card was a creature card, amass Orcs 1." (Moria Scavenger; CR 602.2b, 701.9a)', () => {
  const ACTIVATED = (condition: object) => ({
    kind: 'activated',
    cost: [{ kind: 'tap' }, { kind: 'discard', count: 1 }],
    effect: {
      kind: 'sequence',
      effects: [{ kind: 'draw', player: { kind: 'you' }, count: 1 }, condition],
    },
  });

  test('the real text: the draw, then the amass only when the card the cost discarded was a creature card', () => {
    const parsed = readAll(
      '{T}, Discard a card: Draw a card. If the discarded card was a creature card, amass Orcs 1.',
      'creature',
      ['Goblin'],
    );
    expect(parsed.abilities).toEqual([
      ACTIVATED({
        kind: 'conditional',
        condition: { kind: 'discardedAsCostMatches', filter: { types: ['creature'] } },
        effect: ORC(1),
      }),
    ]);
  });

  test.each([
    ['land', { types: ['land'] }],
    ['nonland', { notTypes: ['land'] }],
    ['legendary creature', { supertypes: ['legendary'], types: ['creature'] }],
  ])('another kind of card (SYNTHETIC): %s', (what, filter) => {
    const parsed = readAll(
      `{T}, Discard a card: Draw a card. If the discarded card was a ${what} card, amass Orcs 1.`,
      'creature',
      ['Goblin'],
    );
    expect(parsed.abilities[0]).toMatchObject({
      effect: { effects: [{ kind: 'draw' }, { condition: { filter } }] },
    });
  });

  test.each([
    '{T}, Discard a card: Draw a card. If the discarded card was not a creature card, amass Orcs 1.',
    '{T}, Discard a card: Draw a card. If the discarded card was a card, amass Orcs 1.',
    '{T}, Discard a card: Draw a card. If the discarded card is a creature card, amass Orcs 1.',
    '{T}, Discard a card: Draw a card. If the discarded cards were creature cards, amass Orcs 1.',
    '{T}, Discard a card: Draw a card. If the card was a creature card, amass Orcs 1.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Goblin']);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('"target player mills three cards. Then amass Orcs X, where X is the number of instant and sorcery cards in that player\'s graveyard." (The Mouth of Sauron; CR 701.17a, 108.3)', () => {
  const TEXT =
    "When this creature enters, target player mills three cards. Then amass Orcs X, where X is the number of instant and sorcery cards in that player's graveyard.";

  test('the real text: the count is of the graveyard the target player owns, read as the amass happens', () => {
    const parsed = readAll(TEXT, 'creature', ['Human']);
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      targets: [{ id: 't1', what: { kind: 'player' } }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'mill', player: { kind: 'target', id: 't1' }, count: 3 },
          ORC({
            kind: 'countOf',
            filter: {
              zone: 'graveyard',
              anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
              owner: { kind: 'target', id: 't1' },
            },
          }),
        ],
      },
    });
  });

  test('target opponent, and another kind of card (SYNTHETIC)', () => {
    const parsed = readAll(
      "When this creature enters, target opponent mills two cards. Then amass Orcs X, where X is the number of creature cards in that player's graveyard.",
      'creature',
      ['Human'],
    );
    expect(parsed.abilities[0]).toMatchObject({
      targets: [{ what: { kind: 'player', filter: 'opponent' } }],
      effect: {
        effects: [
          { kind: 'mill', count: 2 },
          ORC({ kind: 'countOf', filter: { zone: 'graveyard', types: ['creature'] } }),
        ],
      },
    });
  });

  test.each([
    // "that player" names nobody when no earlier instruction targets a player
    "When this creature enters, amass Orcs X, where X is the number of instant and sorcery cards in that player's graveyard.",
    // not a graveyard
    "When this creature enters, target player mills three cards. Then amass Orcs X, where X is the number of instant and sorcery cards in that player's library.",
    'When this creature enters, target player mills three cards. Then amass Orcs X, where X is the number of instant and sorcery cards in that players graveyard.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Human']);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('"Amass Orcs X. Mill X cards. You may cast an instant or sorcery spell with mana value X or less from among them without paying its mana cost." (Summons of Saruman; CR 608.2g, 202.3)', () => {
  const TEXT =
    'Amass Orcs X. Mill X cards. You may cast an instant or sorcery spell with mana value X or less from among them without paying its mana cost.';

  test('the real text: one spell of the milled cards, instant or sorcery, with a mana value no more than X', () => {
    const parsed = readAll(TEXT, 'sorcery');
    expect(parsed.spell).toMatchObject({
      x: true,
      effect: {
        kind: 'sequence',
        effects: [
          ORC({ kind: 'x' }),
          { kind: 'mill', player: { kind: 'you' }, count: { kind: 'x' } },
          {
            kind: 'castFree',
            objects: { kind: 'moved' },
            filter: {
              anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
              manaValueAtMost: { kind: 'x' },
            },
          },
        ],
      },
    });
  });

  test.each([
    // not after a mill of the controller
    'Amass Orcs X. You may cast an instant or sorcery spell with mana value X or less from among them without paying its mana cost.',
    'Each player mills X cards. You may cast an instant or sorcery spell with mana value X or less from among them without paying its mana cost.',
    // another limit, another kind of spell, another count
    'Amass Orcs X. Mill X cards. You may cast an instant or sorcery spell with mana value Y or less from among them without paying its mana cost.',
    'Amass Orcs X. Mill X cards. You may cast an instant or sorcery spell from among them without paying its mana cost.',
    'Amass Orcs X. Mill X cards. You may cast a creature spell with mana value X or less from among them without paying its mana cost.',
    'Amass Orcs X. Mill X cards. You may cast an instant or sorcery spell with mana value X or less from among them without paying their mana costs.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'sorcery').unparsed.length).toBeGreaterThan(0);
  });

  test('the Flashback line with an exile cost is not read, so the card stays unsupported', () => {
    const first = dropped('Flashback—{3}{U}{R}, Exile X cards from your graveyard.', 'sorcery');
    expect(first.reason).toBe('notRunnable');
  });
});
