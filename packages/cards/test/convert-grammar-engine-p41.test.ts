// Parsed text is only worth something if the engine runs it as written (stage P41). These tests import SYNTHETIC cards through the grammar (never through a
// fixture), define them in an engine scenario and play them through applyAction: the Korvold deck's expensive singles of D-187 and D-188 (ENGINE_VERSION 42).
// The sacrifice of one or more Treasures with "up to that many" targets, the +1/+0 for each time a creature attacked and the added combat phase of a landfall
// in a main phase, and an Adventure played through its real face structure (the creature, and the instant that exiles the top of an opponent's library face
// down). Every card name starts with "SYNTHETIC"; the wording of each text is that of the real cards of the slice (the owner's request file of 2026-10-29);
// the powers, toughnesses and costs the file does not give are invented. No real card's text is claimed.
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard, syntheticFace } from './convert-helpers';

const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const stepsSince = (g: ScenarioGame, mark: number): string[] =>
  g.eventsSince(mark).flatMap((e) => (e.kind === 'stepBegan' ? [e.step] : []));

describe('"Whenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike until end of turn."', () => {
  const raider = parsed(
    'SYNTHETIC Parsed Raider',
    'Creature — Dragon Rogue Warrior',
    'When ~ enters, create a Treasure token. (It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")\nWhenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike until end of turn.',
    { manaCost: '{2}{R}', colors: ['R'], power: '2', toughness: '2' },
  );
  const attackWith = () => {
    const g = scenario()
      .seat(0)
      .define(raider)
      .hand(raider.name)
      .battlefield(BEARS, 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(raider.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.passAll();
    return g;
  };

  test('is valid', () => {
    expect(validateCard(raider)).toEqual([]);
  });

  test('sacrificing the Treasure gives the Bears double strike, and they deal their damage twice', () => {
    const g = attackWith();
    g.act(0).accept();
    g.act(0).choosePermanents('Treasure');
    g.expect.noObject('Treasure', { zone: 'battlefield' });
    g.act(0).chooseTargets(BEARS);
    g.pass();
    g.pass();
    g.expect.derived(BEARS, { keywords: ['doubleStrike'] });
    g.advanceTo('postcombatMain');
    g.expect.life(1, 36);
    g.expect.invariants();
  });

  test('declining keeps the Treasure and gives nothing', () => {
    const g = attackWith();
    g.act(0).decline();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.advanceTo('postcombatMain');
    g.expect.life(1, 38);
  });
});

describe('"Each creature you control gets +1/+0 for each time it has attacked this turn." and the landfall of "there\'s an additional combat phase after this phase"', () => {
  const moraug = parsed(
    'SYNTHETIC Parsed Minotaur',
    'Legendary Creature — Minotaur Warrior',
    "Each creature you control gets +1/+0 for each time it has attacked this turn.\nLandfall — Whenever a land you control enters, if it's your main phase, there's an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control.",
    { manaCost: '{4}{R}{R}', colors: ['R'], power: '6', toughness: '6' },
  );
  const play = () =>
    scenario()
      .seat(0)
      .define(moraug)
      .battlefield(moraug.name, BEARS)
      .hand('Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('is valid', () => {
    expect(validateCard(moraug)).toEqual([]);
  });

  test('a land in the precombat main phase: two combats, and the Bears (untapped for the second) have +2/+0 after attacking twice', () => {
    const g = play();
    const mark = g.mark();
    g.act(0).playLand('Forest');
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.expect.pt(BEARS, 3, 2);
    g.advanceTo('postcombatMain');
    expect(stepsSince(g, mark).filter((s) => s === 'declareAttackers')).toHaveLength(2);
    g.expect.invariants();
  });

  test('a land in the postcombat main phase: the Bears that attacked are untapped as the additional combat begins, and attack again with +2/+0', () => {
    const g = play();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.advanceTo('postcombatMain');
    g.act(0).playLand('Forest');
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.tapped(BEARS, false);
    g.act(0).attack([BEARS]);
    g.expect.pt(BEARS, 4, 2);
    g.advanceTo('end');
    g.expect.step('end');
  });
});

describe('Decadent Dragon // Expensive Taste, played through its real face structure', () => {
  const card = parseOnly(
    syntheticCard(
      syntheticFace({
        name: 'SYNTHETIC Parsed Decadent Dragon',
        manaCost: '{2}{R}{R}',
        typeLine: 'Creature — Dragon',
        oracleText: 'Flying, trample\nWhenever this creature attacks, create a Treasure token.',
        power: '4',
        toughness: '4',
        colors: ['R'],
      }),
      {
        name: 'SYNTHETIC Parsed Decadent Dragon // Parsed Expensive Taste',
        layout: 'adventure',
        faces: [
          syntheticFace({
            name: 'SYNTHETIC Parsed Decadent Dragon',
            manaCost: '{2}{R}{R}',
            typeLine: 'Creature — Dragon',
            oracleText: 'Flying, trample\nWhenever this creature attacks, create a Treasure token.',
            power: '4',
            toughness: '4',
            colors: ['R'],
          }),
          syntheticFace({
            name: 'SYNTHETIC Parsed Expensive Taste',
            manaCost: '{2}{B}',
            typeLine: 'Instant — Adventure',
            oracleText:
              "Exile the top two cards of target opponent's library face down. You may look at and play those cards for as long as they remain exiled.",
            colors: ['B'],
          }),
        ],
        colorIdentity: ['R', 'B'],
      },
    ),
  );
  const dragon = card.definition as CardDefinition;
  const THEIRS = { name: BEARS, seat: 1 } as const;

  const taste = () => {
    const g = scenario()
      .seat(0)
      .define(dragon)
      .hand(dragon.name)
      .battlefield(
        'Swamp',
        'Swamp',
        'Swamp',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Forest',
        'Forest',
      )
      .library(...FILLER)
      .seat(1)
      .library(BEARS, 'Mountain', ...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(dragon.name, { face: 1, targets: [{ player: 1 }], pay: true });
    g.passAll();
    return g;
  };

  test('both faces are read and the card is valid', () => {
    expect(card.support.status).toBe('supported');
    expect(validateCard(dragon)).toEqual([]);
    expect(dragon.layout).toBe('adventure');
    expect(dragon.faces).toHaveLength(2);
  });

  test("the Adventure takes the opponent's top two cards face down: seen by its caster, not by the opponent", () => {
    const g = taste();
    g.expect.librarySize(1, 12);
    expect(
      g
        .view(0)
        .exile.filter((o) => o.faceDown === true)
        .map((o) => o.name)
        .sort(),
    ).toEqual([BEARS, 'Mountain']);
    expect(
      g
        .view(1)
        .exile.filter((o) => o.faceDown === true)
        .map((o) => o.name),
    ).toEqual(['Face-down card', 'Face-down card']);
    g.expect.zone(dragon.name, 'exile', { seat: 0 });
  });

  test("its caster may cast the opponent's card, and the Dragon from exile; the opponent's card is theirs to lose", () => {
    const g = taste();
    g.act(0).cast(THEIRS, { pay: true });
    g.passAll();
    const bears = g.find({ name: BEARS, zone: 'battlefield' })[0];
    expect(bears?.controller).toBe(0);
    expect(bears?.owner).toBe(1);
    g.act(0).cast(dragon.name, { face: 0, pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Parsed Decadent Dragon', 'battlefield', { seat: 0 });
    g.expect.derived('SYNTHETIC Parsed Decadent Dragon', { keywords: ['flying', 'trample'] });
    g.expect.invariants();
  });

  test('it makes a Treasure as it attacks', () => {
    const g = taste();
    g.act(0).cast(dragon.name, { face: 0, pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['SYNTHETIC Parsed Decadent Dragon']);
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
  });
});
