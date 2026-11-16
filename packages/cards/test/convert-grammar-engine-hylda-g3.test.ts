// The Hylda deck (issue 42), group 3: the REAL Oracle text of Theft of Dreams, Borrowing 100,000 Arrows, Gadwick the Wizened, Loyal Warhound, Floodpits Drowner, Cloud's Limit Break,
// Ojutai Exemplars, Retreat to Coralhelm, You See a Guard Approach and Surge of Salvation (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no
// override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. The abilities of each real
// card are also the ones of its SYNTHETIC sibling of the engine fixtures (`synthetic-hylda-g3.ts`, apart from the text of the modes, which names the real card), which the engine
// tests and the AI soak play. Pins: CR 109.4 and 608.2c, CR 107.3m, CR 603.4, CR 701.24, CR 115.1 and 601.2c, CR 702.183a, CR 700.2, CR 701.26, CR 702.11b, CR 615 and 609.7a.
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

/** The same value without the `text` of its modes, which shows the real card's name. */
function withoutText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutText);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'text')
        .map(([key, v]) => [key, withoutText(v)]),
    );
  }
  return value;
}

const BEARS = 'Grizzly Bears';
const RATS = 'Typhoid Rats';
const ISAMARU = 'Isamaru, Hound of Konda';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

const theft = real('Theft of Dreams');
const arrows = real('Borrowing 100,000 Arrows');
const gadwick = real('Gadwick, the Wizened');
const warhound = real('Loyal Warhound');
const drowner = real('Floodpits Drowner');
const limitBreak = real("Cloud's Limit Break");
const exemplars = real('Ojutai Exemplars');
const coralhelm = real('Retreat to Coralhelm');
const guard = real('You See a Guard Approach');
const surge = real('Surge of Salvation');

describe('every card is valid and has the AST of its SYNTHETIC sibling', () => {
  test.each([
    ['Theft of Dreams', theft, 'SYNTHETIC Dream Raider'],
    ['Borrowing 100,000 Arrows', arrows, 'SYNTHETIC Dream Raider'],
    ['Gadwick, the Wizened', gadwick, 'SYNTHETIC Mana Scholar'],
    ['Loyal Warhound', warhound, 'SYNTHETIC Landless Hound'],
    ['Floodpits Drowner', drowner, 'SYNTHETIC Tide Shuffler'],
    ["Cloud's Limit Break", limitBreak, 'SYNTHETIC Tiered Smiter'],
    ['Ojutai Exemplars', exemplars, 'SYNTHETIC Spellcast Monk'],
    ['Retreat to Coralhelm', coralhelm, 'SYNTHETIC Tide Keeper'],
    ['You See a Guard Approach', guard, 'SYNTHETIC Sentry Slip'],
    ['Surge of Salvation', surge, 'SYNTHETIC Warding Prayer'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    const face = card.faces[0];
    const twin = syntheticCard(sibling).faces[0];
    expect(withoutText(face?.abilities)).toEqual(withoutText(twin?.abilities));
    expect(withoutText(face?.spell)).toEqual(withoutText(twin?.spell));
    expect(face?.manaCost).toEqual(twin?.manaCost);
  });
});

describe('Theft of Dreams and Borrowing 100,000 Arrows', () => {
  test.each([theft, arrows])(
    '$name draws a card for each tapped creature of the targeted opponent',
    (card) => {
      const g = scenario()
        .define(card)
        .seat(0)
        .library(...LIBRARY)
        .hand(card.name)
        .battlefield('Island', 'Island', 'Island')
        .battlefield(BEARS, { tapped: true })
        .seat(1)
        .library(...LIBRARY)
        .battlefield(BEARS, { tapped: true, count: 3 })
        .battlefield(RATS)
        .at('precombatMain', { active: 0 })
        .build();
      g.act(0)
        .cast(card.name, { targets: [{ player: 1 }] })
        .pay();
      g.passAll();
      g.expect.handSize(0, 3);
      g.expect.invariants();
    },
  );
});

describe('Gadwick, the Wizened', () => {
  const board = (lands: number) =>
    scenario()
      .define(gadwick)
      .seat(0)
      .library(...LIBRARY)
      .hand(gadwick.name)
      .battlefield(...Array.from({ length: lands }, () => 'Island'))
      .seat(1)
      .library(...LIBRARY)
      .battlefield(RATS, { label: 'rats' })
      .at('precombatMain', { active: 0 })
      .build();

  test('entering draws X cards, X the announced X (CR 107.3m)', () => {
    const g = board(7);
    g.act(0).cast(gadwick.name).x(4).pay();
    g.passAll();
    g.expect.zone(gadwick.name, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 4);
    g.expect.invariants();
  });

  test('X = 0 draws nothing', () => {
    const g = board(4);
    g.act(0).cast(gadwick.name).x(0).pay();
    g.passAll();
    g.expect.handSize(0, 0);
  });
});

describe('Loyal Warhound', () => {
  test('an opponent with more lands: a basic Plains is put onto the battlefield tapped', () => {
    const g = scenario()
      .define(warhound)
      .seat(0)
      .library('Plains', 'Forest', 'Forest')
      .hand(warhound.name)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Forest', 'Forest', 'Forest')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(warhound.name).pay();
    g.passAll();
    g.act(0).chooseCards({ name: 'Plains', zone: 'library' });
    g.passAll();
    const plains = g.find({ name: 'Plains', zone: 'battlefield', seat: 0 });
    expect(plains).toHaveLength(3);
    g.expect.librarySize(0, 2);
  });

  test('as many lands: nothing is fetched', () => {
    const g = scenario()
      .define(warhound)
      .seat(0)
      .library('Plains', 'Forest')
      .hand(warhound.name)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Forest', 'Forest')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(warhound.name).pay();
    g.passAll();
    g.expect.librarySize(0, 2);
  });
});

describe('Floodpits Drowner', () => {
  test("shuffles itself and the stunned creature into their owners' libraries", () => {
    const g = scenario()
      .define(drowner)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(drowner.name)
      .battlefield('Island', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'stunned', counters: { stun: 1 } })
      .battlefield(RATS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(drowner.name).targets(['stunned']).pay();
    g.passAll();
    g.expect.zone(drowner.name, 'library', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 1 });
    g.expect.librarySize(0, 9);
    g.expect.librarySize(1, 9);
    g.expect.invariants();
  });
});

