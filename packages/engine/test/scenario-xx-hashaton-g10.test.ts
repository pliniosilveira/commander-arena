// Group 10 of the Hashaton deck (issue 31, D-386 to D-389): "As an additional cost to cast this spell, discard X cards. Return X target creature cards from your
// graveyard to your hand." (Restless Dreams): the cost `discardX` (X announced like "pay X life", D-103) and the target slot `countX` (exactly as many targets as X).
// Pins: CR 107.3a (X in an additional cost is announced as the spell is cast, and equals the announced value everywhere), CR 601.2b (X is announced before the targets, so no X
// larger than the legal targets or the cards in hand is offered), CR 601.2c (targets are chosen before the costs are paid, so a discarded card is no target), CR 601.2f and 601.2h
// (the total cost holds X cards; the discard is paid with the other costs, after the mana), CR 701.9a (a card discarded as a cost triggers "whenever you discard"),
// CR 118.3 (a cost that cannot be paid is not paid: X is limited by the hand), CR 733 (cancel rewinds the whole cast), CR 702.34a (flashback), CR 707.10 (a copy has the X and the
// targets of the spell, no cost is paid for it), CR 608.2b (a target that is no longer legal is skipped). Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g10.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  getLegalActions,
  getView,
  isFeatureSupported,
  syntheticCard,
  validateCard,
} from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision, chooseXDecision, targetsDecision } from './pending-helpers';

const RECALL = 'SYNTHETIC Dream Recall'; // {B} sorcery: discard X cards, return X target creature cards from your graveyard to your hand
const REPLAY = 'SYNTHETIC Dream Replay'; // the same with flashback {2}{B}
const BURN = 'SYNTHETIC Dream Burn'; // {X}{R} sorcery: discard X cards, X damage to any target
const RUMMAGE = 'SYNTHETIC Dream Rummage'; // {1}{U} sorcery: discard X cards, draw X cards
const MOURNER = 'SYNTHETIC Dream Mourner'; // whenever you discard a card, you gain 1 life
const TWIN = 'SYNTHETIC Twin Spell'; // {U}{U}: copy target instant or sorcery spell, new targets may be chosen
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';
const BOLT = 'Lightning Bolt';

const xs = (g: ScenarioGame, seat = 0): number[] =>
  g
    .legalActions(seat)
    .flatMap((a) => (a.kind === 'chooseX' ? [a.value] : []))
    .sort((a, b) => a - b);

/** Seat 0: the spell and `others` in hand, three creature cards in the graveyard, Swamps. */
function recall(others: readonly string[], swamps = 1) {
  return scenario()
    .seat(0)
    .hand(RECALL, ...others)
    .graveyard(BEARS, SPIDER, ELVES)
    .battlefield('Swamp', { count: swamps })
    .seat(1)
    .build();
}

describe('the cards are valid, and the new shapes are what the validator accepts', () => {
  test.each([RECALL, REPLAY, BURN, RUMMAGE, MOURNER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the engine lists what the lowering needs', () => {
    expect(isFeatureSupported('cost:discardX')).toBe(true);
    expect(isFeatureSupported('selector:countX')).toBe(true);
  });

  test('countX and discardX are refused where the engine does not run them', () => {
    const card = syntheticCard(RECALL);
    const face = card.faces[0];
    const spell = face?.spell;
    if (face === undefined || spell === null || spell === undefined) throw new Error('no spell');
    const withFace = (patch: Record<string, unknown>) =>
      ({ ...card, faces: [{ ...face, ...patch }] }) as never;
    const withSpell = (patch: Record<string, unknown>) =>
      withFace({ spell: { ...spell, ...patch } });
    const slot = (extra: Record<string, unknown>) => [{ ...(spell.targets?.[0] ?? {}), ...extra }];
    // X targets need the spell to announce an X.
    expect(validateCard(withSpell({ x: false })).length).toBeGreaterThan(0);
    // No count of its own beside X.
    expect(validateCard(withSpell({ targets: slot({ min: 1 }) })).length).toBeGreaterThan(0);
    expect(validateCard(withSpell({ targets: slot({ max: 2 }) })).length).toBeGreaterThan(0);
    expect(validateCard(withSpell({ targets: slot({ anyNumber: true }) })).length).toBeGreaterThan(
      0,
    );
    // countX must be true.
    expect(validateCard(withSpell({ targets: slot({ countX: false }) })).length).toBeGreaterThan(0);
    // Players are not counted by X.
    expect(
      validateCard(
        withSpell({
          targets: [{ id: 't1', countX: true, what: { kind: 'player', filter: 'any' } }],
        }),
      ).length,
    ).toBeGreaterThan(0);
    // Only one discard cost: discard X cards with a discard of N cards is refused.
    expect(
      validateCard(withFace({ additionalCosts: [{ kind: 'discardX' }, { kind: 'discardX' }] }))
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withFace({ additionalCosts: [{ kind: 'discardX' }, { kind: 'discard', count: 1 }] }),
      ).length,
    ).toBeGreaterThan(0);
    // The cost of an activated ability is not an additional cost of a spell: the engine does not announce an X for it.
    const ability = {
      kind: 'activated',
      cost: [{ kind: 'discardX' }],
      effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } },
    };
    expect(validateCard(withFace({ spell: null, abilities: [ability] })).length).toBeGreaterThan(0);
    // X targets belong to a spell's own text: a triggered ability has no X announced for it.
    const trigger = {
      kind: 'triggered',
      trigger: { kind: 'discarded', who: 'you' },
      targets: spell.targets,
      effect: spell.effect,
    };
    expect(
      validateCard(withFace({ spell: null, additionalCosts: undefined, abilities: [trigger] }))
        .length,
    ).toBeGreaterThan(0);
  });
});

