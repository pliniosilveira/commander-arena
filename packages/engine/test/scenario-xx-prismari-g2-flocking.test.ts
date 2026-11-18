// The Prismari deck (issue 87), group 2: Furygale Flocking, "This spell costs {1} less to cast for each instant and sorcery card in your graveyard. For each opponent, create two 3/3
// blue and red Elemental creature tokens with flying that attack that opponent this turn if able. They gain haste until end of turn." (SYNTHETIC Flocking Gale, src/cards/fixtures/
// synthetic-prismari-g2.ts). Pins: CR 601.2f (a cost reduction lowers the generic part of the total cost, never a colored symbol, and is counted as the cost is determined),
// CR 400.1 and 108.3 (your graveyard: the cards you own), CR 111.2 and 111.4 (the player who creates a token controls it), CR 508.1d (a requirement to attack: obeyed if able), CR 702.10
// (haste), CR 611.2a and 514.2 (until end of turn: the requirement and the haste end with the turn), CR 101.4 (an effect that does something for each opponent).
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GALE = 'SYNTHETIC Flocking Gale'; // {8}{R}{R} sorcery
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

type Builder = ReturnType<typeof scenario>;

function build(
  graveyard: readonly string[],
  lands = 10,
  extra: (b: Builder) => void = () => {},
  opponent: (b: Builder) => void = () => {},
) {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(GALE)
    .battlefield('Mountain', { count: lands });
  for (const card of graveyard) b.graveyard(card);
  extra(b);
  b.seat(1).library(...LIBRARY);
  opponent(b);
  return b.at('precombatMain', { active: 0 }).build();
}

const castable = (g: ReturnType<typeof build>) =>
  getLegalActions(g.state, 0).some(
    (a) => a.kind === 'castSpell' && g.object(g.id(GALE)).id === a.object,
  );
const tokens = (g: ReturnType<typeof build>, seat = 0) =>
  g.find({ name: 'Elemental', zone: 'battlefield', seat }).filter((o) => o.token !== null);
const tappedLands = (g: ReturnType<typeof build>) =>
  g.find({ name: 'Mountain', zone: 'battlefield', seat: 0 }).filter((o) => o.tapped).length;

describe('the card is valid', () => {
  test(GALE, () => {
    expect(validateCard(syntheticCard(GALE))).toEqual([]);
  });
});

describe('costs {1} less for each instant and sorcery card in your graveyard (CR 601.2f)', () => {
  test('no card: the full {8}{R}{R}: not castable with nine lands, castable with ten', () => {
    expect(castable(build([], 9))).toBe(false);
    const g = build([], 10);
    expect(castable(g)).toBe(true);
    g.act(0).cast(GALE, { pay: true });
    expect(tappedLands(g)).toBe(10);
  });

  test('four instants and sorceries: {4}{R}{R}, six mana', () => {
    const g = build(['Lightning Bolt', 'Lightning Bolt', 'Divination', 'Unsummon'], 6);
    expect(castable(g)).toBe(true);
    g.act(0).cast(GALE, { pay: true });
    expect(tappedLands(g)).toBe(6);
  });

  test('five is not enough for six lands... and four with five lands is one short', () => {
    expect(castable(build(['Lightning Bolt', 'Lightning Bolt', 'Divination', 'Unsummon'], 5))).toBe(
      false,
    );
  });

  test('only the generic part is reduced: with a graveyard of ten the spell still costs {R}{R}', () => {
    const ten = Array.from({ length: 10 }, () => 'Lightning Bolt');
    const g = build(ten, 2);
    expect(castable(g)).toBe(true);
    g.act(0).cast(GALE, { pay: true });
    expect(tappedLands(g)).toBe(2);
    expect(castable(build(ten, 1))).toBe(false);
  });

  test('creature cards do not count, and neither do the cards of the opponent’s graveyard', () => {
    const g = build([BEARS, BEARS, BEARS, BEARS], 9, undefined, (b) => {
      b.graveyard('Lightning Bolt', 'Divination');
    });
    expect(castable(g)).toBe(false);
  });
});

describe('two 3/3 flying Elementals for each opponent, hasty, attacking that opponent (CR 508.1d)', () => {
  const resolved = () => {
    const g = build([], 10);
    g.act(0).cast(GALE, { pay: true });
    g.passAll();
    return g;
  };

  test('two 3/3 blue and red Elementals with flying, controlled by the caster', () => {
    const g = resolved();
    expect(tokens(g)).toHaveLength(2);
    expect(tokens(g, 1)).toHaveLength(0);
    for (const t of tokens(g)) {
      g.expect.pt(t.id, 3, 3);
      g.expect.derived(t.id, { colors: ['U', 'R'], keywords: ['flying', 'haste'] });
    }
    g.expect.invariants();
  });

  test('the tokens must attack the opponent this turn: they are required attackers, and a declaration without them is refused', () => {
    const g = resolved();
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    expect(d?.kind).toBe('declareAttackers');
    if (d?.kind !== 'declareAttackers') return;
    expect([...d.mustAttack].sort()).toEqual(
      tokens(g)
        .map((t) => t.id)
        .sort(),
    );
    expect(g.act(0).try.declareAttackers([]).ok).toBe(false);
    g.act(0).attack(tokens(g).map((t) => t.id));
    g.passAll();
    g.expect.invariants();
  });

  test('they are not required to attack another turn: the requirement ends with the turn', () => {
    const g = resolved();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    expect(d?.kind).toBe('declareAttackers');
    if (d?.kind === 'declareAttackers') expect(d.mustAttack).toEqual([]);
  });

  test('another creature of the caster is not required to attack', () => {
    const g = build([], 10, (b) => b.battlefield(BEARS, { label: 'bear' }));
    g.act(0).cast(GALE, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers') throw new Error('expected declareAttackers');
    expect(d.mustAttack).not.toContain(g.id('bear'));
    expect(d.mustAttack).toHaveLength(2);
  });

  test('the haste lasts until end of turn: next turn the tokens have no haste any more (the ones made now were here anyway), and made after combat nothing attacks', () => {
    const g = build([], 10);
    g.advanceTo('postcombatMain');
    g.act(0).cast(GALE, { pay: true });
    g.passAll();
    expect(tokens(g)).toHaveLength(2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    for (const t of tokens(g)) g.expect.derived(t.id, { keywords: ['flying'] });
  });

  test('they are required to attack the opponent, not a planeswalker the opponent controls (CR 508.1d)', () => {
    const g = build([], 10, undefined, (b) => b.battlefield('SYNTHETIC Vanilla Planeswalker'));
    g.act(0).cast(GALE, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    const walker = { name: 'SYNTHETIC Vanilla Planeswalker', seat: 1 } as const;
    expect(() =>
      g.act(0).attack(
        tokens(g).map((t) => t.id),
        walker,
      ),
    ).toThrow();
    g.act(0).attack(
      tokens(g).map((t) => t.id),
      { player: 1 },
    );
    g.expect.invariants();
  });
});
