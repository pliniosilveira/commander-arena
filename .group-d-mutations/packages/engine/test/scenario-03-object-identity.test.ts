// Scenario 3 (SPEC 12): object identity. A creature targeted by removal is flickered in response;
// the removal doesn't resolve, and the returned creature is a new object without its old counters,
// damage or Auras.
// Pins: CR 400.7 (General): an object that moves from one zone to another becomes a new object with
// no memory of, or relation to, its previous existence; CR 608.2b (Resolving Spells and Abilities):
// a target that is no longer in the zone it was in when it was targeted is illegal, so a spell
// whose only target is illegal doesn't resolve; CR 704.5m (State-Based Actions): an Aura attached to
// nothing is put into its owner's graveyard; CR 121.2 / 122.2 (Counters) and CR 120.6 (Damage):
// counters and marked damage stay with the object, not the card; CR 302.6 (Summoning Sickness): a
// creature that comes under its controller's control is sick until their next turn; CR 603.6a: the
// new object's enters abilities trigger.
// The flicker is real: "SYNTHETIC Blink" says "Exile target creature, then return it to the
// battlefield under its owner's control", an `exile` effect followed by a `moveToZone` of the
// `moved` reference (the new object the exile produced, CR 400.7j). Exile and return are two
// separate zone changes, so the creature is a new object after each (CR 400.7). The second
// describe block pins the details of that path (the exile step, a token that does not come back,
// "each creature", control); the third runs the same identity rules through a real bounce
// (Unsummon) and a recast.
import { describe, expect, test } from 'vitest';
import type { SpellText } from '../src/ast/types';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BLINK = 'SYNTHETIC Blink';
const AURA = 'SYNTHETIC Might Aura'; // Enchant creature; +2/+2
const BEARS = 'Grizzly Bears';

/** "Exile [what], then return it to the battlefield under its owner's control." */
function flickerOf(name: string, text: string, spell: Partial<SpellText>) {
  return singleFaceCard({
    name,
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: text,
    spell: {
      ...spell,
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: spell.targets ? { kind: 'target', id: 't1' } : EACH_MINE },
          {
            kind: 'moveToZone',
            objects: { kind: 'moved' },
            to: 'battlefield',
            controller: 'owner',
          },
        ],
      },
    },
  });
}

const EACH_MINE = { kind: 'each', filter: { types: ['creature'], controller: 'you' } } as const;
const BLINK_ALL = 'SYNTHETIC Blink All';
const BLINK_ANY = 'SYNTHETIC Blink Any';

const blink = flickerOf(
  BLINK,
  "Exile target creature, then return it to the battlefield under its owner's control.",
  {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
  },
);
const blinkAny = flickerOf(
  BLINK_ANY,
  "Exile target permanent, then return it to the battlefield under its owner's control.",
  { targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'battlefield' } } }] },
);
const blinkAll = flickerOf(
  BLINK_ALL,
  "Exile each creature you control, then return them to the battlefield under their owners' control.",
  {},
);

/**
 * Seat 1's Bears carry a +1/+1 counter, 2 damage and a Might Aura (+2/+2): a 5/5 with 2 damage.
 * Seat 0 has cast Murder at it and passed, so seat 1 has priority with Murder on the stack.
 */
function murderOnTheStack() {
  const g = scenario()
    .seat(0)
    .hand('Murder')
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .seat(1)
    .hand(BLINK, 'Unsummon')
    .battlefield('Island', 'Island', 'Forest')
    .library('Plains', 'Plains')
    .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 1 }, damage: 2 })
    .battlefield(AURA, { label: 'aura', attachedTo: 'bears' })
    .define(blink)
    .build();
  g.act(0).cast('Murder', { targets: ['bears'], pay: true });
  g.act(0).pass();
  return g;
}

