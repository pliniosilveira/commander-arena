// Planeswalkers and battles as attack targets.
// Pins: CR 506.3 (Combat Phase): a player, a planeswalker or a battle can be attacked. CR 508.1b: the
// active player chooses, for each attacker, which defending player, planeswalker or battle it
// attacks. CR 120.3c: damage to a planeswalker removes that many loyalty counters; CR 120.3h: damage
// to a battle removes that many defense counters; CR 704.5i: a planeswalker with loyalty 0 goes to
// its owner's graveyard; CR 704.5w: so does a non-Siege battle with defense 0. CR 310.9b: a battle's
// protector can never attack it. CR 310.9c: its protector may block creatures attacking it. CR 508.5
// and 509.1a: the controller of an attacked planeswalker may block creatures attacking it.
// CR 510.1b: an unblocked creature assigns its damage only to what it attacks.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const PW = 'SYNTHETIC Vanilla Planeswalker';
const BATTLE = 'SYNTHETIC Vanilla Battle';
const A3 = 'SYNTHETIC Vanilla 3/3';
const A5 = 'SYNTHETIC Vanilla 5/5';

type B = ReturnType<typeof scenario>;

function attack(
  seat0: (b: B) => void,
  seat1: (b: B) => void,
  attacks: { attacker: string; target?: string }[],
  blocks?: { blocker: string; attacker: string }[],
) {
  const b = scenario().seat(0).library('Island', { count: 4 });
  seat0(b);
  b.seat(1).library('Island', { count: 4 });
  seat1(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers');
  g.act(0).declareAttackers(attacks);
  g.advanceTo('declareBlockers');
  if (blocks) g.act(1).declareBlockers(blocks);
  return g;
}

describe('attacking a planeswalker (CR 120.3c, 704.5i)', () => {
  test('unblocked damage removes loyalty counters, and none of it reaches the player', () => {
    const g = attack(
      (b) => b.battlefield(A3),
      (b) => b.battlefield(PW),
      [{ attacker: A3, target: PW }],
    );
    g.advanceTo('combatDamage');
    g.expect.counters(PW, { loyalty: 1 });
    g.expect.life(1, 40);
    g.expect.zone(PW, 'battlefield', { seat: 1 });
    g.expect.eventLog([{ kind: 'counterRemoved', counter: 'loyalty', count: 3 }]);
  });

  test('damage equal to loyalty puts the planeswalker into the graveyard before anyone has priority', () => {
    const g = attack(
      (b) => b.battlefield('Serra Angel'),
      (b) => b.battlefield(PW),
      [{ attacker: 'Serra Angel', target: PW }],
    );
    g.advanceTo('combatDamage');
    g.expect.zone(PW, 'graveyard', { seat: 1 });
    g.expect.noObject(PW, { zone: 'battlefield' });
    g.expect.life(1, 40);
  });

  test('damage beyond the loyalty is lost: it does not go to the player', () => {
    const g = attack(
      (b) => b.battlefield(A5),
      (b) => b.battlefield(PW),
      [{ attacker: A5, target: PW }],
    );
    g.advanceTo('combatDamage');
    g.expect.zone(PW, 'graveyard', { seat: 1 });
    g.expect.life(1, 40);
  });

  test('several attackers add up on the planeswalker', () => {
    const g = attack(
      (b) => b.battlefield('SYNTHETIC Vanilla 2/2', 'SYNTHETIC Vanilla 1/1'),
      (b) => b.battlefield(PW, { counters: { loyalty: 3 } }),
      [
        { attacker: 'SYNTHETIC Vanilla 2/2', target: PW },
        { attacker: 'SYNTHETIC Vanilla 1/1', target: PW },
      ],
    );
    g.advanceTo('combatDamage');
    g.expect.zone(PW, 'graveyard', { seat: 1 });
  });

  test('attackers may be split between the player and the planeswalker (CR 508.1b)', () => {
    const g = attack(
      (b) => b.battlefield(A3, 'Grizzly Bears'),
      (b) => b.battlefield(PW),
      [{ attacker: A3, target: PW }, { attacker: 'Grizzly Bears' }],
    );
    g.expect.combat({
      targets: [
        { attacker: A3, target: PW },
        { attacker: 'Grizzly Bears', target: { player: 1 } },
      ],
    });
    g.advanceTo('combatDamage');
    g.expect.counters(PW, { loyalty: 1 });
    g.expect.life(1, 38);
  });

  test('a creature of the planeswalker controller may block the attacker (CR 509.1a); no damage reaches the planeswalker', () => {
    const g = attack(
      (b) => b.battlefield(A3),
      (b) => b.battlefield(PW).battlefield('SYNTHETIC Vanilla 5/5'),
      [{ attacker: A3, target: PW }],
      [{ blocker: 'SYNTHETIC Vanilla 5/5', attacker: A3 }],
    );
    g.advanceTo('combatDamage');
    g.expect.counters(PW, { loyalty: 4 });
    g.expect.damage('SYNTHETIC Vanilla 5/5', 3);
    g.expect.zone(A3, 'graveyard', { seat: 0 });
  });

  test('the same blocker may also block an attacker that attacks the player', () => {
    const g = attack(
      (b) => b.battlefield(A3, 'Grizzly Bears'),
      (b) => b.battlefield(PW).battlefield('SYNTHETIC Vanilla 2/2'),
      [{ attacker: A3, target: PW }, { attacker: 'Grizzly Bears' }],
    );
    g.expect.canBlock('SYNTHETIC Vanilla 2/2', A3);
    g.expect.canBlock('SYNTHETIC Vanilla 2/2', 'Grizzly Bears');
  });

  test('a planeswalker is not a creature: it cannot attack or block', () => {
    const g = attack(
      (b) => b.battlefield(A3).battlefield(PW),
      (b) => b.battlefield(PW),
      [{ attacker: A3 }],
    );
    // Only seat 1's planeswalker could be a "blocker" and it is not a creature: no decision at all.
    g.expect.step('declareBlockers');
    g.expect.pending('priority', 0);
  });

  test('the attacker cannot attack its own planeswalker, only the opponent ones (CR 506.3)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(A3)
      .battlefield(PW)
      .seat(1)
      .battlefield(PW)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers') throw new Error('expected declareAttackers');
    const ownPw = g.id({ name: PW, seat: 0 });
    const theirPw = g.id({ name: PW, seat: 1 });
    expect(d.candidates[0]?.targets).toEqual([
      { kind: 'player', seat: 1 },
      { kind: 'permanent', object: theirPw },
    ]);
    const before = g.hash();
    expect(
      g.act(0).try.action({
        kind: 'declareAttackers',
        attacks: [{ attacker: g.id(A3), target: { kind: 'permanent', object: ownPw } }],
      }),
    ).toEqual({ ok: false, error: 'That cannot be attacked' });
    g.expect.hash(before);
  });
});

