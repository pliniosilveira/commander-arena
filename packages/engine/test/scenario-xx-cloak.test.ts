// Cloak (CR 701.58a): "cloak the top card of your library" is a manifest whose face-down 2/2 creature also has ward {2}.
// Pins: the permanent is face down by 'cloak' with the face-down characteristics (CR 708.2a) and ward {2} as a copiable value
// (CR 613.2b, layer 1b): an opponent's spell that targets it makes the ward trigger (CR 702.21a); the controller's own spell does not;
// a cloaked creature card with a mana cost is turned face up like a manifested one and then has the card's own abilities only (CR 708.8);
// an empty library cloaks nothing. The cards are SYNTHETIC, defined in this file.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const CLOAKER = 'SYNTHETIC Cloaker'; // sorcery: cloak the top card of your library
const BRUTE = 'SYNTHETIC Cloak Brute'; // {3}{G} 4/4 vanilla
const BOLT = 'Lightning Bolt';
const FILLER = ['Plains', 'Plains', 'Plains'] as const;

const cloaker = singleFaceCard({
  name: CLOAKER,
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Cloak the top card of your library.',
  spell: { effect: { kind: 'manifest', player: { kind: 'you' }, cloak: true } },
});
const brute = singleFaceCard({
  name: BRUTE,
  manaCost: ['3', 'G'],
  types: ['creature'],
  subtypes: ['Beast'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 4,
  toughness: 4,
  oracleText: '',
});

/** Seat 0 holds the cloaker and plenty of mana, with `top` on its library; seat 1 holds two Bolts. */
function game(top: readonly string[], opponentBolts = false): ScenarioGame {
  const b = scenario()
    .seat(0)
    .life(20)
    .hand(CLOAKER)
    .battlefield('Forest', { count: 5 })
    .library(...top, ...FILLER)
    .define(cloaker)
    .define(brute)
    .seat(1)
    .life(20)
    .library(...FILLER);
  return (opponentBolts ? b.hand(BOLT).battlefield('Mountain', { count: 4 }) : b)
    .at('precombatMain')
    .build();
}

describe('cloak (CR 701.58a)', () => {
  test('the card is valid and the effect is a supported feature', () => {
    expect(validateCard(cloaker)).toEqual([]);
    expect(isFeatureSupported('effect:manifest')).toBe(true);
  });

  test('the top card enters face down as a 2/2 creature with ward {2}', () => {
    const g = game([BRUTE]);
    g.act(0).cast(CLOAKER, { pay: true });
    g.passAll();
    const o = g.object({ name: BRUTE, zone: 'battlefield' });
    expect(o.faceDown).toEqual({ by: 'cloak', n: 1 });
    g.expect.pt(BRUTE, 2, 2);
    g.expect.derived(BRUTE, { types: ['creature'], subtypes: [], keywords: ['ward'] });
    g.expect.librarySize(0, FILLER.length);
    g.expect.invariants();
  });

  test('an opponent that targets it makes the ward trigger (CR 702.21a)', () => {
    const g = game([BRUTE], true);
    g.act(0).cast(CLOAKER, { pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BRUTE], pay: true });
    expect(g.state.stack.length).toBe(2);
    g.expect.noEvent({ kind: 'countered' });
    g.passAll();
    g.expect.pending('confirmOptional', 1);
  });

  test('turned face up it is the card again, with no ward (CR 708.8)', () => {
    const g = game([BRUTE]);
    g.act(0).cast(CLOAKER, { pay: true });
    g.passAll();
    g.expect.legal(0, { turnFaceUp: BRUTE });
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.expect.pt(BRUTE, 4, 4);
    g.expect.derived(BRUTE, { subtypes: ['Beast'], keywords: [] });
  });

  test('an empty library cloaks nothing (CR 701.40f)', () => {
    const g = scenario()
      .seat(0)
      .hand(CLOAKER)
      .battlefield('Forest', { count: 2 })
      .library()
      .define(cloaker)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(CLOAKER, { pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'manifested' });
  });
});
