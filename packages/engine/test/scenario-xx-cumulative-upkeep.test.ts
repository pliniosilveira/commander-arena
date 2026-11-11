// Cumulative upkeep (CR 702.24, D-127): "At the beginning of your upkeep, if this permanent is on the battlefield,
// put an age counter on this permanent. Then you may pay [cost] for each age counter on it. If you don't,
// sacrifice it." `derive` expands the keyword into a triggered ability of the `cumulativeUpkeep` effect, which puts
// the counter and asks the same question as "unless you pay" with the cost repeated once for each counter.
// Pins: CR 702.24a (the whole ability; partial payments are not allowed), CR 702.24b (two instances each count all the
// age counters there are when they resolve), CR 118.3 (a cost that cannot be paid is not paid), CR 119.4 (life
// as a cost), CR 701.9 (discard), CR 603.3 and 608.2b (the ability does nothing for a permanent that left).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-upkeep.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import {
  getLegalActions,
  isFeatureSupported,
  SUPPORTED_FEATURES,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const WALL = 'SYNTHETIC Aging Wall'; // 0/5 defender, cumulative upkeep {1}
const BLOOD = 'SYNTHETIC Aging Bloodline'; // 4/4, cumulative upkeep: pay 1 life
const SCHOLAR = 'SYNTHETIC Aging Scholar'; // 3/3, cumulative upkeep: discard a card
const TWINS = 'SYNTHETIC Aging Twins'; // 2/2 artifact creature, two instances of cumulative upkeep {1}
const GARDEN = 'SYNTHETIC Aging Garden'; // enchantment, cumulative upkeep {G}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 0's upkeep of turn 3, after seat 1's turn 2 (`advanceTo` walks there). */
function toUpkeep(place: (b: Builder) => Builder) {
  const g = place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  )
    .seat(1)
    .library(...FILLER)
    .at('postcombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}
type Game = ReturnType<typeof toUpkeep>;

const resolveTop = (g: Game): void => {
  g.pass();
  g.pass();
};

const ageOf = (g: Game, card: string): number => g.object({ name: card }).counters.age ?? 0;

/** The next upkeep of seat 0, two turns on. */
const nextUpkeep = (g: Game): void => {
  g.advanceTo('upkeep', { turn: 'next' });
  g.advanceTo('upkeep', { turn: 'next' });
};

describe('the trigger (CR 702.24a)', () => {
  test('it triggers at every upkeep of its controller, whenever it came (no intervening "if")', () => {
    const g = toUpkeep((b) => b.battlefield(WALL, 'Plains', 'Plains'));
    g.expect.stack([`${WALL} (ability)`]);
  });

  test('not at the opponent’s upkeep', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WALL)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 2 });
    g.expect.stack([]);
  });

  test('a noncreature permanent has it too', () => {
    const g = toUpkeep((b) => b.battlefield(GARDEN, 'Forest'));
    g.expect.stack([`${GARDEN} (ability)`]);
  });
});

