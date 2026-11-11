// Parsed text is only worth something if the engine runs it as written (stage P48). These tests import the REAL cards of the Vraska deck of the owner's golden
// corpus (real Oracle text, `fixtures/corpus/golden.jsonl`) through the grammar only, define them in an engine scenario and play them through applyAction:
// Loyal Apprentice, Dwarven Shortsword, Roll-Roll-Roll-Roll, Refute Destiny, Mind Transfer Protocol, Homesickness, Flaring Cinder and Mirkwood Meditator
// (ENGINE_VERSION 49, PARSER_VERSION 53, D-204, D-205). Real data, so the names are the cards' own. No ruling of any card could be read (Scryfall is not
// reachable from the sandbox): nothing below rests on one. The flavor word of CR 207.2d is played on a SYNTHETIC card with the real label shape.
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

const APPRENTICE = real('Loyal Apprentice');
const SHORTSWORD = real('Dwarven Shortsword');
const ROLL = real('Roll-Roll-Roll-Roll');
const REFUTE = real('Refute Destiny');
const TRANSFER = real('Mind Transfer Protocol');
const HOMESICKNESS = real('Homesickness');
const CINDER = real('Flaring Cinder');
const MEDITATOR = real('Mirkwood Meditator');

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const SPIDER = 'Giant Spider';
const SHOCK = 'SYNTHETIC Shock Land';

const on = (...defs: CardDefinition[]) => {
  const b = scenario().seat(0);
  for (const d of defs) b.define(d);
  return b
    .library(...FILLER)
    .seat(1)
    .library(...FILLER);
};

describe('Loyal Apprentice (Lieutenant: At the beginning of combat on your turn, if you control your commander, create a 1/1 Thopter token with flying. That token gains haste until end of turn.)', () => {
  test('with the commander on the battlefield: a Thopter token with flying and haste, for the turn only', () => {
    const g = on(APPRENTICE)
      .seat(0)
      .battlefield(APPRENTICE.name)
      .battlefield(BEARS, { commander: true })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    const thopter = getView(g.state, 0).battlefield.find((o) => o.isToken);
    expect(thopter).toMatchObject({ name: 'Thopter', power: 1, toughness: 1, colors: [] });
    expect(thopter?.types).toEqual(['artifact', 'creature']);
    expect(thopter?.keywords).toEqual(expect.arrayContaining(['flying', 'haste']));
    g.advanceTo('end');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    const later = getView(g.state, 0).battlefield.find((o) => o.isToken);
    expect(later?.keywords).toEqual(['flying']);
  });

  test('without the commander on the battlefield (CR 603.4: the intervening "if") nothing happens', () => {
    const g = on(APPRENTICE)
      .seat(0)
      .battlefield(APPRENTICE.name)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(getView(g.state, 0).battlefield.some((o) => o.isToken)).toBe(false);
  });

  test('only the token it made gets haste, not the creatures that were there', () => {
    const g = on(APPRENTICE)
      .seat(0)
      .battlefield(APPRENTICE.name)
      .battlefield(BEARS, { commander: true, fresh: true })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    const bears = getView(g.state, 0).battlefield.find((o) => o.name === BEARS);
    expect(bears?.keywords).not.toContain('haste');
  });
});

describe('Dwarven Shortsword (When this Equipment enters, create a 2/2 red Dwarf creature token, then attach this Equipment to it. Equipped creature gets +1/+2.)', () => {
  test('a 2/2 red Dwarf token that carries the Equipment, so it is a 3/4', () => {
    const g = on(SHORTSWORD)
      .seat(0)
      .hand(SHORTSWORD.name)
      .battlefield('Plains', { count: 4 })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(SHORTSWORD.name, { pay: true });
    g.passAll();
    const dwarf = getView(g.state, 0).battlefield.find((o) => o.isToken);
    expect(dwarf).toMatchObject({ name: 'Dwarf', colors: ['R'], power: 3, toughness: 4 });
    expect(
      getView(g.state, 0).battlefield.find((o) => o.name === SHORTSWORD.name)?.attachedTo,
    ).toBe(dwarf?.id);
  });
});

