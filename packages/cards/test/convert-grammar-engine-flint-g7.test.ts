// Flint deck (issue 685), group 7: Rakdos, Patron of Chaos, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "At the beginning of your end step, target opponent may sacrifice two nonland, nontoken permanents of their choice. If they don't, you draw two cards." (CR 608.2d, 101.4, 701.21a):
// the opponent asked is the one targeted, they choose what they sacrifice, and "you" in the sentence after "if they don't" is the controller of Rakdos.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const RAKDOS = real('Rakdos, Patron of Chaos');
const BEARS = 'Grizzly Bears';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const hand = (g: ScenarioGame, seat: 0 | 1 | 2) => g.state.seats[seat]?.hand.length ?? 0;

describe('Rakdos, Patron of Chaos (CR 608.2d, 101.4, 701.21a)', () => {
  test('is valid', () => {
    expect(validateCard(RAKDOS)).toEqual([]);
  });

  const start = () =>
    scenario({ seats: 3 })
      .define(RAKDOS)
      .seat(0)
      .library(...FILLER)
      .battlefield(RAKDOS.name)
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(BEARS, { label: 'b' })
      .battlefield('Forest', { label: 'land' })
      .seat(2)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'c' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const toEndStep = (g: ScenarioGame) => {
    g.advanceTo('end');
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets({ player: 1 });
  };

  test('an opponent who declines gives the controller two cards, and sacrifices nothing', () => {
    const g = start();
    toEndStep(g);
    g.passAll();
    g.act(1).decline();
    g.passAll();
    expect(hand(g, 0)).toBe(2);
    g.expect.zone(BEARS, 'battlefield', { seat: 1, count: 2 });
  });

  test('an opponent who accepts sacrifices two nonland permanents of their choice, and the controller draws nothing', () => {
    const g = start();
    toEndStep(g);
    g.passAll();
    g.act(1).accept();
    // The two nonland permanents are chosen by the opponent (the land cannot be picked).
    for (let i = 0; i < 4 && g.state.pending?.kind !== 'priority'; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'choosePermanent') g.act(1).choosePermanents(...d.legal.slice(0, 2));
      else break;
    }
    g.passAll();
    expect(hand(g, 0)).toBe(0);
    g.expect.zone(BEARS, 'battlefield', { seat: 1, count: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 1 });
  });

  test('the third seat is not asked and keeps its creature', () => {
    const g = start();
    toEndStep(g);
    g.passAll();
    g.act(1).decline();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 2, count: 1 });
  });
});
