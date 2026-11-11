// Extort (CR 702.101), keyword batch 2 (D-116, D-120): "Whenever you cast a spell, you may pay {W/B}. If you do,
// each opponent loses 1 life and you gain life equal to the total life lost this way." `derive` expands the
// keyword into a triggered ability whose effect is `mayPay`: the same question and payment as Ward's.
// Pins: CR 702.101a, 702.101b (each instance triggers separately), CR 603.2 and 601.2i (a cast spell is the
// event; the trigger goes on the stack above the spell and resolves first, CR 405.5), CR 118.3 (a cost that
// cannot be paid is not paid: nobody is asked), CR 107.4e (a hybrid symbol is paid with either color), CR
// 119.3 and 119.4 (life lost and gained), CR 608.2c (the instructions run in order).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords-2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const PRIEST = 'SYNTHETIC Extort Priest';
const BOLT = 'Lightning Bolt';
const ISAMARU = 'Isamaru, Hound of Konda'; // {W}

function resolveTop(g: ScenarioGame): void {
  g.pass();
  g.pass();
}

/** Seat 0 controls the priest and `lands`; casts Lightning Bolt at the opponent with its Mountain. */
function board(lands: readonly string[], priests = [PRIEST]) {
  const g = scenario()
    .seat(0)
    .life(20)
    .battlefield(...priests, 'Mountain', ...lands)
    .hand(BOLT, ISAMARU)
    .library('Island', 'Island')
    .seat(1)
    .life(20)
    .library('Island', 'Island')
    .build();
  return g;
}

function castBolt(g: ScenarioGame): void {
  g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
}

