// The Mardu Surge deck (issue 101): the REAL Oracle text of each card (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in
// an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Group 1, Myriad granted (CR 702.116a, CR 613.1f): Legion Loyalty, Blade of Selves and Ironwill Forger.
// Group 2, tokens that are tapped and attacking (CR 508.4, 111.2): Hero of Bladehold.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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

/** The definition the grammar reads, without the check that every ability of the card was read (for a test of the abilities that were). */
function readAbilities(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES).definition;
}

const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

describe('Myriad granted (CR 702.116a, 613.1f)', () => {
  const loyalty = real('Legion Loyalty');
  const blade = real('Blade of Selves');
  const forger = real('Ironwill Forger');

  test.each([
    ['Legion Loyalty', loyalty],
    ['Blade of Selves', blade],
    ['Ironwill Forger', forger],
  ] as const)('%s is a valid card', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Legion Loyalty: creatures you control have myriad, an opponent’s do not', () => {
    const g = scenario()
      .define(loyalty)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(loyalty.name)
      .battlefield(BEARS, { label: 'ours' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('ours', { keywords: ['myriad'] });
    g.expect.derived('theirs', { keywords: [] });
  });

  test('Blade of Selves: the equipped creature has myriad, and loses it when unattached', () => {
    const g = scenario()
      .define(blade)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(blade.name, { label: 'blade', attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('bears', { keywords: ['myriad'] });
  });
});

describe('Hero of Bladehold: two tokens tapped and attacking (CR 508.4)', () => {
  const hero = real('Hero of Bladehold');

  test('the card is valid', () => {
    expect(validateCard(hero)).toEqual([]);
  });

  test('attacking creates two 1/1 white Soldier tokens that enter tapped and attacking, never declared', () => {
    const g = scenario()
      .define(hero)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(hero.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: hero.name }]);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.zone('Soldier', 'battlefield', { seat: 0, count: 2 });
    g.expect.tapped('Soldier[0]');
    g.expect.tapped('Soldier[1]');
    g.expect.combat({
      attackers: [hero.name, 'Soldier[0]', 'Soldier[1]'],
      unblocked: [hero.name, 'Soldier[0]', 'Soldier[1]'],
    });
    g.expect.invariants();
  });
});

describe('Mobilize (CR 702.181a)', () => {
  const zurgo = readAbilities('Zurgo Stormrender');
  const shield = real('Infantry Shield');

  test('Zurgo has the keyword with its number, and the engine expands it into one attack trigger', () => {
    expect(
      zurgo.faces[0]?.abilities.some(
        (a) => a.kind === 'keyword' && a.keyword.kind === 'mobilize' && a.keyword.count === 1,
      ),
    ).toBe(true);
  });

  test('an attack makes a 1/1 red Warrior tapped and attacking, sacrificed at the next end step', () => {
    const g = scenario()
      .define(zurgo)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(zurgo.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: zurgo.name }]);
    g.passAll();
    g.expect.zone('Warrior', 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped('Warrior');
    g.expect.derived('Warrior', { subtypes: ['Warrior'], colors: ['R'] });
    g.expect.combat({ attackers: [zurgo.name, 'Warrior'], unblocked: [zurgo.name, 'Warrior'] });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Warrior', 'battlefield', { count: 0 });
    g.expect.invariants();
  });

  test('Infantry Shield: the equipped creature has menace and mobilize X, X being its power', () => {
    expect(validateCard(shield)).toEqual([]);
    const g = scenario()
      .define(shield)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(shield.name, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('bears', { keywords: ['menace', 'mobilize'] });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'bears' }]);
    g.passAll();
    g.expect.zone('Warrior', 'battlefield', { seat: 0, count: 2 });
  });
});

