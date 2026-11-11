// "Counter target spell unless its controller pays {3}" (D-092 primitive 4).
// Pins: CR 701.6 (Counter): a countered spell is put into its owner's graveyard from the stack; CR
// 118.3, 119.4: a cost that cannot be paid is not paid, so a player who cannot pay the whole cost is
// not asked and the spell is countered; CR 608.2d: the player the effect gives the option decides as
// it resolves, here the controller of the target spell, not the caster of the counter; CR 605.3a:
// mana is paid by tapping sources, as for any cost; CR 608.2b: a target spell that already left the
// stack is an illegal target, so the counter does nothing and nobody is asked.
// Cards: SYNTHETIC Soft Counter ({1}{U}: unless its controller pays {3}), SYNTHETIC Toll Counter
// ({U}: unless it pays 2 life) from src/cards/fixtures/synthetic-references.ts, and the real Grizzly
// Bears, Lightning Bolt, Counterspell, Forest, Island and Mountain.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SOFT = 'SYNTHETIC Soft Counter';
const TOLL = 'SYNTHETIC Toll Counter';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const COUNTERSPELL = 'Counterspell';

/** Seat 0 casts Bears with `forests` Forests (two are tapped); seat 1 answers with `counter`. */
function stackWith(counter: string, forests: number, islands = 2) {
  const g = scenario()
    .seat(0)
    .hand(BEARS)
    .battlefield(...Array.from({ length: forests }, () => 'Forest'))
    .seat(1)
    .hand(counter)
    .battlefield(...Array.from({ length: islands }, () => 'Island'))
    .build();
  g.act(0).cast(BEARS, { pay: true });
  g.act(0).pass();
  g.act(1).cast(counter, { targets: [{ name: BEARS, zone: 'stack' }], pay: true });
  return g;
}

function asked(g: ScenarioGame) {
  const d = g.state.pending;
  if (d?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
  return d;
}

describe('the controller of the target spell is asked, with the ward path', () => {
  test('asked, not the caster of the counter: the question names the cost and the spell', () => {
    const g = stackWith(SOFT, 5);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const d = asked(g);
    expect(d.purpose).toBe('counterUnlessPays');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['3'] }]);
    expect(d.subject).toBe(g.id({ name: BEARS, zone: 'stack' }));
    expect(d.sourceName).toBe(SOFT);
    // Nothing is countered while the question is open.
    g.expect.noEvent({ kind: 'countered' });
    expect(g.act(1).try.action({ kind: 'acceptOptional' }).ok).toBe(false);
  });

  test('paying {3}: the payment is a payMana with the same purpose, and the spell resolves', () => {
    const g = stackWith(SOFT, 5);
    g.passAll();
    g.act(0).accept();
    g.expect.pending('payMana', 0);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected payMana');
    expect(d.purpose).toBe('counterUnlessPays');
    expect(d.totalCost).toEqual(['3']);
    expect(d.subject).toBe(g.id({ name: BEARS, zone: 'stack' }));
    g.act(0).payAuto();
    g.expect.noEvent({ kind: 'countered' });
    g.expect.stack([BEARS]);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(SOFT, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('declining: the spell is countered', () => {
    const g = stackWith(SOFT, 5);
    g.passAll();
    g.act(0).decline();
    g.expect.eventLog([
      { kind: 'optionalAnswered', seat: 0, accepted: false },
      { kind: 'countered' },
    ]);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    g.expect.zone(SOFT, 'graveyard', { seat: 1 });
    g.expect.stack([]);
  });

  test('backing out of the payment with cancel counts as not paying', () => {
    const g = stackWith(SOFT, 5);
    g.passAll();
    g.act(0).accept();
    g.act(0).cancel();
    g.expect.eventLog([{ kind: 'countered' }]);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('a player who cannot pay is not asked: the spell is countered at once (CR 118.3)', () => {
    // Four Forests, two tapped for the Bears: two are left, {3} cannot be paid.
    const g = stackWith(SOFT, 4);
    g.passAll();
    g.expect.eventLog([{ kind: 'countered' }]);
    g.expect.noEvent({ kind: 'optionalAnswered' });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('exactly enough mana: asked, and paying uses all of it', () => {
    const g = stackWith(SOFT, 5);
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    for (const forest of g.find({ name: 'Forest', zone: 'battlefield' })) {
      expect(forest.tapped).toBe(true);
    }
  });
});

describe('the payer is whoever controls the target spell', () => {
  test('the opponent’s spell countered by the active player: the opponent is asked', () => {
    const g = scenario()
      .seat(0)
      .hand(SOFT)
      .battlefield('Island', 'Island')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    g.act(0).cast(SOFT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.act(1).payAuto();
    g.passAll();
    // Paid: the Bolt resolved.
    g.expect.life(0, 37);
  });
});

describe('paying life', () => {
  const build = (life: number) => {
    const g = scenario()
      .seat(0)
      .life(life)
      .hand(BEARS)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .hand(TOLL)
      .battlefield('Island')
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.act(0).pass();
    g.act(1).cast(TOLL, { targets: [{ name: BEARS, zone: 'stack' }], pay: true });
    return g;
  };

  test('accepting pays the life at once and there is no mana to pay', () => {
    const g = build(10);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    expect(asked(g).cost).toEqual([{ kind: 'payLife', amount: 2 }]);
    g.act(0).accept();
    g.expect.life(0, 8);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('with too little life it is countered without a question (CR 119.4)', () => {
    const g = build(1);
    g.passAll();
    g.expect.eventLog([{ kind: 'countered' }]);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.life(0, 1);
  });
});

describe('a target spell that is already gone (CR 608.2b)', () => {
  test('it was countered in response: the counter fizzles and nobody is asked', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .hand(SOFT, COUNTERSPELL)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.act(0).pass();
    g.act(1).cast(SOFT, { targets: [{ name: BEARS, zone: 'stack' }], pay: true });
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: BEARS, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(SOFT, 'graveyard', { seat: 1 });
    g.expect.eventLog([{ kind: 'countered' }, { kind: 'fizzled' }]);
    g.expect.noEvent({ kind: 'optionalAnswered' });
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    expect(g.state.pending?.kind).toBe('priority');
  });
});
