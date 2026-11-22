// Abzan Armor precon (issue 99), group E: the two commanders, Baldin, Century Herdmaster and Felothar the Steadfast. Each real card of the golden corpus is read through the grammar with no
// override and played with the scenario DSL. Pins: CR 510.1a (combat damage by an effect's number), CR 702.3b / 609.4 (defender, "as though"), CR 115.1 / 601.2c / 603.3d (a slot of "up to N"
// targets is chosen as the trigger goes on the stack), CR 608.2c / 107.1 (X is counted as the ability resolves), CR 602.2c / 608.2h / 113.7a (the cost's sacrificed creature is read from
// last-known information: its toughness and power as it last was on the battlefield), CR 701.9 (discard).
import { applyAction } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const FILLER = Array.from({ length: 14 }, () => 'Island');
const body = (name: string, power: string, toughness: string, text = '') =>
  parsed(name, 'Creature — Bear', text, { manaCost: '{1}', power, toughness });

describe('Felothar the Steadfast', () => {
  const FELOTHAR = real('Felothar the Steadfast');
  const WIDE = body('SYNTHETIC Wide Bear', '5', '2'); // sacrificed: draw 2, discard 5
  const TALL = body('SYNTHETIC Tall Bear', '1', '4'); // sacrificed: draw 4, discard 1
  const WALL = body('SYNTHETIC Wall Bear', '0', '3', 'Defender');
  const cards = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island'];

  const build = (seats: 2 | 3 = 2) => {
    const b = scenario({ seats })
      .define(FELOTHAR)
      .define(WIDE)
      .define(TALL)
      .define(WALL)
      .seat(0)
      .library(...FILLER)
      .battlefield(FELOTHAR.name, WIDE.name, TALL.name, WALL.name, 'Plains', 'Plains', 'Plains')
      .hand(...cards);
    for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('{3}, {T}, sacrifice another creature: draw cards equal to its toughness, then discard cards equal to its power (last-known information)', () => {
    const g = build();
    g.act(0).activate(FELOTHAR.name, { pay: true });
    g.act(0).choosePermanents(WIDE.name);
    g.passAll();
    // Toughness 2 drawn: 7 + 2 cards in hand; then 5 discarded, chosen by the controller.
    g.expect.zone(WIDE.name, 'graveyard');
    g.expect.handSize(0, 9);
    g.act(0).chooseCards('Island[0]', 'Island[1]', 'Island[2]', 'Island[3]', 'Island[4]');
    g.expect.handSize(0, 4);
    g.expect.librarySize(0, 12);
  });

  test('toughness greater than power: draw 4, discard 1', () => {
    const g = build();
    g.act(0).activate(FELOTHAR.name, { pay: true });
    g.act(0).choosePermanents(TALL.name);
    g.passAll();
    g.expect.handSize(0, 11);
    g.act(0).chooseCards('Island[0]');
    g.expect.handSize(0, 10);
  });

  test('the number of cards is the stats the creature last had: a +1/+1 counter counts (CR 608.2h)', () => {
    const b = scenario()
      .define(FELOTHAR)
      .define(TALL)
      .seat(0)
      .library(...FILLER)
      .battlefield(FELOTHAR.name, 'Plains', 'Plains', 'Plains')
      .battlefield(TALL.name, { counters: { '+1/+1': 1 } })
      .hand(...cards);
    const g = b
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(FELOTHAR.name, { pay: true });
    g.passAll();
    // 2/5: draw 5, discard 2.
    g.expect.handSize(0, 12);
    g.act(0).chooseCards('Island[0]', 'Island[1]');
    g.expect.handSize(0, 10);
  });

  test('"another creature": Felothar itself cannot be the sacrifice', () => {
    const g = build();
    g.act(0).activate(FELOTHAR.name, { pay: true });
    const r = applyAction(g.state, 0, { kind: 'choosePermanents', objects: [g.id(FELOTHAR.name)] });
    expect(r.ok).toBe(false);
  });

  test("the draw and the discard are the controller's with three seats: the other seats keep their hands", () => {
    const g = build(3);
    g.act(0).activate(FELOTHAR.name, { pay: true });
    g.act(0).choosePermanents(WIDE.name);
    g.passAll();
    g.act(0).chooseCards('Island[0]', 'Island[1]', 'Island[2]', 'Island[3]', 'Island[4]');
    g.expect.handSize(1, 0);
    g.expect.handSize(2, 0);
  });

  test('creatures you control can attack as though they did not have defender (CR 702.3b, 609.4)', () => {
    const g = build();
    g.advanceTo('declareAttackers', { attack: false });
    const ok = (name: string) =>
      applyAction(g.state, 0, {
        kind: 'declareAttackers',
        attacks: [{ attacker: g.id(name), target: { kind: 'player', seat: 1 } }],
      }).ok;
    expect(ok(WALL.name)).toBe(true);
  });

  test('each creature you control assigns combat damage equal to its toughness: the 0/3 defender deals 3 (CR 510.1a)', () => {
    const g = build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(WALL.name);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 37);
  });

  test('a creature an opponent controls is not affected: it deals its power', () => {
    const b = scenario()
      .define(FELOTHAR)
      .define(WIDE)
      .seat(0)
      .library(...FILLER)
      .battlefield(FELOTHAR.name);
    const g = b
      .seat(1)
      .library(...FILLER)
      .battlefield(WIDE.name)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(WIDE.name, { player: 0 });
    g.advanceTo('postcombatMain');
    g.expect.life(0, 35);
  });
});

