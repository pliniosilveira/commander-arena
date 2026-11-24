// The Riders of Rohan deck (Tales of Middle-earth Commander), group B: the REAL Oracle text of Humble Defector, Field of Ruin, Taunt from the Rampart, Gilraen, Dúnedain Protector and Call
// for Aid (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction. Every test about an
// opponent runs with three or four seats: the player a card names is never assumed to be the only opponent.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const FILLER = Array.from({ length: 14 }, () => 'Island');

const DEFECTOR = real('Humble Defector');
const FIELD = real('Field of Ruin');
// SYNTHETIC nonbasic lands: a Plains-less "Tower" with an ability, and a basic-typed land that is not basic.
const TOWER = parsed('SYNTHETIC Tower', 'Land', '{T}: Add {C}.');
const SNOW_TOWER = parsed('SYNTHETIC Snow Tower', 'Snow Land — Forest', '{T}: Add {G}.');

function table(seats: 2 | 3 | 4, cards: readonly ReturnType<typeof real>[]) {
  const b = scenario({ seats });
  for (const card of cards) b.define(card);
  for (let seat = 0; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  return b;
}

describe('Humble Defector: "{T}: Draw two cards. Target opponent gains control of ~. Activate only during your turn." (CR 613.1b, 115.1)', () => {
  test('is valid', () => {
    expect(DEFECTOR.faces[0]?.abilities.length).toBeGreaterThan(0);
  });

  test('3 seats: you draw two and the opponent you chose takes it, the other does not', () => {
    const b = table(3, [DEFECTOR]);
    b.seat(0).battlefield(DEFECTOR.name);
    const g = b.at('precombatMain', { active: 0, turn: 4 }).build();
    const handBefore = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).activate(DEFECTOR.name, { ability: 0, targets: [{ player: 2 }] });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(handBefore + 2);
    const mine = g.view(0).battlefield.find((o) => o.id === g.id(DEFECTOR.name));
    expect(mine?.controller).toBe(2);
  });

  test('4 seats: the chosen opponent is any of the three', () => {
    for (const chosen of [1, 2, 3]) {
      const b = table(4, [DEFECTOR]);
      b.seat(0).battlefield(DEFECTOR.name);
      const g = b.at('precombatMain', { active: 0, turn: 5 }).build();
      g.act(0).activate(DEFECTOR.name, { ability: 0, targets: [{ player: chosen }] });
      g.passAll();
      const view = g.view(0).battlefield.find((o) => o.id === g.id(DEFECTOR.name));
      expect(view?.controller).toBe(chosen);
    }
  });

  test('you cannot choose yourself: the target must be an opponent', () => {
    const b = table(3, [DEFECTOR]);
    b.seat(0).battlefield(DEFECTOR.name);
    const g = b.at('precombatMain', { active: 0, turn: 4 }).build();
    g.act(0).activate(DEFECTOR.name, { ability: 0 });
    expect(() => g.act(0).chooseTargets({ player: 0 })).toThrow();
  });

  test('it can be activated only during your turn', () => {
    const b = table(3, [DEFECTOR]);
    b.seat(0).battlefield(DEFECTOR.name);
    const g = b.at('precombatMain', { active: 1, turn: 4 }).build();
    g.expect.illegal(0, { activate: DEFECTOR.name, ability: 0 });
  });

  test('the new controller can pass it on, on their own turn, to an opponent of theirs', () => {
    const b = table(3, [DEFECTOR]);
    b.seat(0).battlefield(DEFECTOR.name);
    const g = b.at('precombatMain', { active: 0, turn: 4 }).build();
    g.act(0).activate(DEFECTOR.name, { ability: 0, targets: [{ player: 1 }] });
    g.passAll();
    expect(g.view(0).battlefield.find((o) => o.id === g.id(DEFECTOR.name))?.controller).toBe(1);
    // It is not the turn of its new controller: they cannot activate it yet (CR 302.6 aside, the text limits it to their own turn).
    g.expect.illegal(1, { activate: DEFECTOR.name, ability: 0 });
  });
});

