// "Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature, except their power is half that creature's power and their
// toughness is half that creature's toughness. Round up each time." (Saw in Half, Witch-king of Angmar deck): `diedThisWay` and `copyOf.halfPt`.
// Pins: CR 700.4 (dies), CR 608.2h (last-known information), CR 707.9b (exceptions of a copy), CR 107.1a (rounding up), CR 111.4 (tokens).
// The card is SYNTHETIC; defined here.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SAW = 'SYNTHETIC Saw Spell';
const SPIDER = 'Giant Spider'; // 2/4
const ANGEL = 'Serra Angel'; // 4/4

const CARD = singleFaceCard({
  name: SAW,
  manaCost: ['2', 'B'],
  types: ['instant'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    "Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature, except their power is half that creature's power and their toughness is half that creature's toughness. Round up each time.",
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
        {
          kind: 'conditional',
          condition: { kind: 'diedThisWay', of: { kind: 'target', id: 't1' } },
          effect: {
            kind: 'createToken',
            token: { kind: 'copyOf', object: { kind: 'target', id: 't1' }, halfPt: true },
            count: 2,
            controller: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
          },
        },
      ],
    },
  },
});

const tokensOf = (
  g: ReturnType<typeof scenario>['build'] extends () => infer G ? G : never,
  name: string,
) =>
  g
    .view(1)
    .battlefield.filter((o) => o.name === name && o.controller === 1)
    .map((o) => [o.power, o.toughness]);

describe('two copies with half the power and toughness (CR 707.9b, 107.1a)', () => {
  const board = (theirs: string) =>
    scenario()
      .define(CARD)
      .seat(0)
      .hand(SAW)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield(theirs)
      .at('precombatMain', { active: 0 })
      .build();

  test('the destroyed creature’s controller gets two tokens that copy it, each with half its power and toughness', () => {
    const g = board(ANGEL);
    g.act(0).cast(SAW, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    expect(tokensOf(g, ANGEL)).toEqual([
      [2, 2],
      [2, 2],
    ]);
    g.expect.invariants();
  });

  test('an odd number is rounded up: a 2/4 gives 1/2 tokens and a 2/2 gives 1/1 tokens', () => {
    const g = board(SPIDER);
    g.act(0).cast(SAW, { targets: [SPIDER], pay: true });
    g.passAll();
    expect(tokensOf(g, SPIDER)).toEqual([
      [1, 2],
      [1, 2],
    ]);
  });
});
