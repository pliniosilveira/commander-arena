// "When this artifact enters during the declare attackers step, you may reselect which player or permanent target attacking creature is
// attacking." (D-139): the `duringStep` condition and the `reselectAttack` effect.
// Pins: CR 508.7 (reselecting what a creature attacks), CR 508.7a (it stays in combat, is not declared again, and still counts as having
// attacked the first target), CR 508.7c (the new target must be an opponent of its controller, or a planeswalker or battle of one), CR
// 506.3 (a player, a planeswalker or a battle can be attacked), CR 120.3c (damage to a planeswalker removes loyalty), CR 603.4 (the
// intervening "if" is checked as the event happens), CR 702.36 (Flash).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-reselect.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const SIGNPOST = 'SYNTHETIC Crooked Signpost'; // flash; enters during declare attackers: you may reselect target attacking creature's target
const MARSHAL = 'SYNTHETIC Raid Marshal'; // whenever another player attacks with 2+ creatures, they draw if none of those attacked you
const BANNER = 'SYNTHETIC Dawn Banner'; // flash; enters during the beginning of combat step: draw a card
const PW = 'SYNTHETIC Vanilla Planeswalker'; // loyalty 4
const BEARS = 'Grizzly Bears'; // 2/2

describe('the cards are valid', () => {
  test.each([SIGNPOST, BANNER, MARSHAL])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('reselecting what an attacking creature attacks (CR 508.7)', () => {
  const attacked = () => {
    const g = twoSeatGame(
      (b) => b.battlefield(BEARS),
      (b) => b.battlefield(PW).hand(SIGNPOST).battlefield('Island', { count: 3 }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: BEARS }]);
    return g;
  };

  test('the defender flashes it in during declare attackers and moves the attack to the planeswalker', () => {
    const g = attacked();
    g.act(0).pass();
    g.act(1).cast(SIGNPOST, { pay: true });
    g.passAll();
    // Resolving the trigger: targets the attacking creature, then asks whether to reselect (CR 603.5), then what to attack.
    g.expect.stack([`${SIGNPOST} (ability)`]);
    g.passAll();
    g.act(1).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the choice of what to attack');
    expect(d).toMatchObject({ seat: 1, purpose: 'attackTarget' });
    expect(d.options).toHaveLength(2);
    g.act(1).chooseOption(`permanent:${g.object(PW).id}`);
    g.expect.invariants();
    g.advanceTo('combatDamage');
    g.expect.life(1, 20);
    g.expect.counters(PW, { loyalty: 2 });
  });

  test('choosing the current target keeps the attack as it was', () => {
    const g = attacked();
    g.act(0).pass();
    g.act(1).cast(SIGNPOST, { pay: true });
    g.passAll();
    g.passAll();
    g.act(1).accept();
    g.act(1).chooseOption('player:1');
    g.advanceTo('combatDamage');
    g.expect.life(1, 18);
    g.expect.counters(PW, { loyalty: 4 });
  });

  test('declining the "may" leaves the attack as it was', () => {
    const g = attacked();
    g.act(0).pass();
    g.act(1).cast(SIGNPOST, { pay: true });
    g.passAll();
    g.passAll();
    g.act(1).decline();
    g.advanceTo('combatDamage');
    g.expect.life(1, 18);
  });

  test('the creature stays in combat and nothing triggers again', () => {
    const g = attacked();
    g.act(0).pass();
    g.act(1).cast(SIGNPOST, { pay: true });
    g.passAll();
    g.passAll();
    g.act(1).accept();
    g.act(1).chooseOption(`permanent:${g.object(PW).id}`);
    expect(g.state.combat?.attackers).toHaveLength(1);
    expect(g.state.combat?.attackers[0]?.target).toEqual({
      kind: 'permanent',
      object: g.object(PW).id,
    });
  });
});

describe('only during the named step (CR 603.4)', () => {
  test('cast in another step, the Signpost does nothing', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(BEARS).hand(SIGNPOST).battlefield('Island', { count: 3 }),
      (b) => b,
    );
    g.act(0).cast(SIGNPOST, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(SIGNPOST, 'battlefield', { seat: 0 });
  });

  test('a flash enchantment draws only when it enters in the beginning of combat step', () => {
    const early = twoSeatGame(
      (b) => b.hand(BANNER).battlefield('Plains', { count: 2 }),
      (b) => b,
    );
    early.act(0).cast(BANNER, { pay: true });
    early.passAll();
    early.expect.handSize(0, 0);

    const g = twoSeatGame(
      (b) => b.hand(BANNER).battlefield('Plains', { count: 2 }),
      (b) => b,
    );
    g.advanceTo('beginningOfCombat');
    g.act(0).cast(BANNER, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.handSize(0, 1);
  });
});

describe('the Signpost taps for {U}', () => {
  test('a mana ability', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(SIGNPOST),
      (b) => b,
    );
    g.act(0).tapForMana(SIGNPOST);
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['U']);
  });
});

describe('a reselected attacker is still considered to have attacked the first target (CR 508.7a)', () => {
  // Seat 1 has a Marshal: "Whenever another player attacks with two or more creatures, they draw a card if none of those creatures attacked
  // you." One Bear is declared at the planeswalker and one at the player; the player is the reselect-er and moves the second to the planeswalker.
  // The creature "isn't considered to have attacked a second time ... it's still considered to have attacked the player or permanent
  // chosen as it was declared", so the second Bear attacked seat 1 and the condition fails: nothing is drawn.
  test('the "none of those creatures attacked you" condition reads the targets as declared, not as reselected', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(BEARS, BEARS),
      (b) => b.battlefield(PW, MARSHAL).hand(SIGNPOST).battlefield('Island', { count: 3 }),
    );
    g.advanceTo('declareAttackers');
    const pw = g.object(PW).id;
    g.act(0).declareAttackers([
      { attacker: `${BEARS}[0]`, target: PW },
      { attacker: `${BEARS}[1]`, target: { player: 1 } },
    ]);
    const handBefore = g.state.seats[0]?.hand.length;
    g.act(0).pass();
    g.act(1).cast(SIGNPOST, { pay: true });
    g.passAll();
    // The Signpost's trigger is on top of the Marshal's: reselect the second Bear (target the one attacking the player).
    g.act(1).chooseTargets(`${BEARS}[1]`);
    g.passAll();
    g.act(1).accept();
    g.act(1).chooseOption(`permanent:${pw}`);
    expect(g.state.combat?.attackers.every((a) => a.target.kind === 'permanent')).toBe(true);
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(handBefore);
  });

  test('control: with both Bears declared at the planeswalker none attacked the player, and the attacker draws', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(BEARS, BEARS),
      (b) => b.battlefield(PW, MARSHAL),
    );
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: `${BEARS}[0]`, target: PW },
      { attacker: `${BEARS}[1]`, target: PW },
    ]);
    const handBefore = g.state.seats[0]?.hand.length ?? 0;
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(handBefore + 1);
  });
});
