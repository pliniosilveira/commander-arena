// Ahoy Mateys deck, group 10: Arm-Mounted Anchor, Lethal Scheme, Siren Stormtamer and Storm Fleet Negotiator, read from their real Oracle text and run by the engine.
// "Equip {2}. This ability costs {2} less to activate if you have one or fewer cards in hand."
// "Convoke ... Destroy target creature or planeswalker. Each creature that convoked this spell connives."
// "{U}, Sacrifice this creature: Counter target spell or ability that targets you or a creature you control."
// "Whenever this creature attacks, each player reveals the top card of their library. For each nonland card revealed this way, you create a Map token. Then each player draws a card."
// Pins (the CR text was not available here: the numbers are those the engine's comments cite): CR 601.2f and 602.2b (the cost of an ability is worked out as it is activated), CR 702.6a (Equip),
// CR 702.51a (Convoke), CR 701.50a (Connive), CR 115.1 and 601.2c (what a spell or ability targets), CR 701.6a (Counter), CR 701.20a (Reveal), CR 608.2c (what is done reads the cards as
// they were revealed), CR 508.1 (attacking).
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const ANCHOR = real('Arm-Mounted Anchor');
const SCHEME = real('Lethal Scheme');
const TAMER = real('Siren Stormtamer');
const NEGOTIATOR = real('Storm Fleet Negotiator');
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const FILLER = Array.from({ length: 8 }, () => 'Plains');
const mine = (name: string) => ({ name, zone: 'battlefield' as const, seat: 0 as const });

describe('every card is valid', () => {
  test.each([ANCHOR, SCHEME, TAMER, NEGOTIATOR] as readonly CardDefinition[])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Arm-Mounted Anchor', () => {
  const game = (hand: readonly string[], lands: readonly string[] = []) =>
    scenario()
      .define(ANCHOR)
      .seat(0)
      .hand(...hand)
      .library(...FILLER)
      .battlefield('Arm-Mounted Anchor', BEARS, ...lands)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the equip ability is read as a reduction of {2} when the hand holds one or fewer cards', () => {
    const equip = ANCHOR.faces[0]?.abilities.find((a) => a.kind === 'keyword');
    expect(equip).toMatchObject({
      keyword: {
        kind: 'equip',
        cost: [{ kind: 'mana', symbols: ['2'] }],
        costReducedIf: {
          generic: 2,
          condition: { kind: 'amountIs', compare: { cmp: 'atMost', value: 1 } },
        },
      },
    });
  });

  test('with one card in hand equipping costs nothing', () => {
    const g = game([BEARS]);
    g.act(0).activate('Arm-Mounted Anchor', { targets: [{ name: BEARS, zone: 'battlefield' }] });
    g.passAll();
    g.expect.attached('Arm-Mounted Anchor', { name: BEARS, zone: 'battlefield' });
    g.expect.pt({ name: BEARS, zone: 'battlefield' }, 4, 4);
  });

  test('with two cards in hand it costs {2}', () => {
    const g = game([BEARS, SPIDER]);
    g.expect.illegal(0, { activate: 'Arm-Mounted Anchor' });
    const paid = game([BEARS, SPIDER], ['Forest', 'Forest']);
    paid.act(0).activate('Arm-Mounted Anchor', {
      targets: [{ name: BEARS, zone: 'battlefield' }],
      pay: true,
    });
    paid.passAll();
    paid.expect.attached('Arm-Mounted Anchor', { name: BEARS, zone: 'battlefield' });
  });
});

describe('Lethal Scheme', () => {
  const game = () =>
    scenario()
      .define(SCHEME)
      .seat(0)
      .hand('Lethal Scheme', BEARS)
      .library(...FILLER)
      .battlefield('Swamp', 'Swamp', 'Swamp', BEARS, SPIDER)
      .seat(1)
      .library(...FILLER)
      .battlefield('Wall of Stone')
      .at('precombatMain', { active: 0 })
      .build();

  test('destroys the target; each creature tapped for convoke connives, the others do not', () => {
    const g = game();
    g.act(0).cast('Lethal Scheme', { targets: ['Wall of Stone'] });
    g.act(0).choose({ kind: 'choosePayOptions', objects: [g.id(mine(BEARS))] });
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Wall of Stone', 'graveyard', { seat: 1 });
    // Only the Bears convoked: it draws and discards the Bears card in hand (a nonland card): a counter.
    g.act(0).chooseCards({ name: BEARS, zone: 'hand', nth: 0 });
    expect(g.view(0).battlefield.find((o) => o.name === BEARS)?.counters).toEqual({ '+1/+1': 1 });
    expect(g.view(0).battlefield.find((o) => o.name === SPIDER)?.counters).toEqual({});
    g.expect.invariants();
  });
});

describe('Siren Stormtamer', () => {
  const game = () =>
    scenario()
      .define(TAMER)
      .seat(0)
      .library(...FILLER)
      .battlefield('Siren Stormtamer', BEARS, 'Island')
      .seat(1)
      .hand('Lightning Bolt')
      .library(...FILLER)
      .battlefield('Mountain', 'Wall of Stone')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test('sacrificing it counters a Bolt that targets the player', () => {
    const g = game();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    g.act(0).activate('Siren Stormtamer', { targets: ['Lightning Bolt'], pay: true });
    g.passAll();
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 1 });
    g.expect.zone('Siren Stormtamer', 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.life).toBe(40);
  });

  test('it counters a Bolt that targets a creature of the controller too', () => {
    const g = game();
    g.act(1).cast('Lightning Bolt', { targets: [{ name: BEARS, zone: 'battlefield' }], pay: true });
    g.act(1).pass();
    g.act(0).activate('Siren Stormtamer', { targets: ['Lightning Bolt'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('it cannot counter a Bolt that targets the opponent itself', () => {
    const g = game();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.act(1).pass();
    g.expect.illegal(0, { activate: 'Siren Stormtamer' });
  });
});

describe('Storm Fleet Negotiator', () => {
  const game = (mineTop: string, theirTop: string) =>
    scenario()
      .define(NEGOTIATOR)
      .seat(0)
      .library(mineTop, 'Plains', 'Plains')
      .battlefield('Storm Fleet Negotiator')
      .seat(1)
      .library(theirTop, 'Plains', 'Plains')
      .at('beginningOfCombat', { active: 0 })
      .build();
  const attack = (g: ReturnType<typeof game>) => {
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: 'Storm Fleet Negotiator' }]);
    g.passAll();
  };
  const maps = (g: ReturnType<typeof game>) =>
    g.view(0).battlefield.filter((o) => o.name === 'Map' && o.controller === 0).length;

  test('each nonland card revealed makes a Map for its controller, then each player draws the card', () => {
    const g = game(BEARS, SPIDER);
    attack(g);
    expect(maps(g)).toBe(2);
    expect(
      g.view(0).battlefield.filter((o) => o.name === 'Map' && o.controller === 1),
    ).toHaveLength(0);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 1 });
    g.expect.invariants();
  });

  test('a land card makes no Map', () => {
    const g = game('Forest', SPIDER);
    attack(g);
    expect(maps(g)).toBe(1);
    g.expect.zone('Forest', 'hand', { seat: 0 });
  });
});
