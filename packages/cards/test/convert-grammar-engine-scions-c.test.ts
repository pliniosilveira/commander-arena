// Scions & Spellcraft: Final Fantasy Commander, group C: "whenever you cast a spell" triggers that read the spell cast (its mana value, its color) and the delayed form of them that lasts
// the turn. Each group imports SYNTHETIC cards through the grammar (never through a fixture), defines them in an engine scenario and plays them through applyAction. Every card name
// starts with "SYNTHETIC"; the wording of each text is that of the real card, taken from the card data of the golden corpus.
import { readFileSync } from 'node:fs';
import { applyAction } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

/** Whether seat 1 may declare `blocker` blocking `attacker`, by what the engine accepts (CR 509.1b). */
function canBlock(g: ScenarioGame, blocker: string, attacker: string): boolean {
  return applyAction(g.state, 1, {
    kind: 'declareBlockers',
    blocks: [{ blocker: g.id(blocker), attacker: g.id(attacker) }],
  }).ok;
}

const BOLT = 'Lightning Bolt';

const vanilla = (name: string, manaCost: string, power: string, toughness: string) =>
  parsed(name, 'Creature — Bear', '', { manaCost, colors: ['G'], power, toughness });

// ---- The real cards: each one imports as supported through the grammar alone.

describe('the cards of group C import as supported', () => {
  const cards = parseGolden(
    readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
  );
  const byName = new Map(cards.map((c) => [c.name.toLowerCase(), fromGoldenCard(c)] as const));
  const related = (name: string) => byName.get(name.toLowerCase());
  for (const name of [
    'Hraesvelgr of the First Brood',
    "G'raha Tia, Scion Reborn",
    'Krile Baldesion',
    'Ardbert, Warrior of Darkness',
    'Summon: Good King Mog XII',
  ]) {
    test(name, () => {
      const card = cards.find((c) => c.name === name);
      expect(card).toBeDefined();
      if (card === undefined) return;
      const imported = importCard(
        fromGoldenCard(card),
        undefined,
        NO_OVERRIDES,
        undefined,
        undefined,
        related,
      );
      expect(imported.support.unparsed).toEqual([]);
      expect(imported.support.status).toBe('supported');
    });
  }
});

// ---- Hraesvelgr of the First Brood: "When ~ enters and whenever you cast a noncreature spell, target creature gets +1/+0 until end of turn and can't be blocked this turn."
// (CR 509.1b, 611.2a, 613.4c, 514.2).

const HRAESVELGR = parsed(
  'SYNTHETIC Parsed Hraesvelgr',
  'Creature — Dragon',
  "Shiva's Aid — When ~ enters and whenever you cast a noncreature spell, target creature gets +1/+0 until end of turn and can't be blocked this turn.",
  { manaCost: '{4}{W}', colors: ['W'], power: '3', toughness: '3' },
);

describe('Hraesvelgr: +1/+0 and unblockable for the turn, on entering and on each noncreature spell', () => {
  const board = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(HRAESVELGR)
      .battlefield(HRAESVELGR.name, 'Mountain')
      .hand('Lightning Bolt')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('a noncreature spell gives the target creature +1/+0 and keeps it from being blocked', () => {
    const g = board();
    g.act(0).cast('Lightning Bolt', { targets: ['Grizzly Bears'], pay: true });
    g.act(0).chooseTargets(HRAESVELGR.name);
    g.passAll();
    g.expect.pt(HRAESVELGR.name, 4, 3);
    g.advanceTo('declareAttackers');
    g.act(0).attack([HRAESVELGR.name]);
    g.advanceTo('declareBlockers');
    expect(canBlock(g, 'Grizzly Bears', HRAESVELGR.name)).toBe(false);
    g.expect.invariants();
  });

  test('without a noncreature spell nothing happens', () => {
    const g = board();
    g.expect.pt(HRAESVELGR.name, 3, 3);
    g.advanceTo('declareAttackers');
    g.act(0).attack([HRAESVELGR.name]);
    g.advanceTo('declareBlockers');
    expect(canBlock(g, 'Grizzly Bears', HRAESVELGR.name)).toBe(true);
  });
});

// ---- G'raha Tia, Scion Reborn: "Whenever you cast a noncreature spell, you may pay X life, where X is that spell's mana value. If you do, create a 1/1 colorless Hero creature token and
// put X +1/+1 counters on it. Do this only once each turn." (CR 202.3, 603.3d, 603.2h, 119.4, 107.3c).

const GRAHA = parsed(
  'SYNTHETIC Parsed Graha',
  'Legendary Creature — Cat Archer',
  "Throw Wide the Gates — Whenever you cast a noncreature spell, you may pay X life, where X is that spell's mana value. If you do, create a 1/1 colorless Hero creature token and put X +1/+1 counters on it. Do this only once each turn.",
  { manaCost: '{3}{W}', colors: ['W'], power: '3', toughness: '3' },
);

