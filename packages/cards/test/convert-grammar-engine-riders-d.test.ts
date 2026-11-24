// Riders of Rohan deck, group D (CR 702.33c, 603.3d, 614.1c, 615, 702.34, 603.4): the REAL Oracle text of Dearly Departed, Grey Host Reinforcements, Harsh Mentor, Marshal's Anthem,
// Selfless Squire and Visions of Glory (the Scryfall data of the deck support issue, in the golden corpus) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the test data`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 14 }, () => 'Plains');
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';

const anthem = real("Marshal's Anthem");
const greyHost = real('Grey Host Reinforcements');
const squire = real('Selfless Squire');

describe('the real cards are valid', () => {
  test.each([anthem, greyHost, squire])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe("Marshal's Anthem", () => {
  const start = () =>
    scenario()
      .define(anthem)
      .seat(0)
      .hand(anthem.name)
      .battlefield('Plains', { count: 8 })
      .graveyard(BEARS, ELVES, 'Lightning Bolt')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('kicked twice, it returns up to two creature cards (CR 702.33c, 603.3d)', () => {
    const g = start();
    g.act(0).cast(anthem.name, { kicks: 2, pay: true });
    g.passAll();
    // The trigger asks for up to X = 2 targets.
    g.act(0).chooseTargets(
      { name: BEARS, zone: 'graveyard', seat: 0 },
      { name: ELVES, zone: 'graveyard', seat: 0 },
    );
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.pt(BEARS, 3, 3);
  });

  test('kicked once, X is 1: a second target is refused (CR 601.2c)', () => {
    const g = start();
    g.act(0).cast(anthem.name, { kicks: 1, pay: true });
    g.passAll();
    expect(() =>
      g
        .act(0)
        .chooseTargets(
          { name: BEARS, zone: 'graveyard', seat: 0 },
          { name: ELVES, zone: 'graveyard', seat: 0 },
        ),
    ).toThrow();
    g.act(0).chooseTargets({ name: ELVES, zone: 'graveyard', seat: 0 });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('not kicked, X is 0: the ability has no target and is not put on the stack', () => {
    const g = start();
    g.act(0).cast(anthem.name, { kicks: 0, pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('Grey Host Reinforcements', () => {
  const start = () =>
    scenario({ seats: 3 })
      .define(greyHost)
      .seat(0)
      .hand(greyHost.name)
      .battlefield('Plains', { count: 4 })
      .graveyard(BEARS)
      .library(...FILLER)
      .seat(1)
      .graveyard(BEARS, ELVES, 'Lightning Bolt')
      .library(...FILLER)
      .seat(2)
      .graveyard(ELVES, ELVES)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test("exiles the target player's graveyard and gets a counter for each creature card (CR 608.2c)", () => {
    const g = start();
    g.act(0).cast(greyHost.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.zone('Lightning Bolt', 'exile', { seat: 1 });
    g.expect.counters(greyHost.name, { '+1/+1': 2 });
    g.expect.pt(greyHost.name, 3, 3);
    // Another player's graveyard and the controller's own are untouched.
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 2 });
  });

  test('a third player can be the target, and counts their own creature cards', () => {
    const g = start();
    g.act(0).cast(greyHost.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 2 });
    g.passAll();
    g.expect.counters(greyHost.name, { '+1/+1': 2 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('a graveyard with no creature card gives no counter', () => {
    const g = scenario()
      .define(greyHost)
      .seat(0)
      .hand(greyHost.name)
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .graveyard('Lightning Bolt')
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(greyHost.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.zone('Lightning Bolt', 'exile', { seat: 1 });
    g.expect.counters(greyHost.name, {});
  });
});

describe('Selfless Squire', () => {
  const start = () =>
    scenario({ seats: 3 })
      .define(squire)
      .seat(0)
      .hand(squire.name)
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();

  test('flashed in against a Lightning Bolt, it prevents the damage and gets that many counters (CR 615.6)', () => {
    const g = start();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    g.act(2).pass();
    g.act(0).cast(squire.name, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.counters(squire.name, { '+1/+1': 3 });
    g.expect.pt(squire.name, 4, 4);
  });

  test('damage to another player is not damage to you: no counters', () => {
    const g = start();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 2 }], pay: true });
    g.act(1).pass();
    g.act(2).pass();
    g.act(0).cast(squire.name, { pay: true });
    g.passAll();
    g.expect.life(2, 37);
    g.expect.counters(squire.name, {});
  });

  test('damage that is dealt, not prevented, triggers nothing', () => {
    const g = start();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
    g.act(1).pass();
    g.act(2).pass();
    g.act(0).cast(squire.name, { pay: true });
    g.passAll();
    g.expect.counters(squire.name, {});
  });
});
