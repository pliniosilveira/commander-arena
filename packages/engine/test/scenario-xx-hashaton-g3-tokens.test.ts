// "If one or more tokens would be created under your control, twice that many of those tokens are created instead." (D-378; the Hashaton deck, Bard, King of
// Dale): the replacement `tokensInstead` in `double` mode.
// Pins: CR 614.1a (a replacement effect of a permanent), CR 111.2 (tokens are created under the control of a player), CR 614.5 (an effect replaces an event once:
// two of them make four, not an infinite number), CR 616.1 (the affected player orders the effects, asked only when the order can change what is made), CR 613.1f
// (a permanent that lost its abilities replaces nothing). The tokens are made by SYNTHETIC cards (src/cards/fixtures/synthetic-hashaton-g3.ts) and by the
// triggers and replacement effects of fixtures of other slices (a token made at the end step, Dragons instead of artifact tokens, a Thopter with them).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const TOKEN_REIGN = 'SYNTHETIC Token Reign';
const TWIN_REIGN = 'SYNTHETIC Twin Reign';
const MUSTER = 'SYNTHETIC Muster Call'; // two tapped 1/1 Soldiers
const ANGEL_CALLER = 'SYNTHETIC Angel Caller'; // a 1/1 Angel with flying
const SERAPH = 'SYNTHETIC Dusk Seraph'; // at each end step, if you gained life this turn, a 4/4 Angel
const MEND = 'SYNTHETIC Mend'; // gain 3 life
const DRAGON_MAKER = 'SYNTHETIC Dragon Maker'; // artifact tokens are replaced by as many 5/5 Dragons
const THOPTER_AUTOMATON = 'SYNTHETIC Thopter Automaton'; // artifact tokens plus an additional Thopter
const TREASURES = 'SYNTHETIC Treasure Pair'; // two Treasure tokens
const FROG = 'SYNTHETIC Frog Hex'; // target creature loses all abilities until end of turn
const LIB = Array.from({ length: 6 }, () => 'Plains');

const count = (g: ScenarioGame, name: string, seat: 0 | 1 = 0): number =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id];
    return o?.token?.characteristics.name === name && o.controller === seat;
  }).length;

describe('the cards are valid', () => {
  test.each([TOKEN_REIGN, TWIN_REIGN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a doubling names no token of its own', () => {
    const card = syntheticCard(TOKEN_REIGN);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withRule = (rule: Record<string, unknown>) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [{ kind: 'replacement', replacement: { kind: 'tokensInstead', ...rule } }],
          },
        ],
      }) as never;
    expect(validateCard(withRule({ what: { token: true }, mode: 'double' }))).toEqual([]);
    const token = { kind: 'preset', preset: 'Treasure' };
    expect(validateCard(withRule({ what: { token: true }, mode: 'double', token }))).not.toEqual(
      [],
    );
    expect(validateCard(withRule({ what: { token: true }, mode: 'triple' }))).not.toEqual([]);
  });
});

