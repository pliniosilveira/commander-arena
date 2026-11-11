// Kicker (CR 702.33): "You may pay an additional [cost] as you cast this spell."
// Pins: CR 702.33a (an optional additional cost, paid by 601.2b and 601.2f-h), CR 601.2b (it is
// announced before targets are chosen), CR 601.2f (the total cost includes it), CR 702.33d (a spell
// whose controller declared the intention to pay it is "kicked"), CR 608.2c (the `kicked` condition
// is read as its instruction runs), CR 113.7a (an ability whose source has left reads its
// last-known information), CR 119.4 (life can be paid only if the life total is at least the
// amount), CR 733 (cancelling rewinds the cast). Cards are SYNTHETIC (src/cards/fixtures).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  applyAction,
  checkInvariants,
  getLegalActions,
  getView,
  stateHash,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { confirmOptionalDecision } from './pending-helpers';

const BEAR = 'SYNTHETIC Kicker Bear';
const BOLT = 'SYNTHETIC Kicker Bolt';
const GAIN = 'SYNTHETIC Kicker Gain';
const LIFE = 'SYNTHETIC Life Kicker';
const DOUBLE = 'SYNTHETIC Double Kicker';
const SEER = 'SYNTHETIC Kicker Seer';
const SPIDER = 'Giant Spider'; // 2/4: survives 2 damage, dies to 4

const tappedLands = (g: ScenarioGame): number =>
  g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped).length +
  g.find({ name: 'Forest', zone: 'battlefield' }).filter((o) => o.tapped).length;

/** Seat 0 with a kicker sorcery and four Mountains against a Giant Spider. */
const bolter = (lands = 4) =>
  scenario()
    .seat(0)
    .hand(BOLT)
    .battlefield('Mountain', { count: lands })
    .seat(1)
    .battlefield(SPIDER)
    .build();

describe('the kicker question (CR 702.33a, 601.2b)', () => {
  test('is asked first, before targets and before anything is paid', () => {
    const g = bolter();
    const mark = g.mark();
    g.act(0).cast(BOLT);
    const d = confirmOptionalDecision(g);
    expect(d.purpose).toBe('kicker');
    expect(d.seat).toBe(0);
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['2'] }]);
    expect(d.sourceName).toBe(BOLT);
    expect(d.sourceOracleText).toContain('Kicker {2}');
    // The spell is on the stack (601.2a) as the question's source; nothing is chosen or paid yet.
    expect(d.source).toBe(g.id({ name: BOLT, zone: 'stack' }));
    expect(g.state.casting?.stage).toBe('kicker');
    expect(tappedLands(g)).toBe(0);
    expect(g.eventsSince(mark).map((e) => e.kind)).toEqual(['zoneChanged']);
    g.expect.invariants();
  });

  test('accepting kicks the spell, then asks for targets, then the total cost', () => {
    const g = bolter();
    g.act(0).cast(BOLT);
    g.act(0).accept();
    g.expect.pending('targets', 0);
    expect(g.state.casting?.stage).toBe('targets');
    expect(getView(g.state, 0).stack[0]?.kicked).toBe(true);
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', specId: 't1', id: g.id(SPIDER) }],
    });
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    // CR 601.2f: the mana cost {1}{R} plus the kicker cost {2}.
    expect(pay.totalCost).toEqual(['1', 'R', '2']);
    g.act(0).payAuto();
    expect(tappedLands(g)).toBe(4);
    g.expect.stack([BOLT]);
  });

  test('a kicked sorcery does the bigger effect: 4 damage kills the 2/4', () => {
    const g = bolter();
    const mark = g.mark();
    g.act(0).cast(BOLT, { kicked: true, targets: [SPIDER], pay: true });
    g.expect.eventLog([{ kind: 'spellCast', seat: 0, kicked: true, fromZone: 'hand' }], {
      since: mark,
    });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('declining casts it unkicked for the plain cost, with the smaller effect', () => {
    const g = bolter();
    const mark = g.mark();
    g.act(0).cast(BOLT, { kicked: false, targets: [SPIDER], pay: true });
    expect(tappedLands(g)).toBe(2);
    expect(getView(g.state, 0).stack[0]?.kicked).toBeUndefined();
    const cast = g.eventsSince(mark).find((e) => e.kind === 'spellCast');
    expect(cast).toBeDefined();
    expect(cast).not.toHaveProperty('kicked');
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.damage(SPIDER, 2);
  });

  test('is not asked when the kicked total cannot be paid: the spell is cast unkicked', () => {
    // Three lands pay {1}{R} but not {1}{R}{2}.
    const g = bolter(3);
    const kinds = g.legalActions(0).map((a) => a.kind);
    expect(kinds).toContain('castSpell'); // still castable, unkicked
    g.act(0).cast(BOLT);
    g.expect.pending('targets', 0);
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', specId: 't1', id: g.id(SPIDER) }],
    });
    g.act(0).payAuto();
    g.passAll();
    g.expect.damage(SPIDER, 2);
  });

  test('is asked with exactly enough mana for the kicked total', () => {
    const g = bolter(4);
    g.act(0).cast(BOLT);
    confirmOptionalDecision(g);
    g.act(0).accept();
    g.expect.pending('targets', 0);
  });

  test('a spell without the keyword is never asked', () => {
    const g = scenario().seat(0).hand('Lightning Bolt').battlefield('Mountain').seat(1).build();
    g.act(0).cast('Lightning Bolt');
    g.expect.pending('targets', 0);
  });
});

