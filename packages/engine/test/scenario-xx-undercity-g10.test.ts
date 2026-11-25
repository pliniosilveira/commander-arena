// Venturing into Undercity (CR 701.49) and the dungeon (CR 309). "Venture into Undercity" is an effect: with no dungeon the player
// puts Undercity into the command zone and the venture marker on its topmost room (CR 701.49a, 309.4a); with the marker on another
// room they move it along an arrow, choosing one when two lead away (CR 701.49b, 309.5a); moving it into a room triggers that room's
// ability, controlled by the player who owns the dungeon (CR 309.4c), which goes on the stack and chooses its targets like any trigger.
// On the bottommost room, once no room ability of the player is waiting or on the stack, the dungeon is removed and completed (CR 309.6,
// 309.7); the next venture puts a fresh Undercity into the command zone (CR 701.49a, 701.49c).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-initiative.ts) or real fixtures; the rooms are data (src/data/dungeons.ts).
import { describe, expect, test } from 'vitest';
import { applyAction, getView, type UndercityRoom } from '../src/index';
import { scenario } from '../src/testing/index';

const DIVE = 'SYNTHETIC Undercity Dive'; // {1}{U} sorcery: venture into Undercity
const BEARS = 'Grizzly Bears';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;
type Game = ReturnType<Builder['build']>;

