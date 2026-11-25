// The Sauron deck, Goblin and Orc group: the REAL Oracle text of Assault on Osgiliath, Uglúk of the White Hand and Gorbag of Minas Morgul (the corpus's golden.jsonl) goes through the
// grammar as a card with no override, is defined in an engine scenario and is played through applyAction. Pins: CR 205.3m (creature types), CR 611.2c (a continuous effect of a
// resolving spell affects the permanents there when it resolves), CR 701.47a (amass), CR 603.10a (a "dies" trigger looks back), CR 113.7a (last-known information), CR 603.12 (a
// reflexive triggered ability), CR 603.3c and 700.2b (the modes of a modal triggered ability are chosen as it goes on the stack), CR 701.21a (sacrifice), CR 510.2 (combat damage).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

const GOBLIN = 'SYNTHETIC Goblin Raider';
const goblin = parsed(GOBLIN, 'Creature — Goblin', '', {
  manaCost: '{R}',
  power: '1',
  toughness: '1',
});
const ORC = 'SYNTHETIC Orc Raider';
const orc = parsed(ORC, 'Creature — Orc', '', { manaCost: '{B}', power: '1', toughness: '1' });
const ELF = 'SYNTHETIC Elf Scout';
const elf = parsed(ELF, 'Creature — Elf', '', { manaCost: '{G}', power: '1', toughness: '1' });

const assault = real('Assault on Osgiliath');
const ugluk = real('Uglúk of the White Hand');
const gorbag = real('Gorbag of Minas Morgul');

describe('the three cards are valid', () => {
  test.each([
    ['Assault on Osgiliath', assault],
    ['Uglúk of the White Hand', ugluk],
    ['Gorbag of Minas Morgul', gorbag],
  ] as const)('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Assault on Osgiliath', () => {
  const board = (seats = 2) => {
    const b = scenario({ seats })
      .define(assault)
      .define(goblin)
      .define(orc)
      .define(elf)
      .seat(0)
      .library(...LIBRARY)
      .hand(assault.name, GOBLIN)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(GOBLIN, { label: 'mine' })
      .battlefield(ORC, ELF, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(GOBLIN, { label: 'theirs' });
    return (
      seats > 2
        ? b
            .seat(2)
            .library(...LIBRARY)
            .battlefield(ORC, { label: 'third' })
        : b
    )
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('amass Orcs X first, then the Goblins and Orcs of the controller gain double strike and haste (the new Army too)', () => {
    const g = board();
    g.act(0).cast(assault.name, { pay: true, x: 2 });
    g.passAll();
    g.expect.derived('mine', { keywords: ['doubleStrike', 'haste'] });
    g.expect.derived(ORC, { keywords: ['doubleStrike', 'haste'] });
    // The Army token the amass made is an Orc when the effect is worked out, so it gains them too (CR 701.47a, 611.2c).
    g.expect.pt('Orc Army', 2, 2);
    g.expect.derived('Orc Army', { keywords: ['doubleStrike', 'haste'] });
    g.expect.invariants();
  });

  test('other creatures, and the Goblins and Orcs of other players, gain nothing', () => {
    const g = board(3);
    g.act(0).cast(assault.name, { pay: true, x: 1 });
    g.passAll();
    for (const name of [ELF, BEARS]) {
      g.expect.derived(name, { keywords: [] });
    }
    g.expect.derived('theirs', { keywords: [] });
    g.expect.derived('third', { keywords: [] });
  });

  test('the group is fixed as the effect resolves: a Goblin that arrives later gains nothing (CR 611.2c)', () => {
    const g = board();
    g.act(0).cast(assault.name, { pay: true, x: 1 });
    g.passAll();
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.derived('mine', { keywords: ['doubleStrike', 'haste'] });
    g.expect.derived({ name: GOBLIN, seat: 0, zone: 'battlefield', nth: 1 }, { keywords: [] });
  });

  test('X = 0 with no Army makes a 0/0 Army that dies, and the others still gain the keywords', () => {
    const g = board();
    g.act(0).cast(assault.name, { pay: true, x: 0 });
    g.passAll();
    g.expect.zone('Orc Army', 'battlefield', { seat: 0, count: 0 });
    g.expect.derived('mine', { keywords: ['doubleStrike', 'haste'] });
    g.expect.invariants();
  });
});

describe('Uglúk of the White Hand', () => {
  const board = (seats = 2) => {
    const b = scenario({ seats })
      .define(ugluk)
      .define(goblin)
      .define(orc)
      .define(elf)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, BOLT, BOLT, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(ugluk.name, { label: 'ugluk' })
      .battlefield(GOBLIN, { label: 'goblin' })
      .battlefield(ORC, { label: 'orc' })
      .battlefield(ELF, { label: 'elf' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(GOBLIN, { label: 'theirs' });
    return (seats > 2 ? b.seat(2).library(...LIBRARY) : b)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('another creature of yours that is not a Goblin or Orc dies: one +1/+1 counter', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['elf'], pay: true });
    g.passAll();
    g.expect.counters('ugluk', { '+1/+1': 1 });
    g.expect.pt(ugluk.name, 4, 4);
    g.expect.invariants();
  });

  test('a Goblin of yours dies: two counters instead, from its last-known creature types (CR 603.10a, 113.7a)', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['goblin'], pay: true });
    g.passAll();
    g.expect.counters('ugluk', { '+1/+1': 2 });
    g.expect.pt(ugluk.name, 5, 5);
  });

  test('an Orc of yours dies: two counters', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['orc'], pay: true });
    g.passAll();
    g.expect.counters('ugluk', { '+1/+1': 2 });
  });

  test('a Goblin of an opponent dies: nothing (the trigger is about creatures you control)', () => {
    const g = board(3);
    g.act(0).cast(`${BOLT}[0]`, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.counters('ugluk', {});
  });

  test('two creatures dying one after the other add up', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['elf'], pay: true });
    g.passAll();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['goblin'], pay: true });
    g.passAll();
    g.expect.counters('ugluk', { '+1/+1': 3 });
    g.expect.invariants();
  });
});

