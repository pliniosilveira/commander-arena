// "Remove two +1/+1 counters from among creatures you control" as the cost of an activated ability (`removeCounters` with `among`), and the three small primitives next to it
// (Federation Fleet deck, group D): the `thisWay` counts `countersPut` and `discardedNonland`, and the Evolve test that compares only the power (`subjectGreaterPt` with `onlyPower`).
// Pins (rule numbers the repository's own comments already cite; the rules text is not in this worktree, so none is quoted): CR 118.3 (a cost that can't be paid can't be paid),
// CR 122.1 (counters), CR 602.2 (the cost is paid as the ability is activated), CR 733 (a cost can be taken back), CR 603.12 and 608.2c (a reflexive ability, what an instruction did),
// CR 208.1 (power), CR 603.4 (an intervening "if").
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

const PROBE = 'SYNTHETIC Counter Probe'; // "{W}, Remove two +1/+1 counters from among creatures you control: Draw a card."
const BEARS = 'Grizzly Bears';
const AMONG: Cost = {
  kind: 'removeCounters',
  counter: '+1/+1',
  count: 2,
  among: { types: ['creature'], controller: 'you' },
};

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
const withAmong = probe([{ kind: 'mana', symbols: ['W'] }, AMONG]);

const start = (mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  mine(scenario().define(withAmong).seat(0).life(20).library('Plains', 'Plains', 'Plains'))
    .seat(1)
    .life(20)
    .library('Plains', 'Plains')
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

const offered = (g: ScenarioGame, card: string): boolean =>
  getLegalActions(g.state, 0).some((a) => a.kind === 'activate' && a.object === g.id(card));

const messages = (card: CardDefinition): string[] => validateCard(card).map((i) => i.message);

describe('validateCard: the remove-counters cost with "from among"', () => {
  test('the probe is valid', () => {
    expect(validateCard(withAmong)).toEqual([]);
  });

  test('a count of zero, an opponent’s permanents, a zone other than the battlefield or an owner are refused', () => {
    const bad = (cost: Cost) => messages(probe([{ kind: 'tap' }, cost])).join('|');
    expect(bad({ ...AMONG, count: 0 })).toMatch(/positive integer/);
    expect(bad({ ...AMONG, among: { types: ['creature'], controller: 'opponent' } })).toMatch(
      /only from permanents you control/,
    );
    expect(bad({ ...AMONG, among: { types: ['creature'], zone: 'graveyard' } })).toMatch(
      /battlefield/,
    );
    expect(
      bad({ ...AMONG, among: { types: ['creature'], owner: { kind: 'eachOpponent' } } }),
    ).toMatch(/no stackKind or owner/);
  });

  test('two such costs, or one next to a crew, untap, blight or loyalty cost, are not run', () => {
    const others: Cost[] = [
      { kind: 'tapCreatures', totalPower: 3 },
      { kind: 'untapPermanents', filter: { types: ['creature'] }, count: 1 },
      { kind: 'blight', count: 1 },
    ];
    for (const other of [AMONG, ...others]) {
      expect(messages(probe([AMONG, other])).join('|')).toMatch(/from among/);
    }
  });

  test('as a mana ability it is refused', () => {
    const mana = artifact('SYNTHETIC Counter Mana', [
      { kind: 'mana', cost: [{ kind: 'tap' }, AMONG], production: { kind: 'fixed', mana: ['W'] } },
    ]);
    expect(messages(mana).join('|')).toMatch(/from among/);
  });
});

describe('Remove two +1/+1 counters from among creatures you control (CR 118.3, 122.1, 602.2)', () => {
  test('with exactly as many counters as are owed the engine removes them all and says so', () => {
    const g = start((b) =>
      b
        .battlefield(PROBE, 'Plains')
        .battlefield(BEARS, { label: 'a', counters: { '+1/+1': 1 } })
        .battlefield(BEARS, { label: 'b', counters: { '+1/+1': 1 } }),
    );
    g.act(0).activate(PROBE, { pay: true });
    g.expect.counters('a', {});
    g.expect.counters('b', {});
    g.expect.eventLog([
      { kind: 'permanentsChosen', purpose: 'removeCountersCost', automatic: true },
    ]);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('one creature that holds them all gives them up without a question and keeps the rest', () => {
    const g = start((b) =>
      b.battlefield(PROBE, 'Plains').battlefield(BEARS, { label: 'a', counters: { '+1/+1': 3 } }),
    );
    g.act(0).activate(PROBE, { pay: true });
    g.expect.counters('a', { '+1/+1': 1 });
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('one counter on each of two creatures, and one more on a third: the player chooses one counter at a time', () => {
    const g = start((b) =>
      b
        .battlefield(PROBE, 'Plains')
        .battlefield(BEARS, { label: 'a', counters: { '+1/+1': 1 } })
        .battlefield(BEARS, { label: 'b', counters: { '+1/+1': 2 } })
        .battlefield(BEARS, { label: 'c', counters: { '+1/+1': 1 } })
        .battlefield(BEARS, { label: 'none' }),
    );
    const before = g.positionHash();
    g.act(0).activate(PROBE, { pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect([d.purpose, d.forCost, d.min, d.max, d.legal.length]).toEqual([
      'removeCountersCost',
      true,
      1,
      1,
      3,
    ]);
    expect(g.state.casting?.stage).toBe('removeCounters');
    // CR 733: the whole activation is taken back.
    g.act(0).cancel();
    g.expect.position(before);
    g.act(0).activate(PROBE, { pay: true });
    g.act(0).choosePermanents('b');
    // One counter came off b and one is still owed: b (one left), a and c can all give it.
    const next = g.state.pending;
    if (next?.kind !== 'choosePermanent') throw new Error('expected a second choice');
    expect(next.legal.length).toBe(3);
    g.act(0).choosePermanents('a');
    g.expect.counters('a', {});
    g.expect.counters('b', { '+1/+1': 1 });
    g.expect.counters('c', { '+1/+1': 1 });
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('a creature with no counter, or one outside the candidates, is not a legal choice', () => {
    const g = start((b) =>
      b
        .battlefield(PROBE, 'Plains')
        .battlefield(BEARS, { label: 'a', counters: { '+1/+1': 1 } })
        .battlefield(BEARS, { label: 'b', counters: { '+1/+1': 2 } })
        .battlefield(BEARS, { label: 'none' }),
    );
    g.act(0).activate(PROBE, { pay: true });
    const choose = (...names: string[]) =>
      applyAction(g.state, 0, { kind: 'choosePermanents', objects: names.map((n) => g.id(n)) });
    expect(choose('none').ok).toBe(false);
    expect(choose(PROBE).ok).toBe(false);
    expect(choose('a', 'b').ok).toBe(false);
    expect(choose('a').ok).toBe(true);
  });

  test('fewer counters than owed, counters of another kind, or an opponent’s counters do not count: the ability is not offered', () => {
    const g = start((b) =>
      b
        .battlefield(PROBE, 'Plains')
        .battlefield(BEARS, { counters: { '+1/+1': 1, charge: 3 } })
        .seat(1)
        .battlefield(BEARS, { counters: { '+1/+1': 5 } })
        .seat(0),
    );
    expect(offered(g, PROBE)).toBe(false);
  });

  test('the source itself is among the creatures when it is one', () => {
    const creature = singleFace({
      name: 'SYNTHETIC Counter Creature',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: 'SYNTHETIC probe',
      abilities: [
        {
          kind: 'activated',
          cost: [AMONG],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    });
    expect(validateCard(creature)).toEqual([]);
    const g = scenario()
      .define(creature)
      .seat(0)
      .library('Plains', 'Plains')
      .battlefield('SYNTHETIC Counter Creature', { counters: { '+1/+1': 2 } })
      .seat(1)
      .library('Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate('SYNTHETIC Counter Creature');
    g.expect.counters('SYNTHETIC Counter Creature', {});
    g.passAll();
    g.expect.handSize(0, 1);
  });
});
