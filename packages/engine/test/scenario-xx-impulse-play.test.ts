// "Exile the top card of your library. You may play that card this turn." (D-151): the effects `exileTop` and `mayPlay`, and the permission
// they give: a `playPermission` that lets the player cast a card in exile (or play it when it is a land) until the end of the turn, until the
// end of their next turn, or until their next end step; plus the delayed trigger that counts "those cards that are still exiled".
// Pins: CR 701.13 (Exile), CR 601.2 (casting from exile as though from the hand: the timing of the type, the ordinary cost), CR 305.1 and
// 305.2 (a land from exile is a land play and uses the land drop), CR 611.2a (the permission lasts as long as the effect says), CR 400.7 (a
// card that left exile is a new object and has no permission), CR 603.7 (a delayed trigger), CR 514.2 (cleanup ends "until end of turn").
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-dragons-impulse.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const RITE = 'SYNTHETIC Impulse Rite';
const LONG = 'SYNTHETIC Long Impulse Rite';
const ALTAR = 'SYNTHETIC Luck Altar';
const HAWK = 'SYNTHETIC Hawk of Fortune';
const BOLT = 'Lightning Bolt';
const BEARS = 'Raging Goblin'; // {R}, a red creature the Mountains can pay for
const FILLER = Array.from({ length: 10 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([RITE, LONG, ALTAR, HAWK])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Exile the top card of your library. You may play that card this turn."', () => {
  const game = (top: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('the top card goes to exile face up, and a spell there can be cast for its cost', () => {
    const g = game([BOLT]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: BOLT });
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('a land there can be played, and it uses the land drop', () => {
    const g = game(['Forest']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.legal(0, { playLand: 'Forest' });
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    // The land drop is used: a land from the hand cannot be played too.
    const h = scenario()
      .seat(0)
      .hand(RITE, 'Swamp')
      .battlefield('Mountain', 'Mountain')
      .library('Forest', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    h.act(0).cast(RITE, { pay: true });
    h.passAll();
    h.act(0).playLand('Forest');
    h.expect.illegal(0, { playLand: 'Swamp' });
  });

  test('a spell needs its mana: with nothing to pay for it the card cannot be cast', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Mountain', 'Mountain')
      .library(BEARS, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.illegal(0, { cast: BEARS });
  });

  test('the timing of the type holds: a creature cannot be cast with the Rite still on the stack', () => {
    const g = game([BEARS]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.legal(0, { cast: BEARS });
    // On the next turn, the permission is gone.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { cast: BEARS });
  });

  test("the permission is the controller's own: the opponent cannot cast it", () => {
    const g = game([BOLT]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.illegal(1, { cast: { name: BOLT, seat: 0 } });
  });

  test('an empty library exiles nothing and nothing happens', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
  });

  test('a permission names the very card: once it is cast the card is on the stack, and no other card is playable', () => {
    const g = game([BOLT]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
    expect(g.find({ name: 'Mountain', zone: 'exile' })).toHaveLength(0);
  });
});

describe('"Until the end of your next turn, you may play those cards."', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand(LONG)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(BOLT, BEARS, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test("both cards are exiled and playable this turn, on the opponent's turn the instant only", () => {
    const g = game();
    g.act(0).cast(LONG, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: BEARS });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.pass(1); // the opponent's turn: the controller of the permission may still cast the instant (the permission is not over).
    g.expect.legal(0, { cast: BOLT });
    g.expect.illegal(0, { cast: BEARS });
  });

  test("it lasts through the controller's next turn and ends with it", () => {
    const g = game();
    g.act(0).cast(LONG, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' }); // the opponent's turn
    g.advanceTo('precombatMain', { turn: 'next' }); // my next turn
    g.expect.legal(0, { cast: BEARS });
    g.advanceTo('postcombatMain');
    g.expect.legal(0, { cast: BEARS });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { cast: BEARS });
    g.expect.illegal(0, { cast: BOLT });
  });
});

describe('a trigger at the beginning of the upkeep', () => {
  test('exiles the top card each upkeep and lets it be played that turn', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ALTAR, 'Mountain')
      .library('Forest', 'Swamp', BEARS, 'Plains', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('upkeep', { turn: 'next' }); // the opponent's upkeep: the Altar is not for them
    g.expect.zone('Forest', 'library', { seat: 0 });
    g.advanceTo('upkeep', { turn: 'next' }); // my upkeep
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.advanceTo('precombatMain');
    g.expect.legal(0, { playLand: 'Forest' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    // Last turn's card is still in exile and can no longer be played.
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.advanceTo('precombatMain');
    g.expect.illegal(0, { playLand: 'Forest' });
  });
});

describe('"... until your next end step. At the beginning of your next end step, ~ deals 2 damage to each opponent for each of those cards that are still exiled."', () => {
  const setup = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(HAWK)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...library)
      .seat(1)
      .library(...FILLER)
      .build();

  test('one creature with power 4 or greater (the Hawk itself): one card, and 2 damage if it is still exiled at the end step', () => {
    const g = setup([BEARS, ...FILLER]);
    g.act(0).cast(HAWK, { pay: true });
    g.passAll(); // the Hawk resolves and its enters trigger resolves
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 38);
  });

  test('a card cast before the end step is no longer exiled and does not count', () => {
    const g = setup([BOLT, ...FILLER]);
    g.act(0).cast(HAWK, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    // The Hawk cost five Mountains: nothing is left to cast the Bolt with; play a land from the library instead.
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 38);
  });

  test('lands played from exile are not counted: the land left exile', () => {
    const g = setup(['Forest', ...FILLER]);
    g.act(0).cast(HAWK, { pay: true });
    g.passAll();
    g.act(0).playLand('Forest');
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 40);
  });

  test('the permission ends as the end step begins', () => {
    const g = setup([BEARS, ...FILLER]);
    g.act(0).cast(HAWK, { pay: true });
    g.passAll();
    g.advanceTo('postcombatMain');
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.advanceTo('end');
    g.expect.illegal(0, { cast: BEARS });
  });
});

describe('"When this creature dies, choose one - Exile the top two cards of your library. Until the end of your next turn, you may play those cards. / Create three Treasure tokens."', () => {
  const DYING = 'SYNTHETIC Dying Dragon';
  const dies = () => {
    const g = scenario()
      .seat(0)
      .library('Forest', 'Island', ...FILLER)
      .battlefield(DYING)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(`${BOLT}[0]`, { targets: [DYING], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [DYING], pay: true });
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(syntheticCard(DYING))).toEqual([]);
  });

  test('the first mode exiles two cards that can be played until the end of my next turn', () => {
    const g = dies();
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(0);
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.zone('Island', 'exile', { seat: 0 });
    g.expect.legal(0, { playLand: 'Forest' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(0, { playLand: 'Forest' });
  });

  test('the second mode creates three Treasure tokens', () => {
    const g = dies();
    g.act(0).chooseModes(1);
    g.passAll();
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.token != null)).toHaveLength(3);
    g.expect.zone('Forest', 'library', { seat: 0 });
  });
});
