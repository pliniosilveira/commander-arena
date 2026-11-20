// The Food and Fellowship deck (Tales of Middle-earth Commander), group B, Food and tokens: the REAL cards of the golden corpus (Farmer Cotton, Rosie Cotton of South Lane, Merry and
// Pippin, Warden of Isengard, Sam, Loyal Attendant, Motivated Pony) read through the grammar only and played through applyAction. Stand-ins are real engine cards or SYNTHETIC (named so).
// Pins: CR 111.2 and 111.10b (tokens, the Food token), CR 603.2c (one trigger for the permanents of one event), CR 603.4 (the "if" of a trigger), CR 601.2f and 602.2b (a
// reduction of the generic mana of an activated ability), CR 611.2c and 613.4c (the group an effect names as it resolves, an additional +2/+2), CR 400.7 (the turn log).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';

const FARMER = real('Farmer Cotton');
const ROSIE = real('Rosie Cotton of South Lane');
const MERRY = real('Merry, Warden of Isengard');
const PIPPIN = real('Pippin, Warden of Isengard');
const SAM = real('Sam, Loyal Attendant');
const PONY = real('Motivated Pony');

const count = (g: ScenarioGame, name: string) => g.find({ name }).length;

/** SYNTHETIC: an artifact that makes Foods for free, as the scenarios have no way to put a token onto the battlefield. */
const FOOD_SOURCE = parsed(
  'SYNTHETIC Food Source',
  'Artifact',
  '{0}: Create a Food token.\n{0}: Create four Food tokens.',
  { manaCost: '{0}' },
);

/** SYNTHETIC: an artifact that makes a Clue, an artifact token that is not a Food. */
const CLUE_SOURCE = parsed('SYNTHETIC Clue Source', 'Artifact', '{0}: Create a Clue token.', {
  manaCost: '{0}',
});

/** Activates the free ability of the SYNTHETIC Food Source and lets it resolve. */
function makeFood(g: ScenarioGame, ability: 0 | 1 = 0): void {
  g.act(0).activate(FOOD_SOURCE.name, { ability, pay: true });
  g.passAll();
}

/** The view of a permanent: its power and toughness now. */
const ptOf = (g: ScenarioGame, name: string, nth = 0) => {
  const o = getView(g.state, 0).battlefield.filter((p) => p.name === name)[nth];
  return o === undefined ? undefined : [o.power, o.toughness];
};

describe('Farmer Cotton ("create X 1/1 white Halfling creature tokens and X Food tokens")', () => {
  test('read as two token instructions of X each, one for the Halflings and one for the Foods', () => {
    expect(FARMER.faces[0]?.abilities).toMatchObject([
      {
        kind: 'triggered',
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'createToken',
              token: { kind: 'custom', definition: { name: 'Halfling', power: 1, toughness: 1 } },
            },
            { kind: 'createToken', token: { kind: 'preset', preset: 'Food' } },
          ],
        },
      },
    ]);
  });

  test.each([
    [3, 3],
    [1, 1],
    [0, 0],
  ])('cast for X = %i it makes %i Halflings and %i Foods', (x, n) => {
    const g = scenario()
      .define(FARMER)
      .seat(0)
      .hand(FARMER.name)
      .battlefield('Forest', 'Plains', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(FARMER.name, { x, pay: true });
    g.passAll();
    g.passAll();
    expect(count(g, 'Halfling')).toBe(n);
    expect(count(g, 'Food')).toBe(n);
    g.expect.invariants();
  });
});

describe('Rosie Cotton of South Lane ("Whenever you create a token, put a +1/+1 counter on target creature you control other than Rosie Cotton")', () => {
  const game = (...others: string[]) =>
    scenario()
      .define(ROSIE)
      .seat(0)
      .hand(ROSIE.name)
      .battlefield('Plains', 'Plains', 'Plains', ...others)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('her own Food makes the counter go on another creature, never on her', () => {
    const g = game(BEARS);
    g.act(0).cast(ROSIE.name, { pay: true });
    g.passAll();
    // Her enters trigger makes a Food; that is a token created, so the second ability triggers and targets Grizzly Bears (the only creature but her).
    g.passAll();
    expect(count(g, 'Food')).toBe(1);
    g.expect.counters(BEARS, { '+1/+1': 1 });
    g.expect.counters(ROSIE.name, {});
    g.expect.invariants();
  });

  test('with no other creature the trigger has no target and nothing gets a counter', () => {
    const g = game();
    g.act(0).cast(ROSIE.name, { pay: true });
    g.passAll();
    g.passAll();
    expect(count(g, 'Food')).toBe(1);
    g.expect.counters(ROSIE.name, {});
    g.expect.invariants();
  });
});

