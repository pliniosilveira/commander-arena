// The Revival Trance deck (issue 97), group A, read by the grammar and run by the engine. Every card here is SYNTHETIC: its only text is a real line of the deck
// (the name replaced by ~), run through `applyAction` with the scenario DSL. Every synthetic name starts with "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const LIB = Array.from({ length: 12 }, () => 'Plains');
const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

describe('"When ~ enters, discard any number of cards, then draw that many cards plus one." (CR 701.9, 608.2c, 121.1)', () => {
  const celes = parsed(
    'SYNTHETIC Parsed Rune Knight',
    'Creature — Human Knight',
    'When ~ enters, discard any number of cards, then draw that many cards plus one.',
    { manaCost: '{W}', power: '1', toughness: '1', colors: ['W'] },
  );
  const build = () =>
    base()
      .define(celes)
      .hand(celes.name, 'Forest', 'Forest', 'Island')
      .battlefield('Plains')
      .at('precombatMain')
      .build();

  test('discarding two cards draws three', () => {
    const g = build();
    g.act(0).cast(celes.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest[0]', 'Forest[1]');
    g.expect.handSize(0, 4);
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('discarding nothing still draws one', () => {
    const g = build();
    g.act(0).cast(celes.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.handSize(0, 4);
    g.expect.invariants();
  });
});