describe('announcing X, choosing the targets, then paying (CR 107.3a, 601.2b, 601.2c, 601.2h)', () => {
  test('X is asked first, then the targets (exactly X), then the mana, then the discard', () => {
    const g = recall(['Forest', 'Island', 'Plains']);
    g.act(0).cast(RECALL);
    const d = chooseXDecision(g);
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'spell',
      min: 0,
      max: 3,
      perX: { mana: 0, life: 0, discard: 1 },
      sourceName: RECALL,
    });
    expect(g.state.casting?.stage).toBe('x');
    expect(xs(g)).toEqual([0, 1, 2, 3]);
    g.act(0).chooseX(2);
    const t = targetsDecision(g);
    expect(t.specs).toHaveLength(1);
    expect(t.specs[0]).toMatchObject({ specId: 't1', min: 2, max: 2 });
    expect(t.specs[0]?.legal).toHaveLength(3);
    // The discard is paid after the targets: nothing has left the hand yet.
    g.expect.handSize(0, 3);
    g.act(0).chooseTargets(BEARS, SPIDER);
    g.expect.pending('payMana', 0);
    expect(g.state.casting?.totalCost).toEqual(['B']);
    g.act(0).payAuto();
    expect(g.state.casting?.stage).toBe('discard');
    const c = chooseCardsDecision(g);
    expect(c).toMatchObject({
      purpose: 'discard',
      zone: 'hand',
      forCost: true,
      min: 2,
      max: 2,
      reveal: true,
      seat: 0,
    });
    // The spell is on the stack: it is not one of the cards that can be discarded.
    expect(c.legal).toHaveLength(3);
    expect(c.legal).not.toContain(g.id({ name: RECALL, zone: 'stack' }));
    g.act(0).chooseCards('Forest', 'Plains');
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'hand', { seat: 0 });
    g.expect.stack([RECALL]);
    expect(g.object({ name: RECALL, zone: 'stack' }).stack?.x).toBe(2);
    g.expect.eventLog([
      { kind: 'discarded', seat: 0 },
      { kind: 'discarded', seat: 0 },
      { kind: 'spellCast', x: 2 },
    ]);
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(RECALL, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the cards discarded are no targets, and a creature card discarded stays in the graveyard', () => {
    const g = scenario()
      .seat(0)
      .hand(RECALL, ELVES, 'Forest')
      .graveyard(BEARS)
      .battlefield('Swamp')
      .seat(1)
      .build();
    g.act(0).cast(RECALL);
    // X is limited by the one creature card that is in the graveyard when the targets are chosen, not by the hand (two cards).
    expect(chooseXDecision(g)).toMatchObject({ min: 0, max: 1 });
    g.act(0).chooseX(1);
    const t = targetsDecision(g);
    expect(t.specs[0]?.legal.map((l) => l.kind === 'object' && l.id)).toEqual([
      g.id({ name: BEARS, zone: 'graveyard' }),
    ]);
    g.act(0).chooseTargets(BEARS);
    g.act(0).payAuto();
    g.act(0).chooseCards(ELVES);
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    // The creature card discarded for the cost was not a target: it stays where the cost put it.
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
  });

  test('exactly as many cards as X in hand: they are discarded without a question', () => {
    const g = recall(['Forest', 'Island']);
    g.act(0).cast(RECALL);
    g.act(0).chooseX(2);
    g.act(0).chooseTargets(BEARS, SPIDER);
    g.act(0).payAuto();
    g.expect.pending('priority', 0);
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
    g.expect.stack([RECALL]);
  });

  test('X = 0: no target is chosen, nothing is discarded, the spell resolves and does nothing', () => {
    const g = recall(['Forest', 'Island']);
    g.act(0).cast(RECALL);
    g.act(0).chooseX(0);
    // The slot has no target to choose: the cast goes on to the payment.
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.expect.pending('priority', 0);
    g.expect.stack([RECALL]);
    g.expect.handSize(0, 2);
    g.expect.noEvent({ kind: 'discarded' });
    expect(g.object({ name: RECALL, zone: 'stack' }).stack?.x).toBe(0);
    g.passAll();
    g.expect.zone(RECALL, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.noEvent({ kind: 'fizzled' });
    g.expect.invariants();
  });
});

