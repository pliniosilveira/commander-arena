// "Return all instant and sorcery cards from your graveyard to your hand. You have no maximum hand size for the rest of the game. Exile ~." (issue 576)
// imported through the grammar (a SYNTHETIC name, the wording of the real card) and played through applyAction at a table of three seats. CR 205.2a
// (Card Types), 402.2 (Hand Size), 404.1 (Graveyard). The compound card type of the plural noun is the only grammar this adds.
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const TEXT =
  'Return all instant and sorcery cards from your graveyard to your hand. You have no maximum hand size for the rest of the game.\nExile ~.';
const card = parsed('SYNTHETIC Parsed Ages Sorcery', 'Sorcery', TEXT, {
  manaCost: '{4}{U}{U}{U}',
  colors: ['U'],
});
const ISLANDS = Array.from({ length: 7 }, () => 'Island');

test('the grammar reads the text into a move of the instants and sorceries, the hand size effect and the exile of the spell', () => {
  expect(validateCard(card)).toEqual([]);
  expect(card.faces[0]?.spell?.effect).toEqual({
    kind: 'sequence',
    effects: [
      {
        kind: 'moveToZone',
        objects: {
          kind: 'each',
          filter: {
            zone: 'graveyard',
            controller: 'you',
            anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
          },
        },
        to: 'hand',
      },
      { kind: 'noMaxHandSizeForGame' },
      { kind: 'exile', objects: { kind: 'thisSpell' } },
    ],
  });
});

test('only the caster instants and sorceries return, other cards and other graveyards stay and the spell is exiled', () => {
  const g = scenario({ seats: 3 })
    .define(card)
    .seat(0)
    .hand(card.name)
    .graveyard('Lightning Bolt', 'Divination', 'Grizzly Bears')
    .battlefield(...ISLANDS)
    .seat(1)
    .graveyard('Lightning Bolt')
    .seat(2)
    .graveyard('Divination')
    .build();
  g.act(0).cast(card.name, { pay: true });
  g.passAll();
  expect(g.find({ name: 'Lightning Bolt', zone: 'hand', seat: 0 })).toHaveLength(1);
  expect(g.find({ name: 'Divination', zone: 'hand', seat: 0 })).toHaveLength(1);
  expect(g.find({ name: 'Grizzly Bears', zone: 'graveyard', seat: 0 })).toHaveLength(1);
  expect(g.find({ name: 'Lightning Bolt', zone: 'graveyard', seat: 1 })).toHaveLength(1);
  expect(g.find({ name: 'Divination', zone: 'graveyard', seat: 2 })).toHaveLength(1);
  g.expect.zone(card.name, 'exile');
  expect(g.find({ name: card.name, zone: 'graveyard' })).toHaveLength(0);
  g.expect.invariants();
});