describe('Baldin, Century Herdmaster', () => {
  const BALDIN = real('Baldin, Century Herdmaster');
  const BEAR = body('SYNTHETIC Plain Bear', '2', '2');

  const build = (seats: 2 | 3 = 2, hand = 3) => {
    const b = scenario({ seats })
      .define(BALDIN)
      .define(BEAR)
      .seat(0)
      .library(...FILLER)
      .battlefield(BALDIN.name, BEAR.name)
      .hand(...Array.from({ length: hand }, () => 'Island'));
    for (let seat = 1; seat < seats; seat += 1) {
      b.seat(seat)
        .library(...FILLER)
        .battlefield(BEAR.name);
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };
  const bear = (seat: number) => ({ name: BEAR.name, seat, zone: 'battlefield' as const });

  test('during your turn each creature assigns combat damage equal to its toughness: the 0/7 deals 7 (CR 510.1a)', () => {
    const g = build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BALDIN.name);
    g.act(0).chooseTargets();
    g.passAll();
    g.advanceTo('postcombatMain');
    g.expect.life(1, 33);
  });

  test('up to one hundred target creatures each get +0/+X, X the cards in your hand as it resolves (CR 608.2c): Baldin and creatures of every seat', () => {
    const g = build(3, 3);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BALDIN.name, { player: 1 });
    g.act(0).chooseTargets(BALDIN.name, bear(0), bear(1), bear(2));
    g.passAll();
    g.expect.pt(BALDIN.name, 0, 10);
    g.expect.pt(bear(0), 2, 5);
    g.expect.pt(bear(1), 2, 5);
    g.expect.pt(bear(2), 2, 5);
  });

  test('up to: no target needed, and the count follows the hand (an empty hand gives +0/+0)', () => {
    const g = build(2, 0);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BALDIN.name);
    g.act(0).chooseTargets(BALDIN.name);
    g.passAll();
    g.expect.pt(BALDIN.name, 0, 7);
  });

  test("on an opponent's turn Baldin's damage rule is off: creatures assign damage by power", () => {
    const b = scenario()
      .define(BALDIN)
      .define(BEAR)
      .seat(0)
      .library(...FILLER)
      .battlefield(BALDIN.name, BEAR.name);
    const g = b
      .seat(1)
      .library(...FILLER)
      .battlefield(BEAR.name)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(BEAR.name, { player: 0 });
    g.advanceTo('postcombatMain');
    g.expect.life(0, 38);
  });
});
