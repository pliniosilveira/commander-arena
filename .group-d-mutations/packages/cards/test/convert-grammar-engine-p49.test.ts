// The Vraska deck, groups 2 and on (stage P49, D-206 and following): the REAL cards of the owner's golden corpus (real Oracle text,
// `fixtures/corpus/golden.jsonl`) read through the grammar only, defined in an engine scenario and played through applyAction. The lesson of Lobelia
// (D-198: a card read at its SYNTHETIC text and failed at the real one) is why nothing here is written from a masked or invented wording. No ruling of any
// card could be read (Scryfall is not reachable from the sandbox): nothing below rests on one.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';

const on = (...defs: CardDefinition[]) => {
  const b = scenario().seat(0);
  for (const d of defs) b.define(d);
  return b
    .library(...FILLER)
    .seat(1)
    .library(...FILLER);
};

const STAFF = real("White Mage's Staff");
const LANCE = real("Dragoon's Lance");

describe("White Mage's Staff (Job select; equipped creature gets +1/+1, has a quoted trigger and is a Cleric)", () => {
  const game = () =>
    on(STAFF)
      .seat(0)
      .hand(STAFF.name)
      .battlefield('Plains', { count: 2 })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('Job select makes a 1/1 colorless Hero token and attaches the Equipment: a 2/2 Hero Cleric', () => {
    const g = game();
    g.act(0).cast(STAFF.name, { pay: true });
    g.passAll();
    const hero = getView(g.state, 0).battlefield.find((o) => o.isToken);
    expect(hero).toMatchObject({ name: 'Hero', power: 2, toughness: 2, colors: [] });
    expect(hero?.subtypes).toEqual(expect.arrayContaining(['Hero', 'Cleric']));
    expect(getView(g.state, 0).battlefield.find((o) => o.name === STAFF.name)?.attachedTo).toBe(
      hero?.id,
    );
    g.expect.invariants();
  });

  test('the granted ability triggers on the equipped creature: it attacks, its controller gains 1 life', () => {
    const g = game();
    g.act(0).cast(STAFF.name, { pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers');
    g.act(0).attack('Hero');
    g.passAll();
    g.expect.life(0, 41);
  });
});

describe("Dragoon's Lance (Job select; during your turn, equipped creature has flying)", () => {
  test('a 2/1 Hero Knight that flies only on its controller turn', () => {
    const g = on(LANCE)
      .seat(0)
      .hand(LANCE.name)
      .battlefield('Plains', { count: 2 })
      .seat(1)
      .battlefield(ANGEL)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(LANCE.name, { pay: true });
    g.passAll();
    const hero = () => getView(g.state, 0).battlefield.find((o) => o.isToken);
    expect(hero()).toMatchObject({ name: 'Hero', power: 2, toughness: 1 });
    expect(hero()?.subtypes).toEqual(expect.arrayContaining(['Hero', 'Knight']));
    expect(hero()?.keywords).toContain('flying');
    g.advanceTo('upkeep', { turn: 'next' });
    expect(hero()?.keywords ?? []).not.toContain('flying');
    g.advanceTo('upkeep', { turn: 'next' });
    expect(hero()?.keywords).toContain('flying');
  });
});

const SCYTHE = real('Magitek Scythe');

describe('Magitek Scythe (When this Equipment enters, you may attach it to target creature you control. If you do, that creature gains first strike and must be blocked this turn if able)', () => {
  const game = (tappedOnly = false) => {
    const b = on(SCYTHE)
      .seat(0)
      .hand(SCYTHE.name)
      .battlefield('Mountain', { count: 4 })
      .battlefield(BEARS)
      .seat(1);
    if (tappedOnly) b.battlefield('Giant Spider', { tapped: true });
    else b.battlefield(ANGEL).battlefield('Giant Spider');
    return b.at('precombatMain', { active: 0, turn: 1 }).build();
  };

  const attackWith = (g: ReturnType<typeof game>) => {
    g.act(0).cast(SCYTHE.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
  };

  test('the creature is equipped, has first strike this turn, and a defender who can block it must (CR 509.1c)', () => {
    const g = game();
    attackWith(g);
    g.advanceTo('declareBlockers');
    const none = g.act(1).try.declareBlockers([]);
    expect(none.ok).toBe(false);
    const block = g.act(1).try.declareBlockers([{ blocker: 'Giant Spider', attacker: BEARS }]);
    expect(block.ok).toBe(true);
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEARS)?.keywords).toContain(
      'firstStrike',
    );
  });

  test('declining the attach leaves the creature as it was: no first strike, no requirement', () => {
    const g = game();
    g.act(0).cast(SCYTHE.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    expect(g.act(1).try.declareBlockers([]).ok).toBe(true);
  });

  test('a defender with no creature able to block is not required to do anything', () => {
    const g = game(true);
    attackWith(g);
    // No creature can block, so there is no declaration to make and the damage is dealt (2 power and the Equipment's +2).
    g.advanceTo('endOfCombat');
    g.expect.life(1, 36);
  });
});

const KEY = real('Key to the City');
const SAHAGIN = real('Sahagin');
const INKSHAPE = real('Inkshape Demonstrator');
const GAU = real('Gau, Feral Youth');
const GRAHA = real("G'raha Tia");

describe('Key to the City ({T}, Discard a card: up to one target creature can’t be blocked this turn; whenever it becomes untapped, you may pay {2}, if you do, draw a card)', () => {
  const game = () =>
    on(KEY)
      .seat(0)
      .battlefield(KEY.name, { tapped: true })
      .battlefield('Island', { count: 2 })
      .battlefield(BEARS)
      .library('Island', 'Island', 'Island')
      .at('end', { active: 1, turn: 2 })
      .build();

  test('it untaps in its controller untap step: the controller may pay {2} and draws a card (CR 701.26a)', () => {
    const g = game();
    g.advanceTo('upkeep', { turn: 'next' });
    const before = g.state.seats[0]?.hand.length ?? -1;
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    // One card from the draw step and one from the ability.
    expect(g.state.seats[0]?.hand.length ?? -1).toBe(before + 2);
  });

  test('declining the payment draws nothing', () => {
    const g = game();
    g.advanceTo('upkeep', { turn: 'next' });
    const before = g.state.seats[0]?.hand.length ?? -1;
    g.passAll();
    g.act(0).decline();
    expect(g.state.seats[0]?.hand.length ?? -1).toBe(before);
  });

  test('the activated ability: tap, discard a card, and the creature can’t be blocked this turn', () => {
    const g = on(KEY)
      .seat(0)
      .hand('Island')
      .battlefield(KEY.name)
      .battlefield(BEARS)
      .seat(1)
      .battlefield(ANGEL)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).activate(KEY.name);
    g.act(0).chooseTargets({ name: BEARS });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
  });
});

describe('Sahagin (whenever you cast a noncreature spell, if at least four mana was spent to cast it, put a +1/+1 counter on it and it can’t be blocked this turn)', () => {
  test('four mana spent on a noncreature spell: a counter and unblockable; three mana: nothing (CR 601.2h)', () => {
    const g = on(SAHAGIN)
      .seat(0)
      .battlefield(SAHAGIN.name)
      .hand("Angel's Mercy", 'Lightning Bolt')
      .battlefield('Plains', { count: 4 })
      .battlefield('Mountain')
      .seat(1)
      .battlefield(ANGEL)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === SAHAGIN.name)).toMatchObject({
      power: 1,
      toughness: 3,
    });
    g.act(0).cast("Angel's Mercy", { pay: true });
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === SAHAGIN.name)).toMatchObject({
      power: 2,
      toughness: 4,
    });
    g.advanceTo('declareAttackers');
    g.act(0).attack(SAHAGIN.name);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40 - 3 - 2);
  });
});

