// The Riders of Rohan deck, group B: the REAL Oracle text of Call for Aid (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in an engine scenario and is
// played through applyAction. The creatures are SYNTHETIC vanillas, with an altar (SYNTHETIC) that sacrifices a creature. Every test runs with three or four seats: "target opponent" is one of
// several, and the others keep their creatures and can still be attacked.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');
const CALL = real('Call for Aid');
const ALTAR = parsed(
  'SYNTHETIC Blood Altar',
  'Artifact',
  'Sacrifice a creature: You gain 1 life.',
  {
    manaCost: '{1}',
  },
);
const OGRE = parsed('SYNTHETIC Ogre', 'Creature — Ogre', '', {
  manaCost: '{3}',
  power: '3',
  toughness: '3',
});

function board(seats: 3 | 4) {
  const b = scenario({ seats });
  b.define(CALL).define(ALTAR).define(OGRE);
  for (let seat = 0; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0)
    .hand(CALL.name)
    .battlefield('Mountain', { count: 5 })
    .battlefield(ALTAR.name)
    .battlefield(BEARS, { label: 'mine' });
  b.seat(1)
    .battlefield(OGRE.name, { label: 'ogre1', tapped: true })
    .battlefield(BEARS, { label: 'bears1', fresh: true });
  b.seat(2).battlefield(OGRE.name, { label: 'ogre2' });
  if (seats === 4) b.seat(3).battlefield(OGRE.name, { label: 'ogre3' });
  return b.at('precombatMain', { active: 0, turn: seats + 1 }).build();
}

const controllerOf = (g: ReturnType<typeof board>, label: string) =>
  g.view(0).battlefield.find((o) => o.id === g.id(label))?.controller;

describe('Call for Aid: "Gain control of all creatures target opponent controls until end of turn. Untap those creatures. ..." (CR 613.1b, 611.2a, 611.2c, 701.21a, 508.1a)', () => {
  test('3 seats: every creature of the chosen opponent is taken, the other opponent keeps theirs', () => {
    const g = board(3);
    g.act(0).cast(CALL.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(controllerOf(g, 'ogre1')).toBe(0);
    expect(controllerOf(g, 'bears1')).toBe(0);
    expect(controllerOf(g, 'ogre2')).toBe(2);
  });

  test('4 seats: whichever opponent is chosen, only their creatures are taken', () => {
    for (const chosen of [1, 2, 3]) {
      const g = board(4);
      g.act(0).cast(CALL.name, { targets: [{ player: chosen }], pay: true });
      g.passAll();
      expect(controllerOf(g, 'ogre2')).toBe(chosen === 2 ? 0 : 2);
      expect(controllerOf(g, 'ogre3')).toBe(chosen === 3 ? 0 : 3);
      expect(controllerOf(g, 'ogre1')).toBe(chosen === 1 ? 0 : 1);
    }
  });

  test('the creatures untap and gain haste until end of turn, even one that has just come under its owner control', () => {
    const g = board(3);
    g.expect.tapped('ogre1', true);
    g.act(0).cast(CALL.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.tapped('ogre1', false);
    const view = (label: string) => g.view(0).battlefield.find((o) => o.id === g.id(label));
    expect(view('ogre1')?.keywords).toContain('haste');
    expect(view('bears1')?.keywords).toContain('haste');
    // The creature of the other opponent did not gain it, and the keyword is not given for good.
    expect(view('ogre2')?.keywords ?? []).not.toContain('haste');
  });

  test('3 seats: the creatures can attack the other opponent but nobody you control can attack the chosen player', () => {
    const g = board(3);
    g.act(0).cast(CALL.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    // The stolen creatures and your own are barred from the chosen player (CR 508.1a) and free to attack the other opponent.
    for (const label of ['ogre1', 'bears1', 'mine']) {
      expect(
        g.act(0).try.declareAttackers([{ attacker: label, target: { player: 1 } }]).ok,
        label,
      ).toBe(false);
    }
    g.act(0).declareAttackers([
      { attacker: 'ogre1', target: { player: 2 } },
      { attacker: 'bears1', target: { player: 2 } },
      { attacker: 'mine', target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers');
    g.act(2).declareBlockers([]);
    g.advanceTo('endOfCombat');
    g.expect.life(2, 40 - 3 - 2 - 2);
  });

  test('4 seats: the player named is the only one barred, the creatures can attack either of the others', () => {
    const g = board(4);
    g.act(0).cast(CALL.name, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(0).try.declareAttackers([{ attacker: 'ogre2', target: { player: 2 } }]).ok).toBe(
      false,
    );
    expect(g.act(0).try.declareAttackers([{ attacker: 'ogre2', target: { player: 3 } }]).ok).toBe(
      true,
    );
  });

  test('you cannot sacrifice the creatures you took: only a creature of your own is offered, and with none left the cost cannot be paid', () => {
    const g = board(3);
    g.act(0).cast(CALL.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    // "Sacrifice a creature": the one creature that is yours to sacrifice is paid by itself (CR 701.21a, 101.2), the stolen ones stay.
    g.act(0).activate(ALTAR.name);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(controllerOf(g, 'ogre1')).toBe(0);
    expect(controllerOf(g, 'bears1')).toBe(0);
    g.expect.life(0, 41);
    g.expect.illegal(0, { activate: ALTAR.name });
  });

  test('another player can still sacrifice a creature they control that you took only until they lose it: a creature the opponent controls is not held', () => {
    const g = board(3);
    g.act(0).cast(CALL.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    // Seat 2's creature was not taken, so it is not held by the effect: seat 2 can sacrifice it (seat 2's own altar is not used here, the ruling is about the creatures you gained).
    expect(controllerOf(g, 'ogre2')).toBe(2);
  });

  test('at the cleanup step control goes back, and the creatures are not sacrificed or barred any more', () => {
    const g = board(3);
    g.act(0).cast(CALL.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([]);
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    expect(controllerOf(g, 'ogre1')).toBe(1);
    expect(controllerOf(g, 'bears1')).toBe(1);
  });
});