describe('paying 1, then 2, then failing: the cost grows with the age counters (CR 702.24a)', () => {
  test('the first upkeep: an age counter, then {1} to keep it', () => {
    const g = toUpkeep((b) => b.battlefield(WALL, 'Plains', 'Plains', 'Plains'));
    resolveTop(g);
    // The counter is put on first (CR 702.24a: "put an age counter on this permanent. Then you may pay").
    expect(ageOf(g, WALL)).toBe(1);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.seat).toBe(0);
    expect(d.purpose).toBe('unlessPays');
    expect(d.upkeep).toBe('cumulativeUpkeep');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1'] }]);
    g.act(0).accept();
    const p = g.state.pending;
    if (p?.kind !== 'payMana') throw new Error(`expected payMana, got ${p?.kind}`);
    expect(p.upkeep).toBe('cumulativeUpkeep');
    expect(p.totalCost).toEqual(['1']);
    g.act(0).payAuto();
    g.expect.zone(WALL, 'battlefield');
    g.expect.counters(WALL, { age: 1 });
  });

  test('1, then 2, then it cannot be paid and it is sacrificed without a question', () => {
    // Seat 0 has two lands: {1} the first time, {1}{1} the second, {1}{1}{1} the third.
    const g = toUpkeep((b) => b.battlefield(WALL, 'Plains', 'Plains'));
    resolveTop(g);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.counters(WALL, { age: 1 });

    nextUpkeep(g);
    g.expect.step('upkeep', { active: 0, turn: 5 });
    resolveTop(g);
    expect(ageOf(g, WALL)).toBe(2);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.cost).toEqual([
      { kind: 'mana', symbols: ['1'] },
      { kind: 'mana', symbols: ['1'] },
    ]);
    g.act(0).accept();
    const p = g.state.pending;
    if (p?.kind !== 'payMana') throw new Error(`expected payMana, got ${p?.kind}`);
    expect(p.totalCost).toEqual(['1', '1']);
    g.act(0).payAuto();
    g.expect.zone(WALL, 'battlefield');
    g.expect.counters(WALL, { age: 2 });

    nextUpkeep(g);
    g.expect.step('upkeep', { active: 0, turn: 7 });
    resolveTop(g);
    // Three age counters would be {1}{1}{1} and there are two lands: CR 118.3, nobody is asked.
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(WALL, 'graveyard');
    g.expect.eventLog([{ kind: 'counterAdded', counter: 'age', count: 1 }, { kind: 'sacrificed' }]);
  });

  test('declining sacrifices it, after the counter was put on', () => {
    const g = toUpkeep((b) => b.battlefield(WALL, 'Plains', 'Plains'));
    resolveTop(g);
    g.act(0).decline();
    g.expect.zone(WALL, 'graveyard');
    g.expect.eventLog([
      { kind: 'counterAdded', counter: 'age' },
      { kind: 'optionalAnswered', accepted: false },
      { kind: 'sacrificed' },
    ]);
  });

  test('backing out of the payment is not paying: sacrificed, and no partial payment is kept', () => {
    const g = toUpkeep((b) => b.battlefield(WALL, 'Plains', 'Plains'));
    resolveTop(g);
    g.act(0).accept();
    g.act(0).cancel();
    g.expect.zone(WALL, 'graveyard');
    expect(g.state.battlefield.every((id) => g.state.objects[id]?.tapped !== true)).toBe(true);
  });

  test('a permanent that is gone when the ability resolves is not asked about and gets no counter', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(WALL, 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .hand('Unsummon')
      .battlefield('Island')
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.pass(0);
    g.act(1).cast('Unsummon', { targets: [{ name: WALL }], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(WALL, 'hand');
    g.pass();
    g.pass();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.noEvent({ kind: 'counterAdded' });
    g.expect.noEvent({ kind: 'optionalAnswered' });
  });

  test('the legal actions of the question agree with the engine', () => {
    const g = toUpkeep((b) => b.battlefield(WALL, 'Plains', 'Plains'));
    resolveTop(g);
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toEqual([
      'acceptOptional',
      'declineOptional',
      'concede',
    ]);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });
});

describe('costs that are not mana (CR 119.4, 701.9)', () => {
  test('pay 1 life, then 2 life, then 3', () => {
    const g = toUpkeep((b) => b.battlefield(BLOOD));
    resolveTop(g);
    g.act(0).accept();
    g.expect.life(0, 19);
    nextUpkeep(g);
    resolveTop(g);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.cost).toEqual([
      { kind: 'payLife', amount: 1 },
      { kind: 'payLife', amount: 1 },
    ]);
    g.act(0).accept();
    g.expect.life(0, 17);
    g.expect.counters(BLOOD, { age: 2 });
    g.expect.zone(BLOOD, 'battlefield');
  });

  test('with less life than the cost it cannot be paid: sacrificed without a question', () => {
    const g = scenario()
      .seat(0)
      .life(1)
      .battlefield(BLOOD, { counters: { age: 1 } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    resolveTop(g);
    // Two age counters now: 2 life, and the player has 1.
    g.expect.zone(BLOOD, 'graveyard');
    g.expect.life(0, 1);
  });

  test('discard a card, and with more cards than asked the player chooses which', () => {
    const g = toUpkeep((b) => b.battlefield(SCHOLAR).hand('Plains', 'Island', 'Mountain'));
    resolveTop(g);
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.min).toBe(1);
    g.act(0).chooseCards({ name: 'Island' });
    g.expect.zone('Island', 'graveyard');
    g.expect.zone(SCHOLAR, 'battlefield');
    g.expect.handSize(0, 2);
  });

  test('with fewer cards than asked it cannot be paid', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(SCHOLAR, { counters: { age: 1 } })
      .hand('Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    resolveTop(g);
    // Two age counters: two cards to discard, and the upkeep comes before the draw: one card in hand (CR 118.3).
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(SCHOLAR, 'graveyard');
    g.expect.handSize(0, 1);
  });
});

