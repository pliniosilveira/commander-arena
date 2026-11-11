// Parsed text is only worth something if the engine runs it as written (stage P40). These tests import SYNTHETIC cards through the grammar (never through a
// fixture), define them in an engine scenario and play them through applyAction: the Korvold deck's keywords slice of D-185 and D-186 (ENGINE_VERSION 41).
// Encore (a token copy for each opponent from the graveyard), Devour on a token the card makes each upkeep, Riot given to a group, and the group "can't be
// countered". Every card name starts with "SYNTHETIC"; the wording of each text is that of the real cards of the slice (the owner's request file of
// 2026-10-29); the powers, toughnesses and costs the file does not give are invented. No real card's text is claimed.
import { validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const counters = (g: ScenarioGame, name: string, seat: 0 | 1 = 0): number =>
  g.find({ name, zone: 'battlefield', seat })[0]?.counters['+1/+1'] ?? 0;

describe('"Encore {3}{R}" on a creature with a dies trigger', () => {
  const pilferer = parsed(
    'SYNTHETIC Parsed Pilferer',
    'Creature — Goblin Pirate',
    'When this creature dies, create a Treasure token. (It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")\nEncore {3}{R} ({3}{R}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)',
    { manaCost: '{R}', colors: ['R'], power: '1', toughness: '1' },
  );
  const play = () =>
    scenario()
      .seat(0)
      .define(pilferer)
      .graveyard(pilferer.name)
      .battlefield('Mountain', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('is valid', () => {
    expect(validateCard(pilferer)).toEqual([]);
  });

  test('the card is exiled as the cost, and a token copy with haste must attack', () => {
    const g = play();
    g.act(0).activate(pilferer.name, { pay: true });
    g.expect.zone(pilferer.name, 'exile', { seat: 0 });
    g.passAll();
    const token = g.find({ name: pilferer.name, zone: 'battlefield', seat: 0 })[0];
    expect(token?.token).not.toBeNull();
    g.playCombat({
      attack: [{ name: pilferer.name, zone: 'battlefield' }],
      until: 'postcombatMain',
    });
    g.expect.life(1, 39);
  });

  test('it is sacrificed at the end step, and as a copy it makes a Treasure when it dies', () => {
    const g = play();
    g.act(0).activate(pilferer.name, { pay: true });
    g.passAll();
    g.playCombat({
      attack: [{ name: pilferer.name, zone: 'battlefield' }],
      until: 'postcombatMain',
    });
    g.advanceTo('end');
    g.passAll(); // the sacrifice
    g.passAll(); // the Treasure trigger of the copy
    g.expect.noObject(pilferer.name, { zone: 'battlefield' });
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 })).toHaveLength(1);
  });
});

describe('"At the beginning of each upkeep, create a 1/1 red and green Dragon creature token with flying and devour 2."', () => {
  const brood = parsed(
    'SYNTHETIC Parsed Broodmother',
    'Creature — Dragon',
    'Flying\nAt the beginning of each upkeep, create a 1/1 red and green Dragon creature token with flying and devour 2. (As the token enters, you may sacrifice any number of creatures. It enters with twice that many +1/+1 counters on it.)',
    { manaCost: '{2}{R}{R}{R}{G}', colors: ['R', 'G'], power: '4', toughness: '4' },
  );
  const play = () => {
    const g = scenario()
      .seat(0)
      .define(brood)
      .battlefield(brood.name, BEARS, 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    return g;
  };

  test('is valid', () => {
    expect(validateCard(brood)).toEqual([]);
  });

  test('the token asks which creatures to sacrifice and enters with twice that many counters', () => {
    const g = play();
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    expect(counters(g, 'Dragon')).toBe(2);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('none is a legal answer: a plain 1/1 with flying', () => {
    const g = play();
    g.passAll();
    g.act(0).choosePermanents();
    expect(counters(g, 'Dragon')).toBe(0);
    g.expect.pt({ name: 'Dragon' }, 1, 1);
  });
});

describe('"Creature spells you control can\'t be countered." and "Nontoken creatures you control have riot."', () => {
  const rhythm = parsed(
    'SYNTHETIC Parsed Rhythm',
    'Enchantment',
    "Creature spells you control can't be countered.\nNontoken creatures you control have riot. (They enter with your choice of a +1/+1 counter or haste.)",
    { manaCost: '{1}{R}{G}', colors: ['R', 'G'] },
  );
  const rioter = parsed(
    'SYNTHETIC Parsed Rioter',
    'Creature — Goblin',
    'Riot (This creature enters with your choice of a +1/+1 counter or haste.)',
    { manaCost: '{1}{R}', colors: ['R'], power: '2', toughness: '1' },
  );
  const play = (hand: readonly string[], opponent?: (b: ReturnType<typeof scenario>) => void) => {
    const b = scenario()
      .seat(0)
      .define(rhythm)
      .define(rioter)
      .hand(...hand)
      .battlefield(rhythm.name)
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER);
    opponent?.(b);
    return b.at('precombatMain').build();
  };

  test('both are valid', () => {
    expect(validateCard(rhythm)).toEqual([]);
    expect(validateCard(rioter)).toEqual([]);
  });

  test('a creature with riot of its own and the one the enchantment gives asks twice', () => {
    const g = play([rioter.name]);
    g.act(0).cast(rioter.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('counter');
    g.act(0).chooseOption('counter');
    expect(counters(g, rioter.name)).toBe(2);
    g.expect.invariants();
  });

  test('a creature spell of its controller is not countered', () => {
    const g = play([rioter.name], (b) =>
      b.hand('Counterspell').battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(rioter.name, { pay: true });
    g.pass();
    g.act(1).cast('Counterspell', { targets: [{ name: rioter.name, zone: 'stack' }], pay: true });
    g.passAll();
    g.act(0).chooseOption('haste');
    g.act(0).chooseOption('haste');
    g.expect.zone(rioter.name, 'battlefield', { seat: 0 });
  });
});