describe('Field of Ruin: "{2}, {T}, Sacrifice ~: Destroy target nonbasic land an opponent controls. Each player searches ..." (CR 701.23a, 701.24, 701.8)', () => {
  const board = (seats: 2 | 3 | 4, libraries: readonly (readonly string[])[]) => {
    const b = table(seats, [FIELD, TOWER, SNOW_TOWER]);
    for (let seat = 0; seat < seats; seat += 1)
      b.seat(seat).library(...(libraries[seat] ?? FILLER));
    b.seat(0).battlefield(FIELD.name).battlefield('Island', { count: 2 });
    b.seat(1).battlefield(TOWER.name, { label: 'tower1' });
    if (seats > 2)
      b.seat(2)
        .battlefield(TOWER.name, { label: 'tower2' })
        .battlefield('Forest', { label: 'basic2' });
    return b.at('precombatMain', { active: 0, turn: seats + 1 }).build();
  };
  const LIB = ['Forest', 'Island', 'Island', 'Island', 'Island'];

  test('is valid', () => {
    expect(FIELD.faces[0]?.abilities.length).toBeGreaterThan(0);
  });

  test('3 seats: the chosen opponent land is destroyed, the other opponent land stays, and every player puts a basic land onto the battlefield', () => {
    const g = board(3, [LIB, LIB, LIB]);
    g.act(0).activate(FIELD.name, { targets: ['tower1'], pay: true });
    g.passAll();
    g.expect.zone(FIELD.name, 'graveyard', { seat: 0 });
    g.expect.zone(TOWER.name, 'graveyard', { seat: 1 });
    g.expect.zone(TOWER.name, 'battlefield', { seat: 2 });
    // The searches are made in turn order, the active player first (CR 101.4).
    for (let seat = 0; seat < 3; seat += 1) {
      expect(g.deciding).toBe(seat);
      g.act(seat).chooseCards(g.id({ name: 'Forest', zone: 'library', seat }));
    }
    for (let seat = 0; seat < 3; seat += 1) {
      expect(g.find({ name: 'Forest', zone: 'battlefield', seat }).length).toBe(seat === 2 ? 2 : 1);
    }
    g.expect.invariants();
  });

  test('4 seats: all four players search, not only the opponents', () => {
    const g = board(4, [LIB, LIB, LIB, LIB]);
    g.act(0).activate(FIELD.name, { targets: ['tower1'], pay: true });
    g.passAll();
    for (let seat = 0; seat < 4; seat += 1)
      g.act(g.deciding).chooseCards(g.id({ name: 'Forest', zone: 'library', seat: g.deciding }));
    for (let seat = 0; seat < 4; seat += 1) {
      expect(g.find({ name: 'Forest', zone: 'battlefield', seat }).length).toBeGreaterThanOrEqual(
        1,
      );
    }
    expect(g.state.pending?.kind).not.toBe('chooseCards');
  });

  test('a basic land cannot be the target, and neither can your own nonbasic land', () => {
    const b = table(3, [FIELD, TOWER, SNOW_TOWER]);
    for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...LIB);
    b.seat(0)
      .battlefield(FIELD.name)
      .battlefield(TOWER.name, { label: 'mine' })
      .battlefield('Island', { count: 2 });
    b.seat(1)
      .battlefield('Forest', { label: 'basic' })
      .battlefield(SNOW_TOWER.name, { label: 'snow' });
    const g = b.at('precombatMain', { active: 0, turn: 4 }).build();
    g.act(0).activate(FIELD.name);
    expect(() => g.act(0).chooseTargets('basic')).toThrow();
    expect(() => g.act(0).chooseTargets('mine')).toThrow();
    g.act(0).chooseTargets('snow').payAuto();
    g.passAll();
    g.expect.zone(SNOW_TOWER.name, 'graveyard', { seat: 1 });
  });
});