describe('SPEC scenario 3: flickered in response (CR 400.7, 608.2b)', () => {
  test('before any response the creature is a 5/5 with a counter, damage and its Aura', () => {
    const g = murderOnTheStack();
    g.expect.pt('bears', 5, 5);
    g.expect.counters('bears', { '+1/+1': 1 });
    g.expect.damage('bears', 2);
    g.expect.attached('aura', 'bears');
  });

  test('the creature comes back as a new object: no counters, no damage, no Aura', () => {
    const g = murderOnTheStack();
    const oldId = g.id('bears');
    g.act(1).cast(BLINK, { targets: ['bears'], pay: true });
    g.act(1).pass();
    g.act(0).pass();
    const newId = g.id('bears');
    expect(newId).not.toBe(oldId);
    expect(g.state.objects[oldId]).toBeUndefined();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.counters('bears', {});
    g.expect.damage('bears', 0);
    g.expect.pt('bears', 2, 2);
    // The Aura was attached to the old object: it is attached to nothing, so it is put into its
    // owner's graveyard by the state-based action (CR 704.5m).
    g.expect.zone(AURA, 'graveyard', { seat: 1 });
    g.expect.noObject(AURA, { zone: 'battlefield' });
  });

  test('the removal does not resolve: its target is gone, it goes to the graveyard and does nothing', () => {
    const g = murderOnTheStack();
    g.act(1).cast(BLINK, { targets: ['bears'], pay: true });
    g.act(1).pass();
    g.act(0).pass();
    g.expect.stack(['Murder']);
    const mark = g.mark();
    g.act(0).pass();
    g.act(1).pass();
    g.expect.eventLog([{ kind: 'fizzled', cardName: 'Murder' }], { since: mark });
    // Nothing died as the removal fizzled. (The Aura that lost its creature to the flicker died earlier, CR 700.4: that is before `mark`.)
    g.expect.noEvent({ kind: 'died' }, { since: mark });
    g.expect.zone('Murder', 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('a creature that was not flickered is destroyed (the control)', () => {
    const g = murderOnTheStack();
    g.act(1).pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(AURA, 'graveyard', { seat: 1 });
  });

  test('the new object is summoning sick (CR 302.6) and its enters ability triggers again (CR 603.6a)', () => {
    const g = scenario()
      .seat(0)
      .hand(BLINK)
      .battlefield('Island')
      .battlefield(BEARS, 'SYNTHETIC Enters Draw Creature')
      .library('Plains', 'Plains')
      .define(blink)
      .seat(1)
      .build();
    g.act(0).cast(BLINK, { targets: ['SYNTHETIC Enters Draw Creature'], pay: true });
    g.expect.handSize(0, 0);
    g.passAll();
    // The returned creature entered again, so its "when this enters, draw a card" triggered.
    g.expect.handSize(0, 1);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack('SYNTHETIC Enters Draw Creature', false);
    g.expect.canAttack(BEARS, true);
  });
});

describe('SPEC scenario 3: the exile-and-return path (CR 400.7, 400.7j, 111.8, 110.2)', () => {
  test('the creature really goes to exile first: two zone changes, so two new objects', () => {
    const g = scenario()
      .seat(0)
      .hand(BLINK)
      .battlefield('Island')
      .battlefield(BEARS, { label: 'bears' })
      .define(blink)
      .seat(1)
      .build();
    const first = g.id('bears');
    g.act(0).cast(BLINK, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.eventLog([
      { kind: 'zoneChanged', cardName: BEARS, fromZone: 'battlefield', toZone: 'exile' },
      { kind: 'zoneChanged', cardName: BEARS, fromZone: 'exile', toZone: 'battlefield' },
    ]);
    const exiled = g.events.find((e) => e.kind === 'zoneChanged' && e.toZone === 'exile');
    const returned = g.events.find((e) => e.kind === 'zoneChanged' && e.toZone === 'battlefield');
    if (exiled?.kind !== 'zoneChanged' || returned?.kind !== 'zoneChanged')
      throw new Error('no moves');
    expect(exiled.from).toBe(first);
    // CR 400.7j: the return found the object the exile made, not the one that left the battlefield.
    expect(returned.from).toBe(exiled.to);
    expect(returned.to).toBe(g.id('bears'));
    expect(new Set([first, exiled.to, returned.to]).size).toBe(3);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'exile' });
    g.expect.invariants();
  });

  test('a token that is flickered is exiled and does not come back (CR 111.8, 704.5d)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Make Treasures', BLINK_ANY)
      .battlefield('Mountain', 'Island', 'Island')
      .define(blinkAny)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Make Treasures', { pay: true });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
    g.act(0).cast(BLINK_ANY, { targets: [{ name: 'Treasure', nth: 0 }], pay: true });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.expect.noObject('Treasure', { zone: 'exile' });
    expect(g.state.exile).toEqual([]);
  });

  test('"each creature you control": every one returns, each as a new object', () => {
    const g = scenario()
      .seat(0)
      .hand(BLINK_ALL)
      .battlefield('Island')
      .battlefield(BEARS, { label: 'a', counters: { '+1/+1': 1 } })
      .battlefield('SYNTHETIC Vanilla 3/3', { label: 'b', damage: 1 })
      .define(blinkAll)
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'theirs' })
      .build();
    const before = [g.id('a'), g.id('b'), g.id('theirs')];
    g.act(0).cast(BLINK_ALL, { pay: true });
    g.passAll();
    expect(g.id('a')).not.toBe(before[0]);
    expect(g.id('b')).not.toBe(before[1]);
    expect(g.id('theirs')).toBe(before[2]);
    g.expect.pt('a', 2, 2);
    g.expect.damage('b', 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('SYNTHETIC Vanilla 3/3', 'battlefield', { seat: 0 });
    expect(g.state.exile).toEqual([]);
  });

  test('when nothing was exiled nothing returns', () => {
    const g = scenario()
      .seat(0)
      .hand(BLINK_ALL)
      .battlefield('Island')
      .define(blinkAll)
      .seat(1)
      .build();
    g.act(0).cast(BLINK_ALL, { pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'zoneChanged', toZone: 'exile' });
    g.expect.noEvent({ kind: 'zoneChanged', toZone: 'battlefield' });
  });

  test('a commander that is flickered ends on the battlefield and is never asked about the command zone (CR 903.9a)', () => {
    const g = scenario()
      .seat(0)
      .hand(BLINK)
      .battlefield('Island')
      .battlefield(BEARS, { label: 'cmdr', commander: true })
      .define(blink)
      .seat(1)
      .build();
    g.act(0).cast(BLINK, { targets: ['cmdr'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.pending('priority', 0);
    expect(g.state.commanderWatch.every((id) => g.state.objects[id] === undefined)).toBe(true);
    g.expect.invariants();
  });

  test('"under your control" gives the creature to the caster, whoever owned it (CR 110.2)', () => {
    const takeover = singleFaceCard({
      name: 'SYNTHETIC Blink Mine',
      manaCost: ['U'],
      types: ['instant'],
      colors: ['U'],
      colorIdentity: ['U'],
      oracleText: 'Exile target creature, then return it to the battlefield under your control.',
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'target', id: 't1' } },
            {
              kind: 'moveToZone',
              objects: { kind: 'moved' },
              to: 'battlefield',
              controller: 'you',
            },
          ],
        },
      },
    });
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Blink Mine')
      .battlefield('Island')
      .define(takeover)
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .build();
    g.act(0).cast('SYNTHETIC Blink Mine', { targets: ['theirs'], pay: true });
    g.passAll();
    expect(g.object('theirs').controller).toBe(0);
    expect(g.object('theirs').owner).toBe(1);
  });

  test('a stolen creature returns under its owner control, not its controller (CR 110.2)', () => {
    const g = scenario()
      .seat(0)
      .hand(BLINK)
      .battlefield('Island')
      .define(blink)
      .seat(1)
      .battlefield(BEARS, { label: 'stolen', controller: 0 })
      .build();
    expect(g.object('stolen').controller).toBe(0);
    g.act(0).cast(BLINK, { targets: ['stolen'], pay: true });
    g.passAll();
    expect(g.object('stolen').controller).toBe(1);
    expect(g.object('stolen').owner).toBe(1);
  });
});

describe('SPEC scenario 3: the same rules with a real bounce and a recast (CR 400.7)', () => {
  test('Unsummon in response: Murder has no target, and the recast creature is a fresh 2/2', () => {
    const g = murderOnTheStack();
    const oldId = g.id('bears');
    g.act(1).cast('Unsummon', { targets: ['bears'], pay: true });
    g.act(1).pass();
    g.act(0).pass();
    g.expect.zone(BEARS, 'hand', { seat: 1 });
    expect(g.state.objects[oldId]).toBeUndefined();
    g.expect.zone(AURA, 'graveyard', { seat: 1 });
    const mark = g.mark();
    g.act(0).pass();
    g.act(1).pass();
    g.expect.eventLog([{ kind: 'fizzled', cardName: 'Murder' }], { since: mark });
    g.expect.zone('Murder', 'graveyard', { seat: 0 });
    // On its own turn seat 1 casts the Bears again: a new object with nothing from before.
    g.advanceTo('precombatMain', { turn: 4 });
    g.act(1).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    expect(g.id(BEARS)).not.toBe(oldId);
    g.expect.counters(BEARS, {});
    g.expect.damage(BEARS, 0);
    g.expect.pt(BEARS, 2, 2);
  });
});