describe('cancelling at the question rewinds the cast (CR 733)', () => {
  test('the state is exactly as before the cast, and cancel is a legal answer', () => {
    const g = bolter();
    const before = g.positionHash();
    g.act(0).cast(BOLT);
    expect(g.legalActions(0).map((a) => a.kind)).toEqual([
      'acceptOptional',
      'declineOptional',
      'cancel',
      'concede',
    ]);
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.zone(BOLT, 'hand', { seat: 0 });
    g.expect.pending('priority', 0);
    // And the cast can start again.
    g.act(0).cast(BOLT);
    confirmOptionalDecision(g);
  });

  test('cancelling later, after accepting, also restores the paid life and the unkicked card', () => {
    const g = scenario().seat(0).hand(LIFE).battlefield('Swamp').library('Plains').seat(1).build();
    const before = g.positionHash();
    g.act(0).cast(LIFE, { kicked: true });
    g.expect.pending('payMana', 0);
    g.expect.life(0, 37); // the kicker cost is paid as the total cost is locked in
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.life(0, 40);
  });
});

describe('a kicked permanent remembers it (CR 702.33d, 608.2c)', () => {
  const bear = (lands = 4) =>
    scenario().seat(0).hand(BEAR).battlefield('Forest', { count: lands }).seat(1).build();

  test('kicked: the enters trigger reads the permanent and adds two +1/+1 counters', () => {
    const g = bear();
    g.act(0).cast(BEAR, { kicked: true, pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    expect(g.object(BEAR).kicked).toBe(true);
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEAR)?.kicked).toBe(true);
    g.expect.counters(BEAR, { '+1/+1': 2 });
    g.expect.pt(BEAR, 4, 4);
    expect(tappedLands(g)).toBe(4);
  });

  test('unkicked: the trigger resolves and does nothing', () => {
    const g = bear();
    g.act(0).cast(BEAR, { kicked: false, pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    expect(g.object(BEAR).kicked).toBeUndefined();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEAR)?.kicked).toBeUndefined();
    g.expect.counters(BEAR, {});
    g.expect.pt(BEAR, 2, 2);
    expect(tappedLands(g)).toBe(2);
  });

  test('the fact is the permanent, not the card: a bounced and recast bear starts fresh', () => {
    const g = scenario()
      .seat(0)
      .hand(BEAR, 'Unsummon')
      .battlefield('Forest', { count: 4 })
      .battlefield('Island')
      .seat(1)
      .build();
    g.act(0).cast(BEAR, { kicked: true, pay: true });
    g.passAll();
    expect(g.object(BEAR).kicked).toBe(true);
    g.act(0).cast('Unsummon', { targets: [BEAR], pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'hand', { seat: 0 });
    expect(g.object(BEAR).kicked).toBeUndefined();
  });

  test('"if it was kicked" still reads it when the permanent left before the trigger resolved', () => {
    const g = scenario()
      .seat(0)
      .hand(SEER)
      .battlefield('Island', { count: 3 })
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).cast(SEER, { kicked: true, pay: true });
    g.act(0).pass();
    g.act(1).pass(); // the Seer resolves; its enters trigger goes on the stack
    g.expect.stack([`${SEER} (ability)`]);
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [SEER], pay: true });
    g.passAll(); // Bolt resolves and kills the Seer, then the trigger resolves
    g.expect.zone(SEER, 'graveyard', { seat: 0 });
    g.expect.life(0, 43);
  });

  test('an unkicked Seer left behind gains nothing either', () => {
    const g = scenario().seat(0).hand(SEER).battlefield('Island', { count: 3 }).seat(1).build();
    g.act(0).cast(SEER, { kicked: false, pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });
});

