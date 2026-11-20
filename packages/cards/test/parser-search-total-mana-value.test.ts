// "Search your library for any number of creature cards with total mana value 6 or less, put them onto the battlefield, then shuffle." (CR 701.23, 202.3): the grammar
// reads it, the lowering produces the engine's `search.totalManaValue`, and the engine runs the node. The creature-dies line is the Oracle text of Protean Hulk as given
// with the request (the card is not in the golden corpus of this branch); the other lines are SYNTHETIC siblings and the near misses the grammar must not read.
import { applyAction, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const HULK_TEXT =
  'When ~ dies, search your library for any number of creature cards with total mana value 6 or less, put them onto the battlefield, then shuffle.';

describe('any number of cards with a total mana value', () => {
  test('lowers to a search with totalManaValue, one destination of "rest", and the shuffle', () => {
    const face = readAll(HULK_TEXT, 'creature', ['Beast']);
    const [ability] = face.abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: {
        kind: 'search',
        player: { kind: 'you' },
        filter: { types: ['creature'] },
        max: 1,
        totalManaValue: 6,
        destinations: [{ zone: 'battlefield', count: 'rest' }],
        reveal: false,
        shuffle: true,
      },
    });
  });

  test('another limit, another kind of card and a tapped put (SYNTHETIC)', () => {
    const face = readAll(
      'Search your library for any number of nonland permanent cards with total mana value 4 or less, put them onto the battlefield tapped, then shuffle.',
      'sorcery',
    );
    expect(face.spell?.effect).toMatchObject({
      kind: 'search',
      totalManaValue: 4,
      destinations: [{ zone: 'battlefield', tapped: true, count: 'rest' }],
      shuffle: true,
    });
  });

  test('the node is valid, and the engine runs what the lowering produces', () => {
    const face = readAll(HULK_TEXT, 'creature', ['Beast']);
    const [ability] = face.abilities;
    if (ability?.kind !== 'triggered') throw new Error('no trigger');
    // The synthetic Beast of the engine with the lowered ability in place of its own: it must be valid and play the same.
    const base = syntheticCard('SYNTHETIC Hulking Beast');
    const [baseFace] = base.faces;
    if (baseFace === undefined) throw new Error('no face');
    const lowered = {
      ...base,
      name: 'SYNTHETIC Lowered Beast',
      faces: [{ ...baseFace, name: 'SYNTHETIC Lowered Beast', abilities: [ability] }],
    };
    expect(validateCard(lowered)).toEqual([]);
    const g = scenario()
      .seat(0)
      .define(lowered)
      .battlefield('SYNTHETIC Lowered Beast', 'Mountain')
      .hand('Lightning Bolt')
      .library('SYNTHETIC Two Beast', { label: 'two' })
      .library('SYNTHETIC Four Beast', { label: 'four' })
      .library('SYNTHETIC Six Beast', { label: 'six' })
      .seat(1)
      .library('Island')
      .at('precombatMain')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: ['SYNTHETIC Lowered Beast'], pay: true });
    g.passAll();
    g.passAll();
    const over = applyAction(g.state, 0, {
      kind: 'chooseCards',
      objects: [g.id('two'), g.id('four'), g.id('six')],
    });
    expect(over.ok).toBe(false);
    g.act(0).chooseCards('two', 'four');
    g.expect.zone('SYNTHETIC Two Beast', 'battlefield', { seat: 0 });
    g.expect.zone('SYNTHETIC Four Beast', 'battlefield', { seat: 0 });
  });

  test('a reveal and a put into the hand read too, with every card going to the hand (SYNTHETIC)', () => {
    const face = readAll(
      'Search your library for any number of creature cards with total mana value 6 or less, reveal them, put them into your hand, then shuffle.',
      'sorcery',
    );
    expect(face.spell?.effect).toMatchObject({
      kind: 'search',
      totalManaValue: 6,
      destinations: [{ zone: 'hand', count: 'rest' }],
      reveal: true,
    });
  });

  // "Any number of creature cards" with no total is read since Bilbo, Birthday Celebrant (`search.anyNumber`, convert-grammar-engine-food-fellowship-a.test.ts).
  test('is not read: a different wording, a single card, a count, a reveal or a split put', () => {
    for (const text of [
      'Search your library for any number of creature cards with mana value 6 or less, put them onto the battlefield, then shuffle.',
      'Search your library for any number of creature cards with total mana value 6, put them onto the battlefield, then shuffle.',
      'Search your library for any number of creature cards with total mana value 6 or more, put them onto the battlefield, then shuffle.',
      'Search your library for any number of creature cards with total mana value 6 or less, put it onto the battlefield, then shuffle.',
      'Search your library for up to two creature cards with total mana value 6 or less, put them onto the battlefield, then shuffle.',
      'Search your graveyard, hand, and/or library for any number of creature cards with total mana value 6 or less and put them onto the battlefield.',
    ]) {
      const reason = dropped(text, 'sorcery').reason;
      expect(reason, text).toBeDefined();
    }
  });
});
