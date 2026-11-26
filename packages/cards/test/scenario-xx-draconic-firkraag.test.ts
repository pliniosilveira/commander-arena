// Draconic Dissent deck (issue 167), goad group: Firkraag, Cunning Instigator read from its real Oracle text and run by the engine at three seats.
// "Whenever one or more Dragons you control attack an opponent, goad target creature that player controls." and
// "Whenever a creature deals combat damage to one of your opponents, if that creature had to attack this combat, you put a +1/+1 counter on ~ and you draw a card."
// Pins: CR 508.1b and 508.6 (attack a player), CR 701.15a-b (goad), CR 508.1d (had to attack), CR 603.4 (intervening if).
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const FIRKRAAG = real('Firkraag, Cunning Instigator');
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');

/** Seat 0 has Firkraag; seat 1 has the Bears `a` and `e`; seat 2 has the Bears `d`. It is seat 0's declare attackers step. */
function board(): ScenarioGame {
  const b = scenario({ seats: 3 }).define(FIRKRAAG);
  for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0).battlefield(FIRKRAAG.name, { label: 'fir' });
  b.seat(1).battlefield(BEARS, { label: 'a' }).battlefield(BEARS, { label: 'e' });
  b.seat(2).battlefield(BEARS, { label: 'd' });
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
}

/** Firkraag attacks seat 1 and goads `a`; the combat is played out and the game stops at seat 1's declare attackers decision. */
function goadedBoard(): ScenarioGame {
  const g = board();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).declareAttackers([{ attacker: 'fir', target: { player: 1 } }]);
  if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets('a');
  g.passAll();
  g.advanceTo('declareAttackers', { attack: false, block: false, turn: 'next' });
  return g;
}

describe('Firkraag, Cunning Instigator', () => {
  test('the lowering is an attack batch of Dragons at an opponent with a goad of a creature that player controls', () => {
    expect(FIRKRAAG.faces[0]?.abilities).toContainEqual(
      expect.objectContaining({
        kind: 'triggered',
        trigger: {
          kind: 'attackBatch',
          who: 'you',
          atLeast: 1,
          what: { subtypes: ['Dragon'] },
          eachAttackedOpponent: true,
        },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'triggerPlayer' },
            },
          },
        ],
        effect: { kind: 'goad', objects: { kind: 'target', id: 't1' } },
      }),
    );
    expect(FIRKRAAG.faces[0]?.abilities).toContainEqual(
      expect.objectContaining({
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { types: ['creature'] }, to: 'opponent' },
        interveningIf: { kind: 'subjectHadToAttack' },
      }),
    );
  });

  test('attacking an opponent goads a creature that player controls, never one of another player (CR 508.6, 701.15a)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'fir', target: { player: 1 } }]);
    const d = g.state.pending;
    expect(d?.kind).toBe('targets');
    if (d?.kind !== 'targets') return;
    const legal = d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : null));
    expect(legal).toHaveLength(2);
    expect(legal).toContain(g.id('a'));
    expect(legal).toContain(g.id('e'));
    expect(legal).not.toContain(g.id('d'));
  });

  test('the goaded creature must attack on its controller turn, and not the goader (CR 701.15b)', () => {
    const g = goadedBoard();
    expect(g.state.turn.activeSeat).toBe(1);
    expect(() => g.act(1).declareAttackers([])).toThrow();
    expect(() => g.act(1).declareAttackers([{ attacker: 'a', target: { player: 0 } }])).toThrow();
    g.act(1).declareAttackers([{ attacker: 'a', target: { player: 2 } }]);
  });

  test('a creature that had to attack deals combat damage to an opponent: a +1/+1 counter and a card (CR 508.1d, 603.4)', () => {
    const g = goadedBoard();
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.act(1).declareAttackers([{ attacker: 'a', target: { player: 2 } }]);
    g.advanceTo('declareBlockers', { attack: false, block: false });
    g.act(2).declareBlockers([]);
    g.advanceTo('combatDamage', { attack: false, block: false });
    g.passAll();
    g.expect.counters('fir', { '+1/+1': 1 });
    g.expect.handSize(0, before + 1);
  });

  test('a creature that did not have to attack does not trigger it (CR 508.1d)', () => {
    const g = goadedBoard();
    g.act(1).declareAttackers([
      { attacker: 'a', target: { player: 2 } },
      { attacker: 'e', target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers', { attack: false, block: false });
    g.act(2).declareBlockers([]);
    g.advanceTo('combatDamage', { attack: false, block: false });
    // Both deal damage; only the goaded one had to attack: one counter and one card.
    g.passAll();
    g.passAll();
    g.expect.counters('fir', { '+1/+1': 1 });
  });

  test('control: with nothing goaded, a creature dealing combat damage to an opponent triggers nothing', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([]);
    g.advanceTo('declareAttackers', { attack: false, block: false, turn: 'next' });
    g.act(1).declareAttackers([{ attacker: 'a', target: { player: 2 } }]);
    g.advanceTo('declareBlockers', { attack: false, block: false });
    g.act(2).declareBlockers([]);
    g.advanceTo('combatDamage', { attack: false, block: false });
    g.passAll();
    g.expect.counters('fir', {});
  });
});
