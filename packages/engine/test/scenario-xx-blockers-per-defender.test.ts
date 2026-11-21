// Several defending players (CR 802.4, 802.4a, 802.4b, 509.1): with three seats the attacking player may aim each attacker at a different opponent. Each defending player declares
// blockers, in turn order from the active player, one after the other, only against the attackers aimed at them (or at a planeswalker they control or a battle they protect);
// the active player gets priority after the last. Cards are SYNTHETIC (src/cards/fixtures) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { DeclareBlockersDecision, GameState } from '../src/index';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BEARS = 'Grizzly Bears';
const GEM = 'SYNTHETIC Greedy Gem'; // "whenever creatures an opponent controls attack you and aren't blocked ..."
const BRIDGE = 'SYNTHETIC Toll Bridge'; // "creatures can't block unless their controller pays {1} for each of them"
const FILLER = Array.from({ length: 12 }, () => 'Island');

const MUST_BE_BLOCKED: Ability = {
  kind: 'static',
  static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'mustBeBlocked' },
};
const FORCED = singleFace({
  name: 'SYNTHETIC Forced Bear',
  manaCost: ['1', 'G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'Forced Bear must be blocked if able.',
  abilities: [MUST_BE_BLOCKED],
});

/** The pending decision, which must be a declaration of blockers. */
function blockersDecision(state: GameState): DeclareBlockersDecision {
  const d = state.pending;
  if (d?.kind !== 'declareBlockers') throw new Error(`expected declareBlockers, got ${d?.kind}`);
  return d;
}

const declared = (g: ScenarioGame) =>
  g
    .eventsSince(0)
    .flatMap((e) => (e.kind === 'blockersDeclared' ? [{ seat: e.seat, blocks: e.blocks }] : []));

/** Seat 0 has the Bears `a` and `b` and attacks as `aims` says; seats 1 and 2 have a Bears each (`c`, `d`), plus what the options add. */
function attacked(
  aims: readonly { attacker: string; player: number }[],
  options: { gem?: boolean; bridge?: boolean; seat0?: readonly string[]; blockers?: boolean } = {},
): ScenarioGame {
  const seat0 = options.seat0 ?? [BEARS, BEARS];
  const b = scenario({ seats: 3 }).seat(0).define(FORCED);
  seat0.forEach((name, i) => {
    b.battlefield(name, { label: ['a', 'b'][i] ?? `x${i}` });
  });
  if (options.bridge === true) b.battlefield(BRIDGE);
  b.library(...FILLER).seat(1);
  if (options.blockers !== false) b.battlefield(BEARS, { label: 'c' });
  if (options.bridge === true) b.battlefield('Plains');
  b.library(...FILLER).seat(2);
  if (options.blockers !== false) b.battlefield(BEARS, { label: 'd' });
  if (options.gem === true) b.battlefield(GEM, { tapped: true });
  if (options.bridge === true) b.battlefield('Plains');
  const g = b
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).declareAttackers(
    aims.map((a) => ({ attacker: a.attacker, target: { player: a.player } })),
  );
  g.advanceTo('declareBlockers');
  return g;
}

describe('the cards are valid', () => {
  test.each([FORCED.faces[0]?.name ?? '', GEM, BRIDGE])('%s', (name) => {
    const card = name === FORCED.faces[0]?.name ? FORCED : syntheticCard(name);
    expect(validateCard(card)).toEqual([]);
  });
});