describe('the most X that is offered (CR 601.2b, 118.3)', () => {
  test('the cards in hand besides the spell limit X', () => {
    const g = recall(['Forest']);
    g.act(0).cast(RECALL);
    expect(chooseXDecision(g)).toMatchObject({ min: 0, max: 1 });
    expect(xs(g)).toEqual([0, 1]);
  });

  test('the legal targets limit X: fewer creature cards in the graveyard than cards in hand', () => {
    const g = scenario()
      .seat(0)
      .hand(RECALL, 'Forest', 'Island', 'Plains', 'Mountain')
      .graveyard(BEARS, SPIDER, BOLT)
      .battlefield('Swamp')
      .seat(1)
      .build();
    g.act(0).cast(RECALL);
    // The Bolt is not a creature card: two legal targets.
    expect(chooseXDecision(g)).toMatchObject({ min: 0, max: 2 });
    expect(xs(g)).toEqual([0, 1, 2]);
    // A larger X is not an answer.
    expect(applyAction(g.state, 0, { kind: 'chooseX', value: 3 }).ok).toBe(false);
  });

  test('no creature card in the graveyard, or nothing else in hand: the spell is cast with X = 0, nothing is asked', () => {
    const empty = scenario().seat(0).hand(RECALL, 'Forest').battlefield('Swamp').seat(1).build();
    empty.expect.legal(0, { cast: RECALL });
    empty.act(0).cast(RECALL);
    empty.expect.pending('payMana', 0);
    empty.act(0).payAuto();
    expect(empty.object({ name: RECALL, zone: 'stack' }).stack?.x).toBe(0);
    const alone = recall([]);
    alone.act(0).cast(RECALL);
    alone.expect.pending('payMana', 0);
    alone.act(0).payAuto();
    expect(alone.object({ name: RECALL, zone: 'stack' }).stack?.x).toBe(0);
  });

  test('an {X} in the mana cost as well: the mana and the hand both limit X', () => {
    // {X}{R}: with 3 Mountains X can be 2 by mana; with 1 other card in hand it is 1 by the hand.
    const byHand = scenario()
      .seat(0)
      .hand(BURN, 'Forest')
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    byHand.act(0).cast(BURN);
    expect(chooseXDecision(byHand)).toMatchObject({
      min: 0,
      max: 1,
      perX: { mana: 1, life: 0, discard: 1 },
    });
    const byMana = scenario()
      .seat(0)
      .hand(BURN, 'Forest', 'Island', 'Plains')
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .build();
    byMana.act(0).cast(BURN);
    expect(chooseXDecision(byMana).max).toBe(2);
    byMana.act(0).chooseX(2);
    byMana.act(0).chooseTargets({ player: 1 });
    byMana.expect.pending('payMana', 0);
    expect(byMana.state.casting?.totalCost).toEqual(['2', 'R']);
    byMana.act(0).payAuto();
    byMana.act(0).chooseCards('Forest', 'Island');
    byMana.expect.handSize(0, 1);
    byMana.passAll();
    byMana.expect.life(1, 38);
  });

  test('with no target, X is limited by the hand alone and read by the effect', () => {
    const g = scenario()
      .seat(0)
      .hand(RUMMAGE, 'Forest', 'Island', 'Plains')
      .library('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield('Island', { count: 2 })
      .seat(1)
      .build();
    g.act(0).cast(RUMMAGE);
    expect(chooseXDecision(g)).toMatchObject({ min: 0, max: 3, perX: { discard: 1 } });
    g.act(0).chooseX(2);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.act(0).chooseCards('Forest', 'Island');
    g.passAll();
    g.expect.handSize(0, 3); // Plains and the two cards drawn
  });
});

describe('taking the cast back (CR 733)', () => {
  test('cancelling at the discard question gives the cards, the mana and the X back', () => {
    const g = recall(['Forest', 'Island', 'Plains']);
    const before = g.positionHash();
    g.act(0).cast(RECALL);
    g.act(0).chooseX(2);
    g.act(0).chooseTargets(BEARS, SPIDER);
    g.act(0).payAuto();
    expect(g.state.casting?.stage).toBe('discard');
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(true);
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.tapped('Swamp', false);
    g.expect.handSize(0, 4);
    g.expect.zone(RECALL, 'hand', { seat: 0 });
    g.expect.noEvent({ kind: 'discarded' });
    // The hand is as it was: the cast can be started again, with the whole hand to discard from.
    g.act(0).cast(RECALL);
    expect(chooseXDecision(g).max).toBe(3);
  });

  test('cancelling at the X question and at the targets question rewinds as well', () => {
    const g = recall(['Forest', 'Island']);
    const before = g.positionHash();
    g.act(0).cast(RECALL);
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(true);
    g.act(0).cancel();
    g.expect.position(before);
    g.act(0).cast(RECALL);
    g.act(0).chooseX(1);
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(true);
    g.act(0).cancel();
    g.expect.position(before);
  });
});

describe('answers the engine refuses', () => {
  test('the number of targets must be exactly X, and the discard exactly X cards', () => {
    const g = recall(['Forest', 'Island', 'Plains']);
    g.act(0).cast(RECALL);
    g.act(0).chooseX(2);
    const bears = g.id({ name: BEARS, zone: 'graveyard' });
    const spider = g.id({ name: SPIDER, zone: 'graveyard' });
    const target = (id: typeof bears) => ({ kind: 'object' as const, id, specId: 't1' });
    expect(applyAction(g.state, 0, { kind: 'chooseTargets', targets: [] }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'chooseTargets', targets: [target(bears)] }).ok).toBe(
      false,
    );
    expect(
      applyAction(g.state, 0, {
        kind: 'chooseTargets',
        targets: [target(bears), target(bears)],
      }).ok,
    ).toBe(false);
    g.act(0).chooseTargets(BEARS, SPIDER);
    g.act(0).payAuto();
    const forest = g.id('Forest');
    expect(applyAction(g.state, 0, { kind: 'chooseCards', objects: [forest] }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'chooseCards', objects: [] }).ok).toBe(false);
    expect(
      applyAction(g.state, 0, { kind: 'chooseCards', objects: [forest, g.id('Island')] }).ok,
    ).toBe(true);
    expect(bears).not.toBe(spider);
  });

  test('the legal targets of a long graveyard are listed within a limit, and any legal choice is accepted', () => {
    const names = Array.from({ length: 12 }, () => BEARS);
    const g = scenario()
      .seat(0)
      .hand(RECALL, ...Array.from({ length: 8 }, () => 'Forest'))
      .graveyard(...names)
      .battlefield('Swamp')
      .seat(1)
      .build();
    g.act(0).cast(RECALL);
    expect(chooseXDecision(g).max).toBe(8);
    g.act(0).chooseX(6);
    const listed = getLegalActions(g.state, 0).filter((a) => a.kind === 'chooseTargets');
    // C(12, 6) = 924 combinations exist; the list is cut, and every listed answer is legal.
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.length).toBeLessThanOrEqual(500);
    for (const a of listed.slice(0, 5)) expect(applyAction(g.state, 0, a).ok).toBe(true);
  });
});

