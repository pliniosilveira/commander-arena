// Myriad with three and four seats (CR 702.116a, 702.116b, 508.4, 111.2): "Whenever this creature attacks, for each opponent other than defending player, you may create a
// token that's a copy of this creature that's tapped and attacking that player or a planeswalker they control. If one or more tokens are created this way, exile the tokens at
// end of combat." The creature with myriad is the SYNTHETIC one of src/cards/fixtures; its copy is not declared as an attacker, so it triggers nothing itself (CR 508.4).
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';

const DRAKE = 'SYNTHETIC Echo Drake';
const FILLER = Array.from({ length: 12 }, () => 'Island');

/** `seats` seats; seat 0 has the Drake (`m`) and attacks seat `at` with it. The trigger is on the stack, nothing answered yet. */
function attacking(seats: 2 | 3 | 4, at = 1): ScenarioGame {
  const b = scenario({ seats })
    .seat(0)
    .battlefield(DRAKE, { label: 'm' })
    .library(...FILLER);
  for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).declareAttackers([{ attacker: 'm', target: { player: at } }]);
  return g;
}

/** The ids of the Drakes of seat 0 on the battlefield besides the one that attacked: the tokens. */
const copies = (g: ScenarioGame) =>
  g
    .find({ name: DRAKE, zone: 'battlefield', seat: 0 })
    .map((o) => o.id)
    .filter((id) => id !== g.id('m'));
const attackedBy = (g: ScenarioGame, id: string) =>
  g.state.combat?.attackers.find((a) => a.object === id)?.target;

describe('myriad: a token copy attacks each opponent other than the defending player', () => {
  test('two seats: nobody else to attack, so no token and no question', () => {
    const g = attacking(2);
    expect(g.state.stack).toHaveLength(0); // nothing to do, so the trigger is not put on the stack
    g.passAll();
    expect(copies(g)).toHaveLength(0);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
  });

  test('three seats: the controller is asked once, and the token attacks the other opponent', () => {
    const g = attacking(3);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    const [token] = copies(g);
    expect(copies(g)).toHaveLength(1);
    expect(token).toBeDefined();
    const obj = token === undefined ? undefined : g.state.objects[token];
    expect(obj?.tapped).toBe(true);
    expect(token === undefined ? null : attackedBy(g, token)).toEqual({ kind: 'player', seat: 2 });
    // The creature that attacked still attacks the player it was aimed at.
    expect(attackedBy(g, g.id('m'))).toEqual({ kind: 'player', seat: 1 });
    g.expect.invariants();
  });

  test('declining makes no token', () => {
    const g = attacking(3);
    g.passAll();
    g.act(0).decline();
    expect(copies(g)).toHaveLength(0);
  });

  test('the opponent attacked is the one left out: aiming at seat 2 sends the token to seat 1', () => {
    const g = attacking(3, 2);
    g.passAll();
    g.act(0).accept();
    const [token] = copies(g);
    expect(token === undefined ? null : attackedBy(g, token)).toEqual({ kind: 'player', seat: 1 });
  });

  test('four seats: one question for each of the two other opponents, in turn order, each answered on its own', () => {
    const g = attacking(4);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    const made = copies(g);
    expect(made).toHaveLength(1);
    const [token] = made;
    // Turn order from the controller: seat 2 is asked first, so the accepted token attacks seat 2.
    expect(token === undefined ? null : attackedBy(g, token)).toEqual({ kind: 'player', seat: 2 });
  });

  test('four seats, both accepted: a token for each of the other two opponents', () => {
    const g = attacking(4);
    g.passAll();
    g.act(0).accept();
    g.act(0).accept();
    const targets = copies(g)
      .map((id) => attackedBy(g, id))
      .map((t) => (t?.kind === 'player' ? t.seat : -1))
      .sort();
    expect(targets).toEqual([2, 3]);
    g.expect.invariants();
  });

  test('the copies do not trigger myriad themselves (CR 508.4): they were never declared as attackers', () => {
    const g = attacking(4);
    g.passAll();
    g.act(0).accept();
    g.act(0).accept();
    // Only the first trigger ran: no further question and nothing on the stack.
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    expect(copies(g)).toHaveLength(2);
  });

  test('the tokens are exiled at end of combat and the creature stays (CR 702.116a)', () => {
    const g = attacking(3);
    g.passAll();
    g.act(0).accept();
    expect(copies(g)).toHaveLength(1);
    g.advanceTo('postcombatMain', { block: false });
    expect(g.find({ name: DRAKE, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    expect(g.state.objects[g.id('m')]?.zone).toBe('battlefield');
  });

  test('with no token made nothing is exiled and nothing waits for the end of combat', () => {
    const g = attacking(3);
    g.passAll();
    g.act(0).decline();
    expect(g.state.delayedTriggers).toHaveLength(0);
  });

  test('unblocked, the creature and its copy each hit the player they attack', () => {
    const g = attacking(3);
    g.passAll();
    g.act(0).accept();
    g.advanceTo('postcombatMain', { block: false });
    // 4 damage from the creature to seat 1 and 4 from its copy to seat 2.
    g.expect.life(1, 36);
    g.expect.life(2, 36);
  });
});

describe('the token may attack a planeswalker of the opponent it was made for (CR 702.116a)', () => {
  const PW = 'SYNTHETIC Vanilla Planeswalker'; // loyalty 4

  /** Three seats; seat 1 (attacked) and seat 2 each control a planeswalker. */
  function withWalkers(): ScenarioGame {
    const b = scenario({ seats: 3 })
      .seat(0)
      .battlefield(DRAKE, { label: 'm' })
      .library(...FILLER);
    b.seat(1)
      .battlefield(PW, { label: 'w1' })
      .library(...FILLER);
    b.seat(2)
      .battlefield(PW, { label: 'w2' })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'm', target: { player: 1 } }]);
    g.passAll();
    g.act(0).accept();
    return g;
  }

  test('the choice is between that player and their planeswalker only', () => {
    const g = withWalkers();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'attackTarget') {
      throw new Error(`expected the choice of what the token attacks, got ${d?.kind}`);
    }
    expect(d.options).toEqual(['player:2', `permanent:${g.id('w2')}`]);
    g.act(0).chooseOption(`permanent:${g.id('w2')}`);
    const [token] = copies(g);
    expect(token === undefined ? null : attackedBy(g, token)).toEqual({
      kind: 'permanent',
      object: g.id('w2'),
    });
  });
});