describe("G'raha Tia: pay the spell's mana value in life for a Hero with that many counters", () => {
  const board = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(GRAHA)
      .battlefield(GRAHA.name, 'Mountain', 'Mountain', 'Swamp', 'Swamp', 'Swamp')
      .hand('Lightning Bolt', 'Murder')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears', 'Llanowar Elves')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const heroes = (g: ReturnType<typeof board>) =>
    g.state.battlefield.filter((id) => g.state.objects[id]?.token?.characteristics.name === 'Hero');

  test('Murder (mana value 3): pay 3 life, get a Hero with three counters (a 4/4)', () => {
    const g = board();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional', purpose: 'mayPay' });
    g.act(0).accept();
    g.passAll();
    g.expect.life(0, 17);
    const [hero] = heroes(g);
    expect(heroes(g)).toHaveLength(1);
    expect(hero === undefined ? null : g.state.objects[hero]?.counters['+1/+1']).toBe(3);
    g.expect.invariants();
  });

  test('declining pays nothing and makes no Hero', () => {
    const g = board();
    g.act(0).cast('Lightning Bolt', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.life(0, 20);
    expect(heroes(g)).toHaveLength(0);
  });

  test('once each turn: the second noncreature spell after the Hero was made asks nothing', () => {
    const g = board();
    g.act(0).cast('Lightning Bolt', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.life(0, 19);
    expect(heroes(g)).toHaveLength(1);
    g.act(0).cast('Murder', { targets: ['Llanowar Elves'], pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'priority' });
    g.expect.life(0, 19);
    expect(heroes(g)).toHaveLength(1);
  });
});

// ---- Krile Baldesion: "Whenever you cast a noncreature spell, you may return target creature card with mana value equal to that spell's mana value from your graveyard to your hand. Do
// this only once each turn." (CR 202.3, 603.3d, 603.2h: exactly the mana value, not at most it).

const KRILE = parsed(
  'SYNTHETIC Parsed Krile',
  'Legendary Creature — Human Wizard',
  "Trace Aether — Whenever you cast a noncreature spell, you may return target creature card with mana value equal to that spell's mana value from your graveyard to your hand. Do this only once each turn.",
  { manaCost: '{2}{U}', colors: ['U'], power: '2', toughness: '3' },
);
const TWO = vanilla('SYNTHETIC Parsed Two Drop', '{1}{G}', '2', '2');
const THREE = vanilla('SYNTHETIC Parsed Three Drop', '{2}{G}', '3', '3');
const FOUR = vanilla('SYNTHETIC Parsed Four Drop', '{3}{G}', '4', '4');

describe('Krile Baldesion: a creature card with exactly the mana value of the spell cast', () => {
  const board = (...graveyard: string[]) =>
    scenario()
      .seat(0)
      .life(20)
      .define(KRILE)
      .define(TWO)
      .define(THREE)
      .define(FOUR)
      .battlefield(KRILE.name, 'Swamp', 'Swamp', 'Swamp')
      .graveyard(...graveyard)
      .hand('Murder')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('Murder (mana value 3): the three-drop returns, the two-drop and the four-drop stay', () => {
    const g = board(TWO.name, THREE.name, FOUR.name);
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.zone(THREE.name, 'hand', { seat: 0 });
    g.expect.zone(TWO.name, 'graveyard', { seat: 0 });
    g.expect.zone(FOUR.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a graveyard with only a smaller and a larger creature has no card to return', () => {
    const g = board(TWO.name, FOUR.name);
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.zone(TWO.name, 'graveyard', { seat: 0 });
    g.expect.zone(FOUR.name, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
  });
});

// ---- Ardbert, Warrior of Darkness: "Whenever you cast a white spell, put a +1/+1 counter on each legendary creature you control. They gain vigilance until end of turn."
// (CR 608.2c, 611.2c: "they" are the creatures that got the counters; the group is fixed as the keyword is granted).

const ARDBERT = parsed(
  'SYNTHETIC Parsed Ardbert',
  'Legendary Creature — Human Warrior',
  'Whenever you cast a white spell, put a +1/+1 counter on each legendary creature you control. They gain vigilance until end of turn.\nWhenever you cast a black spell, put a +1/+1 counter on each legendary creature you control. They gain menace until end of turn.',
  { manaCost: '{W}{B}', colors: ['W', 'B'], power: '2', toughness: '2' },
);
const LEGEND = parsed('SYNTHETIC Parsed Legend', 'Legendary Creature — Bear', '', {
  manaCost: '{1}{G}',
  colors: ['G'],
  power: '2',
  toughness: '2',
});
const PLAIN = vanilla('SYNTHETIC Parsed Plain Bear', '{1}{G}', '2', '2');
const WHITE_SPELL = parsed('SYNTHETIC Parsed White Spell', 'Instant', 'You gain 1 life.', {
  manaCost: '{W}',
  colors: ['W'],
});

describe('Ardbert: a counter on each legendary creature, which gain the keyword for the turn', () => {
  const board = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(ARDBERT)
      .define(LEGEND)
      .define(PLAIN)
      .define(WHITE_SPELL)
      .battlefield(ARDBERT.name, LEGEND.name, PLAIN.name, 'Plains')
      .hand(WHITE_SPELL.name)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('a white spell: the legendary creatures get a counter and vigilance, the others nothing', () => {
    const g = board();
    g.act(0).cast(WHITE_SPELL.name, { pay: true });
    g.passAll();
    g.expect.counters(ARDBERT.name, { '+1/+1': 1 });
    g.expect.counters(LEGEND.name, { '+1/+1': 1 });
    g.expect.counters(PLAIN.name, {});
    g.expect.derived(ARDBERT.name, { keywords: ['vigilance'] });
    g.expect.derived(LEGEND.name, { keywords: ['vigilance'] });
    g.expect.invariants();
  });

  test('a creature that comes later does not get the keyword (the group is fixed as it resolves)', () => {
    const g = board();
    g.act(0).cast(WHITE_SPELL.name, { pay: true });
    g.passAll();
    g.expect.derived(PLAIN.name, { keywords: [] });
  });
});

// ---- Summon: Good King Mog XII, chapters II and III: "Whenever you cast a noncreature spell this turn, create a token that's a copy of a non-Saga token you control." (CR 603.7, 603.7a,
// 603.7c, 514.2, 707.2). Played as the enters trigger of a creature: the delayed ability is the same whichever ability makes it.

const COPIER = parsed(
  'SYNTHETIC Parsed Copier',
  'Creature — Moogle',
  "When ~ enters, whenever you cast a noncreature spell this turn, create a token that's a copy of a non-Saga token you control.",
  { manaCost: '{1}', power: '1', toughness: '1' },
);
const MAKER = parsed(
  'SYNTHETIC Parsed Soldier Maker',
  'Creature — Human',
  '{T}: Create a 1/1 white Soldier creature token.',
  { manaCost: '{W}', colors: ['W'], power: '1', toughness: '1' },
);

/** The controller chooses the first permanent offered (the token to copy: with several tokens to choose from the question is asked). */
function chooseFirst(g: ScenarioGame): void {
  const pending = g.state.pending;
  if (pending?.kind !== 'choosePermanent') throw new Error('no permanent choice is pending');
  const [first] = pending.legal;
  if (first === undefined) throw new Error('no permanent to choose');
  g.act(0).choosePermanents(first);
  g.passAll();
}

describe('Whenever you cast a noncreature spell this turn: a copy of a token you control', () => {
  const board = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(COPIER)
      .define(MAKER)
      .battlefield(MAKER.name, 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .hand(COPIER.name, BOLT, BOLT)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears', 'Llanowar Elves')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const soldiers = (g: ReturnType<typeof board>) =>
    g.state.battlefield.filter(
      (id) => g.state.objects[id]?.token?.characteristics.name === 'Soldier',
    );

  test('each noncreature spell cast after it makes another copy, until the end of the turn', () => {
    const g = board();
    g.act(0).activate(MAKER.name);
    g.passAll();
    expect(soldiers(g)).toHaveLength(1);
    g.act(0).cast(COPIER.name, { pay: true });
    g.passAll();
    // The spell that created the delayed ability is not one it sees (CR 603.7a).
    expect(soldiers(g)).toHaveLength(1);
    g.act(0).cast({ name: BOLT, nth: 0 }, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    chooseFirst(g);
    expect(soldiers(g)).toHaveLength(2);
    g.act(0).cast({ name: BOLT, nth: 0 }, { targets: ['Llanowar Elves'], pay: true });
    g.passAll();
    chooseFirst(g);
    expect(soldiers(g)).toHaveLength(3);
    g.expect.invariants();
  });

  test('it ends with the turn', () => {
    const g = board();
    g.act(0).activate(MAKER.name);
    g.passAll();
    g.act(0).cast(COPIER.name, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 3 });
    g.act(0).cast({ name: BOLT, nth: 0 }, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    expect(soldiers(g)).toHaveLength(1);
  });

  test('with no token to copy nothing is created', () => {
    const g = board();
    g.act(0).cast(COPIER.name, { pay: true });
    g.passAll();
    g.act(0).cast({ name: BOLT, nth: 0 }, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    expect(soldiers(g)).toHaveLength(0);
    g.expect.invariants();
  });
});