describe('Inkshape Demonstrator (Repartee: whenever you cast an instant or sorcery spell that targets a creature, it gets +1/+0 and gains lifelink until end of turn)', () => {
  const game = () =>
    on(INKSHAPE)
      .seat(0)
      .battlefield(INKSHAPE.name)
      .hand('Lightning Bolt', 'Divination')
      .battlefield('Mountain', { count: 2 })
      .battlefield('Island', { count: 3 })
      .seat(1)
      .battlefield(ANGEL)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('a spell that targets a creature triggers it', () => {
    const g = game();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: ANGEL }], pay: true });
    const view = getView(g.state, 0).battlefield.find((o) => o.name === INKSHAPE.name);
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === INKSHAPE.name)).toMatchObject({
      power: 4,
    });
    expect(view).toBeDefined();
  });

  test('a spell that targets a player, and a spell with no target, do not', () => {
    const g = game();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === INKSHAPE.name)).toMatchObject({
      power: 3,
    });
  });
});

describe('Gau, Feral Youth (Rage: whenever it attacks, put a +1/+1 counter on it; at the beginning of each end step, if a card left your graveyard this turn, it deals damage equal to its power to each opponent)', () => {
  const game = () =>
    on(GAU)
      .seat(0)
      .battlefield(GAU.name)
      .graveyard(BEARS)
      .hand('SYNTHETIC Raise Dead')
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('a card left the graveyard this turn: the end step deals damage equal to its power to each opponent (CR 400.7)', () => {
    const g = game();
    g.act(0).cast('SYNTHETIC Raise Dead', { targets: [{ name: BEARS }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 38);
  });

  test('nothing left the graveyard: no damage', () => {
    const g = game();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 40);
  });

  test('Rage: attacking puts a +1/+1 counter on it', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack(GAU.name);
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === GAU.name)).toMatchObject({
      power: 3,
      toughness: 3,
    });
  });
});

