// The Prismari deck (issue 87), group 3: Surge to Victory, "Exile target instant or sorcery card from your graveyard. Creatures you control get +X/+0 until end of turn, where X is that card's
// mana value. Whenever a creature you control deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying its mana cost." (SYNTHETIC Surge Victory,
// src/cards/fixtures/synthetic-prismari-g3.ts: `exile`, `modifyPt`, then `delayedCombatDamageTurn` of `copyCardAndCast` of the card exiled, D-649.) Pins: CR 603.7 and 603.7c-d (a delayed
// triggered ability of the controller, about the card the spell exiled), CR 510.3a and 603.2c (it triggers once for each creature and each player damaged), CR 514.2 (until end of turn),
// CR 611.2c (the pump is set when the spell resolves), CR 707.12 (a copy of a card is cast from the zone the card is in), CR 608.2g (cast during resolution, free), CR 400.7 (a card
// that left exile is a new object: nothing to copy), CR 202.3 (the mana value of the exiled card).
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const SURGE = 'SYNTHETIC Surge Victory';
const GAIN2 = 'SYNTHETIC Calamity Gain Two'; // {1}{R}: mana value 2, gain 2 life
const GAIN7 = 'SYNTHETIC Calamity Gain Seven'; // mana value 7, gain 7 life
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4 reach
const GIANT = 'Isamaru, Hound of Konda'; // 2/2
const FILLER = Array.from({ length: 24 }, () => 'Island');

type Builder = ReturnType<typeof scenario>;

function game(graveyard: readonly string[], extra: (b: Builder) => void = () => {}) {
  const b = scenario()
    .seat(0)
    .hand(SURGE)
    .battlefield(BEARS, { label: 'bears' })
    .battlefield(GIANT, { label: 'giant' })
    .library(...FILLER)
    .pool('RRRRRR');
  for (const card of graveyard) b.graveyard(card);
  extra(b);
  return b
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
}

/** Casts Surge at `target` of the graveyard and lets it resolve. */
function castSurge(g: ScenarioGame, target: string) {
  g.act(0).cast(SURGE, { pay: true, targets: [{ name: target, zone: 'graveyard', seat: 0 }] });
  g.passAll();
  return g;
}

/** Attacks with the creatures and walks to the combat damage step: the triggers of the damage are on the stack. */
function attack(g: ScenarioGame, ...who: string[]) {
  g.advanceTo('declareAttackers');
  g.act(0).attack(who);
  g.advanceTo('combatDamage');
  return g;
}

const exiled = (g: ScenarioGame, name: string) =>
  g.find({ name, zone: 'exile', seat: 0 }).filter((o) => o.card !== null);

describe('the card is valid', () => {
  test(SURGE, () => expect(validateCard(syntheticCard(SURGE))).toEqual([]));
});

describe('exile the card, the creatures get +X/+0 where X is its mana value (CR 202.3, 611.2c)', () => {
  test('the card is exiled and every creature the controller has gets +X/+0 until end of turn', () => {
    const g = castSurge(game([GAIN7]), GAIN7);
    expect(exiled(g, GAIN7)).toHaveLength(1);
    g.expect.pt('bears', 9, 2);
    g.expect.pt('giant', 9, 2);
    g.expect.invariants();
  });

  test('a card of mana value 2 gives +2/+0, and the opponent’s creatures nothing', () => {
    const g = castSurge(
      game([GAIN2], (b) => b.seat(1).battlefield(SPIDER, { label: 'spider' })),
      GAIN2,
    );
    g.expect.pt('bears', 4, 2);
    g.expect.pt('spider', 2, 4);
  });

  test('the pump ends with the turn', () => {
    const g = castSurge(game([GAIN7]), GAIN7);
    g.advanceTo('end');
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('bears', 2, 2);
  });
});