describe('twice that many of those tokens (CR 614.1a)', () => {
  const muster = (...mine: string[]) =>
    scenario()
      .seat(0)
      .hand(MUSTER)
      .battlefield('Plains', 'Plains')
      .battlefield(...mine)
      .seat(1)
      .library(...LIB)
      .build();

  test('without the replacement: two tapped Soldiers (the baseline)', () => {
    const g = muster();
    g.act(0).cast(MUSTER, { pay: true });
    g.passAll();
    expect(count(g, 'Soldier')).toBe(2);
  });

  test('two tokens become four, and they are the tokens the spell describes: tapped (what the instruction said about them applies to all)', () => {
    const g = muster(TOKEN_REIGN);
    g.act(0).cast(MUSTER, { pay: true });
    g.passAll();
    expect(count(g, 'Soldier')).toBe(4);
    for (const id of g.state.battlefield) {
      const o = g.state.objects[id];
      if (o?.token?.characteristics.name === 'Soldier') expect(o.tapped).toBe(true);
    }
    g.expect.invariants();
  });

  test('each replacement applies once (CR 614.5): two of them make four times as many, not an infinite number', () => {
    const g = muster(`${TOKEN_REIGN}`, `${TWIN_REIGN}`);
    g.act(0).cast(MUSTER, { pay: true });
    g.passAll();
    expect(count(g, 'Soldier')).toBe(8);
  });

  test('the token a spell makes is what the card says: a flying Angel twice', () => {
    const g = scenario()
      .seat(0)
      .hand(ANGEL_CALLER)
      .battlefield('Plains')
      .battlefield(TWIN_REIGN)
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(ANGEL_CALLER, { pay: true });
    g.passAll();
    expect(count(g, 'Angel')).toBe(2);
    g.expect.derived({ name: 'Angel', zone: 'battlefield', nth: 0 }, { keywords: ['flying'] });
    g.expect.derived({ name: 'Angel', zone: 'battlefield', nth: 1 }, { keywords: ['flying'] });
  });

  test("an opponent's replacement does not double my tokens", () => {
    const g = scenario()
      .seat(0)
      .hand(MUSTER)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .battlefield(TOKEN_REIGN)
      .library(...LIB)
      .build();
    g.act(0).cast(MUSTER, { pay: true });
    g.passAll();
    expect(count(g, 'Soldier')).toBe(2);
  });

  test("the tokens of a triggered ability are doubled too (the end step's Angel after a life gain)", () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(MEND)
      .battlefield('Plains')
      .battlefield(SERAPH)
      .battlefield(TOKEN_REIGN)
      .seat(1)
      .library(...LIB)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    expect(count(g, 'Angel')).toBe(2);
  });

  test('a permanent that lost its abilities replaces nothing (CR 613.1f)', () => {
    const g = scenario()
      .seat(0)
      .hand(MUSTER, FROG)
      .battlefield('Plains', 'Plains', 'Island', 'Island')
      .battlefield(TOKEN_REIGN)
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(FROG, { targets: [TOKEN_REIGN], pay: true });
    g.passAll();
    g.act(0).cast(MUSTER, { pay: true });
    g.passAll();
    expect(count(g, 'Soldier')).toBe(2);
  });
});

describe('with the other replacements of token creation (CR 616.1: asked only when the order can change what is made)', () => {
  test('Dragons instead of artifact tokens: every order makes four Dragons from two Treasures, so nothing is asked', () => {
    const g = scenario()
      .seat(0)
      .hand(TREASURES)
      .battlefield('Mountain', 'Mountain')
      .battlefield(DRAGON_MAKER)
      .battlefield(TOKEN_REIGN)
      .seat(1)
      .library(...LIB)
      .build();
    g.act(0).cast(TREASURES, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseOption');
    expect(count(g, 'Dragon')).toBe(4);
    expect(count(g, 'Treasure')).toBe(0);
  });

  test('a Thopter with the artifact tokens: doubling first makes five tokens, after it six, so the creator is asked and each answer is honoured', () => {
    const make = (answer: 'first' | 'last') => {
      const g = scenario()
        .seat(0)
        .hand(TREASURES)
        .battlefield('Mountain', 'Mountain')
        .battlefield(THOPTER_AUTOMATON)
        .battlefield(TOKEN_REIGN)
        .seat(1)
        .library(...LIB)
        .build();
      g.act(0).cast(TREASURES, { pay: true });
      g.passAll();
      const d = g.state.pending;
      if (d?.kind !== 'chooseOption' || d.replacement === undefined) {
        throw new Error(`expected the replacement question, got ${d?.kind}`);
      }
      expect(d.seat).toBe(0);
      const choices = d.replacement.choices;
      expect(choices.map((c) => c.text).sort()).toEqual([
        'Create those tokens plus an additional Thopter token instead',
        'Create twice that many of those tokens instead',
      ]);
      // "Doubling first" makes 4 Treasures and one Thopter; the Thopter effect first makes 2 Treasures and a Thopter, which doubling then doubles.
      const doubling = choices.find((c) => c.text.startsWith('Create twice'));
      const thopter = choices.find((c) => c.text.startsWith('Create those'));
      const totalOf = (c: typeof doubling): number => (c?.kind === 'tokens' ? c.outcome.total : -1);
      expect(totalOf(doubling)).toBe(5);
      expect(totalOf(thopter)).toBe(6);
      const pick = answer === 'first' ? doubling : thopter;
      g.act(0).chooseOption(pick?.option ?? '');
      g.passAll();
      return g;
    };
    const first = make('first');
    expect(count(first, 'Treasure')).toBe(4);
    expect(count(first, 'Thopter')).toBe(1);
    const last = make('last');
    expect(count(last, 'Treasure')).toBe(4);
    expect(count(last, 'Thopter')).toBe(2);
  });
});