/** Seat 0 has the Dive and two Islands, a marker on `room` (none: no dungeon yet), and a library of basic lands. */
const at = (room: UndercityRoom | null, extra: (b: Builder) => Builder = (b) => b): Game => {
  let b = scenario()
    .seat(0)
    .life(20)
    .library(...FILLER)
    .hand(DIVE)
    .battlefield('Island', { count: 2 });
  if (room !== null) b = b.dungeon(room);
  return extra(
    b
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain')
    .build();
};

/** Casts the Dive and lets it resolve (the answer to a fork is up to the test). */
const dive = (g: Game, seats = 2): void => {
  g.act(0).cast({ name: DIVE, nth: 0 }, { pay: true });
  for (let s = 0; s < seats; s += 1) g.pass();
};

/** Passes priority until the stack is empty (the pending decision, if any, stops it). */
const resolveAll = (g: Game): void => {
  for (
    let i = 0;
    i < 30 && g.state.stack.length > 0 && g.state.pending?.kind === 'priority';
    i += 1
  ) {
    g.pass();
    g.pass();
  }
};

describe('entering the dungeon (CR 701.49a, 309.4a)', () => {
  test('a player in no dungeon puts the venture marker on the topmost room; its ability goes on the stack', () => {
    const g = at(null);
    dive(g);
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.stack(['Undercity (ability)']);
    const top = getView(g.state, 1).stack[0];
    expect(top?.name).toBe('Undercity');
    expect(top?.abilitySource).toBeUndefined();
    expect(top?.controller).toBe(0);
    expect(top?.oracleText).toContain('search your library for a basic land card');
    g.expect.eventLog([
      { kind: 'ventured', seat: 0, dungeon: 'undercity', room: 'secretEntrance', from: null },
    ]);
  });

  test('Secret Entrance: search the library for a basic land card, reveal it, put it into the hand, shuffle', () => {
    const g = at(null, (b) =>
      b.seat(0).library('Plains', 'Forest', 'Swamp', 'Island', 'Mountain', 'Plains'),
    );
    dive(g);
    const hand = g.state.seats[0]?.hand.length ?? 0;
    const library = g.state.seats[0]?.library.length ?? 0;
    g.pass();
    g.pass();
    // The player chooses which of the basic lands (CR 701.23a).
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Forest');
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
    expect(g.find({ name: 'Forest', zone: 'hand', seat: 0 })).toHaveLength(1);
    expect(g.state.seats[0]?.library.length).toBe(library - 1);
    g.expect.eventLog([{ kind: 'cardsRevealed', seat: 0 }]);
  });

  test('only the player who ventured is in the dungeon', () => {
    const g = at(null);
    dive(g);
    g.expect.dungeon(1, null);
    expect(getView(g.state, 1).seats[1]?.dungeon).toBeUndefined();
  });
});

describe('moving the venture marker (CR 701.49b, 309.5a)', () => {
  test('two arrows leave Secret Entrance: the player chooses the room, and only one of them', () => {
    const g = at('secretEntrance');
    dive(g);
    g.expect.pending('chooseOption', 0);
    const d = g.state.pending;
    expect(d?.kind === 'chooseOption' && d.purpose).toBe('dungeonRoom');
    expect(d?.kind === 'chooseOption' && d.options).toEqual(['Forge', 'Lost Well']);
    expect(applyAction(g.state, 0, { kind: 'chooseOption', option: 'Trap!' }).ok).toBe(false);
    g.act(0).chooseOption('Lost Well');
    g.expect.dungeon(0, 'lostWell');
    g.expect.stack(['Undercity (ability)']);
  });

  test('one arrow leaves Trap!: nothing is asked and the marker moves to Archives', () => {
    const g = at('trap');
    dive(g);
    g.expect.dungeon(0, 'archives');
  });

  test('every fork of the dungeon offers the rooms its arrows point to', () => {
    for (const [room, options] of [
      ['secretEntrance', ['Forge', 'Lost Well']],
      ['forge', ['Trap!', 'Arena']],
      ['lostWell', ['Arena', 'Stash']],
      ['arena', ['Archives', 'Catacombs']],
    ] as const) {
      const g = at(room);
      dive(g);
      const d = g.state.pending;
      expect(d?.kind === 'chooseOption' && d.options).toEqual(options);
    }
  });
});

describe('the room abilities (CR 309.4c)', () => {
  test('Forge: put two +1/+1 counters on target creature', () => {
    const g = at('secretEntrance', (b) => b.seat(0).battlefield(BEARS));
    dive(g);
    g.act(0).chooseOption('Forge');
    // One creature on the battlefield: the only legal target is chosen as the ability goes on the stack.
    g.expect.stack(['Undercity (ability)']);
    g.pass();
    g.pass();
    expect(g.state.objects[g.id(BEARS)]?.counters['+1/+1']).toBe(2);
  });

  test('Forge asks for the target when there are two creatures, and may target an opponent’s creature', () => {
    const g = at('secretEntrance', (b) =>
      b.seat(0).battlefield(BEARS).seat(1).battlefield('Typhoid Rats'),
    );
    dive(g);
    g.act(0).chooseOption('Forge');
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ name: 'Typhoid Rats' });
    g.pass();
    g.pass();
    expect(g.state.objects[g.id('Typhoid Rats')]?.counters['+1/+1']).toBe(2);
    expect(g.state.objects[g.id(BEARS)]?.counters['+1/+1'] ?? 0).toBe(0);
  });

  test('Forge with no creature at all: the ability is removed (CR 603.3d)', () => {
    const g = at('secretEntrance');
    dive(g);
    g.act(0).chooseOption('Forge');
    g.expect.stack([]);
    g.expect.dungeon(0, 'forge');
  });

  test('Lost Well: scry 2', () => {
    const g = at('secretEntrance');
    dive(g);
    g.act(0).chooseOption('Lost Well');
    g.pass();
    g.pass();
    g.expect.pending('arrangeCards', 0);
  });

  test('Trap!: target player loses 5 life', () => {
    const g = at('forge');
    dive(g);
    g.act(0).chooseOption('Trap!');
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.pass();
    g.pass();
    g.expect.life(1, 15);
    g.expect.life(0, 20);
  });

  test('Arena: goad target creature', () => {
    const g = at('forge', (b) => b.seat(1).battlefield(BEARS));
    dive(g);
    g.act(0).chooseOption('Arena');
    g.expect.stack(['Undercity (ability)']);
    g.pass();
    g.pass();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEARS)?.goadedBy).toEqual([0]);
  });

  test('Stash: create a Treasure token', () => {
    const g = at('lostWell');
    dive(g);
    g.act(0).chooseOption('Stash');
    g.pass();
    g.pass();
    expect(g.find({ name: 'Treasure' })).toHaveLength(1);
    expect(g.find({ name: 'Treasure' })[0]?.controller).toBe(0);
  });

  test('Archives: draw a card', () => {
    const g = at('trap');
    dive(g);
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.pass();
    g.pass();
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
  });

  test('Catacombs: create a 4/1 black Skeleton creature token with menace', () => {
    const g = at('stash');
    dive(g);
    g.pass();
    g.pass();
    const skeleton = getView(g.state, 0).battlefield.find((o) => o.name === 'Skeleton');
    expect(skeleton?.power).toBe(4);
    expect(skeleton?.toughness).toBe(1);
    expect(skeleton?.colors).toEqual(['B']);
    expect(skeleton?.isToken).toBe(true);
    expect(skeleton?.keywords.join(' ')).toMatch(/menace/i);
  });

  test('Throne of the Dead Three: reveal ten, put a creature onto the battlefield with three +1/+1 counters, hexproof until your next turn, shuffle', () => {
    const g = at('archives', (b) => b.seat(0).library(BEARS, 'Typhoid Rats', ...FILLER));
    dive(g);
    g.expect.dungeon(0, 'throneOfTheDeadThree');
    const library = g.state.seats[0]?.library.length ?? 0;
    g.pass();
    g.pass();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(BEARS);
    const bears = g.state.objects[g.id(BEARS)];
    expect(bears?.zone).toBe('battlefield');
    expect(bears?.counters['+1/+1']).toBe(3);
    expect(
      getView(g.state, 1)
        .battlefield.find((o) => o.name === BEARS)
        ?.keywords.join(' '),
    ).toMatch(/hexproof/i);
    // The rest of the library was shuffled (CR 701.24): the library keeps every other card.
    expect(g.state.seats[0]?.library.length).toBe(library - 1);
    g.expect.eventLog([
      { kind: 'cardsRevealed', seat: 0 },
      { kind: 'libraryShuffled', seat: 0 },
    ]);
  });
});