describe('Gorbag of Minas Morgul', () => {
  const board = (seats = 2) => {
    const b = scenario({ seats })
      .define(gorbag)
      .define(goblin)
      .define(elf)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(gorbag.name, { label: 'gorbag' })
      .battlefield(GOBLIN, { label: 'goblin' })
      .battlefield(ELF, { label: 'elf' })
      .seat(1)
      .library(...LIBRARY);
    return (seats > 2 ? b.seat(2).library(...LIBRARY) : b)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('the modes are not chosen when the first ability triggers: accept the sacrifice, then choose to draw a card', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(gorbag.name);
    g.advanceTo('combatDamage', { attack: false });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    // The Orc is sacrificed as the first ability resolves; the reflexive ability then goes on the stack and its mode is chosen (CR 603.12, 603.3c).
    g.expect.zone(gorbag.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(0);
    g.passAll();
    g.expect.zone('Swamp', 'hand', { seat: 0, count: 1 });
    g.expect.life(1, 38);
    g.expect.invariants();
  });

  test('the second mode creates a Treasure token', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(GOBLIN);
    g.advanceTo('combatDamage', { attack: false });
    g.passAll();
    g.act(0).accept();
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0, count: 1 });
    g.act(0).chooseModes(1);
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Swamp', 'hand', { seat: 0, count: 0 });
  });

  test('declining the sacrifice creates nothing: no modes, no reflexive ability', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(GOBLIN);
    g.advanceTo('combatDamage', { attack: false });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(GOBLIN, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 0 });
    g.expect.zone('Swamp', 'hand', { seat: 0, count: 0 });
    g.expect.pending('priority');
  });

  test('a creature that is not a Goblin or Orc does not trigger it', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(ELF);
    g.advanceTo('combatDamage', { attack: false });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.pending('priority');
    g.expect.zone(ELF, 'battlefield', { seat: 0, count: 1 });
  });

  test('with three seats the Goblin hits the chosen opponent and the sacrifice and the mode work the same', () => {
    const g = board(3);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(GOBLIN, { player: 2 });
    g.advanceTo('combatDamage', { attack: false });
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseModes(0);
    g.passAll();
    g.expect.life(2, 39);
    g.expect.life(1, 40);
    g.expect.zone('Swamp', 'hand', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});
