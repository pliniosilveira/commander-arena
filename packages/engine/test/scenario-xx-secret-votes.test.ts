// Secret votes, votes for players and for permanents, and "whenever players finish voting" (CR 701.38a, 701.38b), with three and four seats. Pins: CR 701.38a (each player votes, in turn
// order from the controller; "secretly": nothing is shown until every player has voted), CR 701.38b (the choices may be objects or variables, here players and creatures), CR 701.38c (only an
// actual vote), CR 101.4 (simultaneous choices in turn order), CR 608.2c (instructions in order), CR 603.2 (a trigger goes on the stack after the spell or ability that caused its event has
// resolved), CR 122.1d (a stun counter stops a permanent untapping), CR 508.1a (can't attack its owner), CR 613.1b (a layer 2 effect gives control).
// Cards are SYNTHETIC; the real cards are played in packages/cards/test/convert-grammar-engine-secret-votes.test.ts.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { CardDefinition, GameEvent } from '../src/index';
import { determinize, getView, validateCard } from '../src/index';
import { createRng } from '../src/rng/index';
import { withoutBannedTargets } from '../src/rules/attack-bans';
import { derive } from '../src/rules/derive';
import { nameOf, seatOfObject } from '../src/testing/describe';
import { type ScenarioGame, scenario } from '../src/testing/index';

const YOU = { kind: 'you' } as const;
const FILLER = Array.from({ length: 12 }, () => 'Plains');
const CREATURE = { zone: 'battlefield', types: ['creature'], controller: 'opponent' } as const;

/** "Each player secretly votes for a player, then those votes are revealed. Each player draws a card for each vote they received. Each player who received no votes may put a permanent card from their hand onto the battlefield." */
const BALLOT = singleFace({
  name: 'SYNTHETIC Secret Ballot',
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'SYNTHETIC: describes what the AST does.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'voteFor', choices: { kind: 'players' }, startingWith: 'you', secret: true },
        {
          kind: 'forEachPlayer',
          players: { kind: 'eachPlayer' },
          runsAs: 'each',
          effect: { kind: 'draw', player: YOU, count: { kind: 'votesReceived' } },
        },
        {
          kind: 'forEachPlayer',
          players: { kind: 'eachPlayerWithoutVotes' },
          runsAs: 'each',
          effect: {
            kind: 'moveToZone',
            objects: {
              kind: 'choose',
              filter: { zone: 'hand', controller: 'you', notTypes: ['instant', 'sorcery'] },
              optional: true,
            },
            to: 'battlefield',
          },
        },
      ],
    },
  },
});

/** "Each player secretly votes for a creature you don't control, then those votes are revealed. For each creature with one or more votes, put that many stun counters on it, then tap it." */
const TRAP = singleFace({
  name: 'SYNTHETIC Trap Spell',
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'SYNTHETIC: describes what the AST does.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'voteFor',
          choices: { kind: 'objects', filter: CREATURE },
          startingWith: 'you',
          secret: true,
        },
        {
          kind: 'addCounters',
          objects: { kind: 'votedObjects' },
          counter: 'stun',
          perObject: true,
          count: { kind: 'votesForObject', of: { kind: 'eachObject' } },
        },
        { kind: 'tap', objects: { kind: 'votedObjects' } },
      ],
    },
  },
});

/** "When this enters, each player secretly votes for fellowship or aid, then those votes are revealed. For each fellowship vote, the voter chooses a creature they control. You gain control of each creature chosen this way, and they gain 'This creature can't attack its owner.' Then for each aid vote, put a +1/+1 counter on each creature you control." */
const ELROND = singleFace({
  name: 'SYNTHETIC Council Lord',
  manaCost: ['U'],
  types: ['creature'],
  subtypes: ['Elf', 'Noble'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 2,
  toughness: 2,
  oracleText: 'SYNTHETIC: describes what the AST does.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'vote', options: ['fellowship', 'aid'], startingWith: 'you', secret: true },
          {
            kind: 'chooseObjects',
            id: 'taken',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
            count: 1,
            exactly: true,
            perVote: 'fellowship',
          },
          { kind: 'gainControl', objects: { kind: 'chosen', id: 'taken' }, duration: 'permanent' },
          {
            kind: 'grantAbility',
            objects: { kind: 'chosen', id: 'taken' },
            abilities: [{ kind: 'static', static: { kind: 'cantAttackItsOwner' } }],
            duration: 'permanent',
          },
          {
            kind: 'repeat',
            times: { kind: 'votesFor', option: 'aid' },
            effect: {
              kind: 'addCounters',
              objects: {
                kind: 'each',
                filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
              },
              counter: '+1/+1',
              count: 1,
            },
          },
        ],
      },
    },
  ],
});