describe('completing the dungeon (CR 309.6, 309.7, 701.49c)', () => {
  test('the marker on the bottommost room: once its ability left the stack the dungeon is removed and completed', () => {
    const g = at('archives');
    dive(g);
    g.expect.dungeon(0, 'throneOfTheDeadThree');
    // The room ability is on the stack, so the dungeon stays (CR 309.6).
    g.expect.stack(['Undercity (ability)']);
    g.pass();
    g.pass();
    if (g.state.pending?.kind === 'chooseCards') g.act(0).decline();
    g.expect.dungeon(0, null);
    g.expect.eventLog([{ kind: 'dungeonCompleted', seat: 0, dungeon: 'undercity' }]);
  });

  test('a venture after completing puts the fresh dungeon into the command zone on its topmost room', () => {
    const g = at('archives', (b) => b.seat(0).hand(DIVE).battlefield('Island', { count: 2 }));
    dive(g);
    resolveAll(g);
    g.expect.dungeon(0, null);
    g.act(0).cast({ name: DIVE, nth: 0 }, { pay: true });
    g.pass();
    g.pass();
    g.expect.dungeon(0, 'secretEntrance');
  });

  test('a venture while the marker is on the bottommost room, its ability waiting: complete, then enter afresh (CR 701.49c)', () => {
    const g = at('throneOfTheDeadThree');
    dive(g);
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.eventLog([
      { kind: 'dungeonCompleted', seat: 0 },
      { kind: 'ventured', seat: 0, room: 'secretEntrance', from: null },
    ]);
  });
});

describe('players and seats (CR 800.4)', () => {
  test('with four seats every player ventures on their own marker', () => {
    let b = scenario({ seats: 4 });
    for (let s = 0; s < 4; s += 1)
      b = b
        .seat(s)
        .life(20)
        .library(...FILLER);
    const g = b
      .seat(0)
      .hand(DIVE)
      .battlefield('Island', { count: 2 })
      .seat(3)
      .dungeon('forge')
      .at('precombatMain')
      .build();
    dive(g, 4);
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.dungeon(3, 'forge');
    g.expect.dungeon(1, null);
    g.expect.dungeon(2, null);
  });
});
