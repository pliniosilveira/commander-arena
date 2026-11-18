// Parsed text is only worth something if the engine runs it as written (stage P98). This test imports a SYNTHETIC card through the grammar (never through a
// fixture) with the real lines of Zenith Festival (golden corpus, acceptance card of issue 103: "Exile the top X cards of your library. You may play them until the
// end of your next turn." and "Harmonize {X}{R}{R}"), defines it in an engine scenario and plays it through applyAction: the X announced for the cast, the cards
// exiled and playable until the end of the next turn, and the cast from the graveyard for the harmonize cost with a creature tapped to reduce it (CR 702.180a), exiled
// as it leaves the stack. The name starts with "SYNTHETIC" and no real card's definition is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FESTIVAL = parsed(
  'SYNTHETIC Parsed Festival',
  'Sorcery',
  'Exile the top X cards of your library. You may play them until the end of your next turn.\nHarmonize {X}{R}{R} (You may cast this card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by an amount of generic mana equal to its power. Then exile this spell.)',
  { manaCost: '{X}{R}{R}', colors: ['R'] },
);
const NAME = FESTIVAL.name;
const FILLER = Array.from({ length: 8 }, () => 'Mountain');

describe('"Exile the top X cards of your library. You may play them until the end of your next turn."', () => {
  const game = () =>
    scenario()
      .seat(0)
      .define(FESTIVAL)
      .hand(NAME)
      .battlefield('Mountain', { count: 5 })
      .library('Forest', 'Raging Goblin', 'Lightning Bolt', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('the lowering is a spell with X and a harmonize cost with X on the face', () => {
    expect(FESTIVAL.faces[0]?.spell?.x).toBe(true);
    expect(FESTIVAL.faces[0]?.alternativeCosts).toEqual([
      { kind: 'harmonize', cost: [{ kind: 'mana', symbols: ['X', 'R', 'R'] }] },
    ]);
  });

  test('cast for {X}{R}{R} with X = 3: the top three cards are exiled, and playable this turn and in the next one', () => {
    const g = game();
    g.act(0).cast(NAME, { x: 3, pay: true });
    g.expect.stack([NAME]);
    g.passAll();
    for (const card of ['Forest', 'Raging Goblin', 'Lightning Bolt']) {
      g.expect.zone(card, 'exile', { seat: 0 });
    }
    expect(g.find({ name: 'Mountain', zone: 'library', seat: 0 })).toHaveLength(8);
    g.expect.zone(NAME, 'graveyard', { seat: 0 });
    g.expect.legal(0, { playLand: 'Forest' });
    // The opponent's turn: the instant only; then my next turn: all of them; then it is over.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(0, { playLand: 'Forest' });
    g.expect.legal(0, { cast: 'Raging Goblin' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { playLand: 'Forest' });
    g.expect.illegal(0, { cast: 'Lightning Bolt' });
  });

  test('X = 0 exiles nothing', () => {
    const g = game();
    g.act(0).cast(NAME, { x: 0, pay: true });
    g.passAll();
    g.expect.zone('Forest', 'library', { seat: 0 });
  });
});

describe('"Harmonize {X}{R}{R}": cast from the graveyard, tapping a creature to reduce the cost', () => {
  const game = () =>
    scenario()
      .seat(0)
      .define(FESTIVAL)
      .graveyard(NAME)
      .battlefield('Mountain', { count: 3 })
      .battlefield('Serra Angel')
      .library('Forest', 'Raging Goblin', 'Lightning Bolt', 'Plains', 'Plains', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('with a 4-power creature tapped, three lands pay {R}{R} and X = 5: five cards are exiled', () => {
    const g = game();
    g.expect.legal(0, { cast: NAME, alternative: 'harmonize' });
    g.act(0).cast(NAME, { alternative: 'harmonize' });
    g.act(0).choosePermanents('Serra Angel');
    g.expect.tapped('Serra Angel');
    g.act(0).chooseX(5);
    g.act(0).payAuto();
    g.passAll();
    for (const card of ['Forest', 'Raging Goblin', 'Lightning Bolt', 'Plains']) {
      g.expect.zone(card, 'exile', { seat: 0 });
    }
    expect(g.find({ name: 'Plains', zone: 'exile' })).toHaveLength(2);
    // Harmonize exiles the spell as it leaves the stack (CR 702.180a): it is not in the graveyard.
    g.expect.zone(NAME, 'exile', { seat: 0 });
    g.expect.noObject(NAME, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('without tapping a creature the X is paid with the mana the lands have left after {R}{R}', () => {
    const g = game();
    g.act(0).cast(NAME, { alternative: 'harmonize' });
    g.act(0).choosePermanents();
    g.act(0).chooseX(1);
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.zone('Raging Goblin', 'library', { seat: 0 });
    g.expect.tapped('Serra Angel', false);
  });
});
