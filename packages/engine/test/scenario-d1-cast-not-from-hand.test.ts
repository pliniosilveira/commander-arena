// "Whenever an opponent casts a spell from anywhere other than their hand, draw a card." (Ghostly Pilferer): a `castSpell` trigger of an opponent's spell with `notCastFromHand`.
// Pins: CR 601.2a (a spell is cast from the zone its card was in), CR 601.2i and 603.2 (it triggers as the spell becomes cast, for any opponent: played with three seats),
// CR 113.6b (the graveyard permission of the cast card). Cards are SYNTHETIC (src/cards/fixtures/synthetic-d1.ts, synthetic-subjects.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WATCHER = 'SYNTHETIC Foreign Cast Watcher';
const CORPSE = 'SYNTHETIC Restless Corpse'; // {B} 2/1 Zombie: may be cast from the graveyard while its owner controls a Zombie
const ZOMBIE = 'SYNTHETIC Plain Zombie';

test('the card is valid', () => {
  expect(validateCard(syntheticCard(WATCHER))).toEqual([]);
});

/** Three seats; seat 0 watches; seats 1 and 2 each have a Swamp and a Zombie, and `corpseAt` holds a Restless Corpse in its graveyard (or hand). Seat `active` has the turn. */
function game(active: 0 | 1 | 2, zone: 'graveyard' | 'hand', owner: 0 | 1 | 2) {
  const b = scenario({ seats: 3 })
    .seat(0)
    .life(20)
    .battlefield(WATCHER)
    .battlefield('Swamp')
    .battlefield(ZOMBIE)
    .library('Plains', { count: 6 })
    .seat(1)
    .life(20)
    .battlefield('Swamp')
    .battlefield(ZOMBIE)
    .library('Plains', { count: 6 })
    .seat(2)
    .life(20)
    .battlefield('Swamp')
    .battlefield(ZOMBIE)
    .library('Plains', { count: 6 });
  b.seat(owner);
  if (zone === 'graveyard') b.graveyard(CORPSE);
  else b.hand(CORPSE);
  return b.at('precombatMain', { active }).build();
}

const handSize = (g: ReturnType<typeof game>): number => g.state.seats[0]?.hand.length ?? 0;

describe('an opponent casts a spell from anywhere other than their hand (CR 601.2a, 603.2)', () => {
  test('from a graveyard: the controller draws', () => {
    const g = game(1, 'graveyard', 1);
    const before = handSize(g);
    g.act(1).cast(CORPSE, { pay: true });
    g.expect.stack([`${WATCHER} (ability)`, CORPSE]);
    g.passAll();
    expect(handSize(g)).toBe(before + 1);
  });

  test('any opponent counts, not only the next seat', () => {
    const g = game(2, 'graveyard', 2);
    const before = handSize(g);
    g.act(2).cast(CORPSE, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(before + 1);
  });

  test('from the hand: nothing happens', () => {
    const g = game(1, 'hand', 1);
    const before = handSize(g);
    g.act(1).cast(CORPSE, { pay: true });
    g.expect.stack([CORPSE]);
    g.passAll();
    expect(handSize(g)).toBe(before);
  });

  test('a spell its controller casts from a graveyard is not an opponent casting it', () => {
    const g = game(0, 'graveyard', 0);
    const before = handSize(g);
    g.act(0).cast(CORPSE, { pay: true });
    g.expect.stack([CORPSE]);
    g.passAll();
    expect(handSize(g)).toBe(before);
  });
});