describe("G'raha Tia (The Allagan Eye: whenever one or more other creatures and/or artifacts you control die, draw a card; this ability triggers only once each turn)", () => {
  const game = () =>
    on(GRAHA)
      .seat(0)
      .battlefield(GRAHA.name)
      .battlefield(BEARS, { count: 2 })
      .hand('SYNTHETIC Wrath', 'Murder', 'Murder')
      .battlefield('Swamp', { count: 6 })
      .battlefield('Plains', { count: 2 })
      .library('Island', 'Island', 'Island')
      .seat(1)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('creatures that die together are one event: one trigger, one card (CR 603.2c, 603.10a)', () => {
    const g = game();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    g.passAll();
    g.passAll();
    // The two Bears and G'raha herself died; her ability saw the Bears die (a look-back trigger) and drew one card.
    expect(g.state.seats[0]?.hand.length ?? -1).toBe(3 - 1 + 1);
  });

  test('once each turn: a second death in the same turn does not draw again', () => {
    const g = game();
    g.act(0).cast({ name: 'Murder', nth: 0 }, { targets: [{ name: BEARS, nth: 0 }], pay: true });
    g.passAll();
    const after = g.state.seats[0]?.hand.length ?? -1;
    g.act(0).cast(
      { name: 'Murder', nth: 0 },
      { targets: [{ name: BEARS, zone: 'battlefield' }], pay: true },
    );
    g.passAll();
    expect(g.state.seats[0]?.hand.length ?? -1).toBe(after - 1);
    expect(after).toBe(3 - 1 + 1);
  });

  test('her own death alone is not enough (the word is "other")', () => {
    const g = game();
    g.act(0).cast({ name: 'Murder', nth: 0 }, { targets: [{ name: GRAHA.name }], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length ?? -1).toBe(3 - 1);
  });
});

const ESPER = real('Retrieve the Esper');

describe('Retrieve the Esper (create a 3/3 Robot Warrior; then if this spell was cast from a graveyard, put two +1/+1 counters on that token; Flashback)', () => {
  const game = (zone: 'hand' | 'graveyard') => {
    const b = on(ESPER).seat(0).battlefield('Island', { count: 7 });
    if (zone === 'hand') b.hand(ESPER.name);
    else b.graveyard(ESPER.name);
    return b.at('precombatMain', { active: 0, turn: 1 }).build();
  };

  test('cast from the hand: a 3/3 token and no counters', () => {
    const g = game('hand');
    g.act(0).cast(ESPER.name, { pay: true });
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.isToken)).toMatchObject({
      name: 'Robot Warrior',
      power: 3,
      toughness: 3,
    });
  });

  test('cast from the graveyard with Flashback (CR 601.2a): the token has two +1/+1 counters, a 5/5', () => {
    const g = game('graveyard');
    g.act(0).cast(ESPER.name, { alternative: 'flashback', pay: true });
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.isToken)).toMatchObject({
      power: 5,
      toughness: 5,
    });
    g.expect.zone(ESPER.name, 'exile', { seat: 0 });
  });
});

const CELL = real('Solitary Cell');
const PAGE = real('Page, Loose Leaf');

