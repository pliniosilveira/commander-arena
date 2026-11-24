// Riders of Rohan deck, group D (CR 702.33c, 603.3d, 614.1c, 615, 702.34, 603.4): the REAL Oracle text of Dearly Departed, Grey Host Reinforcements, Harsh Mentor, Marshal's Anthem,
// Selfless Squire and Visions of Glory (the Scryfall data of the deck support issue, in the golden corpus) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
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
const mentor = real('Harsh Mentor');
const departed = real('Dearly Departed');

describe('the real cards are valid', () => {
  test.each([anthem, greyHost, squire, mentor, departed])('$name', (card) => {
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

describe('Harsh Mentor', () => {
  const NEEDLE = 'SYNTHETIC Needle Rogue'; // {T}: 1 damage to target creature
  const start = () =>
    scenario({ seats: 3 })
      .define(mentor)
      .define(syntheticCard(NEEDLE))
      .seat(0)
      .battlefield(mentor.name)
      .battlefield(NEEDLE, { label: 'myNeedle' })
      .battlefield(BEARS, { label: 'bears' })
      .library(...FILLER)
      .seat(1)
      .battlefield(NEEDLE, { label: 'needle1' })
      .battlefield(ELVES, { label: 'elves1' })
      .library(...FILLER)
      .seat(2)
      .battlefield(NEEDLE, { label: 'needle2' })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();

  test('an opponent activating an ability of a creature takes 2 damage (CR 602.2, 603.2)', () => {
    const g = start();
    g.act(1).activate('needle1', { targets: ['bears'] });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(2, 40);
    g.expect.life(0, 40);
  });

  test('the damage goes to the player who activated, whichever opponent it is', () => {
    const g = scenario({ seats: 3 })
      .define(mentor)
      .define(syntheticCard(NEEDLE))
      .seat(0)
      .battlefield(mentor.name)
      .battlefield(BEARS, { label: 'bears' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .battlefield(NEEDLE, { label: 'needle2' })
      .library(...FILLER)
      .at('precombatMain', { active: 2, turn: 3 })
      .build();
    g.act(2).activate('needle2', { targets: ['bears'] });
    g.passAll();
    g.expect.life(2, 38);
    g.expect.life(1, 40);
  });

  test('a mana ability does not trigger it (CR 605.1a)', () => {
    const g = start();
    g.act(1).tapForMana('elves1');
    g.passAll();
    g.expect.life(1, 40);
  });

  test('its controller activating an ability is not an opponent', () => {
    const g = scenario({ seats: 3 })
      .define(mentor)
      .define(syntheticCard(NEEDLE))
      .seat(0)
      .battlefield(mentor.name)
      .battlefield(NEEDLE, { label: 'myNeedle' })
      .battlefield(BEARS, { label: 'bears' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate('myNeedle', { targets: ['bears'] });
    g.passAll();
    g.expect.life(0, 40);
  });
});

describe('Dearly Departed', () => {
  const KNIGHT = 'Youthful Knight'; // a 2/1 Human Knight
  const start = (graveyard: readonly string[] = [departed.name]) =>
    scenario({ seats: 3 })
      .define(departed)
      .seat(0)
      .hand(KNIGHT, BEARS)
      .battlefield('Plains', { count: 4 })
      .battlefield('Forest')
      .graveyard(...graveyard)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('while it is in your graveyard, a Human creature you cast enters with a +1/+1 counter (CR 113.6b, 614.12)', () => {
    const g = start();
    g.act(0).cast(KNIGHT, { pay: true });
    g.passAll();
    g.expect.counters(KNIGHT, { '+1/+1': 1 });
    g.expect.pt(KNIGHT, 3, 2);
  });

  test('a creature that is not a Human gets nothing', () => {
    const g = start();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
  });

  test('the effect is cumulative: two copies in the graveyard give two counters', () => {
    const g = start([departed.name, departed.name]);
    g.act(0).cast(KNIGHT, { pay: true });
    g.passAll();
    g.expect.counters(KNIGHT, { '+1/+1': 2 });
  });

  test("an opponent's Human gets nothing from a graveyard that is not theirs", () => {
    const g = scenario({ seats: 3 })
      .define(departed)
      .seat(0)
      .graveyard(departed.name)
      .library(...FILLER)
      .seat(1)
      .hand(KNIGHT)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    g.act(1).cast(KNIGHT, { pay: true });
    g.passAll();
    g.expect.counters(KNIGHT, {});
  });

  test('on the battlefield it does nothing: the ability works from the graveyard only', () => {
    const g = scenario()
      .define(departed)
      .seat(0)
      .hand(KNIGHT)
      .battlefield('Plains', { count: 4 })
      .battlefield(departed.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(KNIGHT, { pay: true });
    g.passAll();
    g.expect.counters(KNIGHT, {});
  });
});
