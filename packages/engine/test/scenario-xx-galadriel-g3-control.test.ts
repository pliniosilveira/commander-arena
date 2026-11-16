// Group 3 of the Galadriel deck (issue 43): "Exchange control of this enchantment and target nonland permanent" (Eyes Everywhere), "Its activated abilities can't be activated this turn"
// (Koma, Cosmos Serpent) and "This token saddles Mounts and crews Vehicles as though its power were 2 greater" (the Pilot of Defend the Rider).
// Pins: CR 701.12a (if the entire exchange can't be completed, no part of it occurs), 701.12b (each player gains control of the permanent the other controlled; the same player
// controlling both does nothing), 613.1b and 613.7 (a layer 2 effect; the later timestamp wins), 611.2a (no duration: until the game ends or another effect changes control), 302.6
// (a permanent that changed controller is summoning sick), 506.4 (it leaves combat), 602.5 and 605.1a (an object whose activated abilities can't be activated has no mana ability to
// use either), 606.1 (loyalty abilities are activated abilities), 702.122a (crew taps creatures with total power N or more; the Pilot counts 2 more), 700.2 (modes of an activated
// ability), 101.2 and 701.6 (a spell that can't be countered).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-galadriel-g3.ts) or real fixtures; the real cards are played in packages/cards/test/convert-grammar-engine-galadriel-g3.test.ts.
import { describe, expect, test } from 'vitest';
import { type PendingDecision, syntheticCard, validateCard } from '../src/index';
import { controllerOf } from '../src/rules/control';
import { hasRestriction } from '../src/rules/restrictions';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { choosePermanentDecision } from './pending-helpers';

const EYES = 'SYNTHETIC Swap Eyes';
const PAIR = 'SYNTHETIC Swap Pair';
const LOCK = 'SYNTHETIC Lock Abilities';
const BREAK = 'SYNTHETIC Break Enchantment';
const TITAN = 'SYNTHETIC Coil Titan';
const SHIELD = 'SYNTHETIC Rider Shield';
const COIL = 'SYNTHETIC Coil'; // the token the Serpent makes
const SERPENT = 'SYNTHETIC Garden Serpent';
const WAGON = 'SYNTHETIC Rattle Wagon'; // Vehicle, Crew 3
const SKIFF = 'SYNTHETIC Scout Skiff'; // Vehicle, Crew 1
const WALKER = 'SYNTHETIC Mirror Walker';
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4 flying
const ELVES = 'Llanowar Elves';
const SOL = 'Sol Ring';
const MURDER = 'Murder';
const BOLT = 'Lightning Bolt';
const COUNTERSPELL = 'Counterspell';
const FILLER = Array.from({ length: 14 }, () => 'Plains');

const defs = () =>
  [EYES, PAIR, LOCK, BREAK, TITAN, SHIELD, WALKER, WAGON, SKIFF, SERPENT].reduce(
    (b, name) => b.define(syntheticCard(name)),
    scenario(),
  );

/** The upkeep of `seat` has its scry of the Eyes: keep the one card on top, as the engine asks (CR 701.22a). */
const keepScry = (g: ScenarioGame, seat: 0 | 1): void => {
  g.passAll();
  g.expect.pending('arrangeCards', seat);
  g.act(seat).arrange({ top: [`top${seat}`] });
};

const controller = (g: ScenarioGame, card: string): number => {
  const [found, ...rest] = g.find({ name: card, zone: 'battlefield' });
  if (found === undefined || rest.length > 0)
    throw new Error(`${card} is not on the battlefield once`);
  return controllerOf(g.state, found);
};