describe('Merry, Warden of Isengard ("Whenever one or more artifacts you control enter, create a 1/1 white Soldier creature token with lifelink. This ability triggers only once each turn.")', () => {
  const MAKER = parsed(
    'SYNTHETIC Food Maker',
    'Creature — Halfling',
    '{T}: Create two Food tokens.\n{1}: Create a Food token.',
    { manaCost: '{1}', power: '1', toughness: '1' },
  );

  const game = () =>
    scenario()
      .define(MERRY)
      .define(MAKER)
      .seat(0)
      .battlefield(MERRY.name, MAKER.name, 'Plains', 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('two Foods created together are one event: one Soldier with lifelink', () => {
    const g = game();
    g.act(0).activate(MAKER.name, { ability: 0, pay: true });
    g.passAll();
    g.passAll();
    expect(count(g, 'Food')).toBe(2);
    expect(count(g, 'Soldier')).toBe(1);
    expect(ptOf(g, 'Soldier')).toEqual([1, 1]);
    g.expect.derived('Soldier', { keywords: ['lifelink'] });
    g.expect.invariants();
  });

  test('only once each turn: a second batch of artifacts in the same turn makes no second Soldier', () => {
    const g = game();
    g.act(0).activate(MAKER.name, { ability: 1, pay: true });
    g.passAll();
    g.passAll();
    expect(count(g, 'Soldier')).toBe(1);
    g.act(0).activate(MAKER.name, { ability: 1, pay: true });
    g.passAll();
    g.passAll();
    expect(count(g, 'Food')).toBe(2);
    expect(count(g, 'Soldier')).toBe(1);
  });

  test('a creature token entering is not an artifact entering', () => {
    const g = scenario()
      .define(MERRY)
      .define(FARMER)
      .seat(0)
      .hand(FARMER.name)
      .battlefield(MERRY.name, 'Forest', 'Plains', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(FARMER.name, { x: 1, pay: true });
    g.passAll();
    g.passAll();
    g.passAll();
    // The Halfling is not an artifact; the one Food is: one Soldier.
    expect(count(g, 'Halfling')).toBe(1);
    expect(count(g, 'Food')).toBe(1);
    expect(count(g, 'Soldier')).toBe(1);
  });

  test('Partner with Pippin: when Merry enters, the player may put Pippin from the library into their hand', () => {
    expect(MERRY.faces[0]?.abilities[0]).toEqual({
      kind: 'keyword',
      keyword: { kind: 'partnerWith', name: 'Pippin, Warden of Isengard' },
    });
  });
});

describe('Pippin, Warden of Isengard ("{1}, {T}: Create a Food token." and "{T}, Sacrifice four Foods: Other creatures you control get +3/+3 and gain haste until end of turn. Activate only as a sorcery.")', () => {
  const base = (step: 'precombatMain' | 'beginningOfCombat' = 'precombatMain') =>
    scenario()
      .define(PIPPIN)
      .define(FOOD_SOURCE)
      .seat(0)
      .battlefield(PIPPIN.name, BEARS, FOOD_SOURCE.name, 'Island', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at(step, { active: 0, turn: 3 })
      .build();

  test('the first ability makes a Food', () => {
    const g = base();
    g.act(0).activate(PIPPIN.name, { ability: 1, pay: true });
    g.passAll();
    expect(count(g, 'Food')).toBe(1);
  });

  test('sacrificing four Foods gives the other creatures +3/+3 and haste, not Pippin', () => {
    const g = base();
    makeFood(g, 1);
    expect(count(g, 'Food')).toBe(4);
    g.expect.legal(0, { activate: PIPPIN.name, ability: 2 });
    g.act(0).activate(PIPPIN.name, { ability: 2, pay: true });
    g.passAll();
    expect(count(g, 'Food')).toBe(0);
    expect(ptOf(g, BEARS)).toEqual([5, 5]);
    expect(ptOf(g, PIPPIN.name)).toEqual([2, 2]);
    g.expect.derived(BEARS, { keywords: ['haste'] });
    g.expect.invariants();
  });

  test('three Foods are not enough, and four are not enough outside a main phase (sorcery speed)', () => {
    const three = base();
    makeFood(three);
    makeFood(three);
    makeFood(three);
    expect(count(three, 'Food')).toBe(3);
    three.expect.illegal(0, { activate: PIPPIN.name, ability: 2 });
    const combat = base('beginningOfCombat');
    makeFood(combat, 1);
    expect(count(combat, 'Food')).toBe(4);
    combat.expect.illegal(0, { activate: PIPPIN.name, ability: 2 });
  });
});

describe('Sam, Loyal Attendant ("Activated abilities of Foods you control cost {1} less to activate.")', () => {
  test('read as a trigger of the beginning of combat and a reduction of the abilities of your Foods', () => {
    expect(SAM.faces[0]?.abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered', 'static']);
    expect(SAM.faces[0]?.abilities[2]).toMatchObject({
      kind: 'static',
      static: {
        kind: 'abilityCostReduction',
        abilities: 'ofObjects',
        objects: { zone: 'battlefield', subtypes: ['Food'], controller: 'you' },
        amount: 1,
      },
    });
  });

  const game = (withSam: boolean) =>
    scenario()
      .define(SAM)
      .define(FOOD_SOURCE)
      .seat(0)
      .battlefield(FOOD_SOURCE.name, 'Plains', ...(withSam ? [SAM.name] : []))
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('your Food is eaten for {1}, with one Plains', () => {
    const g = game(true);
    makeFood(g);
    g.expect.legal(0, { activate: { name: 'Food', seat: 0 } });
    g.act(0).activate({ name: 'Food', seat: 0 }, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
    g.expect.tapped('Plains', true);
    g.expect.invariants();
  });

  test('only Foods: a Clue keeps its cost of {2} with Sam on the battlefield', () => {
    const g = scenario()
      .define(SAM)
      .define(CLUE_SOURCE)
      .seat(0)
      .battlefield(CLUE_SOURCE.name, SAM.name, 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(CLUE_SOURCE.name, { pay: true });
    g.passAll();
    g.expect.illegal(0, { activate: { name: 'Clue', seat: 0 } });
  });

  test('without Sam the same Food needs {2}, which one Plains cannot pay', () => {
    const g = game(false);
    makeFood(g);
    g.expect.illegal(0, { activate: { name: 'Food', seat: 0 } });
  });

  test('only the Foods you control: the opponent of Sam keeps the cost of {2}', () => {
    const g = scenario()
      .define(SAM)
      .define(FOOD_SOURCE)
      .seat(0)
      .battlefield(SAM.name, 'Plains')
      .library(...FILLER)
      .seat(1)
      .battlefield(FOOD_SOURCE.name, 'Plains')
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    g.act(1).activate(FOOD_SOURCE.name, { ability: 0, pay: true });
    g.passAll();
    g.expect.illegal(1, { activate: { name: 'Food', seat: 1 } });
  });

  test('the beginning of combat on your turn makes a Food', () => {
    const g = scenario()
      .define(SAM)
      .seat(0)
      .battlefield(SAM.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.passAll();
    expect(count(g, 'Food')).toBe(1);
  });
});

describe('Motivated Pony ("attacking creatures get +1/+1 until end of turn. If a Food entered the battlefield under your control this turn, untap those creatures and they get an additional +2/+2")', () => {
  const game = () =>
    scenario()
      .define(PONY)
      .define(FOOD_SOURCE)
      .seat(0)
      .battlefield(PONY.name, BEARS, FOOD_SOURCE.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('with no Food entered this turn the attackers get +1/+1 and stay tapped', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack([PONY.name, BEARS]);
    g.passAll();
    expect(ptOf(g, PONY.name)).toEqual([4, 4]);
    expect(ptOf(g, BEARS)).toEqual([3, 3]);
    g.expect.tapped(BEARS, true);
    g.expect.invariants();
  });

  test('a Clue entering is not a Food entering: no untap and no additional +2/+2', () => {
    const g = scenario()
      .define(PONY)
      .define(CLUE_SOURCE)
      .seat(0)
      .battlefield(PONY.name, BEARS, CLUE_SOURCE.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(CLUE_SOURCE.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack([PONY.name, BEARS]);
    g.passAll();
    expect(ptOf(g, BEARS)).toEqual([3, 3]);
    g.expect.tapped(BEARS, true);
  });

  test('with a Food that entered this turn they are untapped and get another +2/+2', () => {
    const g = game();
    makeFood(g);
    expect(count(g, 'Food')).toBe(1);
    g.advanceTo('declareAttackers');
    g.act(0).attack([PONY.name, BEARS]);
    g.passAll();
    expect(ptOf(g, PONY.name)).toEqual([6, 6]);
    expect(ptOf(g, BEARS)).toEqual([5, 5]);
    g.expect.tapped(BEARS, false);
    g.expect.tapped(PONY.name, false);
    g.expect.invariants();
  });
});
