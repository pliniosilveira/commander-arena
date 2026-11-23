// "At the beginning of combat on your turn, choose one at random —" (`ModeChoice.random`).
// Pins: CR 700.2 and 603.3c (the mode of a modal triggered ability is chosen as it goes on the stack, so players can respond knowing it; a mode with no
// legal target cannot be chosen), SPEC 4.2 (all randomness comes from the seeded generator of the state: the same seed gives the same mode). The card is
// SYNTHETIC (src/cards/fixtures/synthetic-random-mode.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const YETI = 'SYNTHETIC Random Yeti';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 10 }, () => 'Mountain');

function chosenAtCombat(seed: number, opponentCreature: boolean): readonly number[] | undefined {
  let b = scenario()
    .seed(seed)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(YETI)
    .seat(1)
    .library(...LIBRARY);
  if (opponentCreature) b = b.battlefield(BEARS);
  const g = b.build();
  g.advanceTo('beginningOfCombat');
  // A random mode is not a decision: the ability is already on the stack with its mode, and a lone legal target is chosen by the engine.
  expect(g.state.pending?.kind).toBe('priority');
  const top = g.state.stack[g.state.stack.length - 1];
  return top === undefined ? undefined : g.state.objects[top]?.stack?.chosenModes;
}

describe('the card is valid', () => {
  test(YETI, () => {
    expect(validateCard(syntheticCard(YETI))).toEqual([]);
  });

  test('random is true when present, and only for a triggered ability choosing one', () => {
    const card = syntheticCard(YETI);
    const face = card.faces[0];
    const trigger = face?.abilities.find((a) => a.kind === 'triggered');
    if (face === undefined || trigger === undefined || trigger.kind !== 'triggered') {
      throw new Error('no trigger');
    }
    const withChoose = (chooseModes: unknown) =>
      ({ ...card, faces: [{ ...face, abilities: [{ ...trigger, chooseModes }] }] }) as never;
    expect(validateCard(withChoose({ min: 1, max: 1, random: false })).length).toBeGreaterThan(0);
    expect(validateCard(withChoose({ min: 1, max: 2, random: true })).length).toBeGreaterThan(0);
    expect(validateCard(withChoose({ min: 0, max: 1, random: true })).length).toBeGreaterThan(0);
    expect(
      validateCard(withChoose({ min: 1, max: 1, random: true, repeatable: true })).length,
    ).toBeGreaterThan(0);
  });
});

describe('"choose one at random"', () => {
  test('one legal mode is chosen without a decision, and the choice is the same for the same seed', () => {
    for (const seed of [1, 2, 3]) {
      const modes = chosenAtCombat(seed, true);
      expect(modes).toHaveLength(1);
      expect(chosenAtCombat(seed, true)).toEqual(modes);
    }
  });

  test('every mode is reachable across seeds', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const m of chosenAtCombat(seed, true) ?? []) seen.add(m);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  test('a mode with no legal target is never chosen (CR 603.3c)', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const m of chosenAtCombat(seed, false) ?? []) seen.add(m);
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });

  test('the mode runs: with the damage mode chosen, the opponent creature takes 2', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const g = scenario()
        .seed(seed)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(YETI)
        .seat(1)
        .library(...LIBRARY)
        .battlefield(BEARS)
        .build();
      g.advanceTo('beginningOfCombat');
      const top = g.state.stack[g.state.stack.length - 1];
      const modes = top === undefined ? undefined : g.state.objects[top]?.stack?.chosenModes;
      g.passAll();
      if (modes?.[0] === 0) g.expect.life(0, 43);
      if (modes?.[0] === 2) g.expect.zone(BEARS, 'graveyard', { seat: 1 });
      if (modes?.[0] === 1) g.expect.life(0, 40);
      g.expect.invariants();
    }
  });
});
