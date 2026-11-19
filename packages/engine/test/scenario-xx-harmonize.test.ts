// Harmonize (CR 702.180): "You may cast this card from your graveyard by paying [cost] and tapping up to one untapped creature you control rather
// than paying this spell's mana cost", "its total cost is reduced by an amount of generic mana equal to the tapped creature's power" and "exile this card
// instead of putting it anywhere else any time it would leave the stack".
// Pins: CR 702.180a, 702.180b (the creature is chosen as the harmonize cost is, and tapped as the total cost is paid), CR 118.9 (an alternative cost),
// CR 107.3a (an {X} in the cost is the X announced), CR 601.2b, 601.2f-h (casting; a reduction never goes below zero and never touches coloured mana),
// CR 302.6 (summoning sickness does not stop a creature from being tapped for a cost that is not its own {T} ability), CR 733 (cancel rewinds).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-alt-costs.ts) except the real filler cards.
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, syntheticCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SURGE = 'SYNTHETIC Harmonize Surge'; // {X}{R}{R} sorcery, each opponent loses X; harmonize {X}{R}{R}
const DRAIN = 'SYNTHETIC Harmonize Drain'; // {1}{B} sorcery, each opponent loses 3; harmonize {3}{B}
const BOLT = 'SYNTHETIC Harmonize Bolt'; // {R} instant, 1 damage to an opponent's creature; harmonize {R}

const harmonizeOptions = (g: ScenarioGame, seat: 0 | 1 = 0) =>
  getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'harmonize',
  );

const tapped = (g: ScenarioGame, name: string) =>
  g.find({ name, zone: 'battlefield' }).filter((o) => o.tapped).length;

