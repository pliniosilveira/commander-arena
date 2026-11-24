// Stick Together: the REAL Oracle text of Stick Together (the corpus's golden.jsonl) goes through the grammar with no override and is played through applyAction with two, three and four
// seats. Pins: CR 700.8d (choosing a party), CR 701.21a (sacrifice), CR 101.4 (APNAP order, simultaneous sacrifice), CR 700.8b (a creature with several types counts once), CR 603.10a
// (leaves-the-battlefield triggers look back in time).
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const TOGETHER = real('Stick Together');
const HARUSPEX = real('Grim Haruspex'); // Human Wizard: "Whenever another nontoken creature you control dies, draw a card."
const CHAMPION = real('Champion of Lambholt'); // Human Warrior
const COHORT = real('Mirror Entity'); // Changeling: every creature type
const RAVAGER = real('Dire Fleet Ravager'); // Orc Pirate Wizard
const BEARS = 'Grizzly Bears'; // no party type
const FILLER = Array.from({ length: 12 }, () => 'Island');

describe('the card is read by the grammar', () => {
  test('it lowers to the engine effect for every player, with no unread text', () => {
    expect(validateCard(TOGETHER)).toEqual([]);
    const spell = TOGETHER.faces[0]?.spell;
    expect(spell?.effect).toEqual({ kind: 'chooseParty', players: { kind: 'eachPlayer' } });
  });
});

describe('Stick Together: "Each player chooses a party from among creatures they control, then sacrifices the rest."', () => {
  const start = (seats: 2 | 3 | 4, active: number, boards: Record<number, readonly string[]>) => {
    let b = scenario({ seats });
    for (const card of [TOGETHER, HARUSPEX, CHAMPION, COHORT, RAVAGER] as CardDefinition[]) {
      b = b.define(card);
    }
    for (let seat = 0; seat < seats; seat += 1) {
      const s = b
        .seat(seat)
        .life(20)
        .library(...FILLER);
      if (seat === active) s.hand(TOGETHER.name).pool('WWCCC');
      for (const name of boards[seat] ?? []) s.battlefield(name);
    }
    const g = b.at('precombatMain', { active, turn: 3 }).build();
    g.act(active).cast(TOGETHER.name, { pay: true });
    g.passAll();
    return g;
  };
  test('the players choose in turn order and the creatures left out are sacrificed together (three seats)', () => {
    const board = [HARUSPEX.name, CHAMPION.name, COHORT.name, RAVAGER.name, BEARS];
    const g = start(3, 1, { 0: board, 1: board, 2: [BEARS] });
    const d = g.state.pending;
    if (d?.kind !== 'chooseParty') throw new Error(`expected chooseParty, got ${d?.kind}`);
    expect(d.seat).toBe(1);
    // Wizard: Haruspex or Ravager or the changeling; Warrior: Champion or the changeling; Cleric and Rogue: only the changeling.
    expect(d.slots.map((s) => s.legal.length)).toEqual([1, 1, 2, 3]);
    g.act(1).chooseParty({
      Wizard: { name: HARUSPEX.name, seat: 1 },
      Warrior: { name: CHAMPION.name, seat: 1 },
      Cleric: { name: COHORT.name, seat: 1 },
    });
    // Seat 2 controls only a Grizzly Bears: not a party creature, so it has nothing to choose and is asked nothing; seat 0 is asked next.
    expect(g.state.pending).toMatchObject({ kind: 'chooseParty', seat: 0 });
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 2 })).toHaveLength(1);
    g.act(0).chooseParty({
      Wizard: { name: RAVAGER.name, seat: 0 },
      Rogue: { name: COHORT.name, seat: 0 },
    });
    // Seat 0 kept the Ravager and the changeling: Haruspex, Champion and the Bears are gone. Seat 1 kept three, lost the Ravager and the Bears.
    expect(g.find({ name: HARUSPEX.name, zone: 'graveyard', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: RAVAGER.name, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: CHAMPION.name, zone: 'graveyard', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 2 })).toHaveLength(1);
    expect(g.find({ name: RAVAGER.name, zone: 'graveyard', seat: 1 })).toHaveLength(1);
    expect(g.find({ name: CHAMPION.name, zone: 'battlefield', seat: 1 })).toHaveLength(1);
  });

  test('Grim Haruspex that stays in the party draws for each other nontoken creature sacrificed with it', () => {
    const g = start(2, 0, { 0: [HARUSPEX.name, RAVAGER.name, BEARS], 1: [] });
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).chooseParty({ Wizard: HARUSPEX.name });
    g.passAll();
    // The Ravager and the Bears died; Haruspex stayed on the battlefield and saw both.
    expect(g.state.seats[0]?.hand.length).toBe(before + 2);
    expect(g.find({ name: HARUSPEX.name, zone: 'battlefield', seat: 0 })).toHaveLength(1);
  });

  test('four seats from a seat that is not first: the order is the turn order from the active player', () => {
    const board = [CHAMPION.name];
    const g = start(4, 2, { 0: board, 1: board, 2: board, 3: board });
    const order: number[] = [];
    while (g.state.pending?.kind === 'chooseParty') {
      const seat = g.state.pending.seat;
      order.push(seat);
      g.act(seat).chooseParty({ Warrior: { name: CHAMPION.name, seat } });
    }
    expect(order).toEqual([2, 3, 0, 1]);
    for (const seat of [0, 1, 2, 3]) {
      expect(g.find({ name: CHAMPION.name, zone: 'battlefield', seat })).toHaveLength(1);
    }
  });
});
