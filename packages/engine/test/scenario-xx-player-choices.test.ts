// "Each opponent chooses A or B. For each player who chose A, [the controller does X to that player]. For each player who chose B, [the controller does Y]" (CR 101.4, 608.2d), with two, three
// and four seats. A choice is not a vote (CR 701.38c): no `votesRevealed` event, so "whenever players finish voting" does not trigger. Pins: CR 101.4 (the players choose in APNAP order, then
// the actions happen), 608.2c (instructions in order), 613.1b / 611.2 (control until end of turn), 701.26a (untap), 702.10 (haste), 121.1 (draw), 111.10 (Treasure).
// Cards are SYNTHETIC; the real card is played in packages/cards/test/convert-grammar-engine-player-choices.test.ts.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { CardDefinition, Effect, GameEvent } from '../src/index';
import { validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const YOU = { kind: 'you' } as const;

/** "Each opponent chooses fame or fortune. For each player who chose fame, gain control of a creature that player controls until end of turn. Untap those creatures and they gain haste until end of turn. For each player who chose fortune, you draw a card and create a Treasure token." */
const SPOTLIGHT = singleFace({
  name: 'SYNTHETIC Spotlight',
  manaCost: ['R'],
  types: ['sorcery'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'SYNTHETIC: describes what the AST does.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'eachPlayerChooses',
          players: { kind: 'eachOpponent' },
          options: ['fame', 'fortune'],
        },
        {
          kind: 'chooseObjects',
          id: 'taken',
          filter: { zone: 'battlefield', types: ['creature'] },
          count: 1,
          exactly: true,
          perChoice: 'fame',
        },
        {
          kind: 'gainControl',
          objects: { kind: 'chosen', id: 'taken' },
          duration: 'untilEndOfTurn',
        },
        { kind: 'untap', objects: { kind: 'chosen', id: 'taken' } },
        {
          kind: 'grantKeyword',
          objects: { kind: 'chosen', id: 'taken' },
          keyword: { kind: 'haste' },
          duration: 'untilEndOfTurn',
        },
        {
          kind: 'repeat',
          times: {
            kind: 'playerCount',
            of: { kind: 'eachPlayerWhoChose', option: 'fortune' },
          },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'draw', player: YOU, count: 1 },
              {
                kind: 'createToken',
                token: { kind: 'preset', preset: 'Treasure' },
                count: 1,
              },
            ],
          },
        },
      ],
    },
  },
});

const bear = (name: string) =>
  singleFace({
    name,
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'SYNTHETIC: a vanilla body.',
  });
const B1 = bear('SYNTHETIC Bear One');
const B2 = bear('SYNTHETIC Bear Two');
const B2B = bear('SYNTHETIC Bear Two Spare');
const B3 = bear('SYNTHETIC Bear Three');
const MINE = bear('SYNTHETIC Mine');

/** "Whenever players finish voting, you draw a card." The choice below is not a vote, so this never triggers. */
const WATCHER = singleFace({
  name: 'SYNTHETIC Vote Watcher',
  manaCost: ['2'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC: describes what the AST does.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'votingFinished' },
      effect: { kind: 'draw', player: YOU, count: 1 },
    },
  ],
});

const ALL: readonly CardDefinition[] = [SPOTLIGHT, B1, B2, B2B, B3, MINE, WATCHER];

describe('the card is valid', () => {
  test('validateCard', () => expect(validateCard(SPOTLIGHT)).toEqual([]));
  const probe = (effect: Effect) =>
    singleFace({
      name: 'SYNTHETIC Probe',
      manaCost: ['R'],
      types: ['sorcery'],
      colors: ['R'],
      colorIdentity: ['R'],
      oracleText: 'SYNTHETIC: describes what the AST does.',
      spell: { effect },
    });
  const choose: Effect = {
    kind: 'eachPlayerChooses',
    players: { kind: 'eachOpponent' },
    options: ['fame', 'fortune'],
  };
  const draw = (option: string): Effect => ({
    kind: 'repeat',
    times: { kind: 'playerCount', of: { kind: 'eachPlayerWhoChose', option } },
    effect: { kind: 'draw', player: YOU, count: 1 },
  });
  test('eachPlayerWhoChose needs a choice before it that offers the option', () => {
    expect(validateCard(probe(draw('fame'))).length).toBeGreaterThan(0);
    expect(validateCard(probe({ kind: 'sequence', effects: [choose, draw('fame')] }))).toEqual([]);
    expect(
      validateCard(probe({ kind: 'sequence', effects: [choose, draw('luck')] })).length,
    ).toBeGreaterThan(0);
  });
  test('a choice needs two or more distinct options', () => {
    const one: Effect = { ...choose, options: ['fame'] } as Effect;
    const twice: Effect = { ...choose, options: ['fame', 'fame'] } as Effect;
    expect(validateCard(probe(one)).length).toBeGreaterThan(0);
    expect(validateCard(probe(twice)).length).toBeGreaterThan(0);
  });
});

