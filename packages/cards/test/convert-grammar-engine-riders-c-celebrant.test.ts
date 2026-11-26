// Combat Celebrant of the Riders of Rohan deck (group C), run as written: "If ~ hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you
// control and after this phase, there is an additional combat phase." (CR 701.43a-d, 508.1g, 607.2h, 500.8). A SYNTHETIC card imported through the grammar and played with three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';
const TEXT =
  "If ~ hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase. (An exerted creature won't untap during your next untap step.)";

const CELEBRANT = parsed('SYNTHETIC Parsed Celebrant', 'Creature — Human Warrior', TEXT, {
  manaCost: '{2}{R}',
  colors: ['R'],
  power: '4',
  toughness: '1',
});
// The same text with vigilance, so that it can attack in the additional combat phase and the condition is what keeps it from being exerted again.
const VIGILANT = parsed(
  'SYNTHETIC Parsed Vigilant Celebrant',
  'Creature — Human Warrior',
  `Vigilance\n${TEXT}`,
  { manaCost: '{2}{R}', colors: ['R'], power: '4', toughness: '1' },
);

const board = (...mine: string[]) =>
  scenario({ seats: 3 })
    .define(CELEBRANT)
    .define(VIGILANT)
    .seat(0)
    .battlefield(...mine)
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .seat(2)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('Combat Celebrant as written (CR 701.43, 500.8)', () => {
  test('the lowering is the exert ability with its condition and the linked trigger', () => {
    const abilities = CELEBRANT.faces[0]?.abilities ?? [];
    expect(abilities[0]).toEqual({
      kind: 'static',
      static: { kind: 'exertOnAttack', unlessExertedThisTurn: true },
    });
    expect(abilities[1]).toMatchObject({ kind: 'triggered', trigger: { kind: 'exerted' } });
  });

  test('exerted: every other creature I control untaps, and there is an additional combat phase', () => {
    const g = board(CELEBRANT.name, BEARS);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: CELEBRANT.name, target: { player: 1 } },
      { attacker: BEARS, target: { player: 2 } },
    ]);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    // The Bears were tapped by attacking and untapped again (and still attack); the Celebrant stays tapped.
    g.expect.tapped(BEARS, false);
    g.expect.tapped(CELEBRANT.name, true);
    g.expect.combat({
      attackers: [CELEBRANT.name, BEARS],
    });
    g.advanceTo('endOfCombat');
    g.passAll();
    // The additional combat phase: the Bears attack again.
    g.expect.step('beginningOfCombat', { active: 0 });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS], { player: 1 });
    g.advanceTo('postcombatMain');
    g.expect.life(1, 40 - 4 - 2);
    g.expect.life(2, 40 - 2);
    g.expect.invariants();
  });

  test('declined: nothing untaps and there is no additional combat phase', () => {
    const g = board(CELEBRANT.name, BEARS);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([CELEBRANT.name, BEARS], { player: 1 });
    g.act(0).decline();
    g.passAll();
    g.expect.tapped(BEARS, true);
    g.advanceTo('postcombatMain');
    g.expect.step('postcombatMain', { active: 0 });
  });

  test('"if ~ hasn\'t been exerted this turn": in the additional combat phase it is not asked again, so there is no third combat', () => {
    const g = board(VIGILANT.name, BEARS);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([VIGILANT.name, BEARS], { player: 1 });
    g.act(0).accept();
    g.passAll();
    g.advanceTo('endOfCombat');
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([VIGILANT.name, BEARS], { player: 1 });
    // Exerted already this turn: no question, no second trigger.
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.passAll();
    g.advanceTo('postcombatMain');
    g.expect.step('postcombatMain', { active: 0 });
    g.expect.invariants();
  });

  test('a creature that was not exerted this turn is asked again in another turn', () => {
    const g = board(VIGILANT.name);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([VIGILANT.name], { player: 1 });
    g.expect.pending('confirmOptional', 0);
    expect(g.state.turnLog.exerted).toEqual([]);
  });
});