describe('Solitary Cell ({1}, {T}, Discard a legendary card: Draw a card; when it enters, exile target nonland permanent an opponent controls with mana value 3 or less until it leaves the battlefield)', () => {
  const game = (hand: string[]) =>
    on(CELL, GAU)
      .seat(0)
      .battlefield(CELL.name)
      .battlefield('Plains')
      .hand(...hand)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('discarding a legendary card draws a card (CR 701.9, 118.8)', () => {
    const g = game([GAU.name, BEARS]);
    g.act(0).activate(CELL.name);
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(GAU.name, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(2);
  });

  test('only a legendary card can be discarded: with none in hand the ability is not offered', () => {
    const g = game([BEARS, BEARS]);
    expect(g.act(0).try.activate(CELL.name).ok).toBe(false);
  });

  test('its enters ability exiles a cheap nonland permanent of an opponent until it leaves (CR 610.3)', () => {
    const g = on(CELL)
      .seat(0)
      .hand(CELL.name)
      .battlefield('Mountain')
      .battlefield('Plains')
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(CELL.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
  });
});

describe('Page, Loose Leaf (Grandeur: discard another card named Page, Loose Leaf: reveal until an instant or sorcery card, put it into your hand and the rest on the bottom in a random order)', () => {
  const game = () =>
    on(PAGE)
      .seat(0)
      .battlefield(PAGE.name)
      .hand(PAGE.name, BEARS)
      .library('Island', 'Island', 'Lightning Bolt', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('discarding the second Page finds the first instant or sorcery card: it goes to the hand, the rest to the bottom (CR 701.20, 401.4)', () => {
    const g = game();
    g.act(0).activate({ name: PAGE.name, zone: 'battlefield' }, { ability: 1 });
    g.passAll();
    g.expect.zone('Lightning Bolt', 'hand', { seat: 0 });
    // The Bolt left the library (30 filler cards and 5 placed, one of them found); the two Islands revealed before it went to the bottom.
    expect(g.state.seats[0]?.library).toHaveLength(34);
  });

  test('only a card with the same name can be discarded: with another card in hand it is not offered', () => {
    const g = on(PAGE)
      .seat(0)
      .battlefield(PAGE.name)
      .hand(BEARS)
      .library('Lightning Bolt')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    expect(g.act(0).try.activate(PAGE.name, { ability: 1 }).ok).toBe(false);
  });
});

const END = real('Magnificent End');

describe('Magnificent End (this spell costs {3} less to cast if it targets a tapped creature; it deals 5 damage to target creature)', () => {
  const game = (tapped: boolean) =>
    on(END)
      .seat(0)
      .hand(END.name)
      .battlefield('Plains', { count: 2 })
      .seat(1)
      .battlefield(BEARS, { tapped })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('against a tapped creature it costs {1}{W}: two lands are enough (CR 601.2f)', () => {
    const g = game(true);
    g.act(0).cast(END.name, { targets: [{ name: BEARS }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('against an untapped creature it costs the full {4}{W}: the cast starts (the target is not known yet) and two lands cannot pay it', () => {
    const g = game(false);
    g.act(0).cast(END.name, { targets: [{ name: BEARS }] });
    expect(() => g.act(0).payAuto()).toThrow();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });
});

const GRASP = real("Enchanted River's Grasp");

describe("Enchanted River's Grasp (when it enters, tap enchanted creature and remove all counters from it; enchanted creature loses all abilities and doesn't untap during its controller's untap step)", () => {
  const game = () =>
    on(GRASP)
      .seat(0)
      .hand(GRASP.name)
      .battlefield('Island', { count: 3 })
      .seat(1)
      .battlefield(ANGEL, { counters: { '+1/+1': 2, stun: 1 } })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the creature is tapped, every counter is gone (CR 122.1) and it has no abilities (CR 613.1f)', () => {
    const g = game();
    g.act(0).cast(GRASP.name, { targets: [{ name: ANGEL }], pay: true });
    g.passAll();
    g.passAll();
    g.expect.tapped(ANGEL, true);
    g.expect.counters(ANGEL, {});
    const angel = getView(g.state, 0).battlefield.find((o) => o.name === ANGEL);
    expect(angel).toMatchObject({ power: 4, toughness: 4 });
    expect(angel?.keywords).toEqual([]);
  });

  test("it doesn't untap during its controller's untap step (CR 502.3)", () => {
    const g = game();
    g.act(0).cast(GRASP.name, { targets: [{ name: ANGEL }], pay: true });
    g.passAll();
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(ANGEL, true);
  });
});

const RESCUE = real("Eagle's Rescue");

describe("Eagle's Rescue ({2}{W/U}{W/U}: return this card from your graveyard to the battlefield attached to target creature you control with power 1 or less; activate only as a sorcery)", () => {
  const game = (step: 'precombatMain' | 'beginningOfCombat' = 'precombatMain') =>
    on(RESCUE)
      .seat(0)
      .graveyard(RESCUE.name)
      .battlefield('Plains', { count: 4 })
      .battlefield('Llanowar Elves')
      .battlefield(BEARS)
      .at(step, { active: 0, turn: 1 })
      .build();
  const ability = RESCUE.faces[0]?.abilities.findIndex((a) => a.kind === 'activated') ?? -1;

  test('it returns attached to the creature with power 1 or less, which gets +2/+2 and flying (CR 303.4g)', () => {
    const g = game();
    g.act(0).activate(RESCUE.name, { ability });
    g.act(0).chooseTargets({ name: 'Llanowar Elves' });
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(RESCUE.name, 'battlefield', { seat: 0 });
    const elves = getView(g.state, 0).battlefield.find((o) => o.name === 'Llanowar Elves');
    expect(elves).toMatchObject({ power: 3, toughness: 3 });
    expect(elves?.keywords).toContain('flying');
    expect(getView(g.state, 0).battlefield.find((o) => o.name === RESCUE.name)?.attachedTo).toBe(
      elves?.id,
    );
  });

  test('only as a sorcery (CR 602.5d): not in the beginning of combat', () => {
    const g = game('beginningOfCombat');
    expect(g.act(0).try.activate(RESCUE.name, { ability }).ok).toBe(false);
  });
});

const CONSIGN = real('Consign to Memory');

describe('Consign to Memory (Replicate {1}; counter target triggered ability or colorless spell)', () => {
  const game = () =>
    on(CONSIGN, GAU)
      .seat(0)
      .hand(CONSIGN.name)
      .battlefield('Island', { count: 2 })
      .seat(1)
      .hand('Sol Ring', 'Lightning Bolt')
      .battlefield(GAU.name)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test('a colorless spell (an artifact) can be countered (CR 701.6)', () => {
    const g = game();
    g.act(1).cast('Sol Ring', { pay: true });
    g.act(1).pass();
    g.act(0).cast(CONSIGN.name, { targets: [{ name: 'Sol Ring' }], replicas: 0, pay: true });
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
  });

  test('a colored spell is not a legal target', () => {
    const g = game();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    const handle = g.act(0).try.cast(CONSIGN.name);
    expect(handle.ok).toBe(false);
  });

  test('a triggered ability can be countered: it ceases to exist (CR 701.6, 113.7a)', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(1).attack(GAU.name);
    g.act(1).pass();
    const trigger = g.state.stack[g.state.stack.length - 1] as string;
    g.act(0).cast(CONSIGN.name, {
      targets: [trigger],
      replicas: 0,
      pay: true,
    });
    g.passAll();
    // Without the countered Rage trigger there is no +1/+1 counter.
    expect(getView(g.state, 1).battlefield.find((o) => o.name === GAU.name)).toMatchObject({
      power: 2,
      toughness: 2,
    });
  });
});

const SPIDER = real("Old Fat Spider Can't See Me");

describe("Old Fat Spider Can't See Me (I: target creature you control gains hexproof for as long as ~ remains on the battlefield; II: prevent all damage that would be dealt by up to one target creature for as long as ~ remains on the battlefield; III, IV: draw a card)", () => {
  const game = () =>
    on(SPIDER)
      .seat(0)
      .hand(SPIDER.name)
      .battlefield('Island', { count: 3 })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(ANGEL)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const keywordsOf = (g: ReturnType<typeof game>, name: string) =>
    getView(g.state, 0).battlefield.find((o) => o.name === name)?.keywords ?? [];

  test('chapter I: the creature has hexproof while the Saga is on the battlefield, and not after it is sacrificed (CR 611.2b, 714.4)', () => {
    const g = game();
    g.act(0).cast(SPIDER.name, { pay: true });
    g.passAll();
    g.passAll();
    expect(keywordsOf(g, BEARS)).toContain('hexproof');
    // Chapter II on the next turn of seat 0, III, IV (after IV the Saga is sacrificed).
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.passAll();
    g.act(0).chooseTargets({ name: ANGEL });
    g.passAll();
    expect(keywordsOf(g, BEARS)).toContain('hexproof');
    for (let i = 0; i < 4; i += 1) {
      g.advanceTo('precombatMain', { turn: 'next' });
      g.passAll();
    }
    g.expect.zone(SPIDER.name, 'graveyard', { seat: 0 });
    expect(keywordsOf(g, BEARS)).not.toContain('hexproof');
  });

  test('chapter II: the damage that creature would deal is prevented while the Saga remains (CR 615, 611.2b)', () => {
    const g = game();
    g.act(0).cast(SPIDER.name, { pay: true });
    g.passAll();
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.passAll();
    g.act(0).chooseTargets({ name: ANGEL });
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next' });
    g.act(1).attack(ANGEL);
    g.advanceTo('endOfCombat');
    g.expect.life(0, 40);
  });
});

const CONVERTER = real('Currency Converter');

describe('Currency Converter (whenever you discard a card, you may exile that card from your graveyard; {T}: put a card exiled with it into its owner’s graveyard, a land: a Treasure, a nonland: a 2/2 black Rogue)', () => {
  const abilityOf = (kind: 'activated', n: number) =>
    CONVERTER.faces[0]?.abilities
      .map((a, i) => [a, i] as const)
      .filter(([a]) => a.kind === kind)
      .map(([, i]) => i)[n] ?? -1;
  const game = (hand: string[]) =>
    on(CONVERTER)
      .seat(0)
      .battlefield(CONVERTER.name)
      .battlefield('Island', { count: 2 })
      .hand(...hand)
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  const loot = (g: ReturnType<typeof game>, discarded: string) => {
    g.act(0).activate(CONVERTER.name, { ability: abilityOf('activated', 0) });
    g.act(0).payAuto();
    g.passAll();
    g.act(0).chooseCards(discarded);
  };

  test('the discarded card may be exiled from the graveyard (CR 701.9a, 400.7)', () => {
    const g = game(['Forest']);
    loot(g, 'Forest');
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
  });

  test('declining leaves it in the graveyard', () => {
    const g = game(['Forest']);
    loot(g, 'Forest');
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
  });

  test('{T}: a land card put into its owner’s graveyard makes a Treasure (CR 607.2a)', () => {
    const g = game(['Forest']);
    loot(g, 'Forest');
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(CONVERTER.name, { ability: abilityOf('activated', 1) });
    g.passAll();
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    expect(getView(g.state, 0).battlefield.some((o) => o.name === 'Treasure')).toBe(true);
  });

  test('{T}: a nonland card makes a 2/2 black Rogue creature token', () => {
    const g = game([BEARS]);
    loot(g, BEARS);
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(CONVERTER.name, { ability: abilityOf('activated', 1) });
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === 'Rogue')).toMatchObject({
      power: 2,
      toughness: 2,
      colors: ['B'],
    });
  });
});

const SNARL = real('Furycalm Snarl');
const SANCTUM = real("Theorist's Sanctum");
const JACE = real('Jace Beleren');

describe('Furycalm Snarl (as it enters, you may reveal a Mountain or Plains card from your hand; if you don’t, it enters tapped)', () => {
  const game = (hand: string[]) =>
    on(SNARL)
      .seat(0)
      .hand(SNARL.name, ...hand)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('revealing a Mountain: the land enters untapped and the card is revealed (CR 701.20a)', () => {
    const g = game(['Mountain']);
    g.act(0).playLand(SNARL.name);
    g.act(0).accept();
    g.expect.tapped(SNARL.name, false);
    g.expect.zone('Mountain', 'hand', { seat: 0 });
  });

  test('declining: it enters tapped', () => {
    const g = game(['Plains']);
    g.act(0).playLand(SNARL.name);
    g.act(0).decline();
    g.expect.tapped(SNARL.name, true);
  });

  test('with no Mountain or Plains card in hand nothing is asked and it enters tapped', () => {
    const g = game(['Island']);
    g.act(0).playLand(SNARL.name);
    g.expect.tapped(SNARL.name, true);
  });
});

describe("Theorist's Sanctum (as it enters, you may behold a Jace; if you don’t, it enters tapped)", () => {
  test('a Jace card in hand is revealed: untapped (CR 701.4a)', () => {
    const g = on(SANCTUM, JACE)
      .seat(0)
      .hand(SANCTUM.name, JACE.name)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).playLand(SANCTUM.name);
    g.act(0).accept();
    g.expect.tapped(SANCTUM.name, false);
  });

  test('a Jace on the battlefield is chosen, not revealed: untapped', () => {
    const g = on(SANCTUM, JACE)
      .seat(0)
      .hand(SANCTUM.name)
      .battlefield(JACE.name)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).playLand(SANCTUM.name);
    g.act(0).accept();
    g.expect.tapped(SANCTUM.name, false);
  });

  test('no Jace at all: it enters tapped without a question', () => {
    const g = on(SANCTUM)
      .seat(0)
      .hand(SANCTUM.name)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).playLand(SANCTUM.name);
    g.expect.tapped(SANCTUM.name, true);
  });
});