function table(
  seats: 2 | 3 | 4,
  board: Readonly<Record<number, readonly string[]>>,
  hand0: readonly string[] = [SPOTLIGHT.name],
  tapped: readonly string[] = [],
): ScenarioGame {
  let b = scenario({ seats });
  for (const card of ALL) b = b.define(card);
  for (let seat = 0; seat < seats; seat += 1) {
    b = b
      .seat(seat)
      .life(20)
      .hand(...(seat === 0 ? hand0 : []))
      .battlefield(
        ...(board[seat] ?? []).filter((n) => !tapped.includes(n)),
        ...(seat === 0 ? ['Mountain'] : []),
      );
    for (const name of (board[seat] ?? []).filter((n) => tapped.includes(n))) {
      b = b.battlefield(name, { tapped: true });
    }
    b = b.library(...FILLER);
  }
  return b.at('precombatMain', { active: 0 }).build();
}

describe('each opponent chooses fame or fortune', () => {
  test('two seats: fame gives the caster control of a creature of that player, untapped and with haste, until end of turn', () => {
    const g = table(2, { 1: [B1.name] }, [SPOTLIGHT.name], [B1.name]);
    g.act(0).cast(SPOTLIGHT.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 1);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a choice');
    expect(d.options).toEqual(['fame', 'fortune']);
    // a choice, not a vote: the question says so.
    expect(d.vote?.choice).toBe(true);
    g.act(1).chooseOption('fame');
    g.act(0).choosePermanents({ name: B1.name, seat: 1 });
    g.expect.zone(B1.name, 'battlefield', { seat: 0 });
    g.expect.tapped(B1.name, false);
    g.expect.derived(B1.name, { keywords: ['haste'] });
    g.expect.handSize(0, 0);
    g.expect.invariants();
    // CR 611.2: control ends with the turn.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.zone(B1.name, 'battlefield', { seat: 1 });
  });

  test('two seats: fortune gives the caster a card and a Treasure, and no creature changes hands', () => {
    const g = table(2, { 1: [B1.name] });
    g.act(0).cast(SPOTLIGHT.name, { pay: true });
    g.passAll();
    g.act(1).chooseOption('fortune');
    g.expect.zone(B1.name, 'battlefield', { seat: 1 });
    g.expect.handSize(0, 1);
    g.expect.zone('Treasure', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('four seats: each opponent chooses in turn order; fame takes one creature of each fame player, fortune pays once for each fortune player', () => {
    const g = table(4, { 1: [B1.name], 2: [B2.name, B2B.name], 3: [B3.name] });
    const mark = g.mark();
    g.act(0).cast(SPOTLIGHT.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption('fame');
    g.expect.pending('chooseOption', 2);
    const d = g.state.pending;
    // CR 101.4: the later players see what the earlier ones chose.
    if (d?.kind !== 'chooseOption') throw new Error('no choice');
    expect(d.vote?.cast).toHaveLength(1);
    g.act(2).chooseOption('fame');
    g.expect.pending('chooseOption', 3);
    g.act(3).chooseOption('fortune');
    // the caster chooses which creature of each fame player (seat 2 has two).
    g.expect.pending('choosePermanent', 0);
    const p = g.state.pending;
    if (p?.kind !== 'choosePermanent') throw new Error('no choice of creature');
    expect(p.legal).toHaveLength(1); // seat 1's only creature
    g.act(0).choosePermanents({ name: B1.name, seat: 1 });
    g.expect.pending('choosePermanent', 0);
    const p2 = g.state.pending;
    if (p2?.kind !== 'choosePermanent') throw new Error('no second choice');
    expect(p2.legal).toHaveLength(2); // both creatures of seat 2, none of seat 3
    g.act(0).choosePermanents({ name: B2B.name, seat: 2 });
    g.expect.zone(B1.name, 'battlefield', { seat: 0 });
    g.expect.zone(B2B.name, 'battlefield', { seat: 0 });
    g.expect.zone(B2.name, 'battlefield', { seat: 2 });
    g.expect.zone(B3.name, 'battlefield', { seat: 3 });
    // one fortune player: one card and one Treasure.
    g.expect.handSize(0, 1);
    // a choice is not a vote (CR 701.38c).
    expect(g.eventsSince(mark).some((e: GameEvent) => e.kind === 'votesRevealed')).toBe(false);
    g.expect.invariants();
  });

  test('a fame player with no creature loses nothing, and the caster gets nothing for them', () => {
    const g = table(3, { 2: [B3.name] });
    g.act(0).cast(SPOTLIGHT.name, { pay: true });
    g.passAll();
    g.act(1).chooseOption('fame');
    g.act(2).chooseOption('fame');
    g.act(0).choosePermanents({ name: B3.name, seat: 2 });
    g.expect.zone(B3.name, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('"whenever players finish voting" does not trigger on a choice (CR 701.38c)', () => {
    const g = table(2, { 0: [WATCHER.name], 1: [B1.name] });
    g.act(0).cast(SPOTLIGHT.name, { pay: true });
    g.passAll();
    g.act(1).chooseOption('fortune');
    // one card from the spell, none from the watcher.
    g.expect.handSize(0, 1);
  });
});
