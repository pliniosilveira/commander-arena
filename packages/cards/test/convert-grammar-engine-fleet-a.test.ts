// Federation Fleet deck, group A ("Seek out": whenever you draw your second card each turn): the REAL Oracle text of Jean-Luc Picard, Luminary (its second ability), Reg Barclay,
// Fidgety Fantasist and Vic Fontaine, One Night Only (golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is
// played through applyAction. Pins: CR 121.1 (a draw, and the count of the cards a player has drawn this turn), CR 603.2 (the trigger), CR 115.1 and 601.2c / 603.3d (targets chosen as the
// ability is put on the stack, "up to" and "one or two"), CR 122.6 (counters), CR 707.9b (the exceptions of a copy), CR 205.4a (legendary), CR 611.2a (until end of turn), CR 603.7
// (the delayed exile). The rule numbers are the ones the repository's own comments already use for these mechanics; docs/rules was not read for this file.
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const PICARD = real('Jean-Luc Picard, Luminary');
const REG = real('Reg Barclay, Fidgety Fantasist');
const VIC = real('Vic Fontaine, One Night Only');

const BEARS = 'Grizzly Bears'; // 2/2 green
const SPIDER = 'Giant Spider'; // 2/4 green, reach
const DIVINATION = 'Divination'; // draw two cards
const OPT = 'SYNTHETIC One Card';
const ONE_CARD = parsed(OPT, 'Instant', 'Draw a card.', { manaCost: '{U}' });
const SHIP = parsed('SYNTHETIC Ship', 'Artifact — Spacecraft', '', { manaCost: '{1}' });
const LEGEND = parsed('SYNTHETIC Legend', 'Legendary Creature — Human', '', {
  manaCost: '{1}',
  power: '3',
  toughness: '2',
});
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

describe('the three cards read as supported and are valid', () => {
  test.each([PICARD, REG, VIC])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('the trigger counts the second card drawn this turn', () => {
    for (const card of [PICARD, REG, VIC]) {
      const trigger = card.faces[0]?.abilities.find(
        (a) => a.kind === 'triggered' && a.trigger.kind === 'drawn',
      );
      expect(trigger, card.name).toMatchObject({ trigger: { kind: 'drawn', who: 'you', nth: 2 } });
    }
  });
});

/** The game with the card in play, the spells to draw with in hand and some creatures to aim at. */
function start(card: string, extra: readonly string[] = [], spells: readonly string[] = []) {
  const b = scenario()
    .define(PICARD)
    .define(REG)
    .define(VIC)
    .define(ONE_CARD)
    .define(SHIP)
    .define(LEGEND)
    .seat(0)
    .life(20)
    .library(...LIBRARY)
    .hand(...spells)
    .battlefield(card)
    .battlefield('Island', 'Island', 'Island', 'Island')
    .battlefield(BEARS, { label: 'mine' });
  for (const name of extra) b.seat(0).battlefield(name);
  return b
    .seat(1)
    .life(20)
    .library(...LIBRARY)
    .battlefield(SPIDER, { label: 'theirs' })
    .at('precombatMain', { active: 0, priority: 0, turn: 3 })
    .build();
}

describe('Vic Fontaine, One Night Only', () => {
  test('the first draw of the turn does nothing', () => {
    const g = start(VIC.name, [], [OPT]);
    g.act(0).cast(OPT, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.stack([]);
    g.expect.pt('mine', 2, 2);
  });

  test('the second draw gives two chosen creatures +2/+0 and lifelink until end of turn (CR 121.1)', () => {
    const g = start(VIC.name, [], [DIVINATION]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets('mine', 'theirs');
    g.passAll();
    g.expect.pt('mine', 4, 2);
    g.expect.pt('theirs', 4, 4);
    g.expect.derived('mine', { keywords: ['lifelink'] });
    g.expect.derived('theirs', { keywords: ['lifelink', 'reach'] });
    g.advanceTo('cleanup');
    g.expect.pt('mine', 2, 2);
    g.expect.derived('mine', { keywords: [] });
    g.expect.invariants();
  });

  test('one target is enough (one or two)', () => {
    const g = start(VIC.name, [], [DIVINATION]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets('mine');
    g.passAll();
    g.expect.pt('mine', 4, 2);
    g.expect.pt('theirs', 2, 4);
  });

  test('a draw spell after a first draw also triggers on the second card of the turn', () => {
    const g = start(VIC.name, [], [OPT, OPT]);
    g.act(0).cast({ name: OPT, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.act(0).cast({ name: OPT, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets('mine');
    g.passAll();
    g.expect.pt('mine', 4, 2);
  });
});

describe('Jean-Luc Picard, Luminary: Seek out', () => {
  test('the second draw puts a +1/+1 counter on another creature and two charge counters on a Spacecraft', () => {
    const g = start(PICARD.name, [SHIP.name], [DIVINATION]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets('mine', SHIP.name);
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 1 });
    g.expect.counters(SHIP.name, { charge: 2 });
    g.expect.counters(PICARD.name, {});
    g.expect.invariants();
  });

  test('both targets are optional (up to one)', () => {
    const g = start(PICARD.name, [SHIP.name], [DIVINATION]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.counters('mine', {});
    g.expect.counters(SHIP.name, {});
  });

  test('the creature is another creature, so Picard cannot be its own target', () => {
    const g = start(PICARD.name, [], [DIVINATION]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.pass();
    g.pass();
    expect(() => g.act(0).chooseTargets(PICARD.name)).toThrow();
  });
});

describe('Reg Barclay, Fidgety Fantasist: Seek out', () => {
  test('the second draw makes a hasty, non-legendary Illusion artifact copy that is exiled at the end step (CR 707.9b)', () => {
    const g = start(REG.name, [LEGEND.name], [DIVINATION]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ name: LEGEND.name, nth: 0 });
    g.passAll();
    const copy = { name: LEGEND.name, nth: 1 };
    g.expect.pt(copy, 3, 2);
    g.expect.derived(copy, {
      supertypes: [],
      types: ['artifact', 'creature'],
      subtypes: ['Human', 'Illusion'],
      keywords: ['haste'],
    });
    g.expect.derived({ name: LEGEND.name, nth: 0 }, { supertypes: ['legendary'] });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(LEGEND.name, 'battlefield', { count: 1 });
    g.expect.invariants();
  });

  test('Reg cannot copy itself (another)', () => {
    const g = start(REG.name, [], [DIVINATION]);
    g.act(0).cast(DIVINATION, { pay: true });
    g.pass();
    g.pass();
    expect(() => g.act(0).chooseTargets(REG.name)).toThrow();
  });
});
