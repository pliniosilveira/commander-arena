// The Prismari deck (issue 87), group 2: Restless Spire, "{U}{R}: Until end of turn, ~ becomes a 2/1 blue and red Elemental creature with \"During your turn, ~ has first strike.\"
// It's still a land." (SYNTHETIC Spire Land, src/cards/fixtures/synthetic-prismari-g2.ts). Pins: CR 613.1d (types, layer 4), 613.1e (colors, layer 5), 613.1f (abilities, layer 6),
// 613.4b (base power and toughness, layer 7b), CR 205.1b ("it's still a land": the new types are added), CR 604.1 and 109.5 (a granted ability "during your turn": "your" is the
// controller of the permanent, and the ability works only on their turn), CR 611.2a and 514.2 (until end of turn), CR 302.6 (a land that is a creature can attack only if it has been
// under its controller's control since the turn began), CR 508.1 (attacking taps it), CR 701.22 (scry).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SPIRE = 'SYNTHETIC Spire Land';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

type Builder = ReturnType<typeof scenario>;

function build(extra: (b: Builder) => void = () => {}, opponent: (b: Builder) => void = () => {}) {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(SPIRE, { label: 'spire' })
    .battlefield('Island')
    .battlefield('Mountain');
  extra(b);
  b.seat(1).library(...LIBRARY);
  opponent(b);
  return b.at('precombatMain', { active: 0 }).build();
}

/** Pays {U}{R} with the Island and the Mountain, which are not the Spire, and resolves the ability. */
const animate = (g: ReturnType<typeof build>, seat: 0 | 1 = 0) => {
  g.act(seat).activate({ name: SPIRE, zone: 'battlefield', seat }, { ability: 2 });
  g.choose(seat, { kind: 'payAuto' });
  g.passAll();
};

describe('the card is valid', () => {
  test(SPIRE, () => {
    expect(validateCard(syntheticCard(SPIRE))).toEqual([]);
  });
});

describe('becomes a 2/1 blue and red Elemental creature, still a land (CR 613, 205.1b)', () => {
  test('on its controller’s turn: a land creature, 2/1, blue and red, Elemental, with first strike', () => {
    const g = build();
    g.expect.derived('spire', { types: ['land'], keywords: [] });
    animate(g);
    g.expect.derived('spire', {
      types: ['land', 'creature'],
      subtypes: ['Elemental'],
      colors: ['U', 'R'],
      keywords: ['firstStrike'],
    });
    g.expect.pt('spire', 2, 1);
    g.expect.invariants();
  });

  test('it is still a land: it can still be tapped for mana', () => {
    const g = build();
    animate(g);
    g.act(0).tapForMana('spire', { color: 'U' });
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['U']);
  });

  test('it ends at the end of the turn: it is a plain land again', () => {
    const g = build();
    animate(g);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived('spire', { types: ['land'], colors: [], keywords: [] });
  });

  test('the first strike works on its controller’s turn only: it attacks with first strike', () => {
    const g = build();
    animate(g);
    g.advanceTo('declareAttackers');
    g.act(0).attack('spire');
    g.expect.derived('spire', { keywords: ['firstStrike'] });
    g.expect.invariants();
  });

  test('animated on the opponent’s turn it is a 2/1 creature (it can block) but has no first strike: it is not its controller’s turn', () => {
    const g = build(
      (b) => b.battlefield('Island').battlefield('Mountain'),
      (b) => b.battlefield('Grizzly Bears', { label: 'bears' }),
    );
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers');
    g.act(1).attack('bears');
    g.act(1).pass();
    g.act(0).activate({ name: SPIRE, zone: 'battlefield', seat: 0 }, { ability: 2 });
    g.choose(0, { kind: 'payAuto' });
    g.passAll();
    g.expect.derived('spire', { types: ['land', 'creature'], keywords: [] });
    g.expect.pt('spire', 2, 1);
    g.advanceTo('declareBlockers');
    g.expect.canBlock('spire', 'bears', true);
  });

  test('"whenever this land attacks, scry 1" still works while it is a creature', () => {
    const g = build();
    animate(g);
    g.advanceTo('declareAttackers');
    g.act(0).attack('spire');
    g.passAll();
    g.expect.pending('arrangeCards', 0);
  });

  test('activated twice it is still one 2/1 creature (a base power and toughness is set, not added)', () => {
    const g = build((b) => b.battlefield('Island').battlefield('Mountain'));
    animate(g);
    animate(g);
    g.expect.pt('spire', 2, 1);
  });
});