describe('discarding as a cost triggers "whenever you discard" (CR 701.9a, 603.2)', () => {
  test('each card discarded for the cost triggers it, above the spell on the stack', () => {
    const g = scenario()
      .seat(0)
      .hand(RECALL, 'Forest', 'Island', 'Plains')
      .graveyard(BEARS, SPIDER)
      .battlefield('Swamp', MOURNER)
      .seat(1)
      .build();
    g.act(0).cast(RECALL);
    g.act(0).chooseX(2);
    g.act(0).chooseTargets(BEARS, SPIDER);
    g.act(0).payAuto();
    g.act(0).chooseCards('Forest', 'Island');
    g.expect.stack([`${MOURNER} (ability)`, `${MOURNER} (ability)`, RECALL]);
    g.expect.life(0, 40);
    g.passAll();
    g.expect.life(0, 42);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 0 });
  });
});

describe('a spell with flashback (CR 702.34a)', () => {
  const build = (others: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(...others)
      .graveyard(REPLAY, BEARS, SPIDER)
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .build();

  test('the additional cost applies to the flashback cast: X is announced and the cards come from the hand', () => {
    const g = build(['Forest', 'Island']);
    g.expect.legal(0, { cast: REPLAY, alternative: 'flashback' });
    g.act(0).cast(REPLAY, { alternative: 'flashback' });
    expect(chooseXDecision(g)).toMatchObject({ min: 0, max: 2, perX: { mana: 0, discard: 1 } });
    g.act(0).chooseX(2);
    g.act(0).chooseTargets(BEARS, SPIDER);
    // The flashback cost is the mana: {2}{B}, not the printed {B}.
    expect(g.state.casting?.totalCost).toEqual(['2', 'B']);
    g.act(0).payAuto();
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 0 });
    // Flashback: the spell is exiled instead of going to the graveyard.
    g.expect.zone(REPLAY, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('a hand with no card to discard still casts it, for X = 0', () => {
    const g = build([]);
    g.act(0).cast(REPLAY, { alternative: 'flashback' });
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    expect(g.object({ name: REPLAY, zone: 'stack' }).stack?.x).toBe(0);
  });
});

describe('a copy of the spell (CR 707.10)', () => {
  test('the copy has the X of the spell and the same number of targets, and no cost is paid for it', () => {
    const g = scenario()
      .seat(0)
      .hand(RECALL, TWIN, 'Forest', 'Island', 'Plains')
      .graveyard(BEARS, SPIDER, ELVES)
      .battlefield('Swamp', 'Island', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(RECALL);
    g.act(0).chooseX(2);
    g.act(0).chooseTargets(BEARS, SPIDER);
    g.act(0).payAuto();
    g.act(0).chooseCards('Forest', 'Plains');
    g.expect.stack([RECALL]);
    g.act(0).cast(TWIN, { targets: [{ name: RECALL, zone: 'stack' }], pay: true });
    g.passAll(); // Twin Spell resolves: the copy is on the stack and its controller may choose new targets
    const copy = targetsDecision(g);
    expect(copy.forCopy).toBe(true);
    // Two targets, as the spell has: X is the copy's too (it is not announced again).
    expect(copy.specs[0]).toMatchObject({ min: 2, max: 2 });
    // The copy may keep the targets or choose others; here the Elves and the Spider.
    g.act(0).chooseTargets(ELVES, SPIDER);
    expect(g.find({ name: RECALL, zone: 'stack' }).map((o) => o.stack?.x)).toEqual([2, 2]);
    g.passAll();
    // The copy returns the Elves and the Spider; the spell then returns what is still a legal target: the Bears.
    g.expect.zone(ELVES, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 0 });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    // Only the two cards of the cost were discarded; the copy paid nothing.
    g.expect.zone('Island', 'hand', { seat: 0 });
    g.expect.invariants();
  });
});

describe('what the other seat sees (the cards discarded are public, the choice before is not)', () => {
  test('X is on the spell for everyone, and the discard is a public event', () => {
    const g = recall(['Forest', 'Island', 'Plains']);
    g.act(0).cast(RECALL);
    g.act(0).chooseX(2);
    g.act(0).chooseTargets(BEARS, SPIDER);
    g.act(0).payAuto();
    const theirs = getView(g.state, 1);
    expect(theirs.waitingOn).toMatchObject({ seat: 0, purpose: 'discard', sourceName: RECALL });
    g.act(0).chooseCards('Forest', 'Island');
    const after = getView(g.state, 1);
    expect(after.stack.find((o) => o.name === RECALL)?.x).toBe(2);
    expect(after.seats[0]?.graveyard.map((o) => o.name)).toEqual(
      expect.arrayContaining(['Forest', 'Island']),
    );
  });
});
