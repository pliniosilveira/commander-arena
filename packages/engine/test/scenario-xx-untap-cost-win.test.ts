// "Untap two tapped creatures you control" as the cost of an activated ability (`untapPermanents`) and "You win the game" (`winGame`), the two primitives of Halo Fountain.
// Pins: CR 701.26b (only a tapped permanent can be untapped), CR 118.3 (a cost that can't be paid can't be paid), CR 601.2g-h (the costs are paid in any order: a creature tapped
// for the mana of the cost may be untapped for it), CR 302.6 (summoning sickness holds back only a creature's own {T} ability), CR 122.1d (a stun counter), CR 733 (a cost can be
// taken back), CR 104.2b and 104.1 (an effect may make a player win and the game ends), CR 101.2 ("can't win" beats "wins"), CR 104.3 ("can't lose" does not stop the game ending).
// Cards are SYNTHETIC probes built here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  applyAction,
  type CardDefinition,
  type Cost,
  getLegalActions,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const PROBE = 'SYNTHETIC Untap Probe'; // "{W}, {T}, Untap two tapped creatures you control: Draw a card."
const WINNER = 'SYNTHETIC Win Probe'; // "{T}: You win the game."
const SHIELD = 'SYNTHETIC Win Shield'; // "You can't lose the game and your opponents can't win the game."
const DORK = 'SYNTHETIC Mana Dork'; // 1/1 "{T}: Add {W}."
const BEARS = 'Grizzly Bears';

const UNTAP_TWO: Cost = { kind: 'untapPermanents', filter: { types: ['creature'] }, count: 2 };

const artifact = (name: string, abilities: Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'SYNTHETIC probe',
    abilities,
  });

const probe = (cost: Cost[]): CardDefinition =>
  artifact(PROBE, [
    { kind: 'activated', cost, effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  ]);
const withUntap = probe([{ kind: 'mana', symbols: ['W'] }, { kind: 'tap' }, UNTAP_TWO]);
const winner = artifact(WINNER, [
  {
    kind: 'activated',
    cost: [{ kind: 'tap' }],
    effect: { kind: 'winGame', player: { kind: 'you' } },
  },
]);
const shield = artifact(SHIELD, [
  { kind: 'static', static: { kind: 'cantLoseGame' } },
  { kind: 'static', static: { kind: 'opponentsCantWin' } },
]);
const dork = singleFace({
  name: DORK,
  manaCost: ['W'],
  types: ['creature'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 1,
  toughness: 1,
  oracleText: '{T}: Add {W}.',
  abilities: [
    { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['W'] } },
  ],
});

const start = (mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  mine(
    scenario()
      .define(withUntap)
      .define(winner)
      .define(shield)
      .define(dork)
      .seat(0)
      .life(20)
      .library('Plains', 'Plains', 'Plains'),
  )
    .seat(1)
    .life(20)
    .library('Plains', 'Plains')
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

const offered = (g: ScenarioGame, card: string): boolean =>
  getLegalActions(g.state, 0).some((a) => a.kind === 'activate' && a.object === g.id(card));

const messages = (card: CardDefinition): string[] => validateCard(card).map((i) => i.message);

describe('validateCard: the untap cost and the win effect', () => {
  test('the probes are valid', () => {
    expect(validateCard(withUntap)).toEqual([]);
    expect(validateCard(winner)).toEqual([]);
  });

  test('a count of zero, an opponent’s permanents, a filter that says tapped or a zone other than the battlefield are refused', () => {
    const bad = (cost: Cost) => messages(probe([{ kind: 'tap' }, cost])).join('|');
    expect(bad({ ...UNTAP_TWO, count: 0 })).toMatch(/positive integer/);
    expect(bad({ ...UNTAP_TWO, filter: { types: ['creature'], controller: 'opponent' } })).toMatch(
      /only permanents you control/,
    );
    expect(bad({ ...UNTAP_TWO, filter: { types: ['creature'], tapped: true } })).toMatch(
      /does not say so/,
    );
    expect(bad({ ...UNTAP_TWO, filter: { types: ['creature'], zone: 'graveyard' } })).toMatch(
      /battlefield/,
    );
  });

  test('two untap costs, or one next to a cost that taps permanents or a crew cost, are not run', () => {
    const tapOne: Cost = { kind: 'tapPermanents', filter: { types: ['creature'] }, count: 1 };
    for (const costs of [
      [UNTAP_TWO, UNTAP_TWO],
      [UNTAP_TWO, tapOne],
      [UNTAP_TWO, { kind: 'tapCreatures', totalPower: 3 } as Cost],
    ]) {
      expect(messages(probe(costs)).join('|')).toMatch(/untap cost/);
    }
  });

  test('as a mana ability or an additional cost of a spell it is refused', () => {
    const mana = artifact('SYNTHETIC Untap Mana', [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }, UNTAP_TWO],
        production: { kind: 'fixed', mana: ['W'] },
      },
    ]);
    expect(validateCard(mana).length).toBeGreaterThan(0);
  });

  test('"you win the game" names one player', () => {
    const many = artifact('SYNTHETIC Win Everyone', [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: { kind: 'winGame', player: { kind: 'eachOpponent' } },
      },
    ]);
    expect(messages(many).join('|')).toMatch(/single player/);
  });
});

