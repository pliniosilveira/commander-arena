// Casting is a transaction (SPEC 17.1 A3, D-003).
// Pins: CR 601.2 (Casting Spells) as sub-decisions; CR 733 (Handling Illegal Actions): an illegal
// or abandoned cast is rewound to the state before it began. Cancelling at the targets stage and at
// the payment stage must give back exactly the position from before the cast: the card in its old
// zone with its old object id, no commander-tax change, nothing tapped, nothing on the stack.
// The position hash ignores only `actionCount`, which keeps counting the actions in the log.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

function bolt() {
  return scenario()
    .seat(0)
    .hand('Lightning Bolt', { label: 'bolt' })
    .battlefield('Mountain', 'Grizzly Bears')
    .pool('R')
    .seat(1)
    .battlefield('Llanowar Elves')
    .build();
}

describe('CR 733 (Handling Illegal Actions): cancelling restores the exact prior state', () => {
  test('at the targets stage', () => {
    const g = bolt();
    const before = g.positionHash();
    const object = g.id('bolt');
    g.act(0).cast('bolt');
    g.expect.pending('targets', 0);
    g.expect.stack(['Lightning Bolt']);
    g.act(0).cancel();
    g.expect.position(before);
    expect(g.id('bolt')).toBe(object);
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('at the payment stage', () => {
    const g = bolt();
    const before = g.positionHash();
    g.act(0).cast('bolt', { targets: [{ player: 1 }] });
    g.expect.pending('payMana', 0);
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.zone('Lightning Bolt', 'hand', { seat: 0 });
  });

  test('the pool and the lands are as they were: nothing was paid', () => {
    const g = bolt();
    g.act(0)
      .cast('bolt', { targets: [{ player: 1 }] })
      .cancel();
    g.expect.pool(0, 'R');
    g.expect.tapped('Mountain', false);
  });

  test('the legal actions after the cancel are the legal actions before the cast', () => {
    const g = bolt();
    const before = JSON.stringify(g.legalActions(0));
    g.act(0)
      .cast('bolt', { targets: [{ player: 1 }] })
      .cancel();
    expect(JSON.stringify(g.legalActions(0))).toBe(before);
  });

  test('the same spell can be cast again afterwards, and it resolves', () => {
    const g = bolt();
    g.act(0)
      .cast('bolt', { targets: [{ player: 1 }] })
      .cancel();
    g.act(0).cast('bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('a different target can be chosen on the second try', () => {
    const g = bolt();
    g.act(0)
      .cast('bolt', { targets: [{ player: 1 }] })
      .cancel();
    g.act(0).cast('bolt', { targets: [{ name: 'Llanowar Elves' }], pay: true });
    g.passAll();
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
  });

  test('decision ids are restored too, so the replayed decision is the same', () => {
    const g = bolt();
    const id = g.state.pending?.id;
    g.act(0).cast('bolt').cancel();
    expect(g.state.pending?.id).toBe(id);
    expect(g.state.nextDecisionNumber).toBe(1);
  });

  test('the action log keeps every action, so the count is the log length', () => {
    const g = bolt();
    g.act(0)
      .cast('bolt', { targets: [{ player: 1 }] })
      .cancel();
    expect(g.log.map((l) => l.action.kind)).toEqual(['castSpell', 'chooseTargets', 'cancel']);
    expect(g.state.actionCount).toBe(3);
  });

  test('cancel is only offered while casting', () => {
    const g = bolt();
    expect(g.legalActions(0).some((a) => a.kind === 'cancel')).toBe(false);
    g.act(0).cast('bolt');
    expect(g.legalActions(0).some((a) => a.kind === 'cancel')).toBe(true);
    g.act(0).cancel();
    expect(g.act(0).try.action({ kind: 'cancel' })).toMatchObject({ ok: false });
  });
});

describe('CR 733 (Handling Illegal Actions): a cancelled commander cast', () => {
  function commanderCast(casts: number) {
    return scenario()
      .seat(0)
      .commander('Isamaru, Hound of Konda', { casts, label: 'cmd' })
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .build();
  }

  test('the tax counter is untouched and the commander is back in the command zone', () => {
    const g = commanderCast(1);
    const card = g.object('cmd').card;
    if (card === null) throw new Error('no card');
    const object = g.id('cmd');
    const before = g.positionHash();
    g.act(0).cast('cmd').cancel();
    g.expect.position(before);
    expect(g.state.commanderCasts[card]).toBe(1);
    expect(g.id('cmd')).toBe(object);
    g.expect.zone('Isamaru, Hound of Konda', 'command', { seat: 0 });
    g.expect.noObject('Isamaru, Hound of Konda', { zone: 'stack' });
  });

  test('the total cost is locked at the payment stage and dropped on cancel', () => {
    const g = commanderCast(1);
    g.act(0).cast('cmd');
    expect(g.state.casting?.totalCost).toEqual(['W', '2']);
    g.act(0).cancel();
    expect(g.state.casting).toBeNull();
  });
});

describe('CR 601.2 (Casting Spells): the other ways out of a cast', () => {
  test('a payment the engine refuses leaves the cast in progress and the state as it was', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Grizzly Bears')
      .build();
    g.act(0).cast('Murder', { targets: [{ name: 'Grizzly Bears' }] });
    const before = g.hash();
    const short = g.act(0).try.action({
      kind: 'payManual',
      taps: [{ object: g.id('Swamp[0]'), abilityIndex: 0 }],
    });
    expect(short).toMatchObject({ ok: false });
    g.expect.hash(before);
    g.expect.pending('payMana', 0);
  });

  test('an illegal target choice is refused and the targets decision stays', () => {
    const g = bolt();
    g.act(0).cast('bolt');
    const before = g.hash();
    const wrong = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('Mountain'), specId: 't1' }],
    });
    expect(wrong).toEqual({ ok: false, error: 'That is not a legal target' });
    g.expect.hash(before);
    g.expect.pending('targets', 0);
  });

  test('too many or too few targets are refused', () => {
    const g = bolt();
    g.act(0).cast('bolt');
    expect(g.act(0).try.action({ kind: 'chooseTargets', targets: [] })).toMatchObject({
      ok: false,
    });
    expect(
      g.act(0).try.action({
        kind: 'chooseTargets',
        targets: [
          { kind: 'player', seat: 0, specId: 't1' },
          { kind: 'player', seat: 1, specId: 't1' },
        ],
      }),
    ).toMatchObject({ ok: false });
    g.expect.pending('targets', 0);
  });
});
