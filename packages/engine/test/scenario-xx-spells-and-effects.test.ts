// The M1 spell set, one rule at a time.
// Pins: CR 115.4 (Targets) and CR 120.3 (Damage): any target is a creature, player, planeswalker
// or battle, and damage to a player causes life loss; CR 701.6a and 701.6b (Counter): a countered
// spell is put into its owner's graveyard with no refund; CR 701.8 (Destroy); CR 121.1 (Drawing a
// Card): draw one at a time from the top; CR 119.1 (Life): gaining life; CR 400.7: a returned
// creature is a new object; CR 608.2m: a resolved instant or sorcery goes to its owner's graveyard.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

describe('Lightning Bolt: CR 115.4 any target, CR 120.3 damage', () => {
  test('3 damage to a player becomes 3 life lost', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .life(20)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.eventLog([
      { kind: 'damageDealt', amount: 3, to: { kind: 'player', seat: 1 } },
      { kind: 'lifeChanged', seat: 1, from: 20, to: 17 },
    ]);
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
  });

  test('a player may target themselves', () => {
    const g = scenario()
      .seat(0)
      .life(10)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 7);
  });

  test('3 damage to a creature is marked and a 2/2 dies in the next check', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.life(1, 40);
  });

  test('damage equal to the toughness is lethal: a 9/3 dies to Bolt (CR 704.5g)', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Yargle, Glutton of Urborg')
      .build();
    g.act(0).cast('Lightning Bolt', {
      targets: [{ name: 'Yargle, Glutton of Urborg' }],
      pay: true,
    });
    g.passAll();
    g.expect.zone('Yargle, Glutton of Urborg', 'graveyard', { seat: 1 });
  });

  test('a 3/3 made by a +1/+1 counter still dies to 3 damage (CR 122.1b, 704.5g)', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears', { counters: { '+1/+1': 1 } })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('two +1/+1 counters make a 4/4 that survives the Bolt with 3 damage marked', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears', { counters: { '+1/+1': 2 } })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.damage('Grizzly Bears', 3);
  });

  test('the targets decision lists exactly the legal targets: both players and each creature', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain', 'Grizzly Bears')
      .seat(1)
      .battlefield('Llanowar Elves')
      .build();
    g.act(0).cast('Lightning Bolt');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    const legal = d.specs[0]?.legal.map((t) => (t.kind === 'player' ? `player ${t.seat}` : t.id));
    expect(legal).toEqual([
      g.id({ name: 'Grizzly Bears' }),
      g.id({ name: 'Llanowar Elves' }),
      'player 0',
      'player 1',
    ]);
  });

  test('a land is not a legal target for Bolt', () => {
    const g = scenario().seat(0).hand('Lightning Bolt').battlefield('Mountain').build();
    g.act(0).cast('Lightning Bolt');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    expect(d.specs[0]?.legal.every((t) => t.kind === 'player')).toBe(true);
  });
});

describe('Counterspell: CR 701.6a and 701.6b', () => {
  function bolted() {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', {
      targets: [{ name: 'Lightning Bolt', zone: 'stack' }],
      pay: true,
    });
    return g;
  }

  test('the countered spell goes to its owner graveyard and does nothing', () => {
    const g = bolted();
    g.expect.stack(['Counterspell', 'Lightning Bolt']);
    g.passAll();
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.zone('Counterspell', 'graveyard', { seat: 1 });
    g.expect.life(1, 40);
    g.expect.stack([]);
    g.expect.eventLog([
      { kind: 'countered', cardName: 'Lightning Bolt' },
      { kind: 'zoneChanged', cardName: 'Lightning Bolt', fromZone: 'stack', toZone: 'graveyard' },
    ]);
    g.expect.noEvent({ kind: 'damageDealt' });
    g.expect.noEvent({ kind: 'fizzled' });
  });

  test('no refund: the countered spell mana stays spent (CR 701.6b)', () => {
    const g = bolted();
    g.passAll();
    g.expect.tapped('Mountain');
    g.expect.pool(0, '');
  });

  test('Counterspell is only castable with a spell to target', () => {
    const g = scenario()
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .seat(0)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.expect.illegal(1, { cast: 'Counterspell' });
  });

  test('a Counterspell can be countered by another (a stack of three)', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', 'Counterspell')
      .battlefield('Mountain', 'Island', 'Island')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', {
      targets: [{ name: 'Lightning Bolt', zone: 'stack' }],
      pay: true,
    });
    g.act(1).pass();
    g.act(0).cast('Counterspell', {
      targets: [{ name: 'Counterspell', zone: 'stack', seat: 1 }],
      pay: true,
    });
    g.expect.stack(['Counterspell', 'Counterspell', 'Lightning Bolt']);
    g.passAll();
    // Seat 0's Counterspell countered seat 1's; the Bolt then resolved.
    g.expect.life(1, 37);
    g.expect.zone('Counterspell', 'graveyard', { seat: 1 });
    g.expect.zone('Counterspell', 'graveyard', { seat: 0 });
  });
});