const MILLIKIN = real('Millikin');

describe('Millikin ({T}, Mill a card: Add {C})', () => {
  const game = (library: string[]) =>
    on(MILLIKIN)
      .seat(0)
      .battlefield(MILLIKIN.name)
      .library(...library)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('tapping it mills the top card and adds {C} (CR 701.17a, 605.3)', () => {
    const g = game([]);
    g.act(0).tapForMana(MILLIKIN.name);
    expect(g.state.seats[0]?.graveyard).toHaveLength(1);
    expect(g.state.seats[0]?.library).toHaveLength(29);
    expect(g.state.seats[0]?.manaPool).toHaveLength(1);
  });

  test('with an empty library the cost cannot be paid (CR 701.17b)', () => {
    const b = scenario()
      .seat(0)
      .define(MILLIKIN)
      .battlefield(MILLIKIN.name)
      .seat(1)
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    expect(g.act(0).try.tapForMana(MILLIKIN.name).ok).toBe(false);
  });
});

const PATH = real('Path of Ancestry');

describe('Path of Ancestry (mana of the commander identity; scry 1 when it casts a creature that shares a type with the commander)', () => {
  const KNIGHT = 'Youthful Knight';
  const ACE = 'Fencing Ace';
  const game = (spell: string, commander = KNIGHT) =>
    scenario()
      .define(PATH)
      .seat(0)
      .commander(commander)
      .hand(spell)
      .battlefield(PATH.name, { tapped: false })
      .battlefield('Plains')
      .library('Forest', 'Island', 'Swamp')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as a mana ability whose rider is a scry for the spells that share a creature type (CR 106.6)', () => {
    const ability = PATH.faces[0]?.abilities.find((a) => a.kind === 'mana');
    expect(ability).toMatchObject({
      kind: 'mana',
      spentRider: {
        spells: { types: ['creature'], sharesTypeWithCommander: true },
        grants: { scry: 1 },
      },
    });
  });

  test('spent on a creature that shares a creature type with the commander: its controller scries 1 (CR 603.2, 701.22a)', () => {
    const g = game(ACE);
    g.act(0).cast(ACE, { pay: true });
    g.passAll();
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: [], other: ['Forest'] });
    expect(g.state.seats[0]?.library).toHaveLength(3);
    g.expect.invariants();
  });

  // D-225 (CR 903.3, 205.3m, 613.1d): "your commander" on the battlefield has the creature types it has now, not the ones printed on its card.
  describe('a commander on the battlefield has the types it has now', () => {
    const FROG = parsed('SYNTHETIC Frog Scout', 'Creature \u2014 Frog', '', {
      manaCost: '{W}',
      power: '1',
      toughness: '1',
    });
    const onTheBattlefield = (spell: CardDefinition) =>
      scenario()
        .define(PATH)
        .define(FROG)
        .seat(0)
        .hand('SYNTHETIC Frog Hex', spell.name)
        .battlefield(KNIGHT, { commander: true })
        .battlefield(PATH.name, { tapped: false })
        .battlefield('Island', { count: 2 })
        .library('Forest', 'Island', 'Swamp')
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active: 0, turn: 1 })
        .build();

    test('a commander that became a Frog shares its type with a Frog and no longer with a Knight', () => {
      const g = onTheBattlefield(FROG);
      g.act(0)
        .cast('SYNTHETIC Frog Hex', { targets: [KNIGHT] })
        .payManual([
          { name: 'Island', nth: 0 },
          { name: 'Island', nth: 1 },
        ]);
      g.passAll();
      g.act(0).cast(FROG.name, { pay: true });
      g.passAll();
      g.expect.pending('arrangeCards', 0);
      g.expect.invariants();
    });

    test('the printed types no longer count: a Knight spell gets no scry while the commander is a Frog', () => {
      const knight = parsed('SYNTHETIC Knight Scout', 'Creature \u2014 Knight', '', {
        manaCost: '{W}',
        power: '1',
        toughness: '1',
      });
      const g = scenario()
        .define(PATH)
        .define(knight)
        .seat(0)
        .hand('SYNTHETIC Frog Hex', knight.name)
        .battlefield(KNIGHT, { commander: true })
        .battlefield(PATH.name, { tapped: false })
        .battlefield('Island', { count: 2 })
        .library('Forest', 'Island', 'Swamp')
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active: 0, turn: 1 })
        .build();
      g.act(0)
        .cast('SYNTHETIC Frog Hex', { targets: [KNIGHT] })
        .payManual([
          { name: 'Island', nth: 0 },
          { name: 'Island', nth: 1 },
        ]);
      g.passAll();
      g.act(0).cast(knight.name, { pay: true });
      g.passAll();
      g.expect.pending('priority', 0);
    });
  });

  test('spent on a creature that shares no type with the commander: nothing happens', () => {
    // The commander is a Bear: Fencing Ace (a Human Soldier) shares no creature type, and the mana of the Path is green.
    const g = game(ACE, BEARS);
    g.act(0).cast(ACE, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(getView(g.state, 0).battlefield.map((o) => o.name)).toContain(ACE);
  });
});

