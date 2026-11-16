// The Hylda deck (issue 42), group 1 (D-1500 to D-1505): the REAL Oracle text of Hylda of the Icy Crown, Icewrought Sentry, Sharae of Numbing Depths, Verity Circle, Hammers of Moradin,
// Elvish Mariner and Pippin, Guard of the Citadel (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario
// and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. The abilities of each real card are also the ones of its SYNTHETIC sibling
// of the engine fixtures (`synthetic-hylda-g1.ts`), which the engine tests and the AI soak play. Pins: CR 701.26a (tap), CR 508.1f (declaring attackers taps them), CR 603.2c (one or more),
// CR 603.12 (a reflexive ability created by the payment), CR 700.2b and 603.3c (the modes of a triggered ability are chosen as it goes on the stack), CR 701.22 (scry), CR 702.16a-b
// (protection from a card type), CR 122.1d (a stun counter).
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

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 8 }, () => 'Island');
const TOUCH = 'SYNTHETIC Frost Touch'; // tap target creature
const HUSH = 'SYNTHETIC Tidal Hush'; // tap all creatures your opponents control
const SIGHT = 'SYNTHETIC Clear Sight'; // scry 2
const BOLT = 'Lightning Bolt';

const hylda = real('Hylda of the Icy Crown');
const sentry = real('Icewrought Sentry');
const sharae = real('Sharae of Numbing Depths');
const verity = real('Verity Circle');
const hammers = real('Hammers of Moradin');
const mariner = real('Elvish Mariner');
const pippin = real('Pippin, Guard of the Citadel');

/** Every helper spell and creature the scenarios use. */
const helpers = () =>
  scenario()
    .define(syntheticCard(TOUCH))
    .define(syntheticCard(HUSH))
    .define(syntheticCard(SIGHT));

describe('every card is valid and has the abilities of its SYNTHETIC sibling', () => {
  test.each([
    ['Hylda of the Icy Crown', hylda, 'SYNTHETIC Frost Warlock'],
    ['Icewrought Sentry', sentry, 'SYNTHETIC Chill Sentry'],
    ['Sharae of Numbing Depths', sharae, 'SYNTHETIC Numbing Merfolk'],
    ['Verity Circle', verity, 'SYNTHETIC Watchful Circle'],
    ['Hammers of Moradin', hammers, 'SYNTHETIC Hammer Dwarf'],
    ['Elvish Mariner', mariner, 'SYNTHETIC Tide Pilot'],
    ['Pippin, Guard of the Citadel', pippin, 'SYNTHETIC Citadel Halfling'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    const face = card.faces[0];
    const twin = syntheticCard(sibling).faces[0];
    // Hammers of Moradin has Myriad (read before this group) besides the new line; the sibling has the new line only.
    const abilities = (face?.abilities ?? []).filter(
      (a) => !(a.kind === 'keyword' && a.keyword.kind === 'myriad'),
    );
    expect(abilities).toEqual(twin?.abilities);
  });
});

describe('Hylda of the Icy Crown', () => {
  const board = () =>
    helpers()
      .define(hylda)
      .seat(0)
      .library(...LIBRARY)
      .hand(TOUCH)
      .battlefield('Island', 'Island', 'Island')
      .battlefield(hylda.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();

  test('tapping a creature of an opponent, paying {1}: choose a 4/4 white and blue Elemental token', () => {
    const g = board();
    g.act(0).cast(TOUCH, { targets: ['spider'], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(0);
    g.passAll();
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 1 });
    g.expect.pt('Elemental', 4, 4);
    g.expect.invariants();
  });

  test('the third mode: scry 2, then draw a card', () => {
    const g = board();
    g.act(0).cast(TOUCH, { targets: ['spider'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.act(0).chooseModes(2);
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
  });

  test('a creature that is already tapped: nothing', () => {
    const g = board();
    g.act(0).cast(TOUCH, { targets: ['spider'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 0 });
  });
});

describe('Icewrought Sentry', () => {
  test('attacks: pay {1}{U}, tap a creature of an opponent, and the Sentry gets +2/+1', () => {
    const g = scenario()
      .define(sentry)
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Island', 'Island')
      .battlefield(sentry.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(sentry.name);
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    // The only creature of the opponent is the only legal target, so the engine chooses it (CR 603.3d).
    g.passAll();
    g.expect.tapped('spider');
    g.expect.pt(sentry.name, 4, 4);
    g.expect.invariants();
  });
});

describe('Sharae of Numbing Depths', () => {
  test('enters: tap and stun a creature of an opponent, and draw a card for tapping it, once each turn', () => {
    const g = helpers()
      .define(sharae)
      .seat(0)
      .library(...LIBRARY)
      .hand(sharae.name, TOUCH)
      .battlefield('Island', 'Island', 'Island', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(sharae.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('bears');
    g.passAll();
    g.expect.tapped('bears');
    g.expect.counters('bears', { stun: 1 });
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
    g.act(0).cast(TOUCH, { targets: ['spider'], pay: true });
    g.passAll();
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});

describe('Verity Circle', () => {
  test('a creature of an opponent becomes tapped by a spell: you may draw a card', () => {
    const g = helpers()
      .define(verity)
      .seat(0)
      .library(...LIBRARY)
      .hand(TOUCH)
      .battlefield('Island', 'Island')
      .battlefield(verity.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(TOUCH, { targets: ['spider'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('the creature is tapped as it is declared as an attacker: nothing (CR 508.1f)', () => {
    const g = scenario()
      .define(verity)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(verity.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('spider');
    g.expect.tapped('spider');
    g.expect.zone('Island', 'hand', { seat: 0, count: 0 });
    g.expect.stack([]);
  });

  test('its own activated ability taps a creature without flying', () => {
    const g = scenario()
      .define(verity)
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(verity.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(verity.name, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.tapped('bears');
    // The tap is also a creature of an opponent becoming tapped: the draw is asked.
    g.expect.pending('confirmOptional', 0);
  });
});

describe('Hammers of Moradin', () => {
  test('attacks: tap up to one target creature the opponent controls', () => {
    const g = scenario()
      .define(hammers)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(hammers.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(hammers.name);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    g.act(0).chooseTargets('spider');
    g.passAll();
    g.expect.tapped('spider');
    g.expect.invariants();
  });
});

describe('Elvish Mariner', () => {
  test('whenever you scry: tap up to as many target nonland permanents as the cards looked at', () => {
    const g = helpers()
      .define(mariner)
      .seat(0)
      .library(...LIBRARY)
      .hand(SIGHT)
      .battlefield('Island')
      .battlefield(mariner.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SIGHT, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.act(0).chooseTargets('spider', 'bears');
    g.passAll();
    g.expect.tapped('spider');
    g.expect.tapped('bears');
    g.expect.invariants();
  });
});

describe('Pippin, Guard of the Citadel', () => {
  test('{T}: another creature you control gains protection from a card type you choose', () => {
    const g = scenario()
      .define(pippin)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(pippin.name)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(pippin.name, { targets: ['mine'] });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${d?.kind}`);
    expect(d.purpose).toBe('protectionCardType');
    g.act(0).chooseOption('instant');
    g.expect.tapped(pippin.name);
    g.expect.invariants();
  });
});
