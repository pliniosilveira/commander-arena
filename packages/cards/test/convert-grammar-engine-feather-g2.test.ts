// The Feather deck (issue 27), group 2 (D-443 to D-448): the REAL Oracle text of Bastion Protector, Fall of the Hammer, Reckless Rage, Giggling Skitterspike, Light the Way and Hall of
// Oracles (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the
// nodes the parser writes for the real text are what the engine runs. The abilities and the spell of each real card are also the ones of its SYNTHETIC sibling of the engine fixtures
// (`synthetic-feather-g2.ts`), which the engine tests and the AI soak play. Pins: CR 903.3 (commanders), CR 115.3 (another target), CR 120.3 (damage by a creature), CR 701.37
// (monstrosity), CR 603.2c (an ability for each event), CR 700.2 (modes), CR 602.5b and 602.5d (restrictions on activating).
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

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const bastion = real('Bastion Protector');
const hammer = real('Fall of the Hammer');
const rage = real('Reckless Rage');
const skitterspike = real('Giggling Skitterspike');
const way = real('Light the Way');
const hall = real('Hall of Oracles');

describe('every card is valid and has the AST of its SYNTHETIC sibling', () => {
  test.each([
    ['Bastion Protector', bastion, 'SYNTHETIC Commander Guard'],
    ['Fall of the Hammer', hammer, 'SYNTHETIC Hammer Blow'],
    ['Reckless Rage', rage, 'SYNTHETIC Twin Strike'],
    ['Giggling Skitterspike', skitterspike, 'SYNTHETIC Spike Toy'],
    ['Light the Way', way, 'SYNTHETIC Way Light'],
    ['Hall of Oracles', hall, 'SYNTHETIC Oracle Hall'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    const face = card.faces[0];
    const twin = syntheticCard(sibling).faces[0];
    expect(face?.abilities).toEqual(twin?.abilities);
    expect(face?.spell).toEqual(twin?.spell);
  });
});

describe('Bastion Protector', () => {
  test('commander creatures you control get +2/+2 and have indestructible: Lightning Bolt does not kill the commander', () => {
    const g = scenario()
      .define(bastion)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(bastion.name)
      .battlefield(BEARS, { commander: true, label: 'commander' })
      .battlefield(SPIDER, { label: 'other' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt('commander', 4, 4);
    g.expect.derived('commander', { keywords: ['indestructible'] });
    g.expect.pt('other', 2, 4);
    g.expect.pt(bastion.name, 3, 3);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['commander'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.damage('commander', 3);
    g.expect.invariants();
  });
});

describe('Fall of the Hammer', () => {
  test('the creature you control deals damage equal to its power to another target creature; it takes none', () => {
    const board = () =>
      scenario()
        .define(hammer)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(SPIDER, { label: 'mine' })
        .battlefield('Mountain', 'Mountain')
        .hand(hammer.name)
        .seat(1)
        .library(...LIBRARY)
        .battlefield(BEARS, { label: 'theirs' })
        .at('precombatMain', { active: 0 })
        .build();
    expect(() =>
      board()
        .act(0)
        .cast(hammer.name, { targets: ['mine', 'mine'], pay: true }),
    ).toThrow();
    const g = board();
    g.act(0).cast(hammer.name, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.damage('mine', 0);
    g.expect.invariants();
  });
});

describe('Reckless Rage', () => {
  test("4 damage to the creature you don't control, 2 damage to the creature you control", () => {
    const g = scenario()
      .define(rage)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'mine' })
      .battlefield('Mountain')
      .hand(rage.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(rage.name, { targets: ['theirs', 'mine'], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Giggling Skitterspike', () => {
  test('attacks: damage equal to its power to each opponent; monstrosity makes it 6/6 and the next attack deals 6', () => {
    const g = scenario()
      .define(skitterspike)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(skitterspike.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .life(40)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(skitterspike.name, { pay: true });
    g.passAll();
    g.expect.counters(skitterspike.name, { '+1/+1': 5 });
    expect(g.object(skitterspike.name).monstrous).toBe(true);
    g.playCombat({ attack: [skitterspike.name], until: 'declareBlockers' });
    g.passAll();
    // 6 from the trigger, 6 from combat damage.
    g.expect.life(1, 28);
    g.expect.invariants();
  });

  test('becomes the target of a spell: it deals damage equal to its power to each opponent', () => {
    const g = scenario()
      .define(skitterspike)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(skitterspike.name)
      .seat(1)
      .life(40)
      .library(...LIBRARY)
      .battlefield('Mountain', 'Swamp', 'Swamp', 'Swamp')
      .hand(BOLT, MURDER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [skitterspike.name], pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.zone(skitterspike.name, 'battlefield', { seat: 0 });
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [skitterspike.name], pay: true });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.zone(skitterspike.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('blocks: damage to the opponent of its controller', () => {
    const g = scenario()
      .define(skitterspike)
      .seat(0)
      .life(40)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(skitterspike.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: skitterspike.name, attacker: BEARS }],
      until: 'declareBlockers',
    });
    g.passAll();
    g.expect.life(0, 39);
  });
});

describe('Light the Way', () => {
  test('mode 1: a +1/+1 counter on a creature, then untap it; mode 2: return a permanent you control', () => {
    const g = scenario()
      .define(way)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { tapped: true, label: 'bears' })
      .battlefield(ELVES, { label: 'elves' })
      .battlefield('Plains', 'Plains')
      .hand(way.name, way.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(`${way.name}[0]`, { modes: [0], targets: ['bears'], pay: true });
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 1 });
    g.expect.tapped('bears', false);
    g.act(0).cast(`${way.name}[0]`, { modes: [1], targets: ['elves'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'hand', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Hall of Oracles', () => {
  test('the counter ability: only as a sorcery and only after an instant or sorcery spell this turn; it also taps for {C} and for any color', () => {
    const g = scenario()
      .define(hall)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield(hall.name)
      .battlefield(ELVES, { label: 'elves' })
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { activate: hall.name });
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.illegal(0, { activate: hall.name });
    g.passAll();
    g.expect.legal(0, { activate: hall.name });
    g.act(0).activate(hall.name, { targets: ['elves'] });
    g.passAll();
    g.expect.counters('elves', { '+1/+1': 1 });
    g.expect.invariants();
  });
});