describe('For each opponent, a token tapped and attacking (CR 508.4, 101.4)', () => {
  const adeline = real('Adeline, Resplendent Cathar');
  const ainok = real('Ainok Strike Leader');

  test.each([
    ['Adeline, Resplendent Cathar', adeline],
    ['Ainok Strike Leader', ainok],
  ] as const)('%s is a valid card', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Adeline: attacking makes a tapped and attacking 1/1 white Human for the opponent, and nothing triggers on it', () => {
    const g = scenario()
      .define(adeline)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(adeline.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: adeline.name }]);
    g.passAll();
    g.expect.zone('Human', 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped('Human');
    g.expect.pt('Human', 1, 1);
    g.expect.combat({
      attackers: [adeline.name, 'Human'],
      targets: [
        { attacker: adeline.name, target: { player: 1 } },
        { attacker: 'Human', target: { player: 1 } },
      ],
    });
    g.expect.invariants();
  });

  test('Ainok: attacking with the commander makes a Goblin, attacking with another creature does not', () => {
    const board = () =>
      scenario()
        .define(ainok)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(ainok.name, { label: 'ainok' })
        .battlefield(BEARS, { label: 'cmdr', commander: true })
        .battlefield(BEARS, { label: 'other' })
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0 })
        .build();
    const attack = (who: string) => {
      const g = board();
      g.advanceTo('declareAttackers', { attack: false });
      g.act(0).declareAttackers([{ attacker: who }]);
      g.passAll();
      return g;
    };
    attack('ainok').expect.zone('Goblin', 'battlefield', { seat: 0, count: 1 });
    attack('cmdr').expect.zone('Goblin', 'battlefield', { seat: 0, count: 1 });
    attack('other').expect.zone('Goblin', 'battlefield', { seat: 0, count: 0 });
  });

  test('Ainok: sacrificing it gives the creature tokens indestructible until end of turn, a nontoken creature does not get it', () => {
    const g = scenario()
      .define(ainok)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ainok.name, { label: 'ainok' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    // A Goblin token from the attack trigger is the token; the nontoken Bears is not given anything.
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'ainok' }]);
    g.passAll();
    g.expect.derived('Goblin', { keywords: [] });
    g.act(0).activate('ainok');
    g.passAll();
    g.expect.zone(ainok.name, 'graveyard', { seat: 0 });
    g.expect.derived('Goblin', { keywords: ['indestructible'] });
    g.expect.derived('bears', { keywords: [] });
  });
});

describe('Legion Warboss: a token that gains haste and must attack this combat (CR 508.1d, 506.1)', () => {
  const warboss = real('Legion Warboss');

  test('the card is valid', () => {
    expect(validateCard(warboss)).toEqual([]);
  });

  test('at the beginning of combat a Goblin is created with haste, and it must attack', () => {
    const g = scenario()
      .define(warboss)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(warboss.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.zone('Goblin', 'battlefield', { seat: 0, count: 1 });
    g.expect.derived('Goblin', { keywords: ['haste'] });
    g.advanceTo('declareAttackers', { attack: false });
    // The Goblin must attack (it is "if able": the engine refuses a declaration without it).
    g.expect.illegal(0, { declareAttackers: [{ attacker: warboss.name }] });
    g.expect.legal(0, { declareAttackers: [{ attacker: 'Goblin' }] });
  });
});

describe('Within Range: each opponent loses life for the creatures attacking them (CR 508.1b)', () => {
  const range = real('Within Range');

  test('the card is valid, and each attacking creature costs the opponent 1 life', () => {
    expect(validateCard(range)).toEqual([]);
    const g = scenario()
      .define(range)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(range.name)
      .battlefield(BEARS, { count: 3 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: `${BEARS}[0]` },
      { attacker: `${BEARS}[1]` },
      { attacker: `${BEARS}[2]` },
    ]);
    g.passAll();
    g.expect.life(1, 37);
  });
});

describe('Bone Devourer: counters for the creatures that died this turn (CR 614.12, 700.4)', () => {
  const devourer = real('Bone Devourer');

  test('the card is valid', () => {
    expect(validateCard(devourer)).toEqual([]);
  });

  test('it enters with a +1/+1 counter for each creature that died this turn, any player’s included', () => {
    const board = () =>
      scenario()
        .define(devourer)
        .seat(0)
        .library(...LIBRARY)
        .hand(devourer.name, 'Lightning Bolt', 'Lightning Bolt')
        .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Mountain', 'Mountain')
        .battlefield(BEARS, { label: 'mine' })
        .seat(1)
        .library(...LIBRARY)
        .battlefield(BEARS, { label: 'theirs' })
        .at('precombatMain', { active: 0 })
        .build();
    const quiet = board();
    quiet.act(0).cast(devourer.name, { pay: true });
    quiet.passAll();
    quiet.expect.zone(devourer.name, 'battlefield', { seat: 0 });
    quiet.expect.counters(devourer.name, {});

    const g = board();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['theirs'], pay: true });
    g.passAll();
    g.act(0).cast(devourer.name, { pay: true });
    g.passAll();
    g.expect.counters(devourer.name, { '+1/+1': 2 });
    g.expect.invariants();
  });
});
