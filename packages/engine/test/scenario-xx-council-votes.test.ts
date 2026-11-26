// The results of a council vote (CR 701.38a, 701.38b) with two, three and four seats: "If time gets more votes" (`voteMost`: more than each other option) and "if the vote is tied"
// (`voteTied`: more than one option has the most votes), "for each Redhorn Pass vote, search ..." (`repeat` of the votes for an option), "each player returns up to two cards from their
// graveyard" (`forEachPlayer` with `runsAs: 'each'`), "your Ring-bearer" (`ObjectRef` `ringBearer`) and "if another Elf entered the battlefield under your control this turn"
// (`enteredThisTurn` with `other`). Pins: CR 701.38a (each player votes, starting with the player named and proceeding in turn order), CR 608.2c (instructions are followed in the order
// written; a condition is read as its instruction comes up), CR 500.7 (an extra turn), CR 101.4 (each player's choices in APNAP order), CR 701.23 (search), CR 701.24 (shuffle),
// CR 608.2n (the spell is exiled by its own instruction and so is not put into a graveyard), CR 701.54 (the Ring), CR 603.4 (an intervening "if"), CR 400.7 (a new object).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-council.ts); the real cards are played in packages/cards/test/convert-grammar-engine-council-votes.test.ts.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { GameEvent } from '../src/index';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const TIME = 'SYNTHETIC Council of Time'; // {3}{U} sorcery
const TIDES = 'SYNTHETIC Council of Tides'; // {2}{G}{U} instant
const ROADS = 'SYNTHETIC Council of Roads'; // {5}{G} sorcery
const QUEEN = 'SYNTHETIC Council Queen'; // {2}{G}{U} Elf Noble, 3/4
const ELF = 'SYNTHETIC Council Elf'; // {G} Elf 1/1
const TRIO = 'SYNTHETIC Trio Rite'; // three options, results of a tie
const FILLER = Array.from({ length: 12 }, () => 'Plains');

/** "Starting with you, each player votes for a, b or c. If a gets more votes, draw a card. If the vote is tied, you gain 5 life. If b gets more votes or the vote is tied, you lose 1 life." */
const TRIO_RITE = singleFace({
  name: TRIO,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'SYNTHETIC: describes what the AST does.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'vote', options: ['a', 'b', 'c'], startingWith: 'you' },
        {
          kind: 'conditional',
          condition: { kind: 'voteMost', option: 'a' },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
        {
          kind: 'conditional',
          condition: { kind: 'voteTied' },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 5 },
        },
        {
          kind: 'conditional',
          condition: { kind: 'voteMost', option: 'b' },
          effect: { kind: 'loseLife', player: { kind: 'you' }, amount: 1 },
        },
      ],
    },
  },
});

describe('the cards are valid', () => {
  test.each([TIME, TIDES, ROADS, QUEEN, ELF])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
  test(TRIO, () => {
    expect(validateCard(TRIO_RITE)).toEqual([]);
  });
});

/** A table of `seats` players: seat 0 has `hand` and the mana, every seat has `library`; at the first main phase of seat 0. */
function table(
  seats: 2 | 3 | 4,
  hand: readonly string[],
  mana: readonly string[],
  own: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  extra: readonly ReturnType<typeof syntheticCard>[] = [],
): ScenarioGame {
  let b = scenario({ seats });
  for (const card of extra) b = b.define(card);
  b = own(
    b
      .seat(0)
      .life(20)
      .hand(...hand)
      .battlefield(...mana)
      .library(...FILLER),
  );
  for (let seat = 1; seat < seats; seat += 1)
    b = b
      .seat(seat)
      .life(20)
      .library(...FILLER);
  return b.at('precombatMain', { active: 0 }).build();
}

/** Every seat votes for the option of `votes` at its index, in turn order from seat 0, after the spell resolves. */
function vote(g: ScenarioGame, votes: readonly string[]): void {
  votes.forEach((option, seat) => {
    g.expect.pending('chooseOption', seat);
    g.act(seat).chooseOption(option);
  });
}

const cast = (g: ScenarioGame, name: string): void => {
  g.act(0).cast(name, { pay: true });
  g.passAll();
};