describe('who declares blockers', () => {
  test('the creatures attack seat 2 only: seat 2 is asked, seat 1 is not', () => {
    const g = attacked([{ attacker: 'a', player: 2 }]);
    const d = blockersDecision(g.state);
    expect(d.seat).toBe(2);
    expect(d.attackers.map((a) => a.attacker)).toEqual([g.id('a')]);
    expect(d.candidates.map((c) => c.blocker)).toEqual([g.id('d')]);
  });

  test('each defending player is asked in turn order, and sees only the attackers aimed at them', () => {
    const g = attacked([
      { attacker: 'a', player: 1 },
      { attacker: 'b', player: 2 },
    ]);
    const first = blockersDecision(g.state);
    expect(first.seat).toBe(1);
    expect(first.attackers.map((a) => a.attacker)).toEqual([g.id('a')]);
    expect(first.candidates.map((c) => c.blocker)).toEqual([g.id('c')]);
    g.act(1).declareBlockers([{ blocker: 'c', attacker: 'a' }]);
    // The active player does not get priority until the last defending player has declared (CR 802.4).
    const second = blockersDecision(g.state);
    expect(second.seat).toBe(2);
    expect(second.attackers.map((a) => a.attacker)).toEqual([g.id('b')]);
    expect(second.candidates.map((c) => c.blocker)).toEqual([g.id('d')]);
    g.act(2).declareBlockers([{ blocker: 'd', attacker: 'b' }]);
    g.expect.pending('priority', 0);
    expect(g.state.combat?.blocks).toEqual([
      { blocker: g.id('c'), attacker: g.id('a') },
      { blocker: g.id('d'), attacker: g.id('b') },
    ]);
    expect(declared(g).map((e) => e.seat)).toEqual([1, 2]);
    g.expect.invariants();
  });

  test('a defending player cannot block an attacker aimed at another player (CR 802.4a)', () => {
    const g = attacked([
      { attacker: 'a', player: 1 },
      { attacker: 'b', player: 2 },
    ]);
    expect(g.act(1).try.declareBlockers([{ blocker: 'c', attacker: 'b' }]).ok).toBe(false);
    g.expect.pending('declareBlockers', 1);
  });

  test('a defending player with no creature that can block is not asked: the active player gets priority', () => {
    const g = attacked(
      [
        { attacker: 'a', player: 1 },
        { attacker: 'b', player: 2 },
      ],
      { blockers: false },
    );
    g.expect.pending('priority', 0);
    expect(g.state.combat?.blocks).toEqual([]);
  });
});

describe('what depends on the declaration of one defending player', () => {
  test('"attack you and aren\'t blocked" of a permanent of seat 2 triggers once, for the creatures aimed at seat 2', () => {
    const g = attacked(
      [
        { attacker: 'a', player: 1 },
        { attacker: 'b', player: 2 },
      ],
      { gem: true },
    );
    g.act(1).declareBlockers([{ blocker: 'c', attacker: 'a' }]);
    g.act(2).declareBlockers([]);
    g.passAll();
    // Seat 0 drew two cards from the Gem of seat 2 (its attacker `b` was not blocked); `a` was blocked and aimed at seat 1.
    g.expect.handSize(0, 2);
  });

  test('"must be blocked" of an attacker aimed at seat 1 is not asked of seat 2', () => {
    const g = attacked(
      [
        { attacker: 'a', player: 1 },
        { attacker: 'b', player: 2 },
      ],
      { seat0: [FORCED.faces[0]?.name ?? '', BEARS] },
    );
    g.act(1).declareBlockers([{ blocker: 'c', attacker: 'a' }]);
    const d = blockersDecision(g.state);
    expect(d.seat).toBe(2);
    expect(d.attackers.map((a) => a.attacker)).toEqual([g.id('b')]);
    expect(
      getLegalActions(g.state, 2).some(
        (a) => a.kind === 'declareBlockers' && a.blocks.length === 0,
      ),
    ).toBe(true);
  });
});

describe('the cost of blocking (CR 509.1d)', () => {
  test('a defending player who takes the declaration back is asked again, alone; the declaration of the first is kept', () => {
    const g = attacked(
      [
        { attacker: 'a', player: 1 },
        { attacker: 'b', player: 2 },
      ],
      { bridge: true },
    );
    g.act(1).declareBlockers([{ blocker: 'c', attacker: 'a' }]);
    g.expect.pending('payMana', 1);
    g.act(1).payAuto();
    blockersDecision(g.state);
    g.act(2).declareBlockers([{ blocker: 'd', attacker: 'b' }]);
    g.expect.pending('payMana', 2);
    g.act(2).cancel();
    // Seat 2 is asked again: seat 1 is not, and its block stays.
    expect(blockersDecision(g.state).seat).toBe(2);
    expect(g.state.combat?.blocks).toEqual([{ blocker: g.id('c'), attacker: g.id('a') }]);
    g.act(2).declareBlockers([]);
    g.expect.pending('priority', 0);
    expect(declared(g).map((e) => e.seat)).toEqual([1, 2]);
  });
});