describe("Roll-Roll-Roll-Roll (I, II, III, IV: Exile up to one target creature or land you control. If you do, return it to the battlefield under its owner's control at the beginning of the next end step.)", () => {
  const rolling = (...more: string[]) =>
    on(ROLL, ...[])
      .seat(0)
      .hand(ROLL.name)
      .battlefield('Island', { count: 3 })
      .battlefield(BEARS)
      .battlefield(...(more as [string]))
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('chapter I exiles the creature, which returns in the end step of the same turn', () => {
    const g = rolling();
    g.act(0).cast(ROLL.name, { pay: true });
    g.pass();
    g.pass();
    // The Saga enters with its first lore counter; chapter I triggers and asks for its target.
    g.act(0).chooseTargets({ name: BEARS });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, false);
  });

  test('chapter I with no target does nothing', () => {
    const g = rolling();
    g.act(0).cast(ROLL.name, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.state.delayedTriggers).toEqual([]);
  });

  test('a shock land that returns asks to pay 2 life, as any land that enters does (CR 614.12)', () => {
    const g = on(ROLL)
      .seat(0)
      .hand(ROLL.name)
      .battlefield('Island', { count: 3 })
      .battlefield(SHOCK)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(ROLL.name, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ name: SHOCK });
    g.passAll();
    g.expect.zone(SHOCK, 'exile', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.act(0).decline();
    g.expect.zone(SHOCK, 'battlefield', { seat: 0 });
    g.expect.tapped(SHOCK, true);
  });
});

describe("Refute Destiny (Exile target creature or planeswalker that's green or blue. Surveil 1.)", () => {
  const BLUE_BEAR = parsed('SYNTHETIC Blue Bear', 'Creature — Merfolk', '', {
    power: '2',
    toughness: '2',
    manaCost: '{1}{U}',
    colors: ['U'],
  });
  const GARRUK = real('Garruk Wildspeaker');
  const ELSPETH = real("Elspeth, Sun's Champion");
  const refute = () =>
    on(REFUTE, BLUE_BEAR, GARRUK, ELSPETH)
      .seat(0)
      .hand(REFUTE.name)
      .battlefield('Plains', { count: 2 })
      .seat(1)
      .battlefield(SPIDER, ANGEL, BLUE_BEAR.name, GARRUK.name, ELSPETH.name)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test.each([
    [SPIDER, 'a green creature'],
    [BLUE_BEAR.name, 'a blue creature'],
    [GARRUK.name, 'a green planeswalker'],
  ])('%s (%s) is exiled', (name) => {
    const g = refute();
    g.act(0).cast(REFUTE.name, { targets: [{ name }], pay: true });
    g.passAll();
    g.expect.zone(name, 'exile', { seat: 1 });
  });

  test.each([
    [ANGEL, 'a white creature'],
    [ELSPETH.name, 'a white planeswalker'],
  ])('%s (%s) is not a legal target', (name) => {
    const g = refute();
    expect(() => g.act(0).cast(REFUTE.name, { targets: [{ name }], pay: true })).toThrow();
    g.expect.zone(name, 'battlefield', { seat: 1 });
  });
});

describe('Mind Transfer Protocol (Until end of turn, target artifact or creature becomes an artifact creature with base power and toughness 4/5. Draw a card.)', () => {
  test('a creature becomes an artifact creature 4/5 until the end of the turn; a card is drawn', () => {
    const g = on(TRANSFER)
      .seat(0)
      .hand(TRANSFER.name)
      .battlefield('Island', { count: 3 })
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(TRANSFER.name, { targets: [{ name: BEARS }], pay: true });
    g.passAll();
    const bears = getView(g.state, 0).battlefield.find((o) => o.name === BEARS);
    expect(bears?.types).toEqual(expect.arrayContaining(['artifact', 'creature']));
    expect(bears?.power).toBe(4);
    expect(bears?.toughness).toBe(5);
    g.expect.handSize(0, 1);
    g.advanceTo('upkeep', { turn: 'next' });
    const after = getView(g.state, 0).battlefield.find((o) => o.name === BEARS);
    expect(after?.types).toEqual(['creature']);
    expect(after?.power).toBe(2);
  });

  test('an artifact that is no creature becomes one and keeps being an artifact (CR 205.1b)', () => {
    const g = on(TRANSFER)
      .seat(0)
      .hand(TRANSFER.name)
      .battlefield('Island', { count: 3 })
      .battlefield('Sol Ring')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(TRANSFER.name, { targets: [{ name: 'Sol Ring' }], pay: true });
    g.passAll();
    const ring = getView(g.state, 0).battlefield.find((o) => o.name === 'Sol Ring');
    expect(ring?.types).toEqual(['artifact', 'creature']);
    expect([ring?.power, ring?.toughness]).toEqual([4, 5]);
  });
});