describe('CR 702.101a: you cast a spell, you may pay {W/B}', () => {
  test('the trigger goes on the stack above the spell and asks the controller first of all', () => {
    const g = board(['Plains']);
    castBolt(g);
    g.expect.stack([`${PRIEST} (ability)`, BOLT]);
    resolveTop(g);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.seat).toBe(0);
    expect(d.purpose).toBe('mayPay');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['W/B'] }]);
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toEqual([
      'acceptOptional',
      'declineOptional',
      'concede',
    ]);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('paying: each opponent loses 1 life and you gain life equal to the life lost', () => {
    const g = board(['Plains']);
    castBolt(g);
    resolveTop(g);
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    expect(d.purpose).toBe('mayPay');
    expect(d.totalCost).toEqual(['W/B']);
    g.act(0).payAuto();
    g.expect.life(1, 19);
    g.expect.life(0, 21);
    g.expect.tapped('Plains');
    g.expect.eventLog([
      { kind: 'optionalAnswered', accepted: true },
      { kind: 'lifeChanged', seat: 1, from: 20, to: 19 },
      { kind: 'lifeChanged', seat: 0, from: 20, to: 21 },
    ]);
    // The Bolt is still on the stack and resolves afterwards.
    g.expect.stack([BOLT]);
    resolveTop(g);
    g.expect.life(1, 16);
  });

  test('declining does nothing, and the Plains stay untapped', () => {
    const g = board(['Plains']);
    castBolt(g);
    resolveTop(g);
    g.act(0).decline();
    g.expect.life(1, 20);
    g.expect.life(0, 20);
    g.expect.tapped('Plains', false);
    g.expect.stack([BOLT]);
    g.expect.eventLog([{ kind: 'optionalAnswered', accepted: false }]);
  });

  test('backing out of the payment is not paying (cancel)', () => {
    const g = board(['Plains']);
    castBolt(g);
    resolveTop(g);
    g.act(0).accept();
    g.act(0).cancel();
    g.expect.life(1, 20);
    g.expect.life(0, 20);
    g.expect.tapped('Plains', false);
  });

  test('a Swamp pays it as well as a Plains (hybrid, CR 107.4e), an Island does not', () => {
    for (const land of ['Swamp', 'Plains']) {
      const g = board([land]);
      castBolt(g);
      resolveTop(g);
      g.act(0).accept();
      g.act(0).payAuto();
      g.expect.life(1, 19);
    }
    // Only an Island and the Mountain that cast the Bolt: nothing can pay, so nobody is asked (CR 118.3).
    const g = board(['Island']);
    castBolt(g);
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 20);
    g.expect.stack([BOLT]);
  });

  test('payManual with the right land works, with a land that cannot pay it is refused', () => {
    const g = board(['Plains', 'Island']);
    castBolt(g);
    resolveTop(g);
    g.act(0).accept();
    const island = g.id({ name: 'Island', zone: 'battlefield', seat: 0 });
    const plains = g.id({ name: 'Plains', zone: 'battlefield', seat: 0 });
    expect(
      g.act(0).try.action({ kind: 'payManual', taps: [{ object: island, abilityIndex: 0 }] }).ok,
    ).toBe(false);
    g.act(0).choose({ kind: 'payManual', taps: [{ object: plains, abilityIndex: 0 }] });
    g.expect.life(1, 19);
  });

  test('the legal actions of every question agree with applyAction', () => {
    const g = board(['Plains']);
    castBolt(g);
    resolveTop(g);
    for (const a of getLegalActions(g.state, 0)) {
      if (a.kind !== 'concede') expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
    g.act(0).accept();
    for (const a of getLegalActions(g.state, 0)) {
      if (a.kind !== 'concede') expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
  });

  test('every spell triggers it, creature spells too, and an opponent casting does not', () => {
    const g = board(['Plains']);
    g.act(0).cast(ISAMARU, { pay: true });
    g.expect.stack([`${PRIEST} (ability)`, ISAMARU]);
    const h = scenario()
      .seat(0)
      .battlefield(PRIEST, 'Plains')
      .seat(1)
      .battlefield('Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 1 })
      .build();
    h.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    h.expect.stack([BOLT]);
    expect(h.state.pendingTriggers).toHaveLength(0);
  });

  test('the Priest is not on the battlefield as it is cast, so casting it does not trigger it', () => {
    const g = scenario().seat(0).hand(PRIEST).battlefield('Plains', 'Plains').seat(1).build();
    g.act(0).cast(PRIEST, { pay: true });
    g.expect.stack([PRIEST]);
  });

  test('two instances on one creature are two triggers, each with its own question (CR 702.101b)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Double Extort',
          manaCost: ['W'],
          types: ['creature'],
          colors: ['W'],
          colorIdentity: ['W', 'B'],
          power: 1,
          toughness: 1,
          oracleText: 'Extort. Extort.',
          abilities: [
            { kind: 'keyword', keyword: { kind: 'extort' } },
            { kind: 'keyword', keyword: { kind: 'extort' } },
          ],
        }),
      )
      .battlefield('SYNTHETIC Test Double Extort', 'Mountain', 'Plains', 'Swamp', 'Plains')
      .hand(BOLT)
      .seat(1)
      .life(20)
      .build();
    castBolt(g);
    expect(g.state.stack).toHaveLength(3);
    // Pay the first, decline the second.
    resolveTop(g);
    g.act(0).accept();
    g.act(0).payAuto();
    resolveTop(g);
    g.act(0).decline();
    g.expect.life(1, 19);
    g.expect.life(0, 21);
    // Another game: pay both.
    const h = scenario()
      .seat(0)
      .life(20)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Double Extort',
          manaCost: ['W'],
          types: ['creature'],
          colors: ['W'],
          colorIdentity: ['W', 'B'],
          power: 1,
          toughness: 1,
          oracleText: 'Extort. Extort.',
          abilities: [
            { kind: 'keyword', keyword: { kind: 'extort' } },
            { kind: 'keyword', keyword: { kind: 'extort' } },
          ],
        }),
      )
      .battlefield('SYNTHETIC Test Double Extort', 'Mountain', 'Plains', 'Swamp', 'Plains')
      .hand(BOLT)
      .seat(1)
      .life(20)
      .build();
    castBolt(h);
    resolveTop(h);
    h.act(0).accept();
    h.act(0).payAuto();
    resolveTop(h);
    h.act(0).accept();
    h.act(0).payAuto();
    h.expect.life(1, 18);
    h.expect.life(0, 22);
  });

  test('two creatures with extort: two triggers of one spell, the same ability, no ordering question', () => {
    const g = board(['Plains', 'Swamp'], [PRIEST, PRIEST]);
    castBolt(g);
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(3);
  });

  test('the payer cannot pay once the mana is gone: the second question is not asked', () => {
    const g = board(['Plains'], [PRIEST, PRIEST]);
    castBolt(g);
    resolveTop(g);
    g.act(0).accept();
    g.act(0).payAuto();
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 19);
    g.expect.life(0, 21);
  });

  test('the life gained is the life lost: an opponent that cannot lose life changes nothing here', () => {
    // CR 702.101a reads the life lost; with the engine's one opponent it is always 1.
    const g = board(['Plains']);
    castBolt(g);
    resolveTop(g);
    g.act(0).accept();
    g.act(0).payAuto();
    expect(g.state.seats[0]?.life).toBe(21);
    expect(g.state.seats[1]?.life).toBe(19);
  });
});