describe('"If time gets more votes ... if knowledge gets more votes or the vote is tied" (Plea for Power)', () => {
  const play = (seats: 2 | 3 | 4, votes: readonly string[]) => {
    const g = table(seats, [TIME], ['Island', 'Island', 'Island', 'Island']);
    cast(g, TIME);
    vote(g, votes);
    return g;
  };

  test('everyone votes for time: more votes, so an extra turn and no cards', () => {
    const g = play(2, ['time', 'time']);
    expect(g.state.extraTurns).toEqual([0]);
    g.expect.handSize(0, 0);
    g.expect.zone(TIME, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('two players, one vote each: the vote is tied, so three cards and no extra turn', () => {
    const g = play(2, ['time', 'knowledge']);
    expect(g.state.extraTurns ?? []).toEqual([]);
    g.expect.handSize(0, 3);
  });

  test('knowledge gets more votes: three cards', () => {
    const g = play(2, ['knowledge', 'knowledge']);
    expect(g.state.extraTurns ?? []).toEqual([]);
    g.expect.handSize(0, 3);
  });

  test('three players: two votes for time against one outweigh it (the controller voted for knowledge)', () => {
    const g = play(3, ['knowledge', 'time', 'time']);
    expect(g.state.extraTurns).toEqual([0]);
    g.expect.handSize(0, 0);
  });

  test('three players: two votes for knowledge against one for time draw three cards', () => {
    const g = play(3, ['time', 'knowledge', 'knowledge']);
    expect(g.state.extraTurns ?? []).toEqual([]);
    g.expect.handSize(0, 3);
  });

  test('four players: two against two is tied (more than one option has the most votes)', () => {
    const g = play(4, ['time', 'knowledge', 'time', 'knowledge']);
    expect(g.state.extraTurns ?? []).toEqual([]);
    g.expect.handSize(0, 3);
  });

  test('four players: three against one is not tied', () => {
    const g = play(4, ['time', 'time', 'knowledge', 'time']);
    expect(g.state.extraTurns).toEqual([0]);
    g.expect.handSize(0, 0);
  });

  test('the votes go round the table in turn order, starting with the controller, and each is public', () => {
    const g = table(4, [TIME], ['Island', 'Island', 'Island', 'Island']);
    cast(g, TIME);
    const mark = g.mark();
    vote(g, ['time', 'knowledge', 'time', 'knowledge']);
    const votes = g
      .eventsSince(mark)
      .filter((e): e is Extract<GameEvent, { kind: 'optionChosen' }> => e.kind === 'optionChosen');
    expect(votes.map((v) => [v.seat, v.option])).toEqual([
      [0, 'time'],
      [1, 'knowledge'],
      [2, 'time'],
      [3, 'knowledge'],
    ]);
  });
});

describe('a tie is between the options that lead, with three options (CR 701.38a)', () => {
  const play = (seats: 3 | 4, votes: readonly string[]) => {
    const g = table(seats, [TRIO], ['Island'], (b) => b, [TRIO_RITE]);
    cast(g, TRIO);
    vote(g, votes);
    return g;
  };

  test('a gets one vote more than each other option: a gets more votes, nothing is tied', () => {
    const g = play(4, ['a', 'a', 'b', 'c']);
    g.expect.handSize(0, 1);
    g.expect.life(0, 20);
  });

  test('a and b tie for the most, c trails: the vote is tied and neither gets more votes', () => {
    const g = play(4, ['a', 'a', 'b', 'b']);
    g.expect.handSize(0, 0);
    g.expect.life(0, 25);
  });

  test('three players, one vote each: all three are tied', () => {
    const g = play(3, ['a', 'b', 'c']);
    g.expect.handSize(0, 0);
    g.expect.life(0, 25);
  });

  test('b gets more votes with c voted once and a never: b is not tied', () => {
    const g = play(3, ['b', 'b', 'c']);
    g.expect.handSize(0, 0);
    g.expect.life(0, 19);
  });

  test('an option nobody chose does not make a tie: b and c have one vote each against two for a', () => {
    const g = play(4, ['a', 'a', 'b', 'c']);
    g.expect.life(0, 20);
  });
});

describe('"If return gets more votes, each player returns up to two cards from their graveyard to their hand, then you exile this spell" (Sail into the West)', () => {
  const MOUNTAIN_YARD = ['Grizzly Bears', 'Giant Spider', 'Serra Angel'];
  const board = (seats: 2 | 3) =>
    table(seats, [TIDES], ['Island', 'Forest', 'Island', 'Forest'], (b) =>
      b.graveyard(...MOUNTAIN_YARD),
    );

  test('every player chooses up to two of their own graveyard, in turn order, and the spell is exiled instead of going to the graveyard', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .life(20)
      .hand(TIDES)
      .battlefield('Island', 'Forest', 'Island', 'Forest')
      .graveyard('Grizzly Bears', 'Giant Spider', 'Serra Angel')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .graveyard('Lightning Bolt', 'Murder')
      .library(...FILLER)
      .seat(2)
      .life(20)
      .graveyard('Llanowar Elves')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    cast(g, TIDES);
    vote(g, ['return', 'return', 'embark']);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Grizzly Bears', 'Serra Angel');
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards('Murder');
    // Seat 2 has one card: it is chosen or declined, never from another graveyard.
    g.expect.pending('chooseCards', 2);
    g.act(2).chooseCards('Llanowar Elves');
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.zone('Murder', 'hand', { seat: 1 });
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 1 });
    g.expect.zone('Llanowar Elves', 'hand', { seat: 2 });
    g.expect.zone(TIDES, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('a player may return fewer than two, or none', () => {
    const g = board(2);
    cast(g, TIDES);
    vote(g, ['return', 'return']);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone(TIDES, 'exile', { seat: 0 });
  });

  test('embark gets more votes: each player may discard their hand and draw seven, each deciding for themselves', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .life(20)
      .hand(TIDES, 'Mountain')
      .battlefield('Island', 'Forest', 'Island', 'Forest')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand('Murder', 'Swamp')
      .library(...FILLER)
      .seat(2)
      .life(20)
      .hand('Lightning Bolt')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    cast(g, TIDES);
    vote(g, ['embark', 'embark', 'return']);
    g.act(0).accept();
    g.act(1).decline();
    g.act(2).accept();
    g.expect.handSize(0, 7);
    g.expect.zone('Mountain', 'graveyard', { seat: 0 });
    g.expect.handSize(1, 2);
    g.expect.handSize(2, 7);
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 2 });
    // The spell is not exiled by this half: it goes to its owner's graveyard as it finishes.
    g.expect.zone(TIDES, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a tie is the embark half: nothing is returned', () => {
    const g = board(2);
    cast(g, TIDES);
    vote(g, ['return', 'embark']);
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.act(1).decline();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });
});

describe('"For each Redhorn Pass vote, search ... For each Mines of Moria vote, return a card" (Travel Through Caradhras)', () => {
  const LIB = ['Forest', 'Forest', 'Island', 'Mountain', ...FILLER];
  const play = (seats: 2 | 3 | 4, votes: readonly string[]) => {
    let b = scenario({ seats })
      .seat(0)
      .life(20)
      .hand(ROADS)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .graveyard('Grizzly Bears', 'Giant Spider', 'Serra Angel')
      .library(...LIB);
    for (let seat = 1; seat < seats; seat += 1)
      b = b
        .seat(seat)
        .life(20)
        .library(...FILLER);
    const g = b.at('precombatMain', { active: 0 }).build();
    cast(g, ROADS);
    const mark = g.mark();
    vote(g, votes);
    return { g, mark };
  };
  const shuffles = (g: ScenarioGame, mark: number) =>
    g.eventsSince(mark).filter((e) => e.kind === 'libraryShuffled').length;
  const lands = (g: ScenarioGame) =>
    g.find({ name: 'Forest', zone: 'battlefield', seat: 0 }).length +
    g.find({ name: 'Island', zone: 'battlefield', seat: 0 }).length;

  test('one vote each: one basic land is put onto the battlefield tapped, the library is shuffled once, and one card is returned', () => {
    const { g, mark } = play(2, ['Redhorn Pass', 'Mines of Moria']);
    // The search asks which basic land; the controller takes the Island.
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.tapped('Island', true);
    expect(shuffles(g, mark)).toBe(1);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Serra Angel');
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.zone(ROADS, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('both vote Redhorn Pass: two searches, two tapped basic lands, and one shuffle after them', () => {
    const { g, mark } = play(2, ['Redhorn Pass', 'Redhorn Pass']);
    g.act(0).chooseCards('Island');
    expect(shuffles(g, mark)).toBe(0);
    g.act(0).chooseCards('Mountain');
    expect(shuffles(g, mark)).toBe(1);
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    g.expect.tapped('Mountain', true);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone(ROADS, 'exile', { seat: 0 });
  });

  test('four players, three vote Mines of Moria and one Redhorn Pass: one land is searched for and the library shuffled, three cards come back one after the other', () => {
    const { g, mark } = play(4, [
      'Mines of Moria',
      'Mines of Moria',
      'Redhorn Pass',
      'Mines of Moria',
    ]);
    // One vote for Redhorn Pass: one search and one shuffle, which come first, before the three returns.
    g.act(0).chooseCards('Island');
    expect(shuffles(g, mark)).toBe(1);
    g.act(0).chooseCards('Grizzly Bears');
    g.act(0).chooseCards('Giant Spider');
    // With one card left in the graveyard for the last vote, it comes back without a question.
    g.expect.handSize(0, 3);
    expect(lands(g)).toBe(7);
    g.expect.zone(ROADS, 'exile', { seat: 0 });
  });

  test('every player votes Mines of Moria: no search is made, so the library is not shuffled', () => {
    const { g, mark } = play(3, ['Mines of Moria', 'Mines of Moria', 'Mines of Moria']);
    g.act(0).chooseCards('Grizzly Bears');
    g.act(0).chooseCards('Giant Spider');
    g.expect.handSize(0, 3);
    expect(shuffles(g, mark)).toBe(0);
    g.expect.zone(ROADS, 'exile', { seat: 0 });
  });

  test('a graveyard with fewer cards than votes returns what it has', () => {
    let b = scenario({ seats: 2 })
      .seat(0)
      .life(20)
      .hand(ROADS)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .graveyard('Grizzly Bears')
      .library(...LIB);
    b = b
      .seat(1)
      .life(20)
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0 }).build();
    cast(g, ROADS);
    vote(g, ['Mines of Moria', 'Mines of Moria']);
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.pending('priority', 0);
  });
});

describe('"At the beginning of combat on your turn, if another Elf entered the battlefield under your control this turn" (Galadriel, Elven-Queen)', () => {
  const board = (seats: 2 | 3) => {
    let b = scenario({ seats })
      .seat(0)
      .life(20)
      .hand(ELF)
      .battlefield(QUEEN, 'Forest')
      .library(...FILLER);
    for (let seat = 1; seat < seats; seat += 1)
      b = b
        .seat(seat)
        .life(20)
        .library(...FILLER);
    return b.at('precombatMain', { active: 0 }).build();
  };
  /** The Elf is cast and resolves; the game goes on to the beginning of combat, where the ability triggers. */
  const toCombat = (g: ScenarioGame) => {
    g.act(0).cast(ELF, { pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
  };

  test('another Elf entered this turn: the controller and each opponent vote, and dominion gets more votes: the Ring tempts, and the Ring-bearer gets a +1/+1 counter', () => {
    const g = board(3);
    toCombat(g);
    g.passAll();
    vote(g, ['dominion', 'dominion', 'guidance']);
    // The Ring tempts the controller, who chooses the Elf as their Ring-bearer (two creatures: asked).
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(ELF);
    g.expect.ringBearer(0, ELF);
    g.expect.counters(ELF, { '+1/+1': 1 });
    g.expect.counters(QUEEN, {});
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('guidance gets more votes: a card is drawn and the Ring does not tempt', () => {
    const g = board(2);
    toCombat(g);
    g.passAll();
    vote(g, ['guidance', 'guidance']);
    g.expect.handSize(0, 1);
    g.expect.ringLevel(0, 0);
  });

  test('a tie draws a card too', () => {
    const g = board(2);
    toCombat(g);
    g.passAll();
    vote(g, ['dominion', 'guidance']);
    g.expect.handSize(0, 1);
    g.expect.ringLevel(0, 0);
  });

  test('no other Elf entered: the ability does not trigger (the queen herself does not count as another)', () => {
    const g = board(2);
    g.advanceTo('beginningOfCombat');
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('only an Elf that entered under the controller counts: one an opponent controls does not', () => {
    const g = scenario({ seats: 2 })
      .seat(0)
      .life(20)
      .battlefield(QUEEN)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(ELF)
      .battlefield('Forest')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.expect.stack([]);
  });

  test('the Ring-bearer chosen is the one that gets the counter, even if it is the queen', () => {
    const g = board(2);
    toCombat(g);
    g.passAll();
    vote(g, ['dominion', 'dominion']);
    g.act(0).choosePermanents(QUEEN);
    g.expect.ringBearer(0, QUEEN);
    g.expect.counters(QUEEN, { '+1/+1': 1 });
    g.expect.counters(ELF, {});
  });
});
