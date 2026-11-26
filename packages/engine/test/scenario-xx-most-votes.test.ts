// "Exile each permanent with the most votes or tied for most votes" after a vote for permanents (CR 701.38a, 701.38b, Council's Judgment's pattern), with two, three and four seats.
// Pins: CR 701.38a (each player votes, in turn order from the controller, seeing the earlier votes), 701.38b (the choices are permanents, which are not targeted: protection does not stop a
// vote), 608.2c (instructions in order), 406.1 (exile). Cards are SYNTHETIC; the real card is played in packages/cards/test/convert-grammar-engine-most-votes.test.ts.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { CardDefinition, Effect } from '../src/index';
import { validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const FILLER = Array.from({ length: 12 }, () => 'Plains');

/** "Starting with you, each player votes for a nonland permanent you don't control. Exile each permanent with the most votes or tied for most votes." */
const JUDGE = singleFace({
  name: 'SYNTHETIC Verdict',
  manaCost: ['W'],
  types: ['sorcery'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC: describes what the AST does.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'voteFor',
          choices: {
            kind: 'objects',
            filter: { zone: 'battlefield', notTypes: ['land'], controller: 'opponent' },
          },
          startingWith: 'you',
        },
        { kind: 'exile', objects: { kind: 'mostVotedObjects' } },
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
const BEAR_A = bear('SYNTHETIC Bear A');
const BEAR_B = bear('SYNTHETIC Bear B');
const BEAR_C = bear('SYNTHETIC Bear C');
const MINE = bear('SYNTHETIC My Bear');
const PROTECTED = singleFace({
  name: 'SYNTHETIC Pro-White Bear',
  manaCost: ['1', 'G'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'Protection from white',
  abilities: [{ kind: 'keyword', keyword: { kind: 'protection', from: 'color', colors: ['W'] } }],
});
const ALL: readonly CardDefinition[] = [JUDGE, BEAR_A, BEAR_B, BEAR_C, MINE, PROTECTED];

function table(
  seats: 2 | 3 | 4,
  board: Readonly<Record<number, readonly string[]>>,
): ScenarioGame {
  let b = scenario({ seats });
  for (const card of ALL) b = b.define(card);
  for (let seat = 0; seat < seats; seat += 1) {
    b = b
      .seat(seat)
      .life(20)
      .hand(...(seat === 0 ? [JUDGE.name] : []))
      .battlefield(...(board[seat] ?? []), ...(seat === 0 ? ['Plains'] : []))
      .library(...FILLER);
  }
  return b.at('precombatMain', { active: 0 }).build();
}

/** The option of the pending vote that stands for the permanent called `name`. */
function optionOf(g: ScenarioGame, name: string): string {
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error('no vote pending');
  const c = d.vote?.choices?.find((x) => x.kind === 'object' && x.name === name);
  if (c?.kind !== 'object') throw new Error(`no choice for ${name}`);
  return `object:${c.object}`;
}

describe('the card is valid', () => {
  test('validateCard', () => expect(validateCard(JUDGE)).toEqual([]));
  test('mostVotedObjects needs a vote for permanents before it', () => {
    const exile: Effect = { kind: 'exile', objects: { kind: 'mostVotedObjects' } };
    const probe = (effect: Effect) =>
      singleFace({
        name: 'SYNTHETIC Probe',
        manaCost: ['W'],
        types: ['sorcery'],
        colors: ['W'],
        colorIdentity: ['W'],
        oracleText: 'SYNTHETIC: describes what the AST does.',
        spell: { effect },
      });
    expect(validateCard(probe(exile)).length).toBeGreaterThan(0);
    const words: Effect = { kind: 'vote', options: ['a', 'b'], startingWith: 'you' };
    expect(validateCard(probe({ kind: 'sequence', effects: [words, exile] })).length).toBeGreaterThan(
      0,
    );
  });
});

describe('exile each permanent with the most votes or tied for most', () => {
  test('two seats: the permanent with more votes is exiled and the others stay; only nonland permanents the caster does not control are offered', () => {
    const g = table(2, { 0: [MINE.name], 1: [BEAR_A.name, BEAR_B.name, 'Forest'] });
    g.act(0).cast(JUDGE.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a vote');
    expect(d.options).toHaveLength(2);
    expect(d.vote?.cast).toEqual([]);
    const a = optionOf(g, BEAR_A.name);
    g.act(0).chooseOption(a);
    g.expect.pending('chooseOption', 1);
    const d1 = g.state.pending;
    if (d1?.kind !== 'chooseOption') throw new Error('no second vote');
    // CR 701.38a: the second voter sees the first vote.
    expect(d1.vote?.cast).toHaveLength(1);
    g.act(1).chooseOption(a);
    g.expect.zone(BEAR_A.name, 'exile', { seat: 1 });
    g.expect.zone(BEAR_B.name, 'battlefield', { seat: 1 });
    g.expect.zone('Forest', 'battlefield', { seat: 1 });
    g.expect.zone(MINE.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('three seats: a tie for the most votes exiles every tied permanent', () => {
    const g = table(3, { 1: [BEAR_A.name], 2: [BEAR_B.name, BEAR_C.name] });
    g.act(0).cast(JUDGE.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption(optionOf(g, BEAR_A.name));
    g.act(1).chooseOption(optionOf(g, BEAR_B.name));
    g.act(2).chooseOption(optionOf(g, BEAR_C.name));
    g.expect.zone(BEAR_A.name, 'exile', { seat: 1 });
    g.expect.zone(BEAR_B.name, 'exile', { seat: 2 });
    g.expect.zone(BEAR_C.name, 'exile', { seat: 2 });
    g.expect.invariants();
  });

  test('four seats: two votes beat one; a permanent with protection from white can be voted for and exiled (not targeted)', () => {
    const g = table(4, { 1: [PROTECTED.name], 2: [BEAR_A.name], 3: [BEAR_B.name] });
    g.act(0).cast(JUDGE.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption(optionOf(g, PROTECTED.name));
    g.act(1).chooseOption(optionOf(g, BEAR_A.name));
    g.act(2).chooseOption(optionOf(g, PROTECTED.name));
    g.act(3).chooseOption(optionOf(g, BEAR_B.name));
    g.expect.zone(PROTECTED.name, 'exile', { seat: 1 });
    g.expect.zone(BEAR_A.name, 'battlefield', { seat: 2 });
    g.expect.zone(BEAR_B.name, 'battlefield', { seat: 3 });
    g.expect.invariants();
  });

  test('with no permanent to vote for nothing is exiled', () => {
    const g = table(2, { 0: [MINE.name], 1: ['Forest'] });
    g.act(0).cast(JUDGE.name, { pay: true });
    g.passAll();
    g.expect.zone(MINE.name, 'battlefield', { seat: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});
