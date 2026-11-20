// Tannuk deck, group "Whenever a land you control enters" (issue 347): Lotus Cobra ("add one mana of any color", CR 106.1b, 605.1b, 608.2d), Geode Rager ("goad each creature target
// player controls", CR 701.15, 115.1, 608.2c) and Valakut Exploration ("exile the top card of your library. You may play that card for as long as it remains exiled." and the end step
// ability that puts the cards exiled with it into their owners' graveyards and deals that much damage to each opponent, CR 607.2a, 406.3, 603.4, 608.2c). The wordings are those of the
// real cards read through the grammar only; every card name starts with "SYNTHETIC". Rulings (2020, wotc, unverified here): the landfall abilities use the stack and are not mana abilities;
// creatures that enter or come under the target player's control after Geode Rager's ability resolved are not goaded; cards exiled with Valakut Exploration stay exiled and playable if it
// leaves the battlefield; a card played this way is a new object and is not counted at the end step.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const cobra = parsed(
  'SYNTHETIC Parsed Cobra',
  'Creature — Snake',
  'Landfall — Whenever a land you control enters, add one mana of any color.',
  { manaCost: '{1}{G}', power: '2', toughness: '1', colors: ['G'] },
);
const rager = parsed(
  'SYNTHETIC Parsed Rager',
  'Creature — Elemental',
  'First strike\nLandfall — Whenever a land you control enters, goad each creature target player controls. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)',
  { manaCost: '{4}{R}{R}', power: '4', toughness: '3', colors: ['R'] },
);
const exploration = parsed(
  'SYNTHETIC Parsed Exploration',
  'Enchantment',
  "Landfall — Whenever a land you control enters, exile the top card of your library. You may play that card for as long as it remains exiled.\nAt the beginning of your end step, if there are cards exiled with ~, put them into their owner's graveyard, then ~ deals that much damage to each opponent.",
  { manaCost: '{2}{R}', colors: ['R'] },
);
const bear = parsed('SYNTHETIC Parsed Bear', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const wolf = parsed('SYNTHETIC Parsed Wolf', 'Creature — Wolf', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const hollow = parsed('SYNTHETIC Parsed Hollow', 'Land', '{T}: Add {C}.');
const rampant = parsed(
  'SYNTHETIC Parsed Rampant',
  'Sorcery',
  'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
  { manaCost: '{G}', colors: ['G'] },
);

const defs = () =>
  scenario()
    .define(cobra)
    .define(rager)
    .define(exploration)
    .define(bear)
    .define(wolf)
    .define(hollow)
    .define(rampant);

describe('Lotus Cobra: "Whenever a land you control enters, add one mana of any color." (CR 605.1b, 608.2d)', () => {
  const board = () =>
    defs()
      .seat(0)
      .library('Island', 'Island', 'Island')
      .hand(hollow.name)
      .battlefield(cobra.name)
      .seat(1)
      .library('Island', 'Island', 'Island')
      .hand(hollow.name)
      .at('precombatMain', { active: 0 })
      .build();

  test('a land played: the trigger uses the stack (no mana yet), then its controller names the color', () => {
    const g = board();
    g.act(0).playLand(hollow.name);
    // It is not a mana ability: it waits on the stack and the opponent may respond (ruling 2020-09-25).
    expect(g.state.stack).toHaveLength(1);
    g.expect.pool(0, '');
    g.passAll();
    g.act(0).chooseOption('{R}');
    g.expect.pool(0, 'R');
    g.expect.invariants();
  });

  test('each of the five colors can be named', () => {
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      const g = board();
      g.act(0).playLand(hollow.name);
      g.passAll();
      g.act(0).chooseOption(`{${color}}`);
      g.expect.pool(0, color);
    }
  });

  test('a land put onto the battlefield by a spell triggers it too (a land entering for any reason)', () => {
    const g = defs()
      .seat(0)
      .library('Forest', 'Island', 'Island')
      .hand(rampant.name)
      .battlefield(cobra.name)
      .battlefield('Forest')
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(rampant.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.passAll();
    g.act(0).chooseOption('{U}');
    g.expect.pool(0, 'U');
  });

  test('a land an opponent plays does not trigger it', () => {
    const g = defs()
      .seat(0)
      .library('Island', 'Island', 'Island')
      .battlefield(cobra.name)
      .seat(1)
      .library('Island', 'Island', 'Island')
      .hand(hollow.name)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).playLand(hollow.name);
    expect(g.state.stack).toHaveLength(0);
    g.expect.pool(0, '');
  });
});

describe('Geode Rager: "Whenever a land you control enters, goad each creature target player controls." (CR 701.15a, 115.1)', () => {
  const board = () =>
    defs()
      .seat(0)
      .library('Island', 'Island', 'Island')
      .hand(hollow.name)
      .battlefield(rager.name)
      .battlefield(bear.name)
      .seat(1)
      .library('Island', 'Island', 'Island')
      .battlefield(bear.name)
      .battlefield(wolf.name)
      .at('precombatMain', { active: 0 })
      .build();

  const goaded = (g: ReturnType<typeof board>) =>
    g.state.continuousEffects.filter((e) => e.change.kind === 'goaded');

  test('the opponent is the target: each creature they control is goaded by the controller until their next turn', () => {
    const g = board();
    g.act(0).playLand(hollow.name);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    const effects = goaded(g);
    expect(effects).toHaveLength(2);
    for (const e of effects) {
      expect(e.change).toMatchObject({ kind: 'goaded', by: 0 });
      expect(e.until).toMatchObject({ kind: 'turnStart', seat: 0 });
    }
    // Only the creatures of the target player (CR 608.2c: fixed as the effect resolves, so one that arrives later is not goaded, ruling 2020-09-25).
    const goadedIds = effects.flatMap((e) => e.objects);
    for (const id of goadedIds) expect(g.state.objects[id]?.controller).toBe(1);
    g.expect.invariants();
  });

  test('targeting yourself goads your own creatures (the target is any player)', () => {
    const g = board();
    g.act(0).playLand(hollow.name);
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    const effects = goaded(g);
    // Rager itself and the bear: goaded by their own controller.
    expect(effects).toHaveLength(2);
    for (const e of effects) expect(e.change).toMatchObject({ kind: 'goaded', by: 0 });
  });
});

describe('Valakut Exploration, first ability: "exile the top card of your library. You may play that card for as long as it remains exiled." (CR 406.3, 601.2, 305.1, 607.2a)', () => {
  const board = () =>
    defs()
      .seat(0)
      .library(bear.name, wolf.name, 'Forest', 'Forest')
      .hand(hollow.name)
      .battlefield(exploration.name)
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();

  test('a land played exiles the top card of the controller library, which they may cast from exile', () => {
    const g = board();
    g.act(0).playLand(hollow.name);
    g.passAll();
    g.expect.zone(bear.name, 'exile', { seat: 0, count: 1 });
    g.expect.zone(wolf.name, 'library', { seat: 0, count: 1 });
    g.expect.legal(0, { cast: bear.name });
    g.act(0).cast(bear.name, { pay: true });
    g.passAll();
    g.expect.zone(bear.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('the card stays playable later in the turn: the permission has no end of its own', () => {
    const g = board();
    g.act(0).playLand(hollow.name);
    g.passAll();
    g.advanceTo('postcombatMain');
    g.expect.zone(bear.name, 'exile', { seat: 0, count: 1 });
    g.expect.legal(0, { cast: bear.name });
  });

  test('a land an opponent plays exiles nothing', () => {
    const g = defs()
      .seat(0)
      .library(bear.name, wolf.name)
      .battlefield(exploration.name)
      .seat(1)
      .library('Island', 'Island', 'Island')
      .hand(hollow.name)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).playLand(hollow.name);
    g.passAll();
    g.expect.zone(bear.name, 'library', { seat: 0, count: 1 });
  });
});

describe('Valakut Exploration, end step: "if there are cards exiled with ~, put them into their owner\'s graveyard, then ~ deals that much damage to each opponent" (CR 603.4, 608.2c)', () => {
  const twoLands = () => {
    const g = defs()
      .seat(0)
      .library(bear.name, wolf.name, 'Forest', 'Island', 'Island')
      .hand(hollow.name)
      .hand(rampant.name)
      .battlefield(exploration.name)
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).playLand(hollow.name);
    g.passAll();
    g.act(0).cast(rampant.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.passAll();
    return g;
  };

  test('with two cards exiled, both go to the graveyard and each opponent takes 2', () => {
    const g = twoLands();
    g.expect.zone(bear.name, 'exile', { seat: 0, count: 1 });
    g.expect.zone(wolf.name, 'exile', { seat: 0, count: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(bear.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(wolf.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.life(1, 38);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('a card played from exile is a new object: it is not counted', () => {
    const g = twoLands();
    g.act(0).cast(bear.name, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(wolf.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(bear.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.life(1, 39);
  });

  test('with nothing exiled with it the ability does not trigger (intervening "if")', () => {
    const g = defs()
      .seat(0)
      .library(bear.name, wolf.name)
      .battlefield(exploration.name)
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    expect(g.state.stack).toHaveLength(0);
    g.expect.life(1, 40);
  });
});
