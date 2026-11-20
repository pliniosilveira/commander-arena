// Regression tests of the two helpers of the hidden-information audit (`hidden-info-audit.ts`), on small hand-built inputs.
import { describe, expect, test } from 'vitest';
import { type PoolState, poolOfOtherSeat, quotedStringsOfStack } from './hidden-info-audit';

const oid = (s: string) => s;
const cid = (s: string) => s;

describe('quotedStringsOfStack', () => {
  const state = {
    stack: [oid('o1'), oid('o2')],
    objects: {
      o1: {
        ability: {
          effect: { effects: [{ kind: 'x' }, { effect: { filter: { subtypes: ['Plains'] } } }] },
        },
      },
      // A spell on the stack has no ability: its name is a visible name already.
      o2: { ability: null },
      // Not on the stack: never read.
      o3: { ability: { subtypes: ['Island'] } },
    },
  };

  test('a land type in the AST of a public stack ability is a public string', () => {
    const strings = quotedStringsOfStack(state.stack, (id) => state.objects[id as 'o1']?.ability);
    expect(strings.has('Plains')).toBe(true);
    expect(strings.has('Island')).toBe(false);
  });

  test('a hand card name is still secret: only the stack ability strings become visible', () => {
    const hiddenNames = ['Plains', 'Secret Tutor'];
    const strings = quotedStringsOfStack(state.stack, (id) => state.objects[id as 'o1']?.ability);
    expect(hiddenNames.filter((n) => !strings.has(n))).toEqual(['Secret Tutor']);
  });
});

describe('poolOfOtherSeat', () => {
  type Mutable = { -readonly [K in keyof PoolState]: PoolState[K] };
  const base = (): Mutable => ({
    objects: {
      h1: { card: cid('c1') },
      l1: { card: cid('c2') },
      d1: { card: cid('c3'), owner: 1, faceDown: true },
      f1: { card: cid('c4'), owner: 1, foretold: true },
      mine: { card: cid('c5'), owner: 1, faceDown: true },
    },
    battlefield: [oid('d1'), oid('mine')],
    phased: [],
    exile: [oid('f1')],
    seats: [
      { id: 0, hand: [], library: [] },
      { id: 1, hand: [oid('h1')], library: [oid('l1')] },
    ],
  });
  const viewer0Controls = (id: string) => id === 'mine';

  test('a face-down permanent the viewer cannot see and a foretold card pool with hand and library', () => {
    const real = poolOfOtherSeat(base(), 1, viewer0Controls);
    expect(real).toEqual(['c1', 'c2', 'c3', 'c4']);
    // The determinized sample deals the pool back into other slots: same multiset, other positions.
    const sample = base();
    sample.objects.h1 = { card: cid('c3') };
    sample.objects.l1 = { card: cid('c4') };
    sample.objects.d1 = { card: cid('c1'), owner: 1, faceDown: true };
    sample.objects.f1 = { card: cid('c2'), owner: 1, foretold: true };
    expect(poolOfOtherSeat(sample, 1, viewer0Controls)).toEqual(real);
  });

  test('a missing, extra or hand-swapped card still differs', () => {
    const real = poolOfOtherSeat(base(), 1, viewer0Controls);
    const swapped = base();
    swapped.objects.h1 = { card: cid('c9') };
    expect(poolOfOtherSeat(swapped, 1, viewer0Controls)).not.toEqual(real);
    const missing = base();
    missing.seats = [
      { id: 0, hand: [], library: [] },
      { id: 1, hand: [], library: [oid('l1')] },
    ];
    expect(poolOfOtherSeat(missing, 1, viewer0Controls)).not.toEqual(real);
    const extra = base();
    extra.objects.l2 = { card: cid('c1') };
    extra.seats = [
      { id: 0, hand: [], library: [] },
      { id: 1, hand: [oid('h1')], library: [oid('l1'), oid('l2')] },
    ];
    expect(poolOfOtherSeat(extra, 1, viewer0Controls)).not.toEqual(real);
  });

  test('without the pooling, a face-down card compared on hand and library alone would differ', () => {
    const sample = base();
    sample.objects.h1 = { card: cid('c3') };
    sample.objects.d1 = { card: cid('c1'), owner: 1, faceDown: true };
    const handLibrary = (s: Mutable) =>
      (s.seats[1]?.hand.concat(s.seats[1].library) ?? []).map((id) => s.objects[id]?.card).sort();
    expect(handLibrary(sample)).not.toEqual(handLibrary(base()));
    expect(poolOfOtherSeat(sample, 1, viewer0Controls)).toEqual(
      poolOfOtherSeat(base(), 1, viewer0Controls),
    );
  });
});