const FORGE = real('Forge of Heroes');

describe('Forge of Heroes (a +1/+1 counter on a commander that entered this turn if it is a creature, a loyalty counter if it is a planeswalker)', () => {
  const WALKER = 'SYNTHETIC Loyalty Walker';
  const game = (commander: string, lands: string[]) =>
    scenario()
      .define(FORGE)
      .seat(0)
      .commander(commander)
      .battlefield(FORGE.name)
      .battlefield(...lands)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as one activated ability with a target commander that entered this turn and two tests (CR 400.7, 608.2c)', () => {
    const ability = FORGE.faces[0]?.abilities.filter((a) => a.kind === 'activated')[0];
    expect(ability).toMatchObject({
      kind: 'activated',
      targets: [{ what: { kind: 'object', filter: { commander: true, enteredThisTurn: true } } }],
    });
  });

  test('a creature commander cast this turn gets a +1/+1 counter and no loyalty counter (CR 122.1)', () => {
    const g = game(BEARS, ['Forest', 'Forest']);
    // The mana comes from the lands, so the Forge is left to tap for its own ability.
    g.act(0).tapForMana({ name: 'Forest', nth: 0 }).tapForMana({ name: 'Forest', nth: 1 });
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).activate(FORGE.name, { targets: [BEARS] });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 1 });
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEARS)).toMatchObject({
      power: 3,
      toughness: 3,
    });
    g.expect.invariants();
  });

  test('a planeswalker commander cast this turn gets a loyalty counter and no +1/+1 counter', () => {
    const g = game(WALKER, ['Island', 'Island', 'Island']);
    g.act(0)
      .tapForMana({ name: 'Island', nth: 0 })
      .tapForMana({ name: 'Island', nth: 1 })
      .tapForMana({ name: 'Island', nth: 2 });
    g.act(0).cast(WALKER, { pay: true });
    g.passAll();
    g.act(0).activate(FORGE.name, { targets: [WALKER] });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 5 });
    g.expect.invariants();
  });

  test('a commander that entered on an earlier turn is not a target (CR 400.7)', () => {
    const g = scenario()
      .define(FORGE)
      .seat(0)
      .battlefield(FORGE.name)
      .battlefield(BEARS, { commander: true })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    // No permanent is a legal target, so the ability cannot be activated at all (CR 602.2b, 115.1).
    expect(g.act(0).try.activate(FORGE.name).ok).toBe(false);
  });

  test('a permanent that entered this turn but is no commander is not a target', () => {
    const g = scenario()
      .define(FORGE)
      .seat(0)
      .commander(ANGEL)
      .hand(BEARS)
      .battlefield(FORGE.name)
      .battlefield('Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).tapForMana({ name: 'Forest', nth: 0 }).tapForMana({ name: 'Forest', nth: 1 });
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    // No permanent is a legal target, so the ability cannot be activated at all (CR 602.2b, 115.1).
    expect(g.act(0).try.activate(FORGE.name).ok).toBe(false);
  });
});

// Used by the next groups.
export { BEARS, FILLER, on, real };
