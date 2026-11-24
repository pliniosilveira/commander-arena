// Venturing into Undercity (CR 701.49, 309; "You can't enter this dungeon unless you 'venture into Undercity'"): a player in no dungeon puts Undercity into the command zone and the marker on
// Secret Entrance; a player in a room moves the marker down an arrow (choosing when two leave the room); the room ability triggers as the marker moves into the room, controlled by the
// player who ventured, with its targets chosen as a trigger's are; a marker on the bottommost room whose dungeon is the source of no waiting room ability completes the dungeon.
// Pins: CR 701.49a-d (venture), 309.2, 309.4a (marker on the topmost room), 309.4c (room abilities), 309.5a-b (moving, completing and starting again), 309.6, 309.7 and 704.5t (a completed
// dungeon is removed, when the room ability has left the stack), 603.3d (targets of a trigger), 101.4 (APNAP), 702.11 (hexproof applies to the room ability of another player).
// The rooms are the real ones of Undercity (Scryfall). Cards are SYNTHETIC (src/cards/fixtures/synthetic-initiative.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { UndercityRoom } from '../src/index';
import { derive } from '../src/rules/derive';
import { DUNGEONS, UNDERCITY_ROOMS } from '../src/rules/dungeon-data';
import { goadersOf } from '../src/rules/goad';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { type Policy, settle } from './dungeon-helpers';

const DELVE = 'SYNTHETIC Delve Into Undercity'; // {1}{B} sorcery: you venture into Undercity
const MASS = 'SYNTHETIC Mass Venture'; // {2}{B} sorcery: each player ventures into Undercity
const FLASH = 'SYNTHETIC Initiative Flash'; // {1}{W} instant: you take the initiative (which ventures)
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BLANK = 'SYNTHETIC Blank Slate'; // a 0/0 creature: it dies at once unless it enters with counters
const blank = singleFaceCard({
  name: BLANK,
  manaCost: ['1'],
  types: ['creature'],
  colors: [],
  colorIdentity: [],
  power: 0,
  toughness: 0,
  oracleText: '',
});

type Builder = ReturnType<typeof scenario>;

/** `seats` players with a library of Plains; seat 0 has the sorcery and mana for it. */
function table(
  seats: 2 | 3 | 4,
  build: (b: Builder) => Builder = (b) => b,
  /** Cards on top of seat 0's library, above the Plains. */
  top: readonly string[] = [],
): Builder {
  let b = scenario({ seats })
    .define(blank)
    .seat(0)
    .life(20)
    .hand(DELVE)
    .battlefield('Swamp', { count: 3 })
    .library(...top, ...FILLER);
  for (let seat = 1; seat < seats; seat += 1)
    b = b
      .seat(seat)
      .life(20)
      .library(...FILLER);
  return build(b);
}

/** Seat 0 casts the venture sorcery and everything it causes is settled. */
function delve(g: ScenarioGame, policy: Policy = {}): number[] {
  g.act(0).cast({ name: DELVE, zone: 'hand', nth: 0 }, { pay: true });
  return settle(g, policy);
}