const WATCHER_BODY = singleFace;
/** "Whenever players finish voting, each opponent who voted for a choice you voted for creates a Treasure token. You scry X, where X is the number of opponents who voted for a choice you didn't vote for. Draw a card." */
const ERESTOR = WATCHER_BODY({
  name: 'SYNTHETIC Council Scribe',
  manaCost: ['U'],
  types: ['creature'],
  subtypes: ['Elf'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 1,
  toughness: 1,
  oracleText: 'SYNTHETIC: describes what the AST does.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'votingFinished' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'forEachPlayer',
            players: { kind: 'eachOpponentWhoVoted', choice: 'same' },
            runsAs: 'each',
            effect: {
              kind: 'createToken',
              token: { kind: 'preset', preset: 'Treasure' },
              count: 1,
            },
          },
          {
            kind: 'scry',
            count: {
              kind: 'playerCount',
              of: { kind: 'eachOpponentWhoVoted', choice: 'different' },
            },
          },
          { kind: 'draw', player: YOU, count: 1 },
        ],
      },
    },
  ],
});

/** "Whenever players finish voting, you and each opponent who voted for a choice you voted for may scry 2." */
const MODEL = singleFace({
  name: 'SYNTHETIC Unity Model',
  manaCost: ['3'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC: describes what the AST does.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'votingFinished' },
      effect: {
        kind: 'playersMay',
        players: {
          kind: 'all',
          of: [YOU, { kind: 'eachOpponentWhoVoted', choice: 'same' }],
        },
        runsAs: 'chooser',
        effect: { kind: 'scry', player: YOU, count: 2 },
      },
    },
  ],
});