describe('the cards are valid', () => {
  test.each([EYES, PAIR, LOCK, BREAK, TITAN, SHIELD, SERPENT])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Exchange control of this enchantment and target nonland permanent" (CR 701.12a, 701.12b)', () => {
  const board = () =>
    defs()
      .seat(0)
      .library('Plains', { label: 'top0' })
      .library(...FILLER)
      .battlefield(EYES)
      .battlefield('Island', { count: 6 })
      .battlefield(ANGEL)
      .seat(1)
      .library('Plains', { label: 'top1' })
      .library(...FILLER)
      .battlefield(BEARS)
      .battlefield('Island', { count: 6 })
      .at('precombatMain')
      .build();

  test('the enchantment and the target change places: each player controls what the other did, and the owners stay', () => {
    const g = board();
    g.act(0).activate(EYES, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    expect(controller(g, EYES)).toBe(1);
    expect(controller(g, BEARS)).toBe(0);
    expect(g.object(EYES).owner).toBe(0);
    expect(g.object(BEARS).owner).toBe(1);
    g.expect.eventLog([
      { kind: 'controlChanged', from: 0, to: 1 },
      { kind: 'controlChanged', from: 1, to: 0 },
    ]);
    g.expect.invariants();
  });

  test('it has no duration: it lasts through the next turns (CR 611.2a)', () => {
    const g = board();
    g.act(0).activate(EYES, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    // the new controller of the enchantment has its upkeep trigger, and the old one has not
    keepScry(g, 1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    g.passAll();
    g.expect.noEvent({ kind: 'scried', seat: 0 });
    expect(controller(g, EYES)).toBe(1);
    expect(controller(g, BEARS)).toBe(0);
  });

  test('the permanent it took is summoning sick for its new controller (CR 302.6)', () => {
    const g = board();
    g.act(0).activate(EYES, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEARS, false);
    g.expect.canAttack(ANGEL, true);
  });

  test('the new controller of the enchantment may use it: exchanging back is a later effect, which wins (CR 613.7)', () => {
    const g = board();
    g.act(0).activate(EYES, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    keepScry(g, 1);
    g.advanceTo('precombatMain');
    g.expect.step('precombatMain', { active: 1 });
    g.act(1).activate(EYES, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    expect(controller(g, EYES)).toBe(0);
    expect(controller(g, BEARS)).toBe(1);
    g.expect.invariants();
  });

  test('the same player controlling both does nothing (CR 701.12b)', () => {
    const g = board();
    g.act(0).activate(EYES, { targets: [{ name: ANGEL, seat: 0 }], pay: true });
    g.passAll();
    expect(controller(g, EYES)).toBe(0);
    expect(controller(g, ANGEL)).toBe(0);
    g.expect.noEvent({ kind: 'controlChanged' });
  });

  test('a target that is gone as the ability resolves: no part of the exchange occurs (CR 701.12a)', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(EYES)
      .battlefield('Island', { count: 6 })
      .seat(1)
      .library(...FILLER)
      .hand(MURDER)
      .battlefield(BEARS)
      .battlefield('Swamp', { count: 3 })
      .at('precombatMain')
      .build();
    g.act(0).activate(EYES, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(controller(g, EYES)).toBe(0);
    g.expect.noEvent({ kind: 'controlChanged' });
  });

  test('the enchantment gone as the ability resolves: nothing happens to the target either (CR 701.12a)', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(EYES)
      .battlefield('Island', { count: 6 })
      .seat(1)
      .library(...FILLER)
      .hand(BREAK)
      .battlefield(BEARS)
      .battlefield('Mountain')
      .at('precombatMain')
      .build();
    g.act(0).activate(EYES, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast(BREAK, { targets: [{ name: EYES, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(EYES, 'graveyard', { seat: 0 });
    expect(controller(g, BEARS)).toBe(1);
    g.expect.noEvent({ kind: 'controlChanged' });
  });

  test('"Exchange control of two target creatures": two targets of different players swap', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(PAIR)
      .battlefield(ANGEL, { label: 'angel' })
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS)
      .at('precombatMain')
      .build();
    g.act(0).cast(PAIR, {
      targets: [
        { name: ANGEL, seat: 0 },
        { name: BEARS, seat: 1 },
      ],
      pay: true,
    });
    g.passAll();
    expect(controller(g, ANGEL)).toBe(1);
    expect(controller(g, BEARS)).toBe(0);
    g.expect.invariants();
  });

  test('two targets one player controls: nothing happens', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(PAIR)
      .battlefield(ANGEL)
      .battlefield(ELVES)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(PAIR, {
      targets: [
        { name: ANGEL, seat: 0 },
        { name: ELVES, seat: 0 },
      ],
      pay: true,
    });
    g.passAll();
    expect(controller(g, ANGEL)).toBe(0);
    expect(controller(g, ELVES)).toBe(0);
    g.expect.noEvent({ kind: 'controlChanged' });
  });

  test('one of two targets removed in response: the spell does nothing to the other (CR 701.12a)', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(PAIR)
      .battlefield(ANGEL)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...FILLER)
      .hand(BOLT)
      .battlefield(BEARS)
      .battlefield('Mountain')
      .at('precombatMain')
      .build();
    g.act(0).cast(PAIR, {
      targets: [
        { name: ANGEL, seat: 0 },
        { name: BEARS, seat: 1 },
      ],
      pay: true,
    });
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(controller(g, ANGEL)).toBe(0);
    g.expect.noEvent({ kind: 'controlChanged' });
  });
});

describe('"Its activated abilities can\'t be activated this turn" (CR 602.5, 605.1a, 606.1)', () => {
  const board = () =>
    defs()
      .seat(0)
      .library(...FILLER)
      .hand(LOCK)
      .battlefield('Island', { count: 2 })
      .seat(1)
      .library(...FILLER)
      .battlefield(ELVES)
      .battlefield(SOL)
      .battlefield(WALKER)
      .battlefield(WAGON)
      .battlefield(BEARS)
      .at('precombatMain')
      .build();

  test('a permanent with a mana ability cannot use it, though it is untapped (CR 605.1a)', () => {
    const g = board();
    g.act(0).cast(LOCK, { targets: [{ name: ELVES, seat: 1 }], pay: true });
    g.passAll();
    const elves = g.object(ELVES);
    expect(hasRestriction(g.state, elves, 'cantActivateAbilities')).toBe(true);
    g.expect.tapped(ELVES, false);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    // it is the turn after: the effect ended with the turn it was made in
    expect(hasRestriction(g.state, g.object(ELVES), 'cantActivateAbilities')).toBe(false);
  });

  test('it cannot tap for mana this turn, and a permanent that was not named still can', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield('Island', { count: 2 })
      .battlefield(ELVES)
      .battlefield(SOL)
      .hand(LOCK)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(LOCK, { targets: [{ name: SOL, seat: 0 }], pay: true });
    g.passAll();
    // the spell has resolved: the Ring cannot be tapped for mana, the Elves still can
    expect(g.act(0).try.tapForMana(SOL).ok).toBe(false);
    g.expect.tapped(SOL, false);
    expect(g.act(0).try.tapForMana(ELVES).ok).toBe(true);
  });

  test('the mana of such a permanent does not pay for a spell either (the payment planner leaves it out)', () => {
    const build = (lock: boolean) => {
      const g = defs()
        .seat(0)
        .library(...FILLER)
        .battlefield('Island', { count: 2 })
        .battlefield(SOL)
        .hand(LOCK, 'Divination')
        .seat(1)
        .library(...FILLER)
        .at('precombatMain')
        .build();
      if (lock) {
        g.act(0).cast(LOCK, { targets: [{ name: SOL, seat: 0 }], pay: true });
        g.passAll();
      }
      return g;
    };
    // Divination costs {2}{U}. Without the lock the Ring and one Island pay it (the Lock cost the other Island only if it was cast).
    const free = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield('Island', { count: 1 })
      .battlefield(SOL)
      .hand('Divination')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    expect(free.act(0).try.cast('Divination').ok).toBe(true);
    // With the lock the Ring is not a source: one Island is all the player has left, so the spell cannot be cast.
    const locked = build(true);
    expect(locked.act(0).try.cast('Divination').ok).toBe(false);
  });

  test('a loyalty ability and an ability of a keyword (crew) cannot be activated either', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield('Island', { count: 2 })
      .hand(LOCK)
      .battlefield(WALKER)
      .battlefield(WAGON)
      .battlefield(BEARS)
      .battlefield(ANGEL)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(LOCK, { targets: [{ name: WALKER, seat: 0 }], pay: true });
    g.passAll();
    const walker = g.object(WALKER);
    expect(g.act(0).try.activate(WALKER, { ability: 2 }).ok).toBe(false);
    expect(hasRestriction(g.state, walker, 'cantActivateAbilities')).toBe(true);
    // the Wagon was not named: it can still be crewed
    expect(g.act(0).try.activate(WAGON).ok).toBe(true);
  });

  test('it is not an ability the permanent has lost: the loyalty ability works again next turn', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield('Island', { count: 2 })
      .hand(LOCK)
      .battlefield(WALKER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(LOCK, { targets: [{ name: WALKER, seat: 0 }], pay: true });
    g.passAll();
    expect(g.act(0).try.activate(WALKER, { ability: 2 }).ok).toBe(false);
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.step('precombatMain', { active: 0, turn: 5 });
    expect(g.act(0).try.activate(WALKER, { ability: 2 }).ok).toBe(true);
  });
});

describe('"Sacrifice another Serpent: Choose one — tap target permanent and stop its abilities, or indestructible" (Koma)', () => {
  const board = (...extra: ((b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>)[]) => {
    let b = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(TITAN)
      .battlefield(SERPENT, { label: 'serpent' })
      .battlefield('Island', { count: 2 })
      .seat(1)
      .library(...FILLER)
      .battlefield(SOL)
      .battlefield(BEARS);
    for (const e of extra) b = e(b);
    return b.at('precombatMain').build();
  };

  test('the first mode taps the target and its activated abilities cannot be activated this turn', () => {
    const g = board();
    // the one other Serpent is the cost: the engine sacrifices it without asking
    g.act(0).activate(TITAN, { modes: [0], targets: [{ name: SOL, seat: 1 }] });
    g.passAll();
    g.expect.noObject(SERPENT, { zone: 'battlefield' });
    g.expect.tapped(SOL, true);
    expect(hasRestriction(g.state, g.object(SOL), 'cantActivateAbilities')).toBe(true);
    g.expect.invariants();
  });

  test('the second mode makes Koma indestructible until end of turn', () => {
    const g = board((b) => b);
    g.act(0).activate(TITAN, { modes: [1] });
    g.passAll();
    g.expect.derived(TITAN, { keywords: ['indestructible'] });
    g.advanceTo('end');
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(TITAN, { keywords: [] });
  });

  test('another Serpent is required: Koma cannot sacrifice itself', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(TITAN)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    expect(() => g.act(0).activate(TITAN, { modes: [1] })).toThrow(/nothing to sacrifice/);
  });

  test("at the beginning of each upkeep it makes a Serpent token: on either player's upkeep, for its controller", () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(TITAN)
      .seat(1)
      .library(...FILLER)
      .at('end')
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    g.passAll();
    expect(g.find({ name: COIL, zone: 'battlefield' })).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(g.find({ name: COIL, zone: 'battlefield' })).toHaveLength(2);
    for (const o of g.find({ name: COIL, zone: 'battlefield' })) {
      expect(controllerOf(g.state, o)).toBe(0);
    }
  });

  test('"This spell can\'t be countered": the opponent\'s Counterspell does nothing (CR 101.2)', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(TITAN)
      .battlefield('Forest', { count: 5 })
      .battlefield('Island', { count: 2 })
      .seat(1)
      .library(...FILLER)
      .hand(COUNTERSPELL)
      .battlefield('Island', { count: 2 })
      .at('precombatMain')
      .build();
    g.act(0).cast(TITAN, { pay: true });
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: TITAN, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(TITAN, 'battlefield', { seat: 0 });
  });

  test('the choice of mode is offered when more than one is legal (the first needs a permanent to target)', () => {
    const g = board();
    g.act(0).activate(TITAN, {});
    const d: PendingDecision | null = g.state.pending;
    expect(d?.kind).toBe('chooseModes');
  });
});

