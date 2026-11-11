// Affinity for [text] (CR 702.41), keyword batch 2 (D-116, D-120): "This spell costs {1} less to cast for each
// [text] you control", a cost reduction of the spell itself that `derive-keywords` expands from the keyword (D-095).
// Pins: CR 702.41a (a static ability that functions on the stack; counted for the caster), CR 702.41b (every
// instance applies), CR 601.2f (counted as the total cost is determined; reduces generic mana only), CR 118.7a
// (a reduction never goes below zero and never touches colored mana), CR 601.2a (the spell being cast is on the
// stack, so it does not count itself).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords-2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getLegalActions } from '../src/index';
import { scenario } from '../src/testing/index';

const GOLEM = 'SYNTHETIC Affinity Golem'; // {5} artifact creature, Affinity for artifacts
const SPHINX = 'SYNTHETIC Affinity Sphinx'; // {3}{U}{U}, Affinity for Islands
const TRINKET = 'SYNTHETIC Trinket'; // {1} artifact
const SOL = 'Sol Ring'; // {1} artifact

function castable(g: ReturnType<ReturnType<typeof scenario>['build']>, card: string): boolean {
  return getLegalActions(g.state, 0).some(
    (a) => a.kind === 'castSpell' && g.state.objects[a.object] === g.object(card),
  );
}

describe('CR 702.41a: costs {1} less for each [text] you control', () => {
  test('each artifact you control takes {1} off the generic cost, counted when it is cast', () => {
    for (const artifacts of [0, 1, 3, 5]) {
      const lands = 5 - artifacts;
      const g = scenario()
        .seat(0)
        .hand(GOLEM)
        .battlefield(...Array.from({ length: artifacts }, () => TRINKET))
        .battlefield(...Array.from({ length: lands }, () => 'Mountain'))
        .seat(1)
        .build();
      // Never more than {5} of mana paid in total: the artifacts are not sources of mana.
      g.act(0).cast(GOLEM);
      const d = g.state.pending;
      if (artifacts === 5) {
        // {5} reduced by 5: nothing to pay, the cast goes through with no payment question.
        expect(d?.kind).toBe('priority');
        g.expect.stack([GOLEM]);
      } else {
        if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
        expect(d.totalCost).toEqual([String(5 - artifacts)]);
      }
    }
  });

  test('the artifacts are not tapped or spent: they only reduce the cost, and the lands pay the rest', () => {
    const g = scenario()
      .seat(0)
      .hand(GOLEM)
      .battlefield(TRINKET, TRINKET, 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .build();
    g.act(0).cast(GOLEM);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected payMana');
    expect(d.totalCost).toEqual(['3']);
    g.act(0).payAuto();
    g.expect.stack([GOLEM]);
    for (const mountain of g.find({ name: 'Mountain', zone: 'battlefield', seat: 0 })) {
      g.expect.tapped(mountain.id, true);
    }
    for (const trinket of g.find({ name: TRINKET, zone: 'battlefield', seat: 0 })) {
      g.expect.tapped(trinket.id, false);
    }
  });

  test('colored mana is not reduced, only the generic part (CR 118.7a)', () => {
    const g = scenario()
      .seat(0)
      .hand(SPHINX)
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .build();
    // {3}{U}{U}: three Islands count, so it costs {U}{U} (not {U}{U} less anything else).
    g.act(0).cast(SPHINX);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected payMana');
    expect([...d.totalCost].sort()).toEqual(['U', 'U']);
    g.act(0).payAuto();
    g.expect.stack([SPHINX]);
  });

  test('a reduction never goes below zero, and with more Islands than generic mana the colored part stays', () => {
    const g = scenario()
      .seat(0)
      .hand(SPHINX)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(SPHINX);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected payMana');
    expect([...d.totalCost].sort()).toEqual(['U', 'U']);
  });

  test('legal actions: castable exactly when the reduced cost can be paid', () => {
    const none = scenario().seat(0).hand(GOLEM).battlefield('Mountain', 'Mountain').seat(1).build();
    expect(castable(none, GOLEM)).toBe(false);
    const some = scenario()
      .seat(0)
      .hand(GOLEM)
      .battlefield('Mountain', 'Mountain', TRINKET, SOL, TRINKET)
      .seat(1)
      .build();
    // Three artifacts (Sol Ring too): {2} left, and the Sol Ring taps for two of them anyway.
    expect(castable(some, GOLEM)).toBe(true);
  });

  test('the card in hand shows the reduced cost in the view (D-095)', () => {
    const g = scenario().seat(0).hand(GOLEM).battlefield(TRINKET, TRINKET).seat(1).build();
    const view = g.view(0);
    const card = view.seats[0]?.hand?.find((o) => o.name === GOLEM);
    expect(card?.castCost).toEqual(['3']);
  });

  test("only what you control counts, not the opponent's artifacts and not the spell itself", () => {
    const g = scenario()
      .seat(0)
      .hand(GOLEM)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .battlefield(TRINKET, TRINKET, TRINKET)
      .build();
    g.act(0).cast(GOLEM);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected payMana');
    expect(d.totalCost).toEqual(['5']);
  });

  test('two instances each apply (CR 702.41b), and cancelling the cast restores everything', () => {
    const def = singleFace({
      name: 'SYNTHETIC Test Double Affinity',
      manaCost: ['6'],
      types: ['artifact', 'creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: 'Affinity for artifacts. Affinity for artifacts.',
      abilities: [
        { kind: 'keyword', keyword: { kind: 'affinity', filter: { types: ['artifact'] } } },
        { kind: 'keyword', keyword: { kind: 'affinity', filter: { types: ['artifact'] } } },
      ],
    });
    const g = scenario()
      .seat(0)
      .define(def)
      .hand('SYNTHETIC Test Double Affinity')
      .battlefield(TRINKET, TRINKET, 'Mountain', 'Mountain')
      .seat(1)
      .build();
    const before = g.positionHash();
    g.act(0).cast('SYNTHETIC Test Double Affinity');
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected payMana');
    // 2 artifacts, counted by each of the two instances: {6} less 4.
    expect(d.totalCost).toEqual(['2']);
    g.act(0).cancel();
    g.expect.position(before);
  });

  test('an artifact creature with affinity counts itself once it is on the battlefield, not while cast', () => {
    const g = scenario()
      .seat(0)
      .hand(GOLEM)
      .battlefield(...Array(5).fill('Mountain'))
      .seat(1)
      .build();
    g.act(0).cast(GOLEM);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected payMana');
    expect(d.totalCost).toEqual(['5']);
  });
});