describe("Cloud's Limit Break", () => {
  const board = () =>
    scenario()
      .define(limitBreak)
      .seat(0)
      .library(...LIBRARY)
      .hand(limitBreak.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS, { label: 'mine', tapped: true })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirA', tapped: true })
      .battlefield(RATS, { label: 'theirB', tapped: true })
      .battlefield(ISAMARU, { label: 'theirUntapped' })
      .at('precombatMain', { active: 0 })
      .build();

  test('Cross-Slash: {0}', () => {
    const g = board();
    g.act(0).cast(limitBreak.name).modes(0).targets(['theirB']).pay();
    g.passAll();
    g.expect.zone(RATS, 'graveyard', { seat: 1 });
  });

  test('Blade Beam: one tapped creature of each controller', () => {
    const g = board();
    g.act(0).cast(limitBreak.name).modes(1).targets(['theirA', 'mine']).pay();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(RATS, 'battlefield', { seat: 1 });
  });

  test('Blade Beam: two creatures of one controller are refused', () => {
    const g = board();
    g.act(0).cast(limitBreak.name).modes(1);
    const r = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [
        { kind: 'object', id: g.id('theirA'), specId: 't2' },
        { kind: 'object', id: g.id('theirB'), specId: 't2' },
      ],
    });
    expect(r.ok).toBe(false);
  });

  test('Omnislash: all the tapped creatures', () => {
    const g = board();
    g.act(0).cast(limitBreak.name).modes(2).pay();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(RATS, 'graveyard', { seat: 1 });
    g.expect.zone(ISAMARU, 'battlefield', { seat: 1 });
  });
});

describe('Ojutai Exemplars', () => {
  const board = () =>
    scenario()
      .define(exemplars)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(exemplars.name, { label: 'monk' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('mode 3: it is exiled and returns tapped', () => {
    const g = board();
    g.act(0)
      .cast(BOLT, { targets: [{ player: 1 }] })
      .pay();
    g.act(0).chooseModes(2);
    g.passAll();
    g.expect.zone(exemplars.name, 'battlefield', { seat: 0 });
    g.expect.tapped(exemplars.name);
  });

  test('mode 2: first strike and lifelink', () => {
    const g = board();
    g.act(0)
      .cast(BOLT, { targets: [{ player: 1 }] })
      .pay();
    g.act(0).chooseModes(1);
    g.passAll();
    g.expect.derived('monk', { keywords: ['firstStrike', 'lifelink'] });
  });
});

describe('Retreat to Coralhelm', () => {
  const board = () =>
    scenario()
      .define(coralhelm)
      .seat(0)
      .library(...LIBRARY)
      .hand('Forest')
      .battlefield(coralhelm.name)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs', tapped: true })
      .at('precombatMain', { active: 0 })
      .build();

  test('a land entering: untap their creature', () => {
    const g = board();
    g.act(0).playLand('Forest');
    g.act(0).chooseModes(0);
    g.act(0).chooseTargets('theirs');
    g.passAll();
    g.act(0).chooseOption('Untap it');
    g.expect.tapped('theirs', false);
  });

  test('a land entering: or neither', () => {
    const g = board();
    g.act(0).playLand('Forest');
    g.act(0).chooseModes(0);
    g.act(0).chooseTargets('theirs');
    g.passAll();
    g.act(0).chooseOption('Do nothing');
    g.expect.tapped('theirs', true);
  });
});

describe('You See a Guard Approach', () => {
  const board = () =>
    scenario()
      .define(guard)
      .seat(0)
      .library(...LIBRARY)
      .hand(guard.name)
      .battlefield('Island')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('Distract the Guard', () => {
    const g = board();
    g.act(0).cast(guard.name).modes(0).targets(['theirs']).pay();
    g.passAll();
    g.expect.tapped('theirs');
  });

  test('Hide', () => {
    const g = board();
    g.act(0).cast(guard.name).modes(1).targets(['mine']).pay();
    g.passAll();
    g.expect.derived('mine', { keywords: ['hexproof'] });
  });
});

describe('Surge of Salvation', () => {
  test('the player and the permanents have hexproof, and the damage of black and red sources is prevented', () => {
    const g = scenario()
      .define(surge)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(surge.name)
      .battlefield('Plains')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(RATS, { label: 'rats' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(surge.name).pay();
    g.passAll();
    g.expect.derived('mine', { keywords: ['hexproof'] });
    g.pass(0);
    g.act(1).cast(BOLT);
    const legal = g.state.pending?.kind === 'targets' ? g.state.pending.specs[0]?.legal : undefined;
    expect(legal).toEqual([
      { kind: 'object', id: g.id('rats'), specId: 't1' },
      { kind: 'player', seat: 1, specId: 't1' },
    ]);
    g.expect.invariants();
  });
});
