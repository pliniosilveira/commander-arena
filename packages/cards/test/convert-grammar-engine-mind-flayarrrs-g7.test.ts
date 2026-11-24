// Mind Flayarrrs deck, group 7. Endless Evil and Nighthowler: the REAL Oracle text of the golden corpus goes through the grammar with no override and is played through
// applyAction with the scenario DSL, with three seats. Pins: CR 702.103 (Bestow; the rules text was not available, so the subrule letters are unchecked), CR 707.9b (a copy's
// exception is part of its copiable values), CR 603.4 and 603.10a (an intervening "if" is read again as the ability resolves, the creature that died as it last was), CR 613.4c
// (a "+X/+X" follows the board), CR 107.3c (X is what the text defines), CR 205.1a (an Aura that is not a creature).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped } from './parser-p5-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const real = (name: string): CardDefinition => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
};

const NIGHTHOWLER = real('Nighthowler');
const NAME = NIGHTHOWLER.name;
const BEARS = 'Grizzly Bears';

describe('Nighthowler: +X/+X for itself and the creature it enchants', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(NIGHTHOWLER)
      .seat(0)
      .hand(NAME)
      .battlefield('Swamp', { count: 4 })
      .battlefield(BEARS)
      .graveyard('Serra Angel')
      .seat(1)
      .graveyard('Serra Angel', 'Lightning Bolt')
      .seat(2)
      .graveyard('Serra Angel')
      .build();

  test('as a creature it counts the creature cards of every graveyard (three seats)', () => {
    const g = build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    // Three creature cards in graveyards (the Bolt is not one): 0/0 + 3.
    g.expect.pt(NAME, 3, 3);
    g.expect.invariants();
  });

  test('bestowed, both it and the host get the bonus (CR 702.103)', () => {
    const g = build();
    g.act(0).cast(NAME, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(NAME, BEARS);
    g.expect.pt(BEARS, 5, 5);
    g.expect.invariants();
  });
});

describe('the grammar', () => {
  test.each([
    [
      'no period',
      '~ and enchanted creature each get +X/+X, where X is the number of creature cards in all graveyards',
    ],
    [
      'a fixed step',
      '~ and enchanted creature each get +1/+1, where X is the number of creature cards in all graveyards.',
    ],
    [
      'gets',
      '~ and enchanted creature each gets +X/+X, where X is the number of creature cards in all graveyards.',
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});

const ENDLESS = real('Endless Evil');
const HORROR = 'SYNTHETIC Madness Fiend';
const BOLT = 'Lightning Bolt';
const LIB = Array.from({ length: 12 }, () => 'Plains');

describe('Endless Evil: a 1/1 copy each upkeep, and back to hand when a Horror dies', () => {
  const build = (host: string) =>
    scenario({ seats: 3 })
      .define(ENDLESS)
      .seat(0)
      .library(...LIB)
      .battlefield(host)
      .battlefield(ENDLESS.name, { attachedTo: host })
      .seat(1)
      .library(...LIB)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(2)
      .library(...LIB)
      .battlefield('Serra Angel')
      .at('end', { active: 2, turn: 5 })
      .build();
  const bodies = (g: { state: Parameters<typeof getView>[0] }, name: string) =>
    getView(g.state, 0).battlefield.filter((o) => o.name === name);

  test('the card copies the enchanted creature with a set power and toughness, and checks the creature that died', () => {
    const text = JSON.stringify(ENDLESS.faces[0]?.abilities);
    expect(text).toContain('"setPt":{"power":1,"toughness":1}');
    expect(text).toContain('"subjectMatches"');
  });

  test("at the beginning of its controller's upkeep it makes a 1/1 token copy of the host (three seats)", () => {
    const g = build(HORROR);
    g.advanceTo('upkeep');
    g.passAll();
    const copies = bodies(g, HORROR);
    expect(copies).toHaveLength(2);
    expect(copies.map((o) => `${o.power}/${o.toughness}`).sort()).toEqual(['1/1', '4/3']);
    expect(copies.map((o) => o.subtypes)).toEqual([['Horror'], ['Horror']]);
    g.expect.invariants();
  });

  test("another player's upkeep makes nothing", () => {
    const g = scenario({ seats: 3 })
      .define(ENDLESS)
      .seat(0)
      .battlefield(HORROR)
      .battlefield(ENDLESS.name, { attachedTo: HORROR })
      .seat(1)
      .library(...LIB)
      .seat(2)
      .library(...LIB)
      .at('end', { active: 0, turn: 4 })
      .build();
    g.advanceTo('upkeep');
    g.passAll();
    expect(bodies(g, HORROR)).toHaveLength(1);
  });

  test("a Horror enchanted creature dies: the Aura returns to its owner's hand (CR 603.10a)", () => {
    const g = build(HORROR);
    g.advanceTo('upkeep');
    g.passAll();
    g.advanceTo('precombatMain');
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ name: HORROR, seat: 0, nth: 0 }], pay: true });
    g.passAll();
    g.expect.zone(ENDLESS.name, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature that is not a Horror dies: the Aura goes to the graveyard', () => {
    const g = build('Grizzly Bears');
    g.advanceTo('precombatMain');
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ name: 'Grizzly Bears', seat: 0, nth: 0 }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(ENDLESS.name, 'graveyard', { seat: 0 });
    g.expect.noObject(ENDLESS.name, { zone: 'hand' });
  });
});
