// "Starting with you, each player votes for profit or security" (`vote`, CR 701.38, D-194) and Emissary Green, the card of the Korvold deck that needs it.
// Pins: CR 701.38a (each player, starting with a specified player and proceeding in turn order, chooses one of the choices), CR 701.38b (the choices
// are words with no rules meaning, each connected to a different effect: the amount counts the votes for one), CR 701.38c (only an actual vote is
// voting), CR 701.38d (several votes at once: not supported, one vote for each player), CR 608.2d (the choice is made as the effect resolves), CR 603.5
// (a triggered ability's choices are made as it resolves), CR 110.2 (the Treasure tokens of "you create" are the controller's), CR 122.1 (counters).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-vote.ts): Emissary Green with the real wording (its 3/4 is invented, the request file has no
// power or toughness) and a three-option sorcery.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { GameEvent, GameState } from '../src/index';
import { applyAction, getLegalActions, getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const EMISSARY = 'SYNTHETIC Emissary Green'; // {4}{G} 3/4: whenever it attacks, each player votes for profit or security
const RITE = 'SYNTHETIC Ballot Rite'; // {2}{U} sorcery: votes for gold, iron or ash
const BEARS = 'Grizzly Bears'; // 2/2
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([EMISSARY, RITE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0 casts the rite and lets it resolve: the first vote is asked. */
const ritePending = () => {
  const g = twoSeatGame((b) => b.hand(RITE).battlefield('Island', 'Island', 'Island'));
  g.act(0).cast(RITE, { pay: true });
  g.passAll();
  return g;
};

const asked = (state: GameState) => {
  const d = state.pending;
  if (d?.kind !== 'chooseOption') throw new Error('expected a chooseOption decision');
  return d;
};

describe('the vote of a spell (CR 701.38a)', () => {
  test('nothing is asked as the spell is cast: the choices are made as it resolves (CR 608.2d)', () => {
    const g = twoSeatGame((b) => b.hand(RITE).battlefield('Island', 'Island', 'Island'));
    g.act(0).cast(RITE, { pay: true });
    g.expect.stack([RITE]);
    g.expect.pending('priority', 0);
  });

  test('the player the effect names votes first, with the options as the card words them', () => {
    const g = ritePending();
    const d = asked(g.state);
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'vote',
      options: ['gold', 'iron', 'ash'],
      sourceName: RITE,
      vote: { controller: 0, cast: [] },
    });
    expect(getLegalActions(g.state, 0).filter((a) => a.kind === 'chooseOption')).toEqual([
      { kind: 'chooseOption', option: 'gold' },
      { kind: 'chooseOption', option: 'iron' },
      { kind: 'chooseOption', option: 'ash' },
    ]);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('after the first vote the opponent is asked, and sees the vote already cast (a vote is public)', () => {
    const g = ritePending();
    g.act(0).chooseOption('iron');
    const d = asked(g.state);
    expect(d).toMatchObject({
      seat: 1,
      purpose: 'vote',
      options: ['gold', 'iron', 'ash'],
      vote: { controller: 0, cast: [{ seat: 0, option: 'iron' }] },
    });
    expect(getView(g.state, 1).pending).toEqual(d);
    expect(getView(g.state, 0).pending).toBeNull();
    expect(getView(g.state, 0).decidingSeat).toBe(1);
    expect(getLegalActions(g.state, 0)).toEqual([]);
    expect(getLegalActions(g.state, 1).filter((a) => a.kind === 'chooseOption')).toHaveLength(3);
  });

  test('a player cannot vote for the other, and an answer that is not an option is refused: the question stays', () => {
    const g = ritePending();
    const before = g.state;
    expect(applyAction(before, 1, { kind: 'chooseOption', option: 'gold' }).ok).toBe(false);
    expect(applyAction(before, 0, { kind: 'chooseOption', option: 'copper' }).ok).toBe(false);
    expect(applyAction(before, 0, { kind: 'pass' }).ok).toBe(false);
    expect(g.state.pending).toEqual(before.pending);
  });

  test('each vote is logged as it is cast, in order, with who voted and for what', () => {
    const g = ritePending();
    const mark = g.mark();
    g.act(0).chooseOption('gold');
    g.act(1).chooseOption('ash');
    const votes = g
      .eventsSince(mark)
      .filter((e): e is Extract<GameEvent, { kind: 'optionChosen' }> => e.kind === 'optionChosen');
    expect(votes.map((v) => [v.seat, v.purpose, v.option])).toEqual([
      [0, 'vote', 'gold'],
      [1, 'vote', 'ash'],
    ]);
  });

  test('the votes are counted for each option: gold and iron tie (1 each), nobody voted for ash', () => {
    const g = ritePending();
    g.act(0).chooseOption('gold');
    g.act(1).chooseOption('iron');
    g.expect.life(0, 22); // 1 gold vote: 2 life
    g.expect.handSize(0, 1); // 1 iron vote: a card
    g.expect.life(1, 20); // 0 ash votes
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('both players vote for the same option: that option counts twice', () => {
    const g = ritePending();
    g.act(0).chooseOption('gold');
    g.act(1).chooseOption('gold');
    g.expect.life(0, 24);
    g.expect.handSize(0, 0);
    g.expect.life(1, 20);
  });

  test('the opponent votes against the controller: ash costs the opponent itself life, not the voter of gold', () => {
    const g = ritePending();
    g.act(0).chooseOption('gold');
    g.act(1).chooseOption('ash');
    g.expect.life(0, 22);
    g.expect.life(1, 19); // "each opponent loses 1 life for each ash vote": the vote of the opponent is one
  });

  test('the controller votes for ash too: two ash votes, two life lost, nothing else', () => {
    const g = ritePending();
    g.act(0).chooseOption('ash');
    g.act(1).chooseOption('ash');
    g.expect.life(0, 20);
    g.expect.life(1, 18);
    g.expect.handSize(0, 0);
  });

  test('the spell goes to the graveyard when the last vote is in, and priority returns to its controller', () => {
    const g = ritePending();
    g.act(0).chooseOption('iron');
    g.expect.stack([RITE]);
    g.act(1).chooseOption('iron');
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    g.expect.handSize(0, 2);
  });
});

describe('who votes first and in what order (CR 701.38a)', () => {
  test('when the opponent controls the spell it votes first and the other player second', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .hand(RITE)
      .battlefield('Island', 'Island', 'Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(RITE, { pay: true });
    g.passAll();
    expect(asked(g.state)).toMatchObject({ seat: 1, vote: { controller: 1, cast: [] } });
    g.act(1).chooseOption('gold');
    expect(asked(g.state)).toMatchObject({
      seat: 0,
      vote: { controller: 1, cast: [{ seat: 1, option: 'gold' }] },
    });
    g.act(0).chooseOption('gold');
    g.expect.life(1, 44); // two gold votes: 4 life on top of the 40 of a Commander game
    g.expect.life(0, 40);
  });

  /** The two-seat game with a third seat added: a copy of seat 1, the vote already asked of seat 0. */
  const threeSeats = (): GameState => {
    const g = ritePending();
    const s1 = g.state.seats[1];
    if (s1 === undefined) throw new Error('seat 1');
    return { ...g.state, seats: [...g.state.seats, { ...s1, id: 2 }] };
  };

  test('with three players the votes go in turn order from the controller: 0, 1, 2', () => {
    let state = threeSeats();
    const order: number[] = [];
    for (const option of ['gold', 'iron', 'ash']) {
      const d = asked(state);
      order.push(d.seat);
      const out = applyAction(state, d.seat, { kind: 'chooseOption', option });
      if (!out.ok) throw new Error(out.error);
      state = out.state;
    }
    expect(order).toEqual([0, 1, 2]);
    expect(state.pending?.kind).toBe('priority');
    expect(state.seats[0]?.life).toBe(22); // gold: 2 life; iron: a card for the controller (hand checked below)
    expect(state.seats[0]?.hand).toHaveLength(1);
    // "Each opponent loses 1 life for each ash vote": the one ash vote costs each of the two opponents 1 life.
    expect(state.seats[1]?.life).toBe(19);
    expect(state.seats[2]?.life).toBe(19);
  });

  test('a player who has lost the game does not vote', () => {
    const base = threeSeats();
    const lost = {
      ...base,
      seats: base.seats.map((s) => (s.id === 1 ? { ...s, hasLost: true } : s)),
    };
    const first = applyAction(lost, 0, { kind: 'chooseOption', option: 'gold' });
    if (!first.ok) throw new Error(first.error);
    expect(asked(first.state).seat).toBe(2);
    expect(asked(first.state).vote?.cast).toEqual([{ seat: 0, option: 'gold' }]);
  });
});

describe('Emissary Green: "Whenever Emissary Green attacks, starting with you, each player votes for profit or security"', () => {
  /** Emissary Green and the Bears on seat 0's side, a Bears on seat 1's side, up to the vote. */
  const attack = () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(EMISSARY, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([EMISSARY]);
    return g;
  };
  const treasures = (g: ReturnType<typeof attack>, seat: number) =>
    g.find({ name: 'Treasure' }).filter((o) => o.controller === seat).length;

  test('attacking puts the ability on the stack; nothing is asked until it resolves', () => {
    const g = attack();
    g.expect.stack([`${EMISSARY} (ability)`]);
    g.expect.pending('priority', 0);
  });

  test('the controller votes first, for profit or security', () => {
    const g = attack();
    g.passAll();
    expect(asked(g.state)).toMatchObject({
      seat: 0,
      purpose: 'vote',
      options: ['profit', 'security'],
      sourceName: EMISSARY,
    });
  });

  test('two profit votes: four Treasure tokens for the controller (twice the number of profit votes), no counters', () => {
    const g = attack();
    g.passAll();
    g.act(0).chooseOption('profit');
    g.act(1).chooseOption('profit');
    expect(treasures(g, 0)).toBe(4);
    expect(treasures(g, 1)).toBe(0);
    g.expect.counters(EMISSARY, {});
    g.expect.invariants();
  });

  test('two security votes: two +1/+1 counters on each creature the controller controls, and none on the opponent', () => {
    const g = attack();
    g.passAll();
    g.act(0).chooseOption('security');
    g.act(1).chooseOption('security');
    expect(treasures(g, 0)).toBe(0);
    g.expect.counters(EMISSARY, { '+1/+1': 2 });
    expect(g.find({ name: BEARS }).map((o) => [o.controller, o.counters['+1/+1'] ?? 0])).toEqual(
      expect.arrayContaining([
        [0, 2],
        [1, 0],
      ]),
    );
    expect(g.find({ name: BEARS })).toHaveLength(2);
  });

  test('a split vote, the controller for profit and the opponent for security: two Treasures and one counter on each', () => {
    const g = attack();
    g.passAll();
    g.act(0).chooseOption('profit');
    g.act(1).chooseOption('security');
    expect(treasures(g, 0)).toBe(2);
    g.expect.counters(EMISSARY, { '+1/+1': 1 });
    const mine = g.find({ name: BEARS }).filter((o) => o.controller === 0);
    expect(mine.map((o) => o.counters['+1/+1'] ?? 0)).toEqual([1]);
  });

  test('the other split, the controller for security and the opponent for profit: the same result (the tally, not who voted, counts)', () => {
    const g = attack();
    g.passAll();
    g.act(0).chooseOption('security');
    g.act(1).chooseOption('profit');
    expect(treasures(g, 0)).toBe(2);
    expect(treasures(g, 1)).toBe(0);
    g.expect.counters(EMISSARY, { '+1/+1': 1 });
  });

  test('the second vote shows the first (the opponent sees what the controller chose)', () => {
    const g = attack();
    g.passAll();
    g.act(0).chooseOption('profit');
    expect(asked(g.state)).toMatchObject({
      seat: 1,
      vote: { controller: 0, cast: [{ seat: 0, option: 'profit' }] },
    });
  });

  test('it does not trigger when Emissary Green does not attack', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(EMISSARY, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.expect.stack([]);
  });

  test('once the last vote is in the ability is over and nothing is left waiting', () => {
    const g = attack();
    g.passAll();
    g.act(0).chooseOption('profit');
    g.act(1).chooseOption('profit');
    expect(treasures(g, 0)).toBe(4);
    expect(g.state.resolution).toBeNull();
  });
});

describe('two votes in one resolution', () => {
  // "Starting with you, each player votes for gold or iron. You gain 2 life for each gold vote. Then, starting with you, each player votes for iron or
  // ash. Draw a card for each iron vote." (invented): the second vote replaces the tally of the first, so the iron votes of the first are not counted again.
  const twice = singleFace({
    name: 'SYNTHETIC Double Ballot',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Two votes in a row (invented).',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'vote', options: ['gold', 'iron'], startingWith: 'you' },
          {
            kind: 'gainLife',
            player: { kind: 'you' },
            amount: { kind: 'multiple', factor: 2, of: { kind: 'votesFor', option: 'gold' } },
          },
          { kind: 'vote', options: ['iron', 'ash'], startingWith: 'you' },
          { kind: 'draw', player: { kind: 'you' }, count: { kind: 'votesFor', option: 'iron' } },
        ],
      },
    },
  });

  test('is valid, and each vote counts only its own votes', () => {
    expect(validateCard(twice)).toEqual([]);
    const g = scenario()
      .seat(0)
      .define(twice)
      .hand(twice.name)
      .battlefield('Island', 'Island', 'Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(twice.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('iron');
    g.act(1).chooseOption('iron');
    g.expect.life(0, 40); // no gold votes in the first vote
    // The second vote is asked from the controller again, with no votes cast yet.
    expect(asked(g.state)).toMatchObject({ seat: 0, options: ['iron', 'ash'], vote: { cast: [] } });
    g.act(0).chooseOption('ash');
    g.act(1).chooseOption('ash');
    g.expect.handSize(0, 0); // no iron vote in the second vote: the two of the first are not counted again
  });
});

describe('determinism and replay', () => {
  test('the same answers from the same state give the same state; votes are ordinary actions', () => {
    const run = () => {
      const g = twoSeatGame((b) => b.hand(RITE).battlefield('Island', 'Island', 'Island'));
      g.act(0).cast(RITE, { pay: true });
      g.passAll();
      g.act(0).chooseOption('gold');
      g.act(1).chooseOption('iron');
      return g.state;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  test('applyAction does not change the state it was given', () => {
    const g = ritePending();
    const before = JSON.stringify(g.state);
    applyAction(g.state, 0, { kind: 'chooseOption', option: 'gold' });
    expect(JSON.stringify(g.state)).toBe(before);
  });

  test('replaying the recorded answers on the same state reaches the same state (votes are ordinary actions)', () => {
    const start = ritePending().state;
    const answers: readonly [number, string][] = [
      [0, 'gold'],
      [1, 'iron'],
    ];
    const replay = (from: GameState): GameState =>
      answers.reduce((state, [seat, option]) => {
        const out = applyAction(state, seat, { kind: 'chooseOption', option });
        if (!out.ok) throw new Error(out.error);
        return out.state;
      }, from);
    const a = replay(start);
    const b = replay(start);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.seats[0]?.life).toBe(22);
    expect(a.seats[0]?.hand).toHaveLength(1);
  });
});