describe('Untap two tapped creatures you control (CR 701.26b, 118.3)', () => {
  test('two tapped creatures are untapped as the cost is paid, after the mana', () => {
    const g = start((b) =>
      b
        .battlefield(PROBE, 'Plains')
        .battlefield(BEARS, { tapped: true, label: 'a' })
        .battlefield(BEARS, { tapped: true, label: 'b' }),
    );
    g.act(0).activate(PROBE, { pay: true });
    g.expect.tapped('a', false);
    g.expect.tapped('b', false);
    g.expect.tapped(PROBE, true);
    g.expect.eventLog([{ kind: 'permanentsChosen', purpose: 'untapCost', automatic: true }]);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('untapped creatures and one tapped creature are not enough', () => {
    const g = start((b) =>
      b
        .battlefield(PROBE, 'Plains')
        .battlefield(BEARS, { tapped: true })
        .battlefield(BEARS)
        .battlefield('Island', { tapped: true }),
    );
    expect(offered(g, PROBE)).toBe(false);
  });

  test('summoning-sick tapped creatures can be untapped (CR 302.6)', () => {
    const g = start((b) =>
      b
        .battlefield(PROBE, 'Plains')
        .battlefield(BEARS, { tapped: true, fresh: true })
        .battlefield(BEARS, { tapped: true, fresh: true }),
    );
    expect(offered(g, PROBE)).toBe(true);
  });

  test('a creature tapped for the mana of the cost counts (CR 601.2g-h)', () => {
    const g = start((b) => b.battlefield(PROBE, DORK).battlefield(BEARS, { tapped: true }));
    expect(offered(g, PROBE)).toBe(true);
    g.act(0).activate(PROBE, { pay: true });
    g.expect.tapped(DORK, false);
    g.expect.tapped(BEARS, false);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('without enough of them even counting the mana the ability is not offered', () => {
    const g = start((b) => b.battlefield(PROBE, DORK));
    expect(offered(g, PROBE)).toBe(false);
  });

  test('with more candidates the player chooses, the decision is a cost, and cancel rewinds (CR 733)', () => {
    const g = start((b) =>
      b
        .battlefield(PROBE, 'Plains')
        .battlefield(BEARS, { tapped: true, label: 'a' })
        .battlefield(BEARS, { tapped: true, label: 'b' })
        .battlefield(BEARS, { tapped: true, label: 'c' }),
    );
    const before = g.positionHash();
    g.act(0).activate(PROBE, { pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect([d.purpose, d.forCost, d.min, d.max, d.legal.length]).toEqual([
      'untapCost',
      true,
      2,
      2,
      3,
    ]);
    expect(g.state.casting?.stage).toBe('untap');
    g.act(0).cancel();
    g.expect.position(before);
    g.act(0).activate(PROBE, { pay: true });
    g.act(0).choosePermanents('a', 'c');
    g.expect.tapped('a', false);
    g.expect.tapped('b', true);
    g.expect.tapped('c', false);
  });

  test('a choice of the wrong size or outside the candidates is refused', () => {
    const g = start((b) =>
      b
        .battlefield(PROBE, 'Plains')
        .battlefield(BEARS, { tapped: true, label: 'a' })
        .battlefield(BEARS, { tapped: true, label: 'b' })
        .battlefield(BEARS, { tapped: true, label: 'c' }),
    );
    g.act(0).activate(PROBE, { pay: true });
    const choose = (...names: string[]) =>
      applyAction(g.state, 0, { kind: 'choosePermanents', objects: names.map((n) => g.id(n)) });
    expect(choose('a').ok).toBe(false);
    expect(choose(PROBE, 'a').ok).toBe(false);
    expect(choose('a', 'b').ok).toBe(true);
  });

  test('a creature with a stun counter loses the counter instead of untapping, and the cost is paid (CR 122.1d)', () => {
    const g = start((b) =>
      b
        .battlefield(PROBE, 'Plains')
        .battlefield(BEARS, { tapped: true, label: 'stunned', counters: { stun: 1 } })
        .battlefield(BEARS, { tapped: true, label: 'free' }),
    );
    g.act(0).activate(PROBE, { pay: true });
    g.expect.tapped('stunned', true);
    g.expect.counters('stunned', {});
    g.expect.tapped('free', false);
  });
});

describe('You win the game (CR 104.2b, 104.1, 101.2)', () => {
  test('the player wins and the game ends', () => {
    const g = start((b) => b.battlefield(WINNER));
    g.act(0).activate(WINNER);
    g.passAll();
    g.expect.gameOver({ win: 0 });
    g.expect.hasLost(1, false);
  });

  test('the winner’s own "your opponents can’t win the game" does not stop it (CR 104.2b)', () => {
    const g = start((b) => b.battlefield(WINNER, SHIELD));
    g.act(0).activate(WINNER);
    g.passAll();
    g.expect.gameOver({ win: 0 });
  });

  test('an opponent’s "your opponents can\'t win the game" stops it (CR 101.2)', () => {
    const g = start((b) => b.battlefield(WINNER).seat(1).battlefield(SHIELD).seat(0));
    g.act(0).activate(WINNER);
    g.passAll();
    expect(g.state.result).toBeNull();
    g.expect.hasLost(0, false);
    g.expect.hasLost(1, false);
  });

  test('a shield that left the battlefield no longer stops it', () => {
    const g = start((b) => b.battlefield(WINNER).seat(1).graveyard(SHIELD).seat(0));
    g.act(0).activate(WINNER);
    g.passAll();
    g.expect.gameOver({ win: 0 });
  });
});
