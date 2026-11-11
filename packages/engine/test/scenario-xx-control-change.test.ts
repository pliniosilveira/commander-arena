// Control-changing effects (D-189, the Korvold slice 8a): layer 2 (CR 613.1b) with a timestamp (CR 613.7) and a duration (CR 611.2): until end of turn, until
// the end of the controller's next turn, for as long as the controller controls the permanent with the ability (CR 611.2b), and with none (CR 611.2a).
// Pins: CR 110.2 (the controller of a permanent), 108.3 and 400.3 (a card goes to its owner's graveyard), 302.6 (summoning sickness: "continuously since their
// most recent turn began"), 506.4 (a permanent whose controller changes leaves combat), 603.3 and 603.10 (abilities that have triggered stay with the player who
// controlled them), 611.2b and 611.2c (durations "for as long as"; the set is fixed as the effect begins), 613.7 (the later timestamp wins), 106.12 and 603.2
// ("whenever an opponent taps an artifact for mana"), 608.2b (an object that is gone is skipped). The cards are SYNTHETIC (src/cards/fixtures/synthetic-control.ts)
// or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { controllerOf } from '../src/rules/control';
import { type ScenarioGame, scenario } from '../src/testing/index';

const NABBER = 'SYNTHETIC Treasure Nabber';
const SNATCH = 'SYNTHETIC Snatch Creature'; // control until end of turn, untap, haste
const BORROW = 'SYNTHETIC Borrow Creature'; // control until end of turn
const THEFT = 'SYNTHETIC Lasting Theft'; // control, no duration (sorcery)
const LOAN = 'SYNTHETIC Artifact Loan'; // control of an artifact until the end of your next turn (instant)
const LEASH = 'SYNTHETIC Mind Leash'; // control of a creature for as long as you control it
const ECHO = 'SYNTHETIC Spell Echo';
const MAKER = 'SYNTHETIC Make Treasures';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const SOL = 'Sol Ring';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const NABBER_ABILITY = `${NABBER} (ability)`;
const ISAMARU = 'Isamaru, Hound of Konda';
const FILLER = Array.from({ length: 14 }, () => 'Plains');

const controller = (g: ScenarioGame, card: string): number => {
  const [found, ...rest] = g.find({ name: card, zone: 'battlefield' });
  if (found === undefined || rest.length > 0)
    throw new Error(`${card} is not on the battlefield once`);
  return controllerOf(g.state, found);
};
const viewOf = (g: ScenarioGame, seat: 0 | 1, name: string) => {
  const found = g.view(seat).battlefield.find((o) => o.name === name);
  if (found === undefined) throw new Error(`${name} is not on the battlefield`);
  return found;
};