describe('Homesickness (Target player draws two cards. Tap up to two target creatures. Put a stun counter on each of them.)', () => {
  test('the player draws two, the two creatures are tapped and have a stun counter; the untap step removes it instead of untapping (CR 122.1d)', () => {
    const g = on(HOMESICKNESS)
      .seat(0)
      .hand(HOMESICKNESS.name)
      .battlefield('Island', { count: 6 })
      .seat(1)
      .battlefield(BEARS, SPIDER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(HOMESICKNESS.name, {
      targets: [{ player: 0 }, { name: BEARS }, { name: SPIDER }],
      pay: true,
    });
    g.passAll();
    g.expect.handSize(0, 2);
    for (const name of [BEARS, SPIDER]) {
      g.expect.tapped(name, true);
      g.expect.counters(name, { stun: 1 });
    }
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(BEARS, true);
    g.expect.counters(BEARS, {});
  });

  test('with one target only that one is tapped and stunned; with none nobody', () => {
    const one = on(HOMESICKNESS)
      .seat(0)
      .hand(HOMESICKNESS.name)
      .battlefield('Island', { count: 6 })
      .seat(1)
      .battlefield(BEARS, SPIDER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    one.act(0).cast(HOMESICKNESS.name, { targets: [{ player: 0 }, { name: BEARS }], pay: true });
    one.passAll();
    one.expect.counters(BEARS, { stun: 1 });
    one.expect.counters(SPIDER, {});
    one.expect.tapped(SPIDER, false);
  });
});

describe('Flaring Cinder (When this creature enters and whenever you cast a spell with mana value 4 or greater, you may discard a card. If you do, draw a card.)', () => {
  test('entering: a may discard, and if the card is discarded one is drawn', () => {
    const g = on(CINDER)
      .seat(0)
      .hand(CINDER.name, BEARS, 'Llanowar Elves')
      .battlefield('Island', { count: 3 })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(CINDER.name, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
  });

  test('entering and declining: nothing is discarded and nothing is drawn', () => {
    const g = on(CINDER)
      .seat(0)
      .hand(CINDER.name, BEARS)
      .battlefield('Island', { count: 3 })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(CINDER.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.handSize(0, 1);
  });

  test('casting a spell with mana value 4 or more triggers it, and the second ability does the same thing', () => {
    const g = on(CINDER)
      .seat(0)
      .battlefield(CINDER.name)
      .hand(ANGEL, BEARS, 'Llanowar Elves')
      .battlefield('Plains', { count: 5 })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(ANGEL, { pay: true });
    g.expect.stack([`${CINDER.name} (ability)`, ANGEL]);
    g.pass();
    g.pass();
    g.act(0).accept();
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
  });

  test('a spell of mana value 3 does not trigger it', () => {
    const g = on(CINDER)
      .seat(0)
      .battlefield(CINDER.name)
      .hand(BEARS)
      .battlefield('Forest', { count: 3 })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
  });
});

describe("Mirkwood Meditator (Landfall: you may have this creature's base power and toughness become 4/2 until end of turn.)", () => {
  test('a land you control entering: the choice, then a 4/2 until the end of the turn', () => {
    const g = on(MEDITATOR)
      .seat(0)
      .battlefield(MEDITATOR.name)
      .hand('Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.expect.pt(MEDITATOR.name, 2, 4);
    g.act(0).playLand('Island');
    g.passAll();
    g.act(0).accept();
    g.expect.pt(MEDITATOR.name, 4, 2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(MEDITATOR.name, 2, 4);
  });

  test('declining leaves it a 2/4', () => {
    const g = on(MEDITATOR)
      .seat(0)
      .battlefield(MEDITATOR.name)
      .hand('Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).playLand('Island');
    g.passAll();
    g.act(0).decline();
    g.expect.pt(MEDITATOR.name, 2, 4);
  });
});

describe('a flavor word (CR 207.2d) on a line that reads only without it', () => {
  test('"Rage — Whenever ~ attacks, put a +1/+1 counter on it." plays as the line without the label', () => {
    const rager = parsed(
      'SYNTHETIC Rager',
      'Creature — Berserker',
      'Rage — Whenever ~ attacks, put a +1/+1 counter on it.',
      { power: '2', toughness: '2', manaCost: '{1}{R}', colors: ['R'] },
    );
    const g = on(rager)
      .seat(0)
      .battlefield(rager.name)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: rager.name, target: { player: 1 } }]);
    g.passAll();
    g.expect.counters(rager.name, { '+1/+1': 1 });
  });
});