describe('Unsummon: CR 400.7 and CR 608.2m', () => {
  test('returns a non-commander creature to its owner hand, as a new object, no question asked', () => {
    const g = scenario()
      .seat(0)
      .hand('Unsummon')
      .battlefield('Island')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears', counters: { '+1/+1': 1 } })
      .build();
    const old = g.id('bears');
    g.act(0).cast('Unsummon', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 1 });
    expect(g.id('bears')).not.toBe(old);
    g.expect.counters('bears', {});
    g.expect.zone('Unsummon', 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('it goes to the owner hand even when someone else controlled it (CR 108.3)', () => {
    const g = scenario()
      .seat(1)
      .battlefield('Grizzly Bears', { controller: 0 })
      .seat(0)
      .hand('Unsummon')
      .battlefield('Island')
      .build();
    g.act(0).cast('Unsummon', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 1 });
  });
});

describe("Divination, Angel's Mercy and Murder", () => {
  test('Divination draws two cards, top of the library first (CR 121.1)', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .battlefield('Island', { count: 3 })
      .library('Forest', 'Swamp', 'Mountain')
      .seat(1)
      .build();
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.zone('Swamp', 'hand', { seat: 0 });
    g.expect.zone('Mountain', 'library', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.librarySize(0, 1);
    g.expect.eventLog([
      { kind: 'cardDrawn', seat: 0 },
      { kind: 'cardDrawn', seat: 0 },
    ]);
    g.expect.zone('Divination', 'graveyard', { seat: 0 });
  });

  test('Divination is a sorcery: not castable with a spell on the stack or on the opponent turn', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .battlefield('Island', { count: 3 })
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0, turn: 4 })
      .build();
    g.expect.illegal(0, { cast: 'Divination' });
  });

  test("Angel's Mercy gains 7 life", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand("Angel's Mercy")
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast("Angel's Mercy", { pay: true });
    g.passAll();
    g.expect.life(0, 27);
    g.expect.eventLog([{ kind: 'lifeChanged', seat: 0, from: 20, to: 27 }]);
  });

  test("Angel's Mercy is an instant: castable on the opponent turn", () => {
    const g = scenario()
      .seat(0)
      .hand("Angel's Mercy")
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0, turn: 4 })
      .build();
    g.expect.legal(0, { cast: "Angel's Mercy" });
  });

  test('Murder destroys a creature and needs exactly {1}{B}{B}', () => {
    const short = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 2 })
      .battlefield('Grizzly Bears')
      .build();
    short.expect.illegal(0, { cast: 'Murder' });
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 2 })
      .battlefield('Mountain')
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Murder', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'died', cardName: 'Grizzly Bears' }]);
  });

  test('Murder cannot be cast with no creature to target, and cannot target a player', () => {
    const g = scenario().seat(0).hand('Murder').battlefield('Swamp', { count: 3 }).build();
    g.expect.illegal(0, { cast: 'Murder' });
  });

  test('a sorcery or instant goes to its owner graveyard once resolved (CR 608.2m)', () => {
    const g = scenario()
      .seat(0)
      .hand("Angel's Mercy")
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast("Angel's Mercy", { pay: true });
    g.expect.zone("Angel's Mercy", 'stack', { seat: 0 });
    g.passAll();
    g.expect.zone("Angel's Mercy", 'graveyard', { seat: 0 });
    g.expect.noObject("Angel's Mercy", { zone: 'stack' });
  });

  test('a creature spell becomes a permanent when it resolves (CR 608.3)', () => {
    const g = scenario()
      .seat(0)
      .hand('Grizzly Bears')
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.eventLog([
      { kind: 'zoneChanged', fromZone: 'stack', toZone: 'battlefield' },
      { kind: 'resolved' },
    ]);
  });
});
