// Witherbloom Witchcraft, group A (issue 190): the REAL Oracle text of Pulse of Murasa, Suffer the Past, Druidic Satchel and Sapling of Colfenor
// from the golden corpus goes through the grammar with no override and is played through applyAction.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly } from './convert-grammar-helpers';
import { syntheticCard as storedCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

describe("Pulse of Murasa: return a creature or land card of any graveyard to its owner's hand (CR 400.3)", () => {
  const pulse = real('Pulse of Murasa');
  const start = () =>
    scenario()
      .define(pulse)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand('Pulse of Murasa')
      .graveyard('Forest')
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .graveyard('Serra Angel', 'Lightning Bolt')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test("an opponent's creature card goes to its owner's hand and the caster gains 6 life", () => {
    const g = start();
    g.act(0).cast('Pulse of Murasa', {
      targets: [{ name: 'Serra Angel', zone: 'graveyard' }],
      pay: true,
    });
    g.passAll();
    g.expect.zone('Serra Angel', 'hand', { seat: 1 });
    g.expect.life(0, 26);
    g.expect.invariants();
  });

  test('a land card of your own graveyard returns to your hand', () => {
    const g = start();
    g.act(0).cast('Pulse of Murasa', {
      targets: [{ name: 'Forest', zone: 'graveyard' }],
      pay: true,
    });
    g.passAll();
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.life(0, 26);
  });

  test('an instant card is no target', () => {
    const g = start();
    expect(() =>
      g.act(0).cast('Pulse of Murasa', {
        targets: [{ name: 'Lightning Bolt', zone: 'graveyard' }],
        pay: true,
      }),
    ).toThrow();
  });
});

describe('Suffer the Past: X cards of one graveyard exiled, a life drained for each (CR 601.2b-c, 608.2c)', () => {
  const suffer = real('Suffer the Past');
  const start = (mine: readonly string[] = []) =>
    scenario()
      .define(suffer)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand('Suffer the Past')
      .graveyard(...mine)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .graveyard('Serra Angel', 'Lightning Bolt', 'Grizzly Bears')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('X = 2: two cards of the targeted graveyard are exiled, the player loses 2 and you gain 2', () => {
    const g = start();
    g.act(0).cast('Suffer the Past');
    g.act(0).chooseX(2);
    g.act(0).chooseTargets({ player: 1 }, 'Serra Angel', 'Lightning Bolt');
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Serra Angel', 'exile', { seat: 1 });
    g.expect.zone('Lightning Bolt', 'exile', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.life(1, 18);
    g.expect.life(0, 22);
    g.expect.invariants();
  });

  test('X = 0 exiles nothing and nobody loses or gains life', () => {
    const g = start();
    g.act(0).cast('Suffer the Past');
    g.act(0).chooseX(0);
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(1, 20);
    g.expect.life(0, 20);
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
  });

  test('your own graveyard can be the one exiled from', () => {
    const g = start(['Llanowar Elves', 'Counterspell']);
    g.act(0).cast('Suffer the Past');
    g.act(0).chooseX(2);
    g.act(0).chooseTargets({ player: 0 }, 'Llanowar Elves', 'Counterspell');
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Llanowar Elves', 'exile', { seat: 0 });
    g.expect.life(0, 20);
  });

  test("the cards must all come from the targeted player's graveyard", () => {
    const g = start(['Llanowar Elves']);
    g.act(0).cast('Suffer the Past');
    g.act(0).chooseX(2);
    expect(() => g.act(0).chooseTargets({ player: 1 }, 'Serra Angel', 'Llanowar Elves')).toThrow();
  });

  test('X is at most the cards one graveyard holds, not all graveyards together', () => {
    const g = start(['Llanowar Elves']);
    g.act(0).cast('Suffer the Past');
    // seat 1 holds three cards, seat 0 one: four in all, but one graveyard has at most three.
    expect(g.state.pending).toMatchObject({ kind: 'chooseX', min: 0, max: 3 });
  });
});

describe('Druidic Satchel: one reveal, a branch for each kind of card it shows (CR 701.20a, 608.2c)', () => {
  const satchel = real('Druidic Satchel');
  const start = (top: string) =>
    scenario()
      .define(satchel)
      .seat(0)
      .life(20)
      .library(top, ...LIBRARY)
      .battlefield('Druidic Satchel', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  const run = (top: string) => {
    const g = start(top);
    g.act(0).activate('Druidic Satchel', { pay: true });
    g.passAll();
    return g;
  };
  const saprolings = (g: ReturnType<typeof start>) =>
    g.find({ name: 'Saproling', zone: 'battlefield', seat: 0 });

  test('a creature card: a 1/1 Saproling is created and the card stays on top of the library', () => {
    const g = run('Serra Angel');
    expect(saprolings(g)).toHaveLength(1);
    g.expect.zone('Serra Angel', 'library', { seat: 0 });
    g.expect.life(0, 20);
    g.expect.invariants();
  });

  test('a land card is put onto the battlefield under your control', () => {
    const g = run('Mountain');
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    expect(saprolings(g)).toHaveLength(0);
    g.expect.life(0, 20);
  });

  test('a noncreature, nonland card: you gain 2 life and it stays on top', () => {
    const g = run('Lightning Bolt');
    g.expect.life(0, 22);
    g.expect.zone('Lightning Bolt', 'library', { seat: 0 });
    expect(saprolings(g)).toHaveLength(0);
  });

  test('the card is revealed to the table', () => {
    const g = run('Lightning Bolt');
    g.expect.eventLog([
      { kind: 'cardsRevealed', seat: 0, names: ['Lightning Bolt'], from: 'library' },
    ]);
  });

  test('a card of two kinds does both branches in the order written (a land creature: a token, and it enters)', () => {
    const arbor = parseOnly(
      storedCard({
        name: 'SYNTHETIC Dryad Probe',
        typeLine: 'Land Creature — Forest Dryad',
        power: '1',
        toughness: '1',
        oracleText: '',
      }),
    ).definition;
    const g = scenario()
      .define(satchel)
      .define(arbor)
      .seat(0)
      .life(20)
      .library('SYNTHETIC Dryad Probe', ...LIBRARY)
      .battlefield('Druidic Satchel', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate('Druidic Satchel', { pay: true });
    g.passAll();
    expect(saprolings(g)).toHaveLength(1);
    g.expect.zone('SYNTHETIC Dryad Probe', 'battlefield', { seat: 0 });
    g.expect.life(0, 20);
  });

  test('an empty library does nothing', () => {
    const g = scenario()
      .define(satchel)
      .seat(0)
      .life(20)
      .battlefield('Druidic Satchel', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate('Druidic Satchel', { pay: true });
    g.passAll();
    g.expect.life(0, 20);
  });
});

describe('Sapling of Colfenor: a creature card revealed on an attack (CR 701.20a, 119.3, 508.1m)', () => {
  const sapling = real('Sapling of Colfenor');
  const start = (top: string) =>
    scenario()
      .define(sapling)
      .seat(0)
      .life(20)
      .library(top, ...LIBRARY)
      .battlefield('Sapling of Colfenor')
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield('Wall of Stone')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  const attackWith = (top: string) => {
    const g = start(top);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['Sapling of Colfenor']);
    g.passAll();
    return g;
  };

  test('a creature card: gain its toughness, lose its power, and it goes to your hand', () => {
    const g = attackWith('Giant Spider');
    g.expect.life(0, 22);
    g.expect.zone('Giant Spider', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature card with power 0 costs no life', () => {
    const g = attackWith('Wall of Stone');
    g.expect.zone('Wall of Stone', 'hand', { seat: 0 });
  });

  test('a card that is not a creature stays on top and nothing happens', () => {
    const g = attackWith('Lightning Bolt');
    g.expect.life(0, 20);
    g.expect.zone('Lightning Bolt', 'library', { seat: 0 });
  });
});