describe('the kicked condition in a replacement as the permanent enters (CR 614.12)', () => {
  // "Kicker {1}. This creature enters tapped unless it was kicked." The condition is read as it
  // enters, when the spell has already left the stack, so it reads its last-known information.
  const lazy = singleFace({
    name: 'SYNTHETIC Test Lazy Bear',
    manaCost: ['G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Kicker {1}. This creature enters tapped unless it was kicked.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1'] }] } },
      {
        kind: 'replacement',
        replacement: { kind: 'entersTapped', unless: { kind: 'kicked' } },
      },
    ],
  });
  const run = (kicked: boolean) => {
    const g = scenario()
      .define(lazy)
      .seat(0)
      .hand(lazy.name)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(lazy.name, { kicked, pay: true });
    g.passAll();
    return g.object(lazy.name);
  };

  test('kicked it enters untapped, unkicked it enters tapped', () => {
    expect(run(true).tapped).toBe(false);
    expect(run(false).tapped).toBe(true);
    expect(validateCard(lazy)).toEqual([]);
  });
});

describe('kicker costs that are life, or mana and life', () => {
  const lifeGame = (life: number) =>
    scenario()
      .seat(0)
      .life(life)
      .hand(LIFE)
      .battlefield('Swamp')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();

  test('a life kicker is paid with the total cost and the spell draws the bigger amount', () => {
    const g = lifeGame(20);
    const mark = g.mark();
    g.act(0).cast(LIFE, { kicked: true, pay: true });
    g.expect.life(0, 17);
    g.expect.eventLog([{ kind: 'lifeChanged', seat: 0, from: 20, to: 17 }, { kind: 'tapped' }], {
      since: mark,
    });
    g.passAll();
    g.expect.handSize(0, 3);
  });

  test('unkicked it pays no life and draws one card', () => {
    const g = lifeGame(20);
    g.act(0).cast(LIFE, { kicked: false, pay: true });
    g.expect.life(0, 20);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('with one more life than the cost it is asked, and paying leaves the player at 1', () => {
    const g = lifeGame(4);
    g.act(0).cast(LIFE);
    confirmOptionalDecision(g);
    g.act(0).accept();
    g.expect.life(0, 1);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.passAll();
    g.expect.handSize(0, 3);
  });

  test('a kicker that takes the whole life total is offered (CR 119.4): paying it leaves the caster at 0', () => {
    const g = lifeGame(3);
    g.act(0).cast(LIFE);
    confirmOptionalDecision(g);
    g.act(0).accept();
    g.expect.life(0, 0);
    g.expect.pending('payMana', 0);
  });

  test('with less life than the kicker costs, it is not asked either', () => {
    const g = lifeGame(2);
    g.act(0).cast(LIFE);
    g.expect.pending('payMana', 0);
    expect(getView(g.state, 0).stack[0]?.kicked).toBeUndefined();
  });

  test('mana and life together: both are paid, the planner sees the life already paid', () => {
    const g = scenario()
      .seat(0)
      .life(2)
      .hand(DOUBLE)
      .battlefield('Forest', 'Forest')
      .library('Plains')
      .seat(1)
      .build();
    g.act(0).cast(DOUBLE, { kicked: true });
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['G', '1']);
    g.expect.life(0, 1);
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(0, 2);
    g.expect.handSize(0, 1);
  });

  test('mana and life together: exactly the life is asked (CR 119.4), one mana short is not', () => {
    const lifeExact = scenario()
      .seat(0)
      .life(1)
      .hand(DOUBLE)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .build();
    lifeExact.act(0).cast(DOUBLE);
    lifeExact.expect.pending('confirmOptional', 0);
    const manaShort = scenario().seat(0).hand(DOUBLE).battlefield('Forest').seat(1).build();
    manaShort.act(0).cast(DOUBLE);
    manaShort.expect.pending('payMana', 0);
  });
});

describe('an instant with an extra effect only when kicked', () => {
  test('the unkicked and kicked halves of one sequence', () => {
    const run = (kicked: boolean) => {
      const g = scenario()
        .seat(0)
        .hand(GAIN)
        .battlefield('Plains', 'Plains')
        .library('Plains')
        .seat(1)
        .build();
      g.act(0).cast(GAIN, { kicked, pay: true });
      g.passAll();
      return { life: g.state.seats[0]?.life, hand: g.state.seats[0]?.hand.length };
    };
    expect(run(false)).toEqual({ life: 42, hand: 0 });
    expect(run(true)).toEqual({ life: 42, hand: 1 });
  });

  test('it is cast at instant speed on the opponent turn, and still asks', () => {
    const g = scenario()
      .seat(0)
      .hand(GAIN)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .at('upkeep', { active: 1, priority: 0 })
      .build();
    g.act(0).cast(GAIN);
    expect(confirmOptionalDecision(g).purpose).toBe('kicker');
  });
});

describe('legal actions and applyAction agree', () => {
  test('every listed answer to the question is accepted and nothing else is', () => {
    const g = bolter();
    g.act(0).cast(BOLT);
    const legal = getLegalActions(g.state, 0);
    for (const action of legal) {
      if (action.kind === 'concede') continue;
      const r = applyAction(g.state, 0, action);
      expect(r.ok, JSON.stringify(action)).toBe(true);
      if (r.ok) expect(checkInvariants(r.state)).toEqual([]);
    }
    for (const action of [
      { kind: 'pass' },
      { kind: 'payAuto' },
      { kind: 'chooseTargets', targets: [] },
    ] as const) {
      expect(applyAction(g.state, 0, action).ok, action.kind).toBe(false);
    }
    // The opponent cannot answer it.
    expect(applyAction(g.state, 1, { kind: 'acceptOptional' }).ok).toBe(false);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('the cast is offered exactly when the unkicked spell can be cast', () => {
    for (const lands of [1, 2, 3, 4, 5]) {
      const g = bolter(lands);
      const offered = g.legalActions(0).some((a) => a.kind === 'castSpell');
      expect(offered, `${lands} lands`).toBe(lands >= 2);
      const cast = applyAction(g.state, 0, { kind: 'castSpell', object: g.id(BOLT) });
      expect(cast.ok, `${lands} lands`).toBe(offered);
      // The question is asked exactly when the kicked total (4 mana) can be paid.
      if (cast.ok) {
        expect(cast.state.pending?.kind === 'confirmOptional', `${lands} lands`).toBe(lands >= 4);
      }
    }
  });
});

describe('replay determinism', () => {
  test('the action log of a kicked cast replays to the same hash', () => {
    const make = () =>
      scenario()
        .seat(0)
        .hand(BEAR)
        .battlefield('Forest', { count: 4 })
        .library('Plains', 'Plains')
        .seat(1)
        .library('Plains', 'Plains')
        .build();
    const g = make();
    g.act(0).cast(BEAR, { kicked: true, pay: true });
    g.passAll();
    const replay = make();
    for (const { seat, action } of g.log) replay.choose(seat, action);
    expect(stateHash(replay.state)).toBe(stateHash(g.state));
    expect(replay.log).toEqual(g.log);
  });
});