describe('the cards are valid', () => {
  test.each([NABBER, SNATCH, BORROW, THEFT, LOAN, LEASH])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('a control-changing effect is a layer 2 effect with a duration (CR 613.1b, 611.2)', () => {
  const steal = (
    spell: string,
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      scenario()
        .seat(0)
        .hand(spell)
        .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', ANGEL)
        .library(...FILLER)
        .seat(1)
        .battlefield(BEARS)
        .library(...FILLER),
    )
      .at('precombatMain')
      .build();

  test('until end of turn: the creature is controlled by the caster, owned by the other player, and goes back in the cleanup step', () => {
    const g = steal(BORROW);
    g.act(0).cast(BORROW, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(controller(g, BEARS)).toBe(0);
    expect(g.object(BEARS).owner).toBe(1);
    // the stored controller is the player it entered under (CR 110.2); the effect is what changes who controls it
    expect(g.object(BEARS).controller).toBe(1);
    g.expect.invariants();
    g.advanceTo('end');
    expect(controller(g, BEARS)).toBe(0);
    // the cleanup step ends it (CR 514.2); there is no priority in it, so the next turn is where it is seen
    g.advanceTo('upkeep', { turn: 'next' });
    expect(controller(g, BEARS)).toBe(1);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('the view shows it on the new controller side for both players, with when it ends', () => {
    const g = steal(BORROW);
    g.act(0).cast(BORROW, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    for (const seat of [0, 1] as const) {
      const bears = viewOf(g, seat, BEARS);
      expect(bears.controller).toBe(0);
      expect(bears.owner).toBe(1);
      expect(bears.controlEnds).toBe('endOfTurn');
    }
    // a permanent nobody took is not marked
    expect(viewOf(g, 0, ANGEL).controlEnds).toBeUndefined();
  });

  test('the effect says who gained control in the log', () => {
    const g = steal(BORROW);
    const mark = g.mark();
    g.act(0).cast(BORROW, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    expect(g.eventsSince(mark)).toContainEqual(
      expect.objectContaining({ kind: 'controlChanged', from: 1, to: 0 }),
    );
  });

  test('with no duration it lasts for the rest of the game, across turns (CR 611.2a)', () => {
    const g = steal(THEFT);
    g.act(0).cast(THEFT, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    expect(controller(g, BEARS)).toBe(0);
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.step('precombatMain', { active: 0, turn: 5 });
    expect(controller(g, BEARS)).toBe(0);
    expect(viewOf(g, 1, BEARS).controlEnds).toBe('never');
  });

  test('"until the end of your next turn" from your own turn lasts through the opponent turn and your next one (CR 500.1)', () => {
    const g = steal(LOAN, (b) => b.seat(1).battlefield(SOL));
    g.act(0).cast(LOAN, { targets: [{ name: SOL, seat: 1 }], pay: true });
    g.passAll();
    expect(controller(g, SOL)).toBe(0);
    g.advanceTo('upkeep', { turn: 4 }); // turn 3 is this turn: not the "next turn"
    expect(controller(g, SOL)).toBe(0);
    g.advanceTo('end', { turn: 5 }); // turn 5: the next turn of the controller
    g.expect.step('end', { active: 0, turn: 5 });
    expect(controller(g, SOL)).toBe(0);
    g.advanceTo('upkeep', { turn: 6 }); // its cleanup step has ended it
    expect(controller(g, SOL)).toBe(1);
  });

  test('the latest effect decides; when it ends the earlier one still holds (CR 613.7)', () => {
    const g = scenario()
      .seat(0)
      .hand(THEFT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .hand(BORROW)
      .battlefield(BEARS, 'Mountain', 'Mountain')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(THEFT, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    expect(controller(g, BEARS)).toBe(0);
    // the other player takes it back until end of turn, an effect with a later timestamp
    g.pass(0);
    g.act(1).cast(BORROW, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    expect(controller(g, BEARS)).toBe(1);
    g.advanceTo('end');
    expect(controller(g, BEARS)).toBe(1);
    g.advanceTo('upkeep', { turn: 4 });
    expect(controller(g, BEARS)).toBe(0);
    g.expect.invariants();
  });

  test('an effect from a player who controls the permanent already changes nothing about who may attack with it', () => {
    const g = scenario()
      .seat(0)
      .hand(BORROW)
      .battlefield('Mountain', 'Mountain', BEARS, ANGEL)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(BORROW, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    expect(controller(g, BEARS)).toBe(0);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEARS, true);
  });
});

describe('summoning sickness of a permanent that changed controller (CR 302.6)', () => {
  const setup = (spell: string) =>
    scenario()
      .seat(0)
      .hand(spell)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', ANGEL)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('a creature taken this turn cannot attack', () => {
    const g = setup(BORROW);
    g.act(0).cast(BORROW, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    expect(viewOf(g, 0, BEARS).summoningSick).toBe(true);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEARS, false);
    g.expect.canAttack(ANGEL, true);
  });

  test('with haste it can', () => {
    const g = setup(SNATCH);
    g.act(0).cast(SNATCH, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEARS, true);
  });

  test('one that stays under control through the controller next turn can', () => {
    const g = setup(THEFT);
    g.act(0).cast(THEFT, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 5 });
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.step('declareAttackers', { active: 0, turn: 5 });
    g.expect.canAttack(BEARS, true);
  });

  test('the player who had it cannot attack with it, and it is no candidate for them even after it returns mid-turn', () => {
    // Mind Leash on turn 3, destroyed on turn 4 (the other player turn): the creature goes back to its owner during their own turn and is sick again
    const g = scenario()
      .seat(0)
      .hand(LEASH)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .hand(MURDER)
      .battlefield(BEARS, 'Swamp', 'Swamp', 'Swamp', ANGEL)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(LEASH, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: BEARS, seat: 1 });
    g.passAll();
    expect(controller(g, BEARS)).toBe(0);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1, turn: 4 });
    g.act(1).cast(MURDER, { targets: [{ name: LEASH, seat: 0 }], pay: true });
    g.passAll();
    expect(controller(g, BEARS)).toBe(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEARS, false);
    g.expect.canAttack(ANGEL, true);
  });
});

describe('who can use a permanent that changed controller (CR 110.2, 602.2, 605.3)', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand(LOAN)
      .battlefield('Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(SOL)
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();

  test('its mana ability is the new controller, not the old one', () => {
    const g = game();
    g.pass(1);
    g.act(0).cast(LOAN, { targets: [{ name: SOL, seat: 1 }], pay: true });
    g.passAll();
    g.expect.pending('priority', 1);
    g.expect.illegal(1, { tap: { name: SOL, seat: 0 } });
    g.pass(1);
    g.expect.pending('priority', 0);
    g.expect.legal(0, { tap: SOL });
    g.act(0).tapForMana(SOL);
    g.expect.pool(0, 'CC');
  });

  test('it untaps during the untap step of the new controller (CR 502.3)', () => {
    const g = scenario()
      .seat(0)
      .hand(LOAN)
      .battlefield('Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(SOL)
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).tapForMana(SOL);
    g.pass(1);
    g.act(0).cast(LOAN, { targets: [{ name: SOL, seat: 1 }], pay: true });
    g.passAll();
    g.expect.tapped(SOL, true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 4 });
    g.expect.tapped(SOL, false);
    g.expect.legal(0, { tap: SOL });
  });

  test('a creature taken keeps its triggered abilities, which now trigger for the new controller', () => {
    const g = scenario()
      .seat(0)
      .hand(THEFT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(NABBER, SOL)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(THEFT, { targets: [{ name: NABBER, seat: 1 }], pay: true });
    g.passAll();
    expect(controller(g, NABBER)).toBe(0);
    // the former controller taps an artifact: "an opponent" is now them, for the player who controls the Nabber
    g.pass(0);
    g.act(1).tapForMana(SOL);
    g.expect.stack([NABBER_ABILITY]);
    expect(g.view(0).stack[0]?.controller).toBe(0);
    g.passAll();
    g.expect.zone(SOL, 'battlefield', { seat: 0 });
  });

  test('a triggered ability already on the stack stays with the player who controlled it (CR 603.3)', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT, BORROW)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(ECHO)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    // the other player Spell Echo triggers for the spell: it picks a target
    g.expect.pending('targets', 1);
    g.act(1).chooseTargets({ player: 0 });
    g.expect.pending('priority', 0);
    g.act(0).cast(BORROW, { targets: [{ name: ECHO, seat: 1 }], pay: true });
    // casting the second spell triggers it again, for its controller then
    g.act(1).chooseTargets({ player: 0 });
    g.pass(0);
    g.pass(1); // the second trigger resolves
    g.pass(0);
    g.pass(1); // the spell resolves
    expect(controller(g, ECHO)).toBe(0);
    const [bolt, trigger] = g.view(0).stack;
    expect(bolt?.name).toBe(BOLT);
    expect(trigger?.name).toContain('Spell Echo');
    expect(trigger?.controller).toBe(1);
  });
});

describe('a permanent that changed controller dies to its owner (CR 108.3, 400.3)', () => {
  test('a stolen creature that dies goes to the graveyard of its owner', () => {
    const g = scenario()
      .seat(0)
      .hand(THEFT, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(THEFT, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.noObject(BEARS, { zone: 'graveyard', seat: 0 });
    g.expect.invariants();
  });

  test('its dies trigger is the controller it had as it died (CR 603.10a, 113.7a)', () => {
    const g = scenario()
      .seat(0)
      .hand(THEFT, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield('SYNTHETIC Doomed Scout')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(THEFT, { targets: [{ name: 'SYNTHETIC Doomed Scout', seat: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ name: 'SYNTHETIC Doomed Scout', seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Doomed Scout', 'graveyard', { seat: 1 });
    // "you gain 2 life": the player who controlled it as it died
    g.expect.life(0, 42);
    g.expect.life(1, 40);
  });

  test('Persist brings it back under its owner control, not under the control of the player who had it', () => {
    const g = scenario()
      .seat(0)
      .hand(THEFT, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield('SYNTHETIC Persist Wisp')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(THEFT, { targets: [{ name: 'SYNTHETIC Persist Wisp', seat: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ name: 'SYNTHETIC Persist Wisp', seat: 0 }], pay: true });
    g.passAll();
    // Persist and the "dies" ability both trigger for the player who controlled it as it died
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.zone('SYNTHETIC Persist Wisp', 'battlefield', { seat: 1 });
    g.expect.counters({ name: 'SYNTHETIC Persist Wisp', zone: 'battlefield' }, { '-1/-1': 1 });
    // the new object is not under the old effect (CR 400.7)
    expect(controller(g, 'SYNTHETIC Persist Wisp')).toBe(1);
  });

  test('a stolen commander dying asks its owner about the command zone, and its tax is not touched', () => {
    const g = scenario()
      .seat(0)
      .hand(THEFT, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(ISAMARU, { commander: true, casts: 2 })
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(THEFT, { targets: [{ name: ISAMARU, seat: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ name: ISAMARU, seat: 0 }], pay: true });
    g.passAll();
    g.expect.pending('commanderZone', 1);
    g.act(1).sendToCommandZone();
    g.expect.zone(ISAMARU, 'command', { seat: 1 });
    expect(g.object({ name: ISAMARU, zone: 'command' }).owner).toBe(1);
    expect(Object.values(g.state.commanderCasts)).toEqual([2]);
  });

  test('a token that is taken and sacrificed ceases to exist, and nothing goes to a graveyard', () => {
    const g = scenario()
      .seat(0)
      .hand(LOAN)
      .battlefield('Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .hand(MAKER)
      .battlefield('Mountain', 'Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MAKER, { pay: true });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 1, count: 2 });
    g.pass(1);
    g.act(0).cast(LOAN, { targets: [{ name: 'Treasure', seat: 1, nth: 0 }], pay: true });
    g.passAll();
    expect(
      g
        .find({ name: 'Treasure', zone: 'battlefield' })
        .map((o) => controllerOf(g.state, o))
        .sort(),
    ).toEqual([0, 1]);
    g.pass(1);
    g.act(0).tapForMana({ name: 'Treasure', seat: 0 }, { color: 'R' });
    g.expect.zone('Treasure', 'battlefield', { seat: 1, count: 1 });
    g.expect.noObject('Treasure', { zone: 'graveyard' });
  });
});

describe('combat: a permanent whose controller changes is removed from combat (CR 506.4)', () => {
  const setup = () =>
    scenario()
      .seat(0)
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .hand(BORROW)
      .battlefield('Mountain', 'Mountain', ANGEL)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('an attacking creature taken after it was declared stops attacking', () => {
    const g = setup();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.pass(0);
    g.act(1).cast(BORROW, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    expect(controller(g, BEARS)).toBe(1);
    g.expect.eventLog([{ kind: 'controlChanged', from: 0, to: 1 }, { kind: 'removedFromCombat' }]);
    expect(g.state.combat?.attackers ?? []).toEqual([]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40);
  });

  test('a blocker taken after blocks were declared stops blocking; the attacker it blocked stays blocked', () => {
    const g = scenario()
      .seat(0)
      .hand(BORROW)
      .battlefield('Mountain', 'Mountain', BEARS)
      .library(...FILLER)
      .seat(1)
      .battlefield(ISAMARU)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.passAll();
    g.expect.step('declareBlockers', { active: 0 });
    g.act(1).declareBlockers([{ blocker: ISAMARU, attacker: BEARS }]);
    g.act(0).cast(BORROW, { targets: [{ name: ISAMARU, seat: 1 }], pay: true });
    g.passAll();
    expect(controller(g, ISAMARU)).toBe(0);
    expect(g.state.combat?.blocks ?? []).toEqual([]);
    g.advanceTo('endOfCombat');
    // the Bears were blocked (CR 509.1h): they dealt no damage to the player, and the creature that blocked them took none
    g.expect.life(1, 40);
    g.expect.damage(ISAMARU, 0);
    g.expect.damage(BEARS, 0);
  });
});

describe('"for as long as you control this" (CR 611.2b)', () => {
  const setup = () =>
    scenario()
      .seat(0)
      .hand(LEASH, BORROW)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .hand(MURDER)
      .battlefield(BEARS, 'Swamp', 'Swamp', 'Swamp')
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the creature is controlled while the permanent with the ability is, and goes back as it leaves', () => {
    const g = setup();
    g.act(0).cast(LEASH, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: BEARS, seat: 1 });
    g.passAll();
    expect(controller(g, BEARS)).toBe(0);
    g.pass(0);
    g.act(1).cast(MURDER, { targets: [{ name: LEASH, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(LEASH, 'graveyard', { seat: 0 });
    expect(controller(g, BEARS)).toBe(1);
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('when the ability would begin after the permanent left, it does nothing at all (CR 611.2b)', () => {
    const g = setup();
    g.act(0).cast(LEASH, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: BEARS, seat: 1 });
    // in response to the trigger the other player destroys the creature that has it
    g.pass(0);
    g.act(1).cast(MURDER, { targets: [{ name: LEASH, seat: 0 }], pay: true });
    g.passAll();
    g.passAll();
    expect(controller(g, BEARS)).toBe(1);
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('when the controller of the permanent with the ability changes, the effect ends for good (CR 611.2b)', () => {
    const g = scenario()
      .seat(0)
      .hand(LEASH)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .hand(BORROW)
      .battlefield(BEARS, 'Mountain', 'Mountain')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(LEASH, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: BEARS, seat: 1 });
    g.passAll();
    expect(controller(g, BEARS)).toBe(0);
    // the other player takes the Leash until end of turn: its first controller no longer controls it, so the Bears go back
    g.pass(0);
    g.act(1).cast(BORROW, { targets: [{ name: LEASH, seat: 0 }], pay: true });
    g.passAll();
    expect(controller(g, LEASH)).toBe(1);
    expect(controller(g, BEARS)).toBe(1);
    // when the Leash goes back, the effect does not begin again
    g.advanceTo('upkeep', { turn: 4 });
    expect(controller(g, LEASH)).toBe(0);
    expect(controller(g, BEARS)).toBe(1);
    expect(g.state.continuousEffects).toEqual([]);
  });
});

describe('the end of the game (CR 800.4a, two seats)', () => {
  test('the previous controller conceding ends the game with the taker as the winner', () => {
    const g = scenario()
      .seat(0)
      .hand(THEFT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(THEFT, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.pass(0);
    g.act(1).concede();
    g.expect.gameOver({ win: 0 });
    g.expect.invariants();
  });

  test('the player who took it conceding ends the game too', () => {
    const g = scenario()
      .seat(0)
      .hand(BORROW)
      .battlefield('Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(BORROW, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.act(0).concede();
    g.expect.gameOver({ win: 1 });
  });
});

describe('"Whenever an opponent taps an artifact for mana, gain control of that artifact until the end of your next turn." (CR 106.12, 603.2)', () => {
  const game = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      scenario()
        .seat(0)
        .battlefield(NABBER, 'Mountain')
        .library(...FILLER)
        .seat(1)
        .hand(SOL, MAKER)
        .battlefield(SOL, 'Mountain', 'Mountain')
        .library(...FILLER),
    )
      .at('precombatMain', { active: 1 })
      .build();

  test('the opponent taps an artifact for mana: the trigger goes on the stack and the Nabber controller gains control of it', () => {
    const g = game();
    g.act(1).tapForMana({ name: SOL, zone: 'battlefield' });
    g.expect.stack([NABBER_ABILITY]);
    g.expect.pending('priority', 1);
    g.passAll();
    g.expect.zone(SOL, 'battlefield', { seat: 0 });
    expect(controller(g, SOL)).toBe(0);
    expect(viewOf(g, 1, SOL).controlEnds).toEqual({ endOfTurnOf: 0 });
    g.expect.invariants();
  });

  test('paying for a spell with it triggers too, after the spell is cast', () => {
    const g = scenario()
      .seat(0)
      .battlefield(NABBER)
      .library(...FILLER)
      .seat(1)
      .hand(SOL)
      .battlefield(SOL)
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(SOL, { pay: true });
    g.expect.stack([NABBER_ABILITY, SOL]);
    g.passAll();
    g.passAll();
    g.expect.zone(SOL, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(SOL, 'battlefield', { seat: 1, count: 1 });
  });

  test('it lasts through the controller next turn and ends at its cleanup step; the artifact untaps for the new controller on the way', () => {
    const g = game();
    g.act(1).tapForMana({ name: SOL, zone: 'battlefield' });
    g.passAll();
    g.advanceTo('end'); // turn 3 is the opponent turn here
    expect(controller(g, SOL)).toBe(0);
    g.advanceTo('upkeep', { turn: 4 });
    g.expect.step('upkeep', { active: 0, turn: 4 });
    g.expect.tapped({ name: SOL, zone: 'battlefield' }, false);
    g.expect.legal(0, { tap: { name: SOL, zone: 'battlefield' } });
    g.advanceTo('end', { turn: 4 });
    expect(controller(g, SOL)).toBe(0);
    g.advanceTo('upkeep', { turn: 5 });
    expect(controller(g, SOL)).toBe(1);
  });

  test('it ends in the cleanup step of the controller turn after the one in which the artifact was tapped, even when that was their own', () => {
    // the opponent taps it during the Nabber controller own turn: "your next turn" is the following one
    const g = scenario()
      .seat(0)
      .battlefield(NABBER)
      .library(...FILLER)
      .seat(1)
      .battlefield(SOL)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.pass(0);
    g.act(1).tapForMana({ name: SOL, zone: 'battlefield' });
    g.passAll();
    expect(controller(g, SOL)).toBe(0);
    g.advanceTo('end', { turn: 4 });
    expect(controller(g, SOL)).toBe(0);
    g.advanceTo('end', { turn: 5 });
    g.expect.step('end', { active: 0, turn: 5 });
    expect(controller(g, SOL)).toBe(0);
    g.advanceTo('upkeep', { turn: 6 });
    expect(controller(g, SOL)).toBe(1);
  });

  test('a Treasure is sacrificed as it is tapped: the ability triggers and has nothing to take', () => {
    const g = game();
    g.act(1).cast(MAKER, { pay: true });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 1, count: 2 });
    g.act(1).tapForMana({ name: 'Treasure', zone: 'battlefield', nth: 0 }, { color: 'R' });
    g.expect.stack([NABBER_ABILITY]);
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { count: 1 });
    expect(
      g.find({ name: 'Treasure', zone: 'battlefield' }).map((o) => controllerOf(g.state, o)),
    ).toEqual([1]);
    g.expect.noObject('Treasure', { zone: 'graveyard' });
  });

  test('a land is not an artifact, and the Nabber controller own artifacts do not trigger it', () => {
    const g = game((b) => b);
    g.act(1).tapForMana({ name: 'Mountain', seat: 1, nth: 0 });
    g.expect.stack([]);
    expect(controller(g, SOL)).toBe(1);
  });

  test('its own controller tapping an artifact does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(NABBER, SOL)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(SOL);
    g.expect.stack([]);
  });

  test('the effect does not depend on the Nabber: it stays when the Nabber is gone (CR 611.2b)', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield(NABBER, 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(SOL, 'Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).tapForMana({ name: SOL, zone: 'battlefield' });
    g.passAll();
    expect(controller(g, SOL)).toBe(0);
    g.pass(1);
    g.act(0).cast(BOLT, { targets: [{ name: NABBER, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(NABBER, 'graveyard', { seat: 0 });
    expect(controller(g, SOL)).toBe(0);
  });

  test('two Nabbers trigger twice; the later effect decides and neither does anything wrong', () => {
    const g = scenario()
      .seat(0)
      .battlefield(NABBER, NABBER)
      .library(...FILLER)
      .seat(1)
      .battlefield(SOL)
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).tapForMana({ name: SOL, zone: 'battlefield' });
    // both of them trigger at once: their controller puts them on the stack in the order they choose
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack.length).toBe(2);
    g.passAll();
    expect(controller(g, SOL)).toBe(0);
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'control').length).toBe(2);
  });
});