describe('entering Undercity (CR 701.49a, 701.49d, 309.4a)', () => {
  test('a player in no dungeon puts Undercity into the command zone with the marker on Secret Entrance', () => {
    const g = table(2).at('precombatMain').build();
    g.expect.dungeon(0, null);
    g.act(0).cast(DELVE, { pay: true });
    g.pass();
    g.pass();
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.eventLog([
      { kind: 'ventured', seat: 0, dungeon: 'undercity', room: 'secretEntrance', from: null },
    ]);
    expect(g.view(1).seats[0]?.dungeon?.name).toBe('Undercity');
    expect(g.view(1).seats[0]?.dungeon?.bottom).toBe(false);
  });

  test('Secret Entrance: search the library for a basic land card, reveal it, put it into the hand, then shuffle', () => {
    const g = table(2).at('precombatMain').build();
    g.act(0).cast(DELVE, { pay: true });
    g.pass();
    g.pass();
    // The room ability is on the stack, shown as the dungeon's, controlled by the player who ventured (CR 309.4c).
    g.expect.stack(['Undercity (ability)']);
    const top = g.view(1).stack[0];
    expect(top?.name).toBe('Undercity');
    expect(top?.controller).toBe(0);
    expect(top?.oracleText).toContain('Secret Entrance');
    const hand = g.state.seats[0]?.hand.length ?? 0;
    settle(g);
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
    expect(g.state.seats[0]?.library.length).toBe(11);
    g.expect.noEvent({ kind: 'abilityRemoved' });
  });

  test('the marker goes down one arrow each venture; a room with two arrows asks the player which', () => {
    const g = table(2, (b) => b.seat(0).dungeon('secretEntrance'))
      .at('precombatMain')
      .build();
    g.act(0).cast(DELVE, { pay: true });
    g.pass();
    g.pass();
    // Secret Entrance leads to Forge and Lost Well: the question lists both by name (CR 701.49b).
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'dungeonRoom')
      throw new Error('expected the room question');
    expect(d.seat).toBe(0);
    expect(d.options).toEqual(['Forge', 'Lost Well']);
    // An answer that is not one of the options is refused, and nothing moved.
    expect(() => g.act(0).chooseOption('Arena')).toThrow();
    g.expect.dungeon(0, 'secretEntrance');
    g.act(0).chooseOption('Lost Well');
    g.expect.dungeon(0, 'lostWell');
    g.expect.eventLog([
      { kind: 'optionChosen', purpose: 'dungeonRoom', option: 'Lost Well' },
      { kind: 'ventured', seat: 0, room: 'lostWell', from: 'secretEntrance' },
    ]);
  });

  test('a room with one arrow leaving it moves the marker without asking', () => {
    const g = table(2, (b) => b.seat(0).dungeon('trap'))
      .at('precombatMain')
      .build();
    g.act(0).cast(DELVE, { pay: true });
    g.pass();
    g.pass();
    g.expect.dungeon(0, 'archives');
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe('the rooms of Undercity (CR 309.4c)', () => {
  test('Forge: put two +1/+1 counters on target creature, which the player who ventured chooses', () => {
    const g = table(2, (b) =>
      b.seat(0).dungeon('secretEntrance').battlefield(BEARS).seat(1).battlefield('Giant Spider'),
    )
      .at('precombatMain')
      .build();
    delve(g, { rooms: ['Forge'], targets: ['Giant Spider'] });
    g.expect.dungeon(0, 'forge');
    g.expect.counters({ name: 'Giant Spider' }, { '+1/+1': 2 });
    g.expect.pt({ name: 'Giant Spider' }, 4, 6);
    g.expect.pt({ name: BEARS }, 2, 2);
  });

  test('Forge with no creature to target: the ability is removed and nothing else happens (CR 603.3d)', () => {
    const g = table(2, (b) => b.seat(0).dungeon('secretEntrance'))
      .at('precombatMain')
      .build();
    delve(g, { rooms: ['Forge'] });
    g.expect.dungeon(0, 'forge');
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('Lost Well: scry 2', () => {
    const g = table(2, (b) => b.seat(0).dungeon('secretEntrance'))
      .at('precombatMain')
      .build();
    g.act(0).cast(DELVE, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseOption('Lost Well');
    g.pass();
    g.pass();
    g.expect.pending('arrangeCards', 0);
    const d = g.state.pending;
    if (d?.kind !== 'arrangeCards') throw new Error('expected scry');
    expect(d.purpose).toBe('scry');
    expect(d.cards).toHaveLength(2);
  });

  test('Trap!: target player loses 5 life, any player', () => {
    const g = table(2, (b) => b.seat(0).dungeon('forge'))
      .at('precombatMain')
      .build();
    delve(g, { rooms: ['Trap!'], targets: [{ player: 1 }] });
    g.expect.dungeon(0, 'trap');
    g.expect.life(1, 15);
    g.expect.life(0, 20);
    // Each player is a legal target, the player who ventured included (CR 115.1: "target player").
    const h = table(2, (b) => b.seat(0).dungeon('forge'))
      .at('precombatMain')
      .build();
    delve(h, { rooms: ['Trap!'], targets: [{ player: 0 }] });
    h.expect.life(0, 15);
  });

  test('Arena: goad target creature (goaded by the player who ventured)', () => {
    const g = table(2, (b) => b.seat(0).dungeon('lostWell').seat(1).battlefield(BEARS))
      .at('precombatMain')
      .build();
    delve(g, { rooms: ['Arena'] });
    g.expect.dungeon(0, 'arena');
    expect(goadersOf(g.state, g.id({ name: BEARS, zone: 'battlefield' }))).toEqual([0]);
  });

  test('Stash: create a Treasure token', () => {
    const g = table(2, (b) => b.seat(0).dungeon('lostWell'))
      .at('precombatMain')
      .build();
    delve(g, { rooms: ['Stash'] });
    g.expect.dungeon(0, 'stash');
    g.expect.zone('Treasure', 'battlefield', { seat: 0 });
  });

  test('Archives: draw a card', () => {
    const g = table(2, (b) => b.seat(0).dungeon('trap'))
      .at('precombatMain')
      .build();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    delve(g);
    g.expect.dungeon(0, 'archives');
    // The sorcery left the hand and a card was drawn.
    expect(g.state.seats[0]?.hand.length).toBe(hand);
  });

  test('Catacombs: create a 4/1 black Skeleton creature token with menace', () => {
    const g = table(2, (b) => b.seat(0).dungeon('stash'))
      .at('precombatMain')
      .build();
    delve(g);
    g.expect.dungeon(0, 'catacombs');
    g.expect.zone('Skeleton', 'battlefield', { seat: 0 });
    g.expect.pt('Skeleton', 4, 1);
    const skeleton = derive(g.state, g.object({ name: 'Skeleton', zone: 'battlefield' }));
    expect(skeleton.colors).toEqual(['B']);
    expect(skeleton.subtypes).toContain('Skeleton');
    expect(
      skeleton.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'menace'),
    ).toBe(true);
  });

  test('Throne of the Dead Three: reveal ten, a creature enters with three +1/+1 counters and hexproof until the next turn, then shuffle; the dungeon is completed', () => {
    const g = table(2, (b) => b.seat(0).dungeon('catacombs'), [...FILLER.slice(0, 4), BEARS])
      .at('precombatMain')
      .build();
    delve(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(BEARS, { '+1/+1': 3 });
    g.expect.pt(BEARS, 5, 5);
    const bears = derive(g.state, g.object({ name: BEARS, zone: 'battlefield' }));
    expect(bears.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'hexproof')).toBe(
      true,
    );
    // Everything else is still in the library, shuffled (12 Plains and 4 more on top).
    g.expect.librarySize(0, 16);
    // The room ability has left the stack, so the dungeon is completed and removed (CR 704.5t, 309.7).
    g.expect.dungeon(0, null);
    g.expect.eventLog([
      { kind: 'ventured', seat: 0, room: 'throneOfTheDeadThree' },
      { kind: 'dungeonCompleted', seat: 0, dungeon: 'undercity' },
    ]);
    // Hexproof lasts until the player's next turn begins (CR 611.2a, 500.1).
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    const later = derive(g.state, g.object({ name: BEARS, zone: 'battlefield' }));
    expect(later.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'hexproof')).toBe(
      false,
    );
  });

  test('Throne of the Dead Three with no creature among the top ten: nothing enters, the library is shuffled and the dungeon is still completed', () => {
    const g = table(2, (b) => b.seat(0).dungeon('catacombs'))
      .at('precombatMain')
      .build();
    delve(g);
    g.expect.librarySize(0, 12);
    g.expect.dungeon(0, null);
    g.expect.noEvent({ kind: 'abilityRemoved' });
  });

  test('a creature put onto the battlefield by Throne with toughness 0 survives: the counters are on it as it enters', () => {
    const g = table(2, (b) => b.seat(0).dungeon('catacombs'), [BLANK])
      .at('precombatMain')
      .build();
    delve(g);
    g.expect.zone(BLANK, 'battlefield', { seat: 0 });
    g.expect.counters(BLANK, { '+1/+1': 3 });
    g.expect.pt(BLANK, 3, 3);
  });
});

describe('the room ability of one player on the stack and hexproof (CR 309.4c, 702.11)', () => {
  test('the creature Throne gave hexproof cannot be the target of an opponent’s Forge', () => {
    const g = table(
      2,
      (b) =>
        b
          .seat(0)
          .dungeon('catacombs')
          .seat(1)
          .hand(DELVE)
          .battlefield('Swamp', { count: 3 })
          .dungeon('secretEntrance')
          .battlefield('Giant Spider'),
      [BEARS],
    )
      .at('precombatMain')
      .build();
    delve(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    // Seat 1 ventures on their own turn... the sorcery is cast now with the turn handed over.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast(DELVE, { pay: true });
    g.pass();
    g.pass();
    g.act(1).chooseOption('Forge');
    g.pass();
    g.pass();
    const d = g.state.pending;
    // Only creatures seat 1 may target: their own (the Bears of seat 0 has hexproof until seat 0's next turn), and with one legal target the choice is made for them.
    expect(d?.kind === 'targets' ? d.specs[0]?.legal.length : 1).toBe(1);
    settle(g);
    g.expect.counters('Giant Spider', { '+1/+1': 2 });
    g.expect.counters(BEARS, { '+1/+1': 3 });
  });
});

describe('completing a dungeon (CR 701.49c, 309.5b, 309.6, 309.7, 704.5t)', () => {
  test('the dungeon stays while its room ability is on the stack and is removed when it has left it', () => {
    const g = table(2, (b) => b.seat(0).dungeon('archives'))
      .at('precombatMain')
      .build();
    g.act(0).cast(DELVE, { pay: true });
    g.pass();
    g.pass();
    g.expect.dungeon(0, 'throneOfTheDeadThree');
    g.expect.stack(['Undercity (ability)']);
    g.expect.noEvent({ kind: 'dungeonCompleted' });
    settle(g);
    g.expect.dungeon(0, null);
    g.expect.eventLog([{ kind: 'dungeonCompleted', seat: 0, dungeon: 'undercity' }]);
  });

  test('a venture while the marker is on the bottommost room completes the dungeon and enters Undercity again', () => {
    const g = table(2, (b) =>
      b.seat(0).hand(FLASH).battlefield('Plains', { count: 2 }).dungeon('archives'),
    )
      .at('precombatMain')
      .build();
    g.act(0).cast(DELVE, { pay: true });
    g.pass();
    g.pass();
    g.expect.dungeon(0, 'throneOfTheDeadThree');
    // In response to the Throne ability, seat 0 takes the initiative: the venture it triggers resolves first, with the marker on the bottommost room (CR 701.49c).
    g.act(0).cast(FLASH, { pay: true });
    const before = g.mark();
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    const events = g.eventsSince(before);
    expect(events.map((e) => e.kind)).toContain('dungeonCompleted');
    expect(events.find((e) => e.kind === 'ventured')).toMatchObject({
      room: 'secretEntrance',
      from: null,
    });
    settle(g);
    // The new dungeon is on Secret Entrance (its room ability searched a land).
    g.expect.dungeon(0, 'secretEntrance');
  });

  test('a new venture after the dungeon was completed starts Undercity again', () => {
    const g = table(2, (b) =>
      b.seat(0).dungeon('archives').hand(DELVE).battlefield('Swamp', { count: 2 }),
    )
      .at('precombatMain')
      .build();
    delve(g);
    g.expect.dungeon(0, null);
    g.act(0).cast({ name: DELVE, zone: 'hand', nth: 0 }, { pay: true });
    settle(g);
    g.expect.dungeon(0, 'secretEntrance');
  });
});

describe('the dungeon card (CR 309.4)', () => {
  test('the rooms are joined by the arrows of the card: a topmost room, a bottommost room, every room reachable', () => {
    const rooms = DUNGEONS.undercity.rooms;
    expect(UNDERCITY_ROOMS).toHaveLength(9);
    const exits = (r: UndercityRoom) => [...rooms[r].exits];
    expect(exits('secretEntrance')).toEqual(['forge', 'lostWell']);
    expect(exits('forge')).toEqual(['trap', 'arena']);
    expect(exits('lostWell')).toEqual(['arena', 'stash']);
    expect(exits('trap')).toEqual(['archives']);
    expect(exits('arena')).toEqual(['archives', 'catacombs']);
    expect(exits('stash')).toEqual(['catacombs']);
    expect(exits('archives')).toEqual(['throneOfTheDeadThree']);
    expect(exits('catacombs')).toEqual(['throneOfTheDeadThree']);
    expect(exits('throneOfTheDeadThree')).toEqual([]);
    const reachable = new Set<UndercityRoom>([DUNGEONS.undercity.top]);
    for (let i = 0; i < 10; i += 1)
      for (const r of [...reachable]) for (const e of rooms[r].exits) reachable.add(e);
    expect([...reachable].sort()).toEqual([...UNDERCITY_ROOMS].sort());
  });

  test('every arrow of the card can be followed by a venture: the marker moves from the room to the room the player chose', () => {
    let arrows = 0;
    for (const from of UNDERCITY_ROOMS) {
      for (const to of DUNGEONS.undercity.rooms[from].exits) {
        arrows += 1;
        const g = table(2, (b) => b.seat(0).dungeon(from).battlefield(BEARS))
          .at('precombatMain')
          .build();
        delve(g, { rooms: [DUNGEONS.undercity.rooms[to].name] });
        // The room ability of the room moved into may have completed the dungeon (the bottommost room).
        if (DUNGEONS.undercity.rooms[to].exits.length === 0) g.expect.dungeon(0, null);
        else g.expect.dungeon(0, to);
        expect(g.eventsSince(0).find((e) => e.kind === 'ventured')).toMatchObject({
          room: to,
          from,
        });
      }
    }
    expect(arrows).toBe(12);
  });
});

describe('what a view shows (hidden information)', () => {
  test('the initiative and every dungeon are public; the cards found by Secret Entrance stay hidden in the hand', () => {
    const g = table(2).at('precombatMain', { initiative: 0 }).build();
    delve(g);
    const seen = g.view(1);
    // Public: who has the initiative and where the venture marker of each player is.
    expect(seen.initiative).toBe(0);
    expect(seen.seats[0]?.dungeon).toMatchObject({
      dungeon: 'undercity',
      name: 'Undercity',
      room: 'secretEntrance',
      roomName: 'Secret Entrance',
      bottom: false,
    });
    expect(seen.seats[1]?.dungeon).toBeUndefined();
    // Private: the opponent sees how many cards seat 0 holds, never which (the land was revealed as it was found, a log event, but it is in a hand).
    expect(seen.seats[0]?.handCount).toBe(1);
    expect(seen.seats[0]?.hand).toBeNull();
    expect(JSON.stringify(seen)).not.toContain(`"id":"${g.state.seats[0]?.library[0]}"`);
    // The owner sees their own hand.
    expect(g.view(0).seats[0]?.hand).toHaveLength(1);
    // The view is the same for the two seats on what is public.
    expect(g.view(0).initiative).toBe(seen.initiative);
    expect(g.view(0).seats[0]?.dungeon).toEqual(seen.seats[0]?.dungeon);
  });

  test('a view of a game with no initiative and no dungeon has neither field (the state shape is unchanged for other games)', () => {
    const g = table(2).at('precombatMain').build();
    const view = g.view(0);
    expect('initiative' in view).toBe(false);
    expect(view.seats.every((seat) => !('dungeon' in seat))).toBe(true);
    expect('initiative' in g.state).toBe(false);
  });
});

describe('every player ventures: APNAP order and one dungeon each (CR 101.4, 701.49)', () => {
  for (const seats of [2, 3, 4] as const) {
    test(`${seats} seats: each enters Undercity, each room ability is controlled and settled by its own player`, () => {
      const g = table(seats, (b) => b.seat(0).hand(MASS))
        .at('precombatMain')
        .build();
      g.act(0).cast(MASS, { pay: true });
      const asked = settle(g);
      expect(asked).toEqual([]);
      for (let seat = 0; seat < seats; seat += 1) {
        g.expect.dungeon(seat, 'secretEntrance');
        // Each searched their own library for a basic land: one card in hand each (seat 0 cast the sorcery from hand).
        expect(g.state.seats[seat]?.library.length).toBe(11);
      }
    });
  }

  test('three seats: the second venture asks each player in turn order from the active player, each choosing their own room', () => {
    const g = table(3, (b) =>
      b
        .seat(0)
        .hand(MASS)
        .dungeon('secretEntrance')
        .seat(1)
        .dungeon('secretEntrance')
        .seat(2)
        .dungeon('lostWell'),
    )
      .at('precombatMain')
      .build();
    g.act(0).cast(MASS, { pay: true });
    const asked = settle(g, { rooms: ['Forge', 'Lost Well', 'Stash'] });
    // Seats 0 and 1 are at the fork of Secret Entrance, seat 2 at the fork of Lost Well: all three are asked, active player first.
    expect(asked).toEqual([0, 1, 2]);
    g.expect.dungeon(0, 'forge');
    g.expect.dungeon(1, 'lostWell');
    g.expect.dungeon(2, 'stash');
  });

  test('four seats with the turn on the third player: the questions come in turn order from them', () => {
    const g = table(4, (b) =>
      b
        .seat(2)
        .hand(MASS)
        .battlefield('Swamp', { count: 3 })
        .seat(0)
        .dungeon('secretEntrance')
        .seat(1)
        .dungeon('secretEntrance')
        .seat(3)
        .dungeon('secretEntrance'),
    )
      .at('precombatMain', { active: 2, turn: 3 })
      .build();
    g.act(2).cast(MASS, { pay: true });
    const asked = settle(g);
    expect(asked).toEqual([3, 0, 1]);
  });

  test('a player who has left the game does not venture', () => {
    const g = table(3, (b) => b.seat(0).hand(MASS).seat(2).life(0))
      .at('precombatMain')
      .build();
    g.act(0).cast(MASS, { pay: true });
    settle(g);
    g.expect.hasLost(2, true);
    g.expect.dungeon(2, null);
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.dungeon(1, 'secretEntrance');
  });
});
