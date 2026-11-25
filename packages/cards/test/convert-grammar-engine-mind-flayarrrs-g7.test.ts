// Mind Flayarrrs deck, group 7. Endless Evil, Nighthowler, Grell Philosopher and Aboleth Spawn: the REAL Oracle text of the golden corpus goes through the grammar with no override and is played through
// applyAction with the scenario DSL, with three seats. Pins: CR 702.103 (Bestow; the rules text was not available, so the subrule letters are unchecked), CR 707.9b (a copy's
// exception is part of its copiable values), CR 603.4 and 603.10a (an intervening "if" is read again as the ability resolves, the creature that died as it last was), CR 613.4c
// (a "+X/+X" follows the board), CR 107.3c (X is what the text defines), CR 205.1a (an Aura that is not a creature).
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  getLegalActions,
  getView,
  validateCard,
} from '@commander-arena/engine';
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

const GRELL = real('Grell Philosopher');
const KEYRUNE = real('Dimir Keyrune');

describe('Grell Philosopher: Horrors gain the activated abilities of an opponent artifact, and blue mana pays any color for them', () => {
  const build = (lands: readonly string[], mine = false) => {
    const b = scenario({ seats: 3 })
      .define(GRELL)
      .define(KEYRUNE)
      .seat(0)
      .hand(GRELL.name)
      .battlefield(...lands);
    if (mine) b.battlefield(KEYRUNE.name);
    return b
      .seat(1)
      .battlefield(...(mine ? [] : [KEYRUNE.name]))
      .seat(2)
      .battlefield('Mountain')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };
  /** The abilities of Grell itself the seat may activate now (the Keyrune's own are not counted). */
  const activations = (g: {
    state: Parameters<typeof getView>[0];
    object: (name: string) => { id: string };
  }) =>
    getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'activate' && a.object === g.object(GRELL.name).id,
    );

  test('the card lowers to a grant from a target to a group, with the blue mana rider', () => {
    const text = JSON.stringify(GRELL.faces[0]?.abilities);
    expect(text).toContain('"kind":"gainActivatedAbilitiesOf"');
    expect(text).toContain('"blueAsAnyColor":true');
    expect(text).toContain('"kind":"upkeep"');
  });

  test('on entering it gains the ability, and two Islands pay {U}{B} (blue mana as any color)', () => {
    const g = build(['Island', 'Island', 'Island', 'Island', 'Island']);
    g.act(0).cast(GRELL.name, { pay: true });
    g.passAll();
    expect(activations(g)).toHaveLength(1);
    g.act(0).activate(GRELL.name, { ability: 3, pay: true });
    g.passAll();
    // The copy of the ability turns the Horror into a 2/2 for the turn.
    g.expect.pt(GRELL.name, 2, 2);
    g.expect.invariants();
  });

  test('only blue mana is spent as though it were any color: a Mountain cannot pay for {B}', () => {
    const g = build(['Island', 'Island', 'Island', 'Island', 'Mountain']);
    g.act(0).cast(GRELL.name, { pay: true });
    g.passAll();
    expect(activations(g)).toHaveLength(0);
  });

  test('an artifact of its own controller is no target: nothing is gained', () => {
    const g = build(['Island', 'Island', 'Island', 'Island', 'Island'], true);
    g.act(0).cast(GRELL.name, { pay: true });
    g.passAll();
    expect(activations(g)).toHaveLength(0);
  });

  test('the grant lasts until end of turn', () => {
    const g = build(['Island', 'Island', 'Island', 'Island', 'Island']);
    g.act(0).cast(GRELL.name, { pay: true });
    g.passAll();
    expect(g.state.continuousEffects.filter((c) => c.change.kind === 'grantAbility')).toHaveLength(
      2,
    );
    expect(
      g.state.continuousEffects.every(
        (c) => c.change.kind !== 'grantAbility' || c.until === 'endOfTurn',
      ),
    ).toBe(true);
  });
});

const ABOLETH = real('Aboleth Spawn');
const HUNTED = real('Hunted Horror');
const CENTAUR = 'Centaur';

describe("Aboleth Spawn: copy the enters ability of an opponent's creature, with new targets", () => {
  const build = (active: 0 | 1 | 2 | 3) => {
    let b = scenario({ seats: 4 }).define(ABOLETH).define(HUNTED);
    for (const s of [0, 1, 2, 3] as const) b = b.seat(s).library(...LIB);
    return b
      .seat(0)
      .battlefield(ABOLETH.name)
      .seat(1)
      .hand(HUNTED.name)
      .battlefield('Swamp', { count: 3 })
      .seat(2)
      .hand(BOLT)
      .at('precombatMain', { active, turn: 3 })
      .build();
  };
  const tokensOf = (g: { find: (q: { name: string }) => { controller: number }[] }) =>
    g.find({ name: CENTAUR }).map((t) => t.controller);

  test('the card is read as a trigger of an entering creature that copies its ability', () => {
    const text = JSON.stringify(ABOLETH.faces[0]?.abilities);
    expect(text).toContain('"kind":"entersCausesTrigger","who":"opponent"');
    expect(text).toContain('"kind":"copySpell","spell":{"kind":"triggerSubject"}');
  });

  test('an opponent casts a creature whose ability targets: the controller of Aboleth copies it and picks a new target (four seats)', () => {
    const g = build(1);
    g.act(1).cast(HUNTED.name, { pay: true });
    g.passAll();
    // The controller of the enters ability chooses its target as it goes on the stack: seat 2.
    g.act(1).chooseTargets({ player: 2 });
    // Aboleth's trigger goes on the stack after it, and its controller says whether to copy.
    g.passAll();
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    // The copy is controlled by seat 0, who chooses its new target among their opponents: seat 3.
    expect(g.state.pending?.kind).toBe('targets');
    g.act(0).chooseTargets({ player: 3 });
    g.passAll();
    // "Target opponent" of the copy is seen from its controller (seat 0): seat 3 gets two tokens, and seat 2 two from the original.
    expect(tokensOf(g).sort()).toEqual([2, 2, 3, 3]);
    g.expect.invariants();
  });

  test('declining makes no copy', () => {
    const g = build(1);
    g.act(1).cast(HUNTED.name, { pay: true });
    g.passAll();
    g.act(1).chooseTargets({ player: 2 });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    expect(tokensOf(g)).toEqual([2, 2]);
  });

  test('a creature of the controller of Aboleth is no cause', () => {
    let b = scenario({ seats: 4 }).define(ABOLETH).define(HUNTED);
    for (const s of [0, 1, 2, 3] as const) b = b.seat(s).library(...LIB);
    const g = b
      .seat(0)
      .hand(HUNTED.name)
      .battlefield('Swamp', { count: 3 })
      .battlefield(ABOLETH.name)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(HUNTED.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 2 });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    expect(tokensOf(g)).toEqual([2, 2]);
  });
});