describe('attacking a battle (CR 120.3h, 704.5w, 310.9)', () => {
  test('damage removes defense counters', () => {
    const g = attack((b) => b.battlefield(A3).battlefield(BATTLE), () => {}, [
      { attacker: A3, target: BATTLE },
    ]);
    g.advanceTo('combatDamage');
    g.expect.counters(BATTLE, { defense: 2 });
    g.expect.life(1, 40);
  });

  test('no defense left puts the battle into its owner graveyard', () => {
    const g = attack((b) => b.battlefield(A5).battlefield(BATTLE), () => {}, [
      { attacker: A5, target: BATTLE },
    ]);
    g.advanceTo('combatDamage');
    g.expect.zone(BATTLE, 'graveyard', { seat: 0 });
    g.expect.life(1, 40);
  });

  test('a battle is attacked and protected by the opponent: its controller attacks it, the protector blocks for it', () => {
    const g = attack(
      (b) => b.battlefield(A3).battlefield(BATTLE),
      (b) => b.battlefield('SYNTHETIC Vanilla 5/5'),
      [{ attacker: A3, target: BATTLE }],
    );
    expect(g.object(BATTLE).protector).toBe(1);
    g.expect.canBlock('SYNTHETIC Vanilla 5/5', A3);
    g.act(1).declareBlockers([{ blocker: 'SYNTHETIC Vanilla 5/5', attacker: A3 }]);
    g.advanceTo('combatDamage');
    g.expect.counters(BATTLE, { defense: 5 });
  });

  test('the protector can never attack it (CR 310.9b): not a target on the protector turn', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BATTLE)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(A3)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.advanceTo('declareAttackers');
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers') throw new Error('expected declareAttackers');
    expect(d.candidates).toEqual([{ attacker: g.id(A3), targets: [{ kind: 'player', seat: 0 }] }]);
    g.expect.illegal(1, { declareAttackers: [{ attacker: A3, target: BATTLE }] });
  });

  test('a battle controlled by seat 1 and protected by seat 0 cannot be attacked by seat 0 but can by seat 1', () => {
    const g = scenario()
      .seat(0)
      .battlefield(A3)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(BATTLE)
      .battlefield('Grizzly Bears')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.expect.illegal(0, { declareAttackers: [{ attacker: A3, target: BATTLE }] });
    g.advanceTo('declareAttackers', { turn: 4 });
    g.expect.legal(1, { declareAttackers: [{ attacker: 'Grizzly Bears', target: BATTLE }] });
  });

  test('a battle is not a creature: it does not attack or block', () => {
    const g = attack(
      (b) => b.battlefield(A3),
      (b) => b.battlefield(BATTLE),
      [{ attacker: A3 }],
    );
    g.expect.pending('priority', 0);
  });

  test('a planeswalker and a battle may be attacked in the same combat', () => {
    const g = attack(
      (b) => b.battlefield(A3, 'SYNTHETIC Vanilla 2/2').battlefield(BATTLE),
      (b) => b.battlefield(PW),
      [
        { attacker: A3, target: PW },
        { attacker: 'SYNTHETIC Vanilla 2/2', target: BATTLE },
      ],
    );
    g.advanceTo('combatDamage');
    g.expect.counters(PW, { loyalty: 1 });
    g.expect.counters(BATTLE, { defense: 3 });
  });
});