describe('"Whenever a creature you control deals combat damage to a player this turn, copy the exiled card" (CR 603.7, 510.3a)', () => {
  test('one creature hits the opponent: the card is copied and the copy may be cast free', () => {
    const g = castSurge(game([GAIN7]), GAIN7);
    attack(g, 'bears');
    g.passAll();
    // The trigger resolved on combat damage: the copy of the exiled card is offered.
    const d = chooseCardsDecision(g);
    expect(d).toMatchObject({ seat: 0, purpose: 'cast', zone: 'exile' });
    expect(g.state.objects[d.legal[0] as `o${number}`]?.cardCopy).toBe(true);
    g.act(0).chooseCards(d.legal[0] as string);
    g.passAll();
    g.expect.life(0, 47);
    g.expect.life(1, 31);
    // The card itself is still exiled; the copy ceased to exist.
    expect(exiled(g, GAIN7)).toHaveLength(1);
    expect(Object.values(g.state.objects).filter((o) => o.cardCopy === true)).toHaveLength(0);
    g.expect.invariants();
  });

  test('two creatures hit: the trigger happens once for each, each copies the card again', () => {
    const g = castSurge(game([GAIN2]), GAIN2);
    attack(g, 'bears', 'giant');
    g.passAll();
    // Two triggers resolved one after the other: two copies, each cast free.
    let casts = 0;
    for (let guard = 0; guard < 6 && g.state.pending?.kind === 'chooseCards'; guard += 1) {
      const d = chooseCardsDecision(g);
      g.act(0).chooseCards(d.legal[0] as string);
      casts += 1;
      g.passAll();
    }
    expect(casts).toBe(2);
    g.expect.life(0, 44);
    expect(exiled(g, GAIN2)).toHaveLength(1);
  });

  test('the copy may be left uncast: it ceases to exist and the card stays exiled', () => {
    const g = castSurge(game([GAIN2]), GAIN2);
    attack(g, 'bears');
    g.passAll();
    g.act(0).chooseCards();
    expect(exiled(g, GAIN2)).toHaveLength(1);
    expect(Object.values(g.state.objects).filter((o) => o.cardCopy === true)).toHaveLength(0);
    g.expect.life(0, 40);
  });

  test('a blocked attacker deals its damage to the blocker: no combat damage to a player, no copy', () => {
    const g = castSurge(
      game([GAIN2], (b) => b.seat(1).battlefield(SPIDER, { label: 'spider' })),
      GAIN2,
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack('bears');
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: 'spider', attacker: 'bears' }]);
    g.advanceTo('combatDamage');
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    expect(exiled(g, GAIN2)).toHaveLength(1);
    g.expect.life(1, 40);
  });

  test('a creature of the opponent that deals combat damage in the next turn does not trigger it: the ability has ended', () => {
    const g = castSurge(
      game([GAIN2], (b) => b.seat(1).battlefield(SPIDER)),
      GAIN2,
    );
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers');
    g.act(1).attack({ name: SPIDER, zone: 'battlefield', seat: 1 });
    g.advanceTo('combatDamage');
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.life(0, 38);
  });

  test('the ability ends with the turn: damage next turn copies nothing', () => {
    const g = castSurge(game([GAIN2]), GAIN2);
    g.advanceTo('end');
    expect(g.state.delayedTriggers.length).toBeGreaterThan(0);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.delayedTriggers).toHaveLength(0);
  });

  test('the copy is a copy of the exiled card as it is: the same card', () => {
    const g = castSurge(game([GAIN7]), GAIN7);
    attack(g, 'bears');
    g.passAll();
    const d = chooseCardsDecision(g);
    const copy = g.state.objects[d.legal[0] as `o${number}`];
    expect(copy?.copyOf).toBe(exiled(g, GAIN7)[0]?.card);
  });
});

describe('the target (CR 115.1)', () => {
  test('only an instant or sorcery card of the controller’s own graveyard is a legal target: without one the spell cannot be cast', () => {
    const g = game([BEARS], (b) => b.seat(1).graveyard(GAIN2));
    const surge = g.find({ name: SURGE, zone: 'hand', seat: 0 })[0];
    const casts = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' && a.object === surge?.id,
    );
    expect(casts).toEqual([]);
  });

  test('with an instant or sorcery card there, it can be cast', () => {
    const g = game([GAIN2]);
    const surge = g.find({ name: SURGE, zone: 'hand', seat: 0 })[0];
    const casts = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' && a.object === surge?.id,
    );
    expect(casts.length).toBeGreaterThan(0);
  });
});
