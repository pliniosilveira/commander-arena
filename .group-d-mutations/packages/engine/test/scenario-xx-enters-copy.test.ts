// "As this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste" (D-151): the
// replacement `entersAsCopy`.
// Pins: CR 614.12 and 707.9 (it enters as the copy, so what triggers as it enters sees the copy), CR 707.2 (copiable values), CR 707.9b (an exception
// of the copy effect: haste), CR 611.2 (until end of turn: it is the artifact again afterwards), CR 400.7. Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-dragons-enters.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const MIRROR = 'SYNTHETIC Cursed Looking Glass';
const OGRE = 'SYNTHETIC Gleeful Ogre';
const GOBLIN = 'Raging Goblin';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(
    scenario()
      .seat(0)
      .library(...LIBRARY),
  )
    .seat(1)
    .library(...LIBRARY)
    .build();

const FOUR = ['Mountain', 'Mountain', 'Mountain', 'Mountain'] as const;

describe('the card is valid', () => {
  test('the Looking Glass, and the shapes that are refused', () => {
    expect(validateCard(syntheticCard(MIRROR))).toEqual([]);
    const card = syntheticCard(MIRROR);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withRule = (rule: Record<string, unknown>) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'replacement',
                replacement: {
                  kind: 'entersAsCopy',
                  what: { types: ['creature'] },
                  duration: 'untilEndOfTurn',
                  ...rule,
                },
              },
            ],
          },
        ],
      }) as never;
    expect(validateCard(withRule({}))).toEqual([]);
    expect(validateCard(withRule({ duration: 'forever' })).length).toBeGreaterThan(0);
    expect(
      validateCard(withRule({ what: { types: ['creature'], zone: 'graveyard' } })).length,
    ).toBeGreaterThan(0);
    expect(validateCard(withRule({ gains: [] })).length).toBeGreaterThan(0);
    expect(validateCard(withRule({ gains: [{ kind: 'ward', cost: 1 }] })).length).toBeGreaterThan(
      0,
    );
    expect(validateCard(withRule({ optional: false })).length).toBeGreaterThan(0);
  });

  test('only one question as it enters', () => {
    const card = syntheticCard(MIRROR);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const rule = face.abilities[0];
    const two = { ...card, faces: [{ ...face, abilities: [rule, rule] }] } as never;
    expect(JSON.stringify(validateCard(two))).toContain('at most one ability may ask a question');
  });
});

describe('the copy', () => {
  test('I am asked which creature, with every creature on the battlefield legal, and it becomes it', () => {
    const g = game((b) =>
      b
        .hand(MIRROR)
        .battlefield(...FOUR)
        .battlefield(BEARS)
        .battlefield(GOBLIN),
    );
    g.act(0).cast(MIRROR, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    if (d?.kind !== 'choosePermanent') return;
    expect(d.purpose).toBe('entersCopy');
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents(BEARS);
    g.expect.pt(MIRROR, 2, 2);
    g.expect.derived(MIRROR, { types: ['creature'], subtypes: ['Bear'], keywords: ['haste'] });
    g.expect.invariants();
  });

  test('the exception: a copy of a creature without haste has haste', () => {
    const g = game((b) =>
      b
        .hand(MIRROR)
        .battlefield(...FOUR)
        .battlefield(BEARS),
    );
    g.act(0).cast(MIRROR, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.expect.derived(`${BEARS}[0]`, { keywords: [] });
    g.expect.derived(`${BEARS}[1]`, { keywords: ['haste'] });
  });

  test('what triggers as it enters is what the copy has: the Ogre gains me 3 life', () => {
    const g = game((b) =>
      b
        .hand(MIRROR)
        .battlefield(...FOUR)
        .battlefield(OGRE),
    );
    g.act(0).cast(MIRROR, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(OGRE);
    g.passAll();
    g.expect.life(0, 43);
    g.expect.pt(MIRROR, 4, 4);
  });

  test('declining leaves an artifact', () => {
    const g = game((b) =>
      b
        .hand(MIRROR)
        .battlefield(...FOUR)
        .battlefield(BEARS),
    );
    g.act(0).cast(MIRROR, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.derived(MIRROR, { types: ['artifact'], keywords: [] });
    g.expect.life(0, 40);
  });

  test('with no creature on the battlefield there is no question', () => {
    const g = game((b) => b.hand(MIRROR).battlefield(...FOUR));
    g.act(0).cast(MIRROR, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.derived(MIRROR, { types: ['artifact'] });
  });

  test('a creature of the opponent can be copied', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MIRROR)
      .battlefield(...FOUR)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(MIRROR, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    g.act(0).choosePermanents({ name: BEARS, seat: 1 });
    g.expect.pt(`${BEARS}[1]`, 2, 2);
  });

  test('it is the artifact again after the turn ends', () => {
    const g = game((b) =>
      b
        .hand(MIRROR)
        .battlefield(...FOUR)
        .battlefield(BEARS),
    );
    g.act(0).cast(MIRROR, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.expect.derived(MIRROR, { types: ['creature'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(MIRROR, { types: ['artifact'], subtypes: [], keywords: [] });
    g.expect.invariants();
  });

  test('the answer must be one of the creatures', () => {
    const g = game((b) =>
      b
        .hand(MIRROR)
        .battlefield(...FOUR)
        .battlefield(BEARS)
        .battlefield('Forest'),
    );
    g.act(0).cast(MIRROR, { pay: true });
    g.passAll();
    expect(() => g.act(0).choosePermanents('Forest')).toThrow();
    g.expect.pending('choosePermanent', 0);
  });
});