describe('two instances (CR 702.24b)', () => {
  test('each counts all the age counters there are when it resolves: {1}, then {1}{1}', () => {
    const g = toUpkeep((b) => b.battlefield(TWINS, 'Plains', 'Plains', 'Plains'));
    g.expect.stack([`${TWINS} (ability)`, `${TWINS} (ability)`]);
    resolveTop(g);
    expect(ageOf(g, TWINS)).toBe(1);
    const first = g.state.pending;
    if (first?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(first.cost).toEqual([{ kind: 'mana', symbols: ['1'] }]);
    g.act(0).accept();
    g.act(0).payAuto();
    resolveTop(g);
    expect(ageOf(g, TWINS)).toBe(2);
    const second = g.state.pending;
    if (second?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(second.cost).toEqual([
      { kind: 'mana', symbols: ['1'] },
      { kind: 'mana', symbols: ['1'] },
    ]);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.zone(TWINS, 'battlefield');
    g.expect.counters(TWINS, { age: 2 });
  });

  test('not paying either one sacrifices it, and the other ability then does nothing', () => {
    const g = toUpkeep((b) => b.battlefield(TWINS, 'Plains', 'Plains', 'Plains'));
    resolveTop(g);
    g.act(0).decline();
    g.expect.zone(TWINS, 'graveyard');
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.noEvent({ kind: 'optionalAnswered', accepted: true });
  });
});

describe('the engine reports and refuses it honestly (CR 702.24a)', () => {
  test('the keyword and the effect are in SUPPORTED_FEATURES', () => {
    expect(SUPPORTED_FEATURES.keywordKinds).toContain('cumulativeUpkeep');
    expect(SUPPORTED_FEATURES.effectKinds).toContain('cumulativeUpkeep');
    expect(isFeatureSupported('keyword:cumulativeUpkeep')).toBe(true);
    expect(isFeatureSupported('effect:cumulativeUpkeep')).toBe(true);
  });

  const withCost = (cost: unknown) => {
    const base = syntheticCard(WALL);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return {
      ...base,
      faces: [
        { ...face, abilities: [{ kind: 'keyword', keyword: { kind: 'cumulativeUpkeep', cost } }] },
      ],
    } as never;
  };

  test('the fixture cards validate', () => {
    for (const name of [WALL, BLOOD, SCHOLAR, TWINS, GARDEN]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('"Sacrifice a creature" and the other costs the question cannot pay are refused with a reason', () => {
    for (const cost of [
      { kind: 'sacrifice', what: { types: ['creature'] } },
      { kind: 'removeCounters', counter: '+1/+1', count: 1 },
      { kind: 'tap' },
    ]) {
      const result = JSON.stringify(validateCard(withCost([cost])));
      expect(result, cost.kind).toContain(`cost \\"${cost.kind}\\" is not implemented`);
    }
  });

  test('X in the cost is refused', () => {
    expect(JSON.stringify(validateCard(withCost([{ kind: 'mana', symbols: ['X'] }])))).toContain(
      'X in the cost of a keyword',
    );
  });

  test('an empty cost is refused', () => {
    expect(JSON.stringify(validateCard(withCost([])))).toContain('needs a cost to pay');
  });

  test('the effect in a spell is refused', () => {
    const base = syntheticCard(WALL);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const card = {
      ...base,
      faces: [
        {
          ...face,
          types: ['instant'],
          abilities: [],
          spell: {
            effect: { kind: 'cumulativeUpkeep', cost: [{ kind: 'mana', symbols: ['1'] }] },
          },
        },
      ],
    } as never;
    expect(JSON.stringify(validateCard(card))).toContain('ability of a permanent only');
  });
});
