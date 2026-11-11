// "Sacrifice it unless you return an untapped Plains you control to its owner's hand" (Karoo; D-258).
// Pins: CR 118.12a ("[Do something] unless [a player does something else]" means "[A player may do something else].
// If [that player doesn't], [do something]"), CR 118.12 (the "if [a player] doesn't" clause covers a player who
// chose not to pay and one who cannot), CR 608.2d (the controller chooses as the effect resolves, but not an
// option that is impossible), CR 400.3 (a card goes to its owner's hand), CR 614.1c (the land enters tapped),
// CR 701.21a (the land is sacrificed by its controller), CR 603.3 (the enters trigger waits on the stack).
// The guard is general, not Plains-specific: SYNTHETIC Bounce Offer Land ("you may return a creature you control to its
// owner's hand", no "unless") is not asked either when the player controls no creature.
// Cards: SYNTHETIC Plains Karoo (src/cards/fixtures/synthetic-references.ts: no land type of its own), the real
// Plains, Forest and Island.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const KAROO = 'SYNTHETIC Plains Karoo';
const OFFER = 'SYNTHETIC Bounce Offer Land';
const ability = `${KAROO} (ability)`;

function play(g: ScenarioGame) {
  g.act(0).playLand(KAROO);
  g.expect.stack([ability]);
  return g;
}

describe('an untapped Plains is returned', () => {
  test('the only untapped Plains goes to the hand without a question after the player says yes', () => {
    const g = play(
      scenario().seat(0).hand(KAROO).battlefield('Plains', { label: 'plains' }).seat(1).build(),
    );
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    expect(g.object('plains').zone).toBe('hand');
    g.expect.zone(KAROO, 'battlefield', { seat: 0 });
    expect(g.object(KAROO).tapped).toBe(true);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('with several untapped Plains the controller chooses; tapped ones, other lands and the opponent’s are not offered', () => {
    const g = play(
      scenario()
        .seat(0)
        .hand(KAROO)
        .battlefield('Plains', { label: 'a' })
        .battlefield('Plains', { label: 'b' })
        .battlefield('Plains', { label: 'tapped', tapped: true })
        .battlefield('Forest', { label: 'forest' })
        .seat(1)
        .battlefield('Plains', { label: 'theirs' })
        .build(),
    );
    g.passAll();
    g.act(0).accept();
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    expect([...d.legal].sort()).toEqual([g.id('a'), g.id('b')].sort());
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    // A tapped Plains is no answer.
    expect(g.act(0).try.action({ kind: 'choosePermanents', objects: [g.id('tapped')] }).ok).toBe(
      false,
    );
    g.act(0).choosePermanents('b');
    expect(g.object('b').zone).toBe('hand');
    expect(g.object('a').zone).toBe('battlefield');
    expect(g.object('tapped').zone).toBe('battlefield');
    g.expect.zone(KAROO, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('the land is sacrificed unless the Plains is returned', () => {
  test('declining: the land is sacrificed and the Plains stays', () => {
    const g = play(
      scenario().seat(0).hand(KAROO).battlefield('Plains', { label: 'plains' }).seat(1).build(),
    );
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.zone(KAROO, 'graveyard', { seat: 0 });
    expect(g.object('plains').zone).toBe('battlefield');
    g.expect.eventLog([{ kind: 'sacrificed' }]);
    g.expect.invariants();
  });

  test('only tapped Plains: nothing is asked and the land is sacrificed (a tapped Plains cannot be returned)', () => {
    const g = play(
      scenario()
        .seat(0)
        .hand(KAROO)
        .battlefield('Plains', { label: 'tapped', tapped: true })
        .seat(1)
        .build(),
    );
    g.passAll();
    g.expect.noEvent({ kind: 'optionalAnswered' });
    g.expect.zone(KAROO, 'graveyard', { seat: 0 });
    expect(g.object('tapped').zone).toBe('battlefield');
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('no Plains: nothing is asked and the land is sacrificed (the land is no Plains itself)', () => {
    const g = play(
      scenario().seat(0).hand(KAROO).battlefield('Forest').seat(1).battlefield('Plains').build(),
    );
    g.passAll();
    g.expect.noEvent({ kind: 'optionalAnswered' });
    g.expect.zone(KAROO, 'graveyard', { seat: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('nothing else on the battlefield: the land is sacrificed', () => {
    const g = play(scenario().seat(0).hand(KAROO).seat(1).build());
    g.passAll();
    g.expect.zone(KAROO, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('the land taps for {C}{W} when it stays', () => {
  test('after returning a Plains it adds both mana the turn after it entered', () => {
    const g = play(
      scenario().seat(0).hand(KAROO).battlefield('Plains', { label: 'plains' }).seat(1).build(),
    );
    g.passAll();
    g.act(0).accept();
    g.expect.zone(KAROO, 'battlefield', { seat: 0 });
    expect(g.object(KAROO).tapped).toBe(true);
  });
});

describe('a "you may return a creature you control" offer with nothing to return (CR 608.2d)', () => {
  const offerAbility = `${OFFER} (ability)`;

  test('no creature: nothing is asked and the trigger is done', () => {
    const g = scenario().seat(0).hand(OFFER).seat(1).build();
    g.act(0).playLand(OFFER);
    g.expect.stack([offerAbility]);
    g.passAll();
    g.expect.noEvent({ kind: 'optionalAnswered' });
    g.expect.pending('priority', 0);
    g.expect.zone(OFFER, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature: the offer is asked, and a yes returns it', () => {
    const g = scenario()
      .seat(0)
      .hand(OFFER)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .seat(1)
      .build();
    g.act(0).playLand(OFFER);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    expect(g.object('bears').zone).toBe('hand');
    g.expect.invariants();
  });
});

test('the cards are valid', () => {
  expect(validateCard(syntheticCard(KAROO))).toEqual([]);
  expect(validateCard(syntheticCard(OFFER))).toEqual([]);
});
