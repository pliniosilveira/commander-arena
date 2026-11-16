// The Hylda deck (issue 42), group 2 (D-1510 to D-1518): the REAL Oracle text of Sleep, Tempest Caller, Send to Sleep, Icy Blast, Niblis of Frost, Narcolepsy, Cone of Cold,
// Dreamshackle Geist, Citadel Siege, Topplegeist and Hylda's Crown of Winter (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override,
// is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. The abilities of each real card are
// also the ones of its SYNTHETIC sibling of the engine fixtures (`synthetic-hylda-g2.ts`), which the engine tests and the AI soak play. Pins: CR 502.3 (the untap step),
// CR 611.2a (a continuous effect lasts as long as it says), CR 706.3 (a results table), CR 700.2b (a modal triggered ability with no mode chosen is removed), CR 603.4 (an
// intervening "if"), CR 205.2a (card types), CR 601.2f (a cost reduced by one).
import { readFileSync } from 'node:fs';
import { type CardDefinition, nextInt, syntheticCard, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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
const BOLT = 'Lightning Bolt';
const LIB = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

const sleep = real('Sleep');
const caller = real('Tempest Caller');
const send = real('Send to Sleep');
const blast = real('Icy Blast');
const niblis = real('Niblis of Frost');
const narcolepsy = real('Narcolepsy');
const cone = real('Cone of Cold');
const geist = real('Dreamshackle Geist');
const siege = real('Citadel Siege');
const topple = real('Topplegeist');
const crown = real("Hylda's Crown of Winter");

describe('every card is valid and has the AST of its SYNTHETIC sibling', () => {
  test.each([
    ['Sleep', sleep, 'SYNTHETIC Lullaby Wave'],
    ['Tempest Caller', caller, 'SYNTHETIC Gale Binder'],
    ['Send to Sleep', send, 'SYNTHETIC Drowse Pair'],
    ['Icy Blast', blast, 'SYNTHETIC Frost Gust'],
    ['Niblis of Frost', niblis, 'SYNTHETIC Chill Spirit'],
    ['Narcolepsy', narcolepsy, 'SYNTHETIC Drowsy Aura'],
    ['Cone of Cold', cone, 'SYNTHETIC Cold Table'],
    ['Dreamshackle Geist', geist, 'SYNTHETIC Slumber Geist'],
    ['Citadel Siege', siege, 'SYNTHETIC Dawn Siege'],
    ['Topplegeist', topple, 'SYNTHETIC Ghost Sentinel'],
    ["Hylda's Crown of Winter", crown, 'SYNTHETIC Winter Crown'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    const face = card.faces[0];
    const twin = syntheticCard(sibling).faces[0];
    expect(face?.spell).toEqual(twin?.spell);
    // The second ability of the Crown (sacrifice, draw for each tapped creature) is another group's.
    const own =
      card.name === "Hylda's Crown of Winter" ? face?.abilities.slice(0, 1) : face?.abilities;
    expect(own).toEqual(twin?.abilities);
  });
});

const keptTapped = (g: ScenarioGame) =>
  g.state.continuousEffects.filter((e) => e.until === 'nextUntapStep');

describe('Sleep', () => {
  test('taps the creatures of the target player and they miss their next untap step', () => {
    const g = scenario()
      .define(sleep)
      .seat(0)
      .library(...LIB)
      .hand(sleep.name)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(sleep.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.tapped('a', true);
    g.expect.tapped('b', true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('a', true);
    g.expect.tapped('b', true);
    expect(keptTapped(g)).toHaveLength(0);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('a', false);
    g.expect.invariants();
  });
});

describe('Tempest Caller', () => {
  test('taps the creatures of the opponent as it enters', () => {
    const g = scenario()
      .define(caller)
      .seat(0)
      .library(...LIB)
      .hand(caller.name)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(caller.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.tapped('a', true);
  });
});

describe('Send to Sleep and Icy Blast', () => {
  test('Send to Sleep with two instants in the graveyard: the targets miss the untap step', () => {
    const g = scenario()
      .define(send)
      .seat(0)
      .library(...LIB)
      .hand(send.name)
      .graveyard(BOLT, BOLT)
      .battlefield('Island', { count: 2 })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(send.name, { targets: ['a', 'b'], pay: true });
    g.passAll();
    g.expect.tapped('a', true);
    expect(keptTapped(g)).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('b', true);
  });

  test('Icy Blast with X = 2 and a creature of power 4: both are tapped and kept', () => {
    const g = scenario()
      .define(blast)
      .seat(0)
      .library(...LIB)
      .hand(blast.name)
      .battlefield('Island', { count: 4 })
      .battlefield('Serra Angel')
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(blast.name, { x: 2, targets: ['a', 'b'], pay: true });
    g.passAll();
    g.expect.tapped('a', true);
    g.expect.tapped('b', true);
    expect(keptTapped(g)).toHaveLength(1);
  });
});

describe('Niblis of Frost', () => {
  test('an instant spell taps a creature of an opponent, which misses its next untap step', () => {
    const g = scenario()
      .define(niblis)
      .seat(0)
      .library(...LIB)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(niblis.name)
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.tapped('a', true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('a', true);
  });
});

describe('Narcolepsy', () => {
  test('taps the creature it enchants at an upkeep', () => {
    const g = scenario()
      .define(narcolepsy)
      .seat(0)
      .library(...LIB)
      .battlefield(BEARS, { label: 'host', tapped: true })
      .battlefield(narcolepsy.name, { attachedTo: 'host' })
      .seat(1)
      .library(...LIB)
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep');
    g.expect.tapped('host', false);
    g.passAll();
    g.expect.tapped('host', true);
  });
});

describe('Cone of Cold', () => {
  const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);
  const game = (seed: number): ScenarioGame =>
    scenario()
      .define(cone)
      .seed(seed)
      .seat(0)
      .library(...LIB)
      .hand(cone.name)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .at('precombatMain', { active: 0 })
      .build();
  const result = (seed: number) => (nextInt(game(seed).state.rng, 20)[0] ?? -1) + 1;

  test.each([
    [5, 0, false],
    [15, 1, false],
    [20, 1, true],
  ] as const)('a roll of %i: %i kept tapped, enters tapped %s', (wanted, kept, enters) => {
    const seed = SEEDS.find((s) =>
      wanted === 5
        ? result(s) <= 9
        : wanted === 15
          ? result(s) >= 10 && result(s) <= 19
          : result(s) === 20,
    );
    if (seed === undefined) throw new Error('no seed');
    const g = game(seed);
    g.act(0).cast(cone.name, { pay: true });
    g.passAll();
    g.expect.tapped('a', true);
    expect(keptTapped(g)).toHaveLength(kept);
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'entersTapped')).toBe(enters);
  });
});

describe('Dreamshackle Geist', () => {
  test('choose up to one: the question lists no mode, and choosing none removes the ability', () => {
    const g = scenario()
      .define(geist)
      .seat(0)
      .library(...LIB)
      .battlefield(geist.name)
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .at('upkeep', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes();
    g.expect.stack([]);
    g.expect.tapped('a', false);
  });
});

describe('Citadel Siege', () => {
  test('Dragons: a creature of the opponent is tapped at the beginning of their combat', () => {
    const g = scenario()
      .define(siege)
      .seat(0)
      .library(...LIB)
      .hand(siege.name)
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(siege.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Dragons');
    g.advanceTo('beginningOfCombat', { turn: 'next' });
    g.passAll();
    g.expect.tapped('a', true);
  });
});

describe('Topplegeist', () => {
  test('with four card types in the graveyard it taps a creature of the opponent at their upkeep', () => {
    const g = scenario()
      .define(topple)
      .seat(0)
      .library(...LIB)
      .battlefield(topple.name)
      .graveyard(BOLT, 'Island', 'Sol Ring', BEARS)
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .at('end', { active: 0, turn: 1 })
      .build();
    g.advanceTo('upkeep');
    g.passAll();
    g.expect.tapped('a', true);
  });

  test('three card types do not trigger it', () => {
    const g = scenario()
      .define(topple)
      .seat(0)
      .library(...LIB)
      .battlefield(topple.name)
      .graveyard(BOLT, 'Island', BEARS)
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .at('end', { active: 0, turn: 1 })
      .build();
    g.advanceTo('upkeep');
    g.expect.stack([]);
  });
});

describe("Hylda's Crown of Winter", () => {
  test('costs nothing but the tap during my turn', () => {
    const g = scenario()
      .define(crown)
      .seat(0)
      .library(...LIB)
      .battlefield(crown.name)
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(crown.name, { ability: 0 }).targets(['a']);
    g.passAll();
    g.expect.tapped('a', true);
  });
});
