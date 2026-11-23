// Blitz (CR 702.152a, the rules text was not available to check: UNVERIFIED), the keyword of Sabin, Master Monk: "You may cast this card by paying [cost] rather than its mana cost.
// If its blitz cost was paid, it gains haste and 'When this creature dies, draw a card.' Sacrifice it at the beginning of the next end step." The cost may discard a card, and a card may
// say "You may cast this card from your graveyard using its blitz ability". Cards are SYNTHETIC (src/cards/fixtures/synthetic-alt-costs.ts).
// Pins: CR 118.9 (an alternative cost instead of the mana cost), CR 118.3 (a cost that cannot be paid), CR 603.7 and 603.7c (the delayed sacrifice names the permanent),
// CR 700.4 (dies), CR 707.2 (a copy has the copiable values only), CR 400.7, CR 302.6 and 702.10 (haste).
import { describe, expect, test } from 'vitest';
import { getLegalActions, getView, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const MONK = 'SYNTHETIC Blitz Monk'; // {4}{R} 4/3, blitz {2}{R}{R} and discard a card, castable from the graveyard that way
const RUSHER = 'SYNTHETIC Blitz Rusher'; // {3}{R} 2/2, blitz {1}{R}
const CLONER = 'SYNTHETIC Blitz Cloner'; // {3}{R} 2/2, blitz {1}{R}, "{1}: create a token that's a copy of this creature"
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island'] as const;

type Builder = ReturnType<typeof scenario>;

function game(
  zones: { hand?: readonly string[]; graveyard?: readonly string[]; lands?: number },
  extra: (b: Builder) => Builder = (b) => b,
) {
  const b = scenario()
    .seat(0)
    .library(...FILLER)
    .battlefield('Mountain', { count: zones.lands ?? 4 });
  for (const card of zones.hand ?? []) b.hand(card);
  for (const card of zones.graveyard ?? []) b.graveyard(card);
  return extra(b)
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
}

const blitzOptions = (g: ScenarioGame, name: string, zone: 'hand' | 'graveyard') => {
  const card = g.find({ name, zone, seat: 0 })[0];
  return getLegalActions(g.state, 0).filter(
    (a) => a.kind === 'castSpell' && a.object === card?.id && a.alternative === 'blitz',
  );
};

describe('the cards are valid', () => {
  for (const name of [MONK, RUSHER, CLONER]) {
    test(name, () => expect(validateCard(syntheticCard(name))).toEqual([]));
  }

  test('a blitz permission needs a blitz cost, and a blitz cost a creature card', () => {
    const monk = syntheticCard(MONK);
    const face = monk.faces[0];
    if (face === undefined) throw new Error('no face');
    const { alternativeCosts: _costs, ...withoutCosts } = face;
    const noCost = { ...monk, faces: [withoutCosts] };
    expect(JSON.stringify(validateCard(noCost))).toMatch(
      /using blitz needs a blitz alternative cost/,
    );
    const instant = { ...monk, faces: [{ ...face, types: ['instant' as const] }] };
    expect(JSON.stringify(validateCard(instant))).toMatch(/blitz is on a creature card/);
  });
});

describe('the cast from the hand (CR 702.152a, 118.9)', () => {
  test('the blitz cast is a separate option beside the ordinary cast, with the discard in the view', () => {
    const g = game({ hand: [MONK, 'Island'], lands: 5 });
    g.expect.legal(0, { cast: MONK });
    expect(blitzOptions(g, MONK, 'hand')).toHaveLength(1);
    const card = getView(g.state, 0).seats[0]?.hand?.find((o) => o.name === MONK);
    expect(card?.alternativeCosts).toEqual([{ kind: 'blitz', cost: ['2', 'R', 'R'], discard: 1 }]);
  });

  test('"Discard a card" cannot be paid with no other card in the hand (CR 118.3)', () => {
    const g = game({ hand: [MONK], lands: 5 });
    expect(blitzOptions(g, MONK, 'hand')).toEqual([]);
    g.expect.legal(0, { cast: MONK });
  });

  test('the mana of the blitz cost is paid instead of the mana cost and a card is discarded', () => {
    const g = game({ hand: [MONK, 'Island', 'Forest'], lands: 4 });
    g.act(0).cast(MONK, { alternative: 'blitz', pay: true });
    const d = chooseCardsDecision(g);
    expect(d).toMatchObject({ purpose: 'discard', zone: 'hand', min: 1, max: 1, forCost: true });
    // The card cast is on the stack already: only the other cards of the hand can be discarded.
    expect(d.legal).toHaveLength(2);
    g.act(0).chooseCards({ name: 'Forest', zone: 'hand', seat: 0 });
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(
      4,
    );
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'blitz' }]);
    expect(getView(g.state, 1).stack[0]?.alternative).toBe('blitz');
  });

  test('with only the blitz mana payable the blitz cast is the only one offered', () => {
    const g = game({ hand: [RUSHER], lands: 2 });
    g.expect.illegal(0, { cast: RUSHER });
    g.expect.legal(0, { cast: RUSHER, alternative: 'blitz' });
  });

  test('a card without a permission is not blitzed from the graveyard', () => {
    const g = game({ graveyard: [RUSHER] });
    expect(blitzOptions(g, RUSHER, 'graveyard')).toEqual([]);
  });
});

