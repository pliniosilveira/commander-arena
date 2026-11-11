// "Whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand. If that land is a Plains, you
// may return that nonland permanent card to the battlefield instead." (D-149)
// Pins: CR 603.2 (landfall), CR 608.2d ("you may"), CR 608.2h and 113.7a (the land that entered is read as it is), CR 205.3i (a land with the
// Plains type), CR 303.4f (an Aura card put onto the battlefield chooses what it enchants), CR 115.1 (the target card is chosen as the
// trigger goes on the stack). Cards are SYNTHETIC (src/cards/fixtures/synthetic-until-leaves.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SHEPHERD = 'SYNTHETIC Dawn Shepherd';
const MIGHTY = 'SYNTHETIC Mighty Aura';
const BEARS = 'Grizzly Bears';
const RING = 'Sol Ring';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the card is valid', () => {
  test(SHEPHERD, () => {
    expect(validateCard(syntheticCard(SHEPHERD))).toEqual([]);
  });
});

const game = (land: string, graveyard: readonly string[]) =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(land)
    .battlefield(SHEPHERD)
    .graveyard(...graveyard)
    .seat(1)
    .library(...LIBRARY)
    .build();

describe('a land that is not a Plains: only to the hand', () => {
  test('accept: the card goes to the hand', () => {
    const g = game('Forest', [BEARS]);
    g.act(0).playLand('Forest');
    g.passAll();
    g.act(0).accept();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('decline: it stays in the graveyard', () => {
    const g = game('Forest', [BEARS]);
    g.act(0).playLand('Forest');
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('a Plains: to the battlefield instead, or to the hand', () => {
  test('accept the battlefield: the creature card enters', () => {
    const g = game('Plains', [BEARS]);
    g.act(0).playLand('Plains');
    g.passAll();
    g.act(0).accept();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('decline the battlefield, accept the hand', () => {
    const g = game('Plains', [BEARS]);
    g.act(0).playLand('Plains');
    g.passAll();
    g.act(0).decline();
    g.act(0).accept();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('decline both: it stays', () => {
    const g = game('Plains', [BEARS]);
    g.act(0).playLand('Plains');
    g.passAll();
    g.act(0).decline();
    g.act(0).decline();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('an artifact card enters the battlefield too', () => {
    const g = game('Plains', [RING]);
    g.act(0).playLand('Plains');
    g.passAll();
    g.act(0).accept();
    g.expect.zone(RING, 'battlefield', { seat: 0 });
  });

  test('an Aura card enters attached to a creature its controller chooses (CR 303.4f)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand('Plains')
      .battlefield(SHEPHERD, BEARS)
      .graveyard(MIGHTY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).playLand('Plains');
    g.passAll();
    g.act(0).accept();
    // Two creatures it could enchant: the Shepherd and the Bears.
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    g.expect.attached(MIGHTY, BEARS);
  });
});

describe('what can be returned', () => {
  test("lands, instants and sorceries are not offered; only my graveyard's cards", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand('Forest')
      .battlefield(SHEPHERD)
      .graveyard('Forest', BOLT)
      .seat(1)
      .library(...LIBRARY)
      .graveyard(BEARS)
      .build();
    g.act(0).playLand('Forest');
    // No legal target: the ability is not put on the stack.
    expect(g.state.stack.length).toBe(0);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('a land of the opponent entering does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SHEPHERD)
      .graveyard(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .hand('Forest')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).playLand('Forest');
    expect(g.state.stack.length).toBe(0);
  });
});