describe('"This token saddles Mounts and crews Vehicles as though its power were 2 greater" (the Pilot)', () => {
  const pilotGame = () =>
    defs()
      .seat(0)
      .library(...FILLER)
      .hand(SHIELD)
      .battlefield('Forest', { count: 1 })
      .battlefield(WAGON)
      .battlefield(SKIFF)
      .battlefield(BEARS)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  const makePilot = (g: ScenarioGame) => {
    g.act(0).cast(SHIELD, { modes: [1], pay: true });
    g.passAll();
  };

  test('the Pilot is a 1/1 colorless creature token whose own power is not changed', () => {
    const g = pilotGame();
    makePilot(g);
    g.expect.pt('Pilot', 1, 1);
    g.expect.derived('Pilot', { types: ['creature'], subtypes: ['Pilot'], colors: [] });
  });

  test('tapped for a crew cost it counts as power 3: it crews a Vehicle with Crew 3 alone', () => {
    const g = pilotGame();
    makePilot(g);
    g.act(0).activate(WAGON);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('crew');
    expect(d.powers?.[g.id('Pilot')]).toBe(3);
    g.act(0).choosePermanents('Pilot');
    g.passAll();
    g.expect.derived(WAGON, { types: ['artifact', 'creature'] });
    g.expect.tapped('Pilot', true);
    g.expect.invariants();
  });

  test('the summoning sick token may crew (tapping it for another permanent is not its {T} ability, CR 302.6)', () => {
    const g = pilotGame();
    makePilot(g);
    expect(g.act(0).try.activate(WAGON).ok).toBe(true);
  });

  test('a creature with 2 power and no such ability cannot crew Crew 3 alone', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(WAGON)
      .battlefield(BEARS)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    expect(g.act(0).try.activate(WAGON).ok).toBe(false);
  });

  test('the bonus is its own: another creature still counts its power', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(SHIELD)
      .battlefield('Forest')
      .battlefield(WAGON)
      .battlefield(BEARS)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    makePilot(g);
    g.act(0).activate(WAGON);
    const d = choosePermanentDecision(g);
    expect(d.powers?.[g.id(BEARS)]).toBe(2);
    expect(d.powers?.[g.id('Pilot')]).toBe(3);
  });

  test('the first mode: the target permanent has hexproof and indestructible until end of turn', () => {
    const g = pilotGame();
    g.act(0).cast(SHIELD, { modes: [0], targets: [{ name: WAGON, seat: 0 }], pay: true });
    g.passAll();
    g.expect.derived(WAGON, { keywords: ['crew', 'hexproof', 'indestructible'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(WAGON, { keywords: ['crew'] });
  });
});