describe('what is offered (CR 702.180a)', () => {
  test('the cards are valid; in the graveyard one is cast with the alternative, not plainly', () => {
    for (const name of [SURGE, DRAIN, BOLT]) expect(syntheticCard(name).support).toBe('supported');
    const g = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .build();
    const id = g.id({ name: DRAIN, zone: 'graveyard' });
    expect(harmonizeOptions(g)).toEqual([
      { kind: 'castSpell', object: id, alternative: 'harmonize' },
    ]);
    expect(applyAction(g.state, 0, { kind: 'castSpell', object: id }).ok).toBe(false);
    const flash = applyAction(g.state, 0, {
      kind: 'castSpell',
      object: id,
      alternative: 'flashback',
    });
    expect(flash.ok).toBe(false);
  });

  test('not from the hand, not from the opponent graveyard', () => {
    const hand = scenario().seat(0).hand(DRAIN).battlefield('Swamp', { count: 4 }).seat(1).build();
    expect(harmonizeOptions(hand)).toEqual([]);
    const id = hand.id(DRAIN);
    expect(
      applyAction(hand.state, 0, { kind: 'castSpell', object: id, alternative: 'harmonize' }).ok,
    ).toBe(false);
    const theirs = scenario()
      .seat(0)
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .graveyard(DRAIN)
      .build();
    expect(harmonizeOptions(theirs)).toEqual([]);
  });

  test('the cost must be payable; a creature to tap counts for it, a tapped creature does not', () => {
    // {3}{B} with three lands is one short; a 2-power creature to tap makes it {1}{B}.
    const poor = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .build();
    expect(harmonizeOptions(poor)).toEqual([]);
    const helped = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp', { count: 2 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();
    expect(harmonizeOptions(helped)).toHaveLength(1);
    const spent = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp', { count: 2 })
      .battlefield('Grizzly Bears', { tapped: true })
      .seat(1)
      .build();
    expect(harmonizeOptions(spent)).toEqual([]);
  });

  test('a creature that taps for mana cannot do both: its power is not counted if it is needed for the mana', () => {
    // {3}{B} with two lands and a 1-power mana creature: tapping it for the cost leaves {2}{B} and two lands, tapping it for mana leaves {3}{B} and three.
    const g = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp', { count: 2 })
      .battlefield('Llanowar Elves')
      .seat(1)
      .build();
    expect(harmonizeOptions(g)).toEqual([]);
  });

  test('timing is the card own: a sorcery only at sorcery speed, an instant any time', () => {
    const at = (step: 'precombatMain' | 'upkeep') =>
      scenario()
        .seat(0)
        .graveyard(DRAIN)
        .battlefield('Swamp', { count: 4 })
        .seat(1)
        .at(step, { active: 0, priority: 0 })
        .build();
    expect(harmonizeOptions(at('precombatMain'))).toHaveLength(1);
    expect(harmonizeOptions(at('upkeep'))).toEqual([]);
    const bolt = scenario()
      .seat(0)
      .graveyard(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Giant Spider')
      .at('upkeep', { active: 1, priority: 0 })
      .build();
    expect(harmonizeOptions(bolt)).toHaveLength(1);
  });
});

describe('tapping a creature to reduce the cost (CR 702.180a, 702.180b)', () => {
  const board = () =>
    scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp')
      .battlefield('Serra Angel')
      .seat(1)
      .build();

  test('the creature is chosen as the cost is announced, tapped, and its power comes off the generic mana', () => {
    const g = board();
    const cast = g.act(0).cast(DRAIN, { alternative: 'harmonize' });
    expect(cast.stage).toBe('harmonize');
    g.expect.pending('choosePermanent', 0);
    expect(tapped(g, 'Serra Angel')).toBe(0);
    g.act(0).choosePermanents('Serra Angel');
    // {3}{B} less 4 generic is {B}: one land pays.
    g.expect.tapped('Serra Angel');
    g.expect.pending('payMana', 0);
    expect(g.state.casting?.totalCost).toEqual(['B']);
    g.act(0).payAuto();
    expect(tapped(g, 'Swamp')).toBe(1);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(DRAIN, 'exile');
    g.expect.noObject(DRAIN, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('a smaller reduction leaves generic mana: a 2-power creature makes {3}{B} into {1}{B}', () => {
    const g = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp', { count: 2 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).cast(DRAIN, { alternative: 'harmonize' });
    g.act(0).choosePermanents('Grizzly Bears');
    expect(g.state.casting?.totalCost).toEqual(['1', 'B']);
    g.act(0).payAuto();
    expect(tapped(g, 'Swamp')).toBe(2);
  });

  test('"up to one": choosing none pays the whole cost in mana and taps nothing', () => {
    const g = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp', { count: 4 })
      .battlefield('Serra Angel')
      .seat(1)
      .build();
    g.act(0).cast(DRAIN, { alternative: 'harmonize' });
    g.act(0).choosePermanents();
    expect(g.state.casting?.totalCost).toEqual(['3', 'B']);
    g.act(0).payAuto();
    g.expect.tapped('Serra Angel', false);
    expect(tapped(g, 'Swamp')).toBe(4);
  });

  test('only an untapped creature you control is offered; a creature that just entered can be tapped (CR 302.6)', () => {
    const g = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp')
      .battlefield('Serra Angel', { fresh: true })
      .battlefield('Typhoid Rats', { tapped: true })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.act(0).cast(DRAIN, { alternative: 'harmonize' });
    const d = g.state.pending;
    expect(d?.kind === 'choosePermanent' ? d.legal : []).toEqual([g.id('Serra Angel')]);
    expect(d?.kind === 'choosePermanent' ? [d.min, d.max] : []).toEqual([0, 1]);
    // Another answer is refused.
    expect(
      g.act(0).try.action({ kind: 'choosePermanents', objects: [g.id('Giant Spider')] }).ok,
    ).toBe(false);
    expect(
      g.act(0).try.action({ kind: 'choosePermanents', objects: [g.id('Typhoid Rats')] }).ok,
    ).toBe(false);
  });

  test('nothing is asked when the cost has no generic mana to reduce, or no creature qualifies', () => {
    const noGeneric = scenario()
      .seat(0)
      .graveyard(BOLT)
      .battlefield('Mountain')
      .battlefield('Serra Angel')
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    const cast = noGeneric.act(0).cast(BOLT, { alternative: 'harmonize' });
    expect(cast.stage).toBe('targets');
    noGeneric.expect.tapped('Serra Angel', false);
    const noCreature = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .build();
    expect(noCreature.act(0).cast(DRAIN, { alternative: 'harmonize' }).stage).toBe('payment');
  });

  test('cancelling after the creature was tapped gives the exact state back (CR 733)', () => {
    const g = board();
    const before = g.positionHash();
    g.act(0).cast(DRAIN, { alternative: 'harmonize' });
    g.act(0).choosePermanents('Serra Angel');
    g.expect.tapped('Serra Angel');
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.tapped('Serra Angel', false);
    g.expect.zone(DRAIN, 'graveyard', { seat: 0 });
    // Cancelling at the question itself works too.
    g.act(0).cast(DRAIN, { alternative: 'harmonize' });
    g.act(0).cancel();
    g.expect.position(before);
  });
});

describe('X in the harmonize cost (CR 107.3a, 702.180a)', () => {
  const board = () =>
    scenario()
      .seat(0)
      .graveyard(SURGE)
      .battlefield('Mountain', { count: 3 })
      .battlefield('Serra Angel')
      .seat(1)
      .build();

  test('X is announced after the creature is chosen, and the reduction makes room for it', () => {
    const g = board();
    g.act(0).cast(SURGE, { alternative: 'harmonize' });
    g.act(0).choosePermanents('Serra Angel');
    // {X}{R}{R}: three lands pay {R}{R} and one X; the creature's 4 generic mana pay four more.
    const d = g.state.pending;
    expect(d?.kind === 'chooseX' ? [d.min, d.max] : []).toEqual([0, 5]);
    g.act(0).chooseX(5);
    expect(g.state.casting?.totalCost).toEqual(['1', 'R', 'R']);
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(1, 35);
    g.expect.zone(SURGE, 'exile');
  });

  test('without the creature the whole X is paid in mana', () => {
    const g = board();
    g.act(0).cast(SURGE, { alternative: 'harmonize' });
    g.act(0).choosePermanents();
    const d = g.state.pending;
    expect(d?.kind === 'chooseX' ? d.max : -1).toBe(1);
    g.act(0).chooseX(1);
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(1, 39);
  });

  test('the reduction never touches coloured mana: with X = 0 the cost is still {R}{R}', () => {
    const g = scenario()
      .seat(0)
      .graveyard(SURGE)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Serra Angel')
      .seat(1)
      .build();
    g.act(0).cast(SURGE, { alternative: 'harmonize' });
    g.act(0).choosePermanents('Serra Angel');
    // The 4 reduction pays X = 4 at most; two lands pay {R}{R}.
    const d = g.state.pending;
    expect(d?.kind === 'chooseX' ? d.max : -1).toBe(4);
    g.act(0).chooseX(0);
    expect(g.state.casting?.totalCost).toEqual(['R', 'R']);
  });
});

describe('leaving the stack (CR 702.180a)', () => {
  test('a harmonize spell that is countered is exiled, not put in the graveyard', () => {
    const g = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(DRAIN, { alternative: 'harmonize', pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [{ name: DRAIN, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
    g.expect.zone(DRAIN, 'exile');
    g.expect.noObject(DRAIN, { zone: 'graveyard' });
  });

  test('a harmonize spell that fizzles is exiled, and an ordinary cast of the card from the hand still goes to the graveyard', () => {
    const g = scenario()
      .seat(0)
      .graveyard(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears', 'Island')
      .hand('Unsummon')
      .build();
    g.act(0).cast(BOLT, { alternative: 'harmonize', targets: ['Grizzly Bears'], pay: true });
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'exile');
    const hand = scenario().seat(0).hand(DRAIN).battlefield('Swamp', { count: 2 }).seat(1).build();
    hand.act(0).cast(DRAIN, { pay: true });
    hand.passAll();
    hand.expect.zone(DRAIN, 'graveyard', { seat: 0 });
  });

  test('exiled, the card is gone for good: nothing is offered from exile and the log says it was cast with harmonize', () => {
    const g = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .build();
    const mark = g.mark();
    g.act(0).cast(DRAIN, { alternative: 'harmonize', pay: true });
    g.expect.eventLog(
      [
        { kind: 'zoneChanged', fromZone: 'graveyard', toZone: 'stack' },
        { kind: 'spellCast', seat: 0, fromZone: 'graveyard', alternative: 'harmonize' },
      ],
      { since: mark },
    );
    g.passAll();
    g.expect.zone(DRAIN, 'exile');
    expect(g.legalActions(0).some((a) => a.kind === 'castSpell')).toBe(false);
    g.expect.invariants();
  });
});
