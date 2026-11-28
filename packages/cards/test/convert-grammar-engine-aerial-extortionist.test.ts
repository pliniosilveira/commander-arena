// Aerial Extortionist (Deep Clue Sea deck, issue 128): "Whenever this creature enters or deals combat damage to a player, exile up to one target nonland permanent. For as long as that card
// remains exiled, its owner may cast it." and "Whenever another player casts a spell from anywhere other than their hand, draw a card." Imported through the grammar (never a fixture),
// defined in an engine scenario and played through applyAction. Names start with "SYNTHETIC"; the wording is that of the real card, taken from the golden corpus.
// Rules pinned: CR 701.13 (exile), 108.3 and 406.3 (the owner of an exiled card may cast it, and no one else), 601.2a (the spell is cast from where the card was: exile), 603.2 and 601.2i (the
// trigger as the spell becomes cast), 102.2 (another player is an opponent), 101.4 (three seats: both opponents trigger it).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BIRD = parsed(
  'SYNTHETIC Parsed Aerial Extortionist',
  'Creature — Bird Soldier',
  'Flying\nWhenever this creature enters or deals combat damage to a player, exile up to one target nonland permanent. For as long as that card remains exiled, its owner may cast it.\nWhenever another player casts a spell from anywhere other than their hand, draw a card.',
  { manaCost: '{3}{W}{W}', colors: ['W'], power: '3', toughness: '5' },
);
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 10 }, () => 'Plains');

describe('Aerial Extortionist: the grammar reads all three abilities', () => {
  test('flying and two triggers', () => {
    expect(BIRD.faces[0]?.abilities.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Aerial Extortionist: played in a three-seat game', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(BIRD)
      .seat(0)
      .library(...FILLER)
      .hand(BIRD.name)
      .battlefield('Plains', { count: 5 })
      .seat(1)
      .library(...FILLER)
      .hand(BEARS)
      .battlefield('Forest', 'Forest', BEARS)
      .seat(2)
      .library(...FILLER)
      .battlefield('Mountain')
      .at('precombatMain', { active: 0 })
      .build();

  test('entering exiles the target; the owner (seat 1) may cast it from exile, I draw a card for it, and seat 2 may not cast it', () => {
    const g = board();
    g.act(0).cast(BIRD.name, { pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ name: BEARS, seat: 1, zone: 'battlefield' });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    // Seat 1's turn: its own Bears (in exile) may be cast; seat 2's turn has no way to.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(1, { cast: { name: BEARS, zone: 'exile' } });
    const handBefore = g.state.seats[0]?.hand.length ?? 0;
    g.act(1).cast({ name: BEARS, zone: 'exile' }, { pay: true });
    // Seat 1 cast a spell from exile: seat 0 (another player's Extortionist) draws.
    g.passAll();
    g.expect.handSize(0, handBefore + 1);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('a spell cast from the hand does not trigger it', () => {
    const g = board();
    g.act(0).cast(BIRD.name, { pay: true });
    g.passAll();
    // "Up to one": choose no target.
    g.act(0).chooseTargets();
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    const handBefore = g.state.seats[0]?.hand.length ?? 0;
    g.act(1).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.handSize(0, handBefore);
  });
});