describe('what a blitzed creature has (CR 702.152a, 702.10, 302.6)', () => {
  test('haste: it attacks the turn it enters; cast normally it cannot', () => {
    const blitzed = game({ hand: [RUSHER], lands: 2 });
    blitzed.act(0).cast(RUSHER, { alternative: 'blitz', pay: true });
    blitzed.passAll();
    blitzed.advanceTo('declareAttackers', { attack: false });
    blitzed.expect.canAttack(RUSHER, true);

    const normal = game({ hand: [RUSHER], lands: 4 });
    normal.act(0).cast(RUSHER, { pay: true });
    normal.passAll();
    normal.advanceTo('declareAttackers', { attack: false });
    normal.expect.canAttack(RUSHER, false);
  });

  test('it is sacrificed at the beginning of the next end step and its dies trigger draws a card', () => {
    const g = game({ hand: [RUSHER], lands: 2 });
    g.act(0).cast(RUSHER, { alternative: 'blitz', pay: true });
    g.passAll();
    g.expect.zone(RUSHER, 'battlefield', { seat: 0 });
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end');
    g.expect.stack([`${RUSHER} (ability)`]);
    // The sacrifice resolves, and the dies trigger of the blitzed creature after it.
    g.passAll();
    g.expect.zone(RUSHER, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
    expect(g.state.delayedTriggers).toEqual([]);
    g.expect.invariants();
  });

  test('a creature cast normally is not sacrificed and has no haste', () => {
    const g = game({ hand: [RUSHER], lands: 4 });
    g.act(0).cast(RUSHER, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.expect.stack([]);
    g.expect.zone(RUSHER, 'battlefield', { seat: 0 });
    expect(getView(g.state, 0).battlefield.find((o) => o.name === RUSHER)?.keywords).not.toContain(
      'haste',
    );
  });

  test('a token copy of a blitzed creature has no haste and is not sacrificed', () => {
    const g = game({ hand: [CLONER], lands: 3 });
    g.act(0).cast(CLONER, { alternative: 'blitz', pay: true });
    g.passAll();
    g.expect.zone(CLONER, 'battlefield', { seat: 0 });
    g.act(0).activate(CLONER, { pay: true });
    g.passAll();
    const named = () => getView(g.state, 0).battlefield.filter((o) => o.name === CLONER);
    const view = named();
    expect(view).toHaveLength(2);
    expect(view.filter((o) => o.keywords.includes('haste'))).toHaveLength(1);
    g.advanceTo('end');
    g.passAll();
    // Only the blitzed creature went; the copy stays.
    expect(named()).toHaveLength(1);
    expect(named()[0]?.keywords).not.toContain('haste');
    g.expect.invariants();
  });
});

describe('"You may cast this card from your graveyard using its blitz ability"', () => {
  test('the card in the graveyard is cast for its blitz cost and not for its mana cost', () => {
    const g = game({ graveyard: [MONK], hand: ['Island'], lands: 5 });
    expect(blitzOptions(g, MONK, 'graveyard')).toHaveLength(1);
    const card = g.find({ name: MONK, zone: 'graveyard', seat: 0 })[0];
    expect(
      getLegalActions(g.state, 0).filter(
        (a) => a.kind === 'castSpell' && a.object === card?.id && a.alternative === undefined,
      ),
    ).toEqual([]);
    expect(
      getView(g.state, 0).seats[0]?.graveyard.find((o) => o.name === MONK)?.alternativeCosts,
    ).toEqual([{ kind: 'blitz', cost: ['2', 'R', 'R'], discard: 1 }]);
  });

  test('it needs a card to discard', () => {
    expect(blitzOptions(game({ graveyard: [MONK] }), MONK, 'graveyard')).toEqual([]);
  });

  test('cast from the graveyard it is sacrificed at the end step, draws, and is in the graveyard again', () => {
    const g = game({ graveyard: [MONK], hand: ['Island'] });
    g.act(0).cast(MONK, { alternative: 'blitz', pay: true });
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(MONK, 'battlefield', { seat: 0 });
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end');
    g.passAll();
    g.passAll();
    g.expect.zone(MONK, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
  });

  test('a card in the opponent’s graveyard is not cast by you', () => {
    const g = game({ hand: ['Island'] }, (b) => b.seat(1).graveyard(MONK));
    const card = g.find({ name: MONK, zone: 'graveyard', seat: 1 })[0];
    expect(
      getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell' && a.object === card?.id),
    ).toEqual([]);
  });
});

describe('three players', () => {
  test('the sacrifice happens at the beginning of the next end step, once', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .library(...FILLER)
      .hand(RUSHER)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(RUSHER, { alternative: 'blitz', pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.passAll();
    g.expect.zone(RUSHER, 'graveyard', { seat: 0 });
    expect(g.state.delayedTriggers).toEqual([]);
    g.expect.invariants();
  });
});
