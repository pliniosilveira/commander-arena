// `TargetSpec.upToThatMany: 'discarded'` (Loamcrafter Faun, CR 603.12, 601.2c, 701.9): "you may discard one or more land cards. When you do, return up to that many target nonland permanent
// cards from your graveyard to your hand." The slot of a reflexive ability that counts the cards discarded (`ifThisWay: 'discarded'`) takes as many targets as were discarded.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';

const RAIDER = 'SYNTHETIC Treasure Raider';

const withAbility = (ability: unknown) => {
  const card = syntheticCard(RAIDER);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, abilities: [ability] }] } as never;
};

const discard = {
  kind: 'discard',
  player: { kind: 'you' },
  count: 0,
  anyNumber: true,
  cards: { types: ['land'] },
};
const slot = (extra: Record<string, unknown>) => ({
  id: 't1',
  what: {
    kind: 'object',
    filter: { zone: 'graveyard', controller: 'you', card: true, notTypes: ['land'] },
  },
  ...extra,
});
const reflexive = (targetSpec: unknown, extra: Record<string, unknown> = {}) => ({
  kind: 'reflexive',
  targets: [targetSpec],
  effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
  ...extra,
});
const seq = (...effects: unknown[]) =>
  withAbility({
    kind: 'triggered',
    trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
    effect: { kind: 'sequence', effects },
  });

describe("upToThatMany 'discarded'", () => {
  test('a slot of a reflexive ability that counts the cards discarded is valid', () => {
    expect(
      validateCard(
        seq(discard, reflexive(slot({ upToThatMany: 'discarded' }), { ifThisWay: 'discarded' })),
      ),
    ).toEqual([]);
  });

  test('it needs ifThisWay discarded: without it, or after a sacrifice only, it is refused', () => {
    expect(
      validateCard(seq(discard, reflexive(slot({ upToThatMany: 'discarded' })))).length,
    ).toBeGreaterThan(0);
  });

  test('the sacrifice form stays refused where nothing was sacrificed, and has no number of its own', () => {
    expect(
      validateCard(
        seq(discard, reflexive(slot({ upToThatMany: true }), { ifThisWay: 'discarded' })),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        seq(
          discard,
          reflexive(slot({ upToThatMany: 'discarded', max: 2 }), { ifThisWay: 'discarded' }),
        ),
      ).length,
    ).toBeGreaterThan(0);
  });

  test('any other value is refused', () => {
    expect(
      validateCard(
        seq(discard, reflexive(slot({ upToThatMany: 'sacrificed' }), { ifThisWay: 'discarded' })),
      ).length,
    ).toBeGreaterThan(0);
  });
});