/** A plain creature to be voted for. */
const BEAR = singleFace({
  name: 'SYNTHETIC Voted Bear',
  manaCost: ['1', 'G'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'SYNTHETIC: a vanilla body.',
});

const ALL: readonly CardDefinition[] = [BALLOT, TRAP, ELROND, ERESTOR, MODEL, BEAR];

describe('the cards are valid', () => {
  test.each(ALL.map((c) => [c.name, c] as const))('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

/** A table of `seats` players; seat 0 has the mana and `hand` and `board`; the others have `others[seat]`. */
function table(
  seats: 2 | 3 | 4,
  hand: readonly string[],
  board: readonly string[],
  others: Readonly<Record<number, { hand?: readonly string[]; board?: readonly string[] }>> = {},
): ScenarioGame {
  let b = scenario({ seats });
  for (const card of ALL) b = b.define(card);
  b = b
    .seat(0)
    .life(20)
    .hand(...hand)
    .battlefield(...board)
    .library(...FILLER);
  for (let seat = 1; seat < seats; seat += 1) {
    b = b
      .seat(seat)
      .life(20)
      .hand(...(others[seat]?.hand ?? []))
      .battlefield(...(others[seat]?.board ?? []))
      .library(...FILLER);
  }
  return b.at('precombatMain', { active: 0 }).build();
}

describe('"each player secretly votes for a player" (a vote for players, secret)', () => {
  const play = (seats: 3 | 4, votes: readonly number[]) => {
    const g = table(seats, [BALLOT.name], ['Island'], { 2: { hand: ['Forest'] } });
    g.act(0).cast(BALLOT.name, { pay: true });
    g.passAll();
    const mark = g.mark();
    votes.forEach((target, seat) => {
      g.expect.pending('chooseOption', seat);
      const d = g.state.pending;
      if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a vote');
      // CR 701.38a: nobody is told what the voters before them chose, and the options are the players still in the game.
      expect(d.vote?.cast).toEqual([]);
      expect(d.vote?.secret).toBe(true);
      expect(d.options).toEqual(Array.from({ length: seats }, (_, i) => `seat:${i}`));
      g.act(seat).chooseOption(`seat:${target}`);
    });
    return { g, mark };
  };

  test('three seats: nothing is logged until the votes are revealed all together, then each player draws a card for each vote they received', () => {
    const { g, mark } = play(3, [1, 1, 0]);
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'optionChosen')).toEqual([]);
    const revealed = events.filter(
      (e): e is Extract<GameEvent, { kind: 'votesRevealed' }> => e.kind === 'votesRevealed',
    );
    expect(revealed).toHaveLength(1);
    expect(revealed[0]?.secret).toBe(true);
    expect(revealed[0]?.cast.map((c) => [c.seat, c.option])).toEqual([
      [0, 'seat:1'],
      [1, 'seat:1'],
      [2, 'seat:0'],
    ]);
    // seat 0 received one vote, seat 1 two, seat 2 none.
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 2);
    g.expect.invariants();
  });

  test('a player who received no votes may put a permanent card from their hand onto the battlefield', () => {
    const { g } = play(3, [1, 1, 0]);
    g.expect.pending('chooseCards', 2);
    g.act(2).chooseCards('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 2 });
    g.expect.handSize(2, 1 - 1 + 0); // the Forest left; seat 2 drew nothing
    g.expect.invariants();
  });

  test('four seats: two players who received no votes are each offered the put, in turn order', () => {
    const g = table(4, [BALLOT.name], ['Island'], { 2: { hand: ['Forest'] }, 3: { hand: ['Swamp'] } });
    g.act(0).cast(BALLOT.name, { pay: true });
    g.passAll();
    [1, 1, 0, 1].forEach((target, seat) => g.act(seat).chooseOption(`seat:${target}`));
    g.expect.pending('chooseCards', 2);
    g.act(2).chooseCards('Forest');
    g.expect.pending('chooseCards', 3);
    g.act(3).chooseCards('Swamp');
    g.expect.zone('Forest', 'battlefield', { seat: 2 });
    g.expect.zone('Swamp', 'battlefield', { seat: 3 });
    g.expect.handSize(1, 3);
    g.expect.invariants();
  });

  test('the sample an AI plays out from does not hold the votes the other seats cast (CR 701.38a)', () => {
    const g = table(3, [BALLOT.name], ['Island']);
    g.act(0).cast(BALLOT.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('seat:1');
    g.act(1).chooseOption('seat:2');
    const sample = determinize(g.state, 2, createRng(7));
    const head = sample.resolution?.queue[0];
    expect(head?.kind).toBe('vote');
    if (head?.kind !== 'vote') return;
    // Seat 2 is voting now and saw neither vote: the sample keeps its own (none) and blanks the others.
    expect(head.cast.map((c) => c.option)).toEqual(['seat:0', 'seat:0']);
    expect(getView(g.state, 2).pending?.kind).toBe('chooseOption');
  });
});

describe('"each player secretly votes for a creature you don\'t control" (a vote for permanents)', () => {
  const setup = (seats: 3 | 4) => {
    const others: Record<number, { board: readonly string[] }> = { 1: { board: [BEAR.name] } };
    if (seats === 4) others[2] = { board: [BEAR.name] };
    const g = table(seats, [TRAP.name], ['Island', BEAR.name], others);
    g.act(0).cast(TRAP.name, { pay: true });
    g.passAll();
    return g;
  };

  test('only the creatures the controller does not control are offered, with their names; the votes put that many stun counters and tap them', () => {
    const g = setup(3);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a vote');
    expect(d.options).toHaveLength(1);
    expect(d.vote?.choices).toEqual([
      { kind: 'object', object: expect.any(String), name: BEAR.name },
    ]);
    const only = d.options[0] as string;
    for (const seat of [0, 1, 2]) g.act(seat).chooseOption(only);
    const target = Object.values(g.state.objects).find((o) => o.id === only.replace('object:', ''));
    expect(target?.counters.stun).toBe(3);
    expect(target?.tapped).toBe(true);
    // The controller's own creature was never offered.
    const mine = g.state.battlefield
      .map((id) => g.state.objects[id])
      .find((o) => o?.owner === 0 && o.counters.stun !== undefined);
    expect(mine).toBeUndefined();
    g.expect.invariants();
  });

  test('four seats: votes split between two creatures give each its own number of stun counters', () => {
    const g = setup(4);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a vote');
    const [a, b] = d.options as [string, string];
    [a, a, b, a].forEach((o, seat) => g.act(seat).chooseOption(o));
    const counters = (o: string) =>
      Object.values(g.state.objects).find((x) => x.id === o.replace('object:', ''))?.counters.stun;
    expect(counters(a)).toBe(3);
    expect(counters(b)).toBe(1);
    g.expect.invariants();
  });
});

/** The permanents named `name` that `seat` controls. */
function controlled(g: ScenarioGame, seat: number, name: string) {
  return g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter(
      (o): o is NonNullable<typeof o> =>
        o !== undefined && nameOf(g.state, o) === name && seatOfObject(g.state, o) === seat,
    );
}

describe('"For each fellowship vote, the voter chooses a creature they control" (Elrond of the White Council)', () => {
  const cast = (seats: 3 | 4, votes: readonly string[]) => {
    const board: Record<number, { board: readonly string[] }> = {
      1: { board: [BEAR.name] },
      2: { board: [BEAR.name] },
    };
    if (seats === 4) board[3] = { board: [BEAR.name] };
    const g = table(seats, [ELROND.name], ['Island'], board);
    g.act(0).cast(ELROND.name, { pay: true });
    g.passAll();
    g.passAll();
    votes.forEach((v, seat) => g.act(seat).chooseOption(v));
    return g;
  };

  test('two fellowship votes: each voter chooses a creature they control, in turn order; the controller gains both, which can not attack their owner; the aid vote counts the new creatures', () => {
    const g = cast(3, ['aid', 'fellowship', 'fellowship']);
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(BEAR.name);
    g.expect.pending('choosePermanent', 2);
    g.act(2).choosePermanents(BEAR.name);
    const taken = controlled(g, 0, BEAR.name);
    expect(taken.map((o) => o.owner).sort()).toEqual([1, 2]);
    expect(controlled(g, 1, BEAR.name)).toHaveLength(0);
    // CR 508.1a: each can not attack its owner, but may attack the other opponent.
    for (const bear of taken) {
      expect(
        derive(g.state, bear).abilities.some(
          (a) => a.kind === 'static' && a.static.kind === 'cantAttackItsOwner',
        ),
      ).toBe(true);
      const targets = withoutBannedTargets(g.state, bear.id, [
        { kind: 'player', seat: 1 },
        { kind: 'player', seat: 2 },
      ]);
      expect(targets).toEqual([{ kind: 'player', seat: bear.owner === 1 ? 2 : 1 }]);
    }
    // One aid vote: a +1/+1 counter on each of the three creatures the controller controls now (CR 608.2c: after control changed).
    for (const bear of taken) expect(bear.counters['+1/+1']).toBe(1);
    g.expect.invariants();
  });

  test('no fellowship vote: nobody is asked to choose and no control changes; four aid votes put four counters', () => {
    const g = cast(4, ['aid', 'aid', 'aid', 'aid']);
    expect(controlled(g, 1, BEAR.name)).toHaveLength(1);
    const elrond = controlled(g, 0, ELROND.name)[0];
    expect(elrond?.counters['+1/+1']).toBe(4);
    g.expect.pending('priority', 0);
  });

  test('the votes are secret: a later voter is not told the earlier ones', () => {
    const g = cast(3, ['aid']);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a vote');
    expect(d.vote?.cast).toEqual([]);
    expect(d.options).toEqual(['fellowship', 'aid']);
  });
});

describe('"Whenever players finish voting" (Erestor of the Council, Model of Unity)', () => {
  /** Seat 0 controls the watcher and casts the ballot; `votes[seat]` is who that seat votes for. */
  const play = (seats: 3 | 4, board: readonly string[], votes: readonly number[]) => {
    const g = table(seats, [BALLOT.name], ['Island', ...board]);
    g.act(0).cast(BALLOT.name, { pay: true });
    g.passAll();
    const mark = g.mark();
    votes.forEach((target, seat) => g.act(seat).chooseOption(`seat:${target}`));
    return { g, mark };
  };

  test('it triggers once the vote is over: goes on the stack after the spell has resolved, and reads who voted for what', () => {
    // Seat 0 votes for seat 1, seat 1 for seat 1 (a choice seat 0 voted for), seat 2 for seat 0 (a choice seat 0 did not vote for).
    const { g } = play(3, [ERESTOR.name], [1, 1, 0]);
    // The ballot has resolved (each drew for the votes they received: seat 0 one card, seat 1 two) and the ability is on the stack.
    g.expect.stack([`${ERESTOR.name} (ability)`]);
    g.passAll();
    // Seat 1 voted as seat 0 did: a Treasure. Seat 2 did not: the controller scries 1 (asked), then draws a card.
    expect(controlled(g, 1, 'Treasure')).toHaveLength(1);
    expect(controlled(g, 2, 'Treasure')).toHaveLength(0);
    g.expect.pending('arrangeCards', 0);
    const looked = g.state.pending;
    if (looked?.kind !== 'arrangeCards') throw new Error('not a scry');
    expect(looked.cards).toHaveLength(1);
    g.act(0).choose({ kind: 'arrangeCards', top: [...looked.cards], other: [] });
    g.expect.handSize(0, 2);
  });

  test('four seats: each opponent counts on its own side', () => {
    const { g } = play(4, [ERESTOR.name], [1, 1, 2, 0]);
    g.passAll();
    expect(controlled(g, 1, 'Treasure')).toHaveLength(1);
    expect(controlled(g, 2, 'Treasure')).toHaveLength(0);
    expect(controlled(g, 3, 'Treasure')).toHaveLength(0);
  });

  test('Unity Model: the controller and each opponent who voted for a choice the controller voted for may scry 2', () => {
    const { g } = play(3, [MODEL.name], [1, 1, 0]);
    g.expect.stack([`${MODEL.name} (ability)`]);
    g.passAll();
    // Seat 0 is asked first, then seat 1 (seat 2 voted differently and is not asked).
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.pending('priority', 0);
  });

  test('two copies of the permanent are two triggers (their order is asked), each for the one vote', () => {
    const { g } = play(3, [MODEL.name, MODEL.name], [1, 1, 0]);
    g.expect.pending('orderTriggers', 0);
  });
});
