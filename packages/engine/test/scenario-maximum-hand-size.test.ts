// "Your maximum hand size is twenty." (the engine's static `maximumHandSize`, Twenty-Toed Toad).
// Pins: CR 402.2 (Hand: a player's maximum hand size is normally seven), CR 514.1 (Cleanup Step: the active player discards down to it), CR 613.11 (an effect that changes
// a game rule, such as the maximum hand size, is applied in timestamp order: of "Your maximum hand size is twenty" and "You have no maximum hand size" the later one decides),
// CR 613.7a (a static ability's effect has the timestamp of its permanent).
// The cards are SYNTHETIC (defined here and in src/cards/fixtures/synthetic-mana.ts).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type CardDefinition, validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const HAT = 'SYNTHETIC Reading Hat';

const TOAD: CardDefinition = singleFace({
  name: 'SYNTHETIC Wide Toad',
  manaCost: ['2', 'U'],
  types: ['creature'],
  subtypes: ['Frog'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 1,
  toughness: 1,
  oracleText: 'SYNTHETIC: Your maximum hand size is twenty.',
  abilities: [{ kind: 'static', static: { kind: 'maximumHandSize', size: 20 } }],
});

const FINALE: CardDefinition = singleFace({
  name: 'SYNTHETIC Endless Reading',
  manaCost: ['U'],
  types: ['sorcery'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'SYNTHETIC: You have no maximum hand size for the rest of the game.',
  abilities: [],
  spell: { effect: { kind: 'noMaxHandSizeForGame' } },
});

/** Seat 0's end step, ready to pass into cleanup. */
function endStep(configure: (b: ReturnType<typeof scenario>) => unknown) {
  const b = scenario().define(TOAD).seat(0);
  configure(b);
  return b.seat(1).library('Island', { count: 4 }).at('end', { active: 0, turn: 3 }).build();
}

describe('CR 402.2, 514.1: a maximum hand size of twenty', () => {
  test('twenty cards are kept, twenty-three mean a discard of three', () => {
    const kept = endStep((b) => b.hand('Forest', { count: 20 }).battlefield(TOAD.name));
    kept.passAll();
    kept.expect.noEvent({ kind: 'discarded' });
    kept.expect.handSize(0, 20);
    const over = endStep((b) => b.hand('Forest', { count: 23 }).battlefield(TOAD.name));
    over.passAll();
    over.expect.pending('discard', 0);
    expect(over.state.pending?.kind === 'discard' ? over.state.pending.count : null).toBe(3);
  });

  test("an opponent's permanent changes nothing: seven is still my maximum", () => {
    const g = endStep((b) =>
      b.hand('Forest', { count: 9 }).seat(1).battlefield(TOAD.name).seat(0),
    );
    g.passAll();
    expect(g.state.pending?.kind === 'discard' ? g.state.pending.count : null).toBe(2);
  });

  test('it replaces a lowered maximum too', () => {
    const g = endStep((b) => b.handSizeMax(2).hand('Forest', { count: 9 }).battlefield(TOAD.name));
    g.passAll();
    g.expect.handSize(0, 9);
    g.expect.noEvent({ kind: 'discarded' });
  });
});

describe('CR 613.11: with "You have no maximum hand size", the later timestamp decides', () => {
  test('the toad first, the hat later: no maximum hand size', () => {
    const g = endStep((b) => b.hand('Forest', { count: 25 }).battlefield(TOAD.name, HAT));
    g.passAll();
    g.expect.handSize(0, 25);
    g.expect.noEvent({ kind: 'discarded' });
  });

  test('the hat first, the toad later: the maximum is twenty', () => {
    const g = endStep((b) => b.hand('Forest', { count: 25 }).battlefield(HAT, TOAD.name));
    g.passAll();
    expect(g.state.pending?.kind === 'discard' ? g.state.pending.count : null).toBe(5);
  });

  /** Seat 0's first main phase with the toad on the battlefield or in hand, the sorcery in hand and mana for both. */
  const main = (toadOnBattlefield: boolean) => {
    const b = scenario().define(TOAD).define(FINALE).seat(0).hand(FINALE.name);
    if (toadOnBattlefield) b.battlefield(TOAD.name);
    else b.hand(TOAD.name);
    return b
      .hand('Forest', { count: 25 })
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };

  test('"no maximum hand size for the rest of the game" after the toad entered wins over it', () => {
    const g = main(true);
    g.act(0).cast(FINALE.name, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.noEvent({ kind: 'discarded' });
    g.expect.step('upkeep', { active: 1, turn: 4 });
  });

  test('a toad that enters after that effect sets the maximum to twenty again', () => {
    const g = main(false);
    g.act(0).cast(FINALE.name, { pay: true });
    g.passAll();
    g.act(0).cast(TOAD.name, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    expect(g.state.pending?.kind === 'discard' ? g.state.pending.count : null).toBe(5);
  });
});

describe('validation', () => {
  test('a whole size is valid; a negative or fractional one is not', () => {
    const ok: Ability = { kind: 'static', static: { kind: 'maximumHandSize', size: 20 } };
    expect(validateAbility(ok)).toEqual([]);
    for (const size of [-1, 2.5]) {
      const bad = { kind: 'static', static: { kind: 'maximumHandSize', size } } as Ability;
      expect(validateAbility(bad).map((i) => i.message).join()).toContain('whole number');
    }
    expect(validateCard(TOAD)).toEqual([]);
  });
});
