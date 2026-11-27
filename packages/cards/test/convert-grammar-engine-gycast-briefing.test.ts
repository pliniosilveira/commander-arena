// Revenant Recon deck, group B: Mission Briefing, the REAL card of the golden corpus read through the grammar only and played through `applyAction`: "Surveil 2, then choose an instant or
// sorcery card in your graveyard. You may cast it this turn. If that spell would be put into your graveyard, exile it instead." (CR 701.25a surveil, 608.2c the order of the instructions,
// 608.2d the choice as the spell resolves, 601.2 and 611.2a the permission until end of turn, 400.7 a card that leaves the graveyard is a new object, 614.1a the rider).
// Stand-ins are SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const briefing = real('Mission Briefing');

const zap = parsed('SYNTHETIC Parsed Zap', 'Instant', 'You gain 2 life.', {
  manaCost: '{U}',
  colors: ['U'],
});
const study = parsed('SYNTHETIC Parsed Study', 'Sorcery', 'You gain 3 life.', {
  manaCost: '{U}',
  colors: ['U'],
});
const bear = parsed('SYNTHETIC Parsed Cub', 'Creature — Bear', 'Vigilance', {
  manaCost: '{U}',
  power: '2',
  toughness: '2',
  colors: ['U'],
});
const reuse = parsed('SYNTHETIC Parsed Reuse', 'Instant', 'Draw a card.', {
  manaCost: '{U}',
  colors: ['U'],
});

function game(yard: readonly string[], top: readonly string[] = ['Island', 'Forest', 'Plains']) {
  let b = scenario()
    .define(briefing)
    .define(zap)
    .define(study)
    .define(bear)
    .define(reuse)
    .seat(0)
    .life(20)
    .hand(briefing.name)
    .battlefield('Island', { count: 4 })
    .library(...top);
  for (const name of yard) b = b.graveyard(name);
  return b.seat(1).library('Swamp', 'Swamp').at('precombatMain', { active: 0, turn: 1 }).build();
}

/** Casts the spell and resolves the surveil, keeping every card on top. */
function afterSurveil(g: ScenarioGame, keep: readonly string[] = ['Island', 'Forest']) {
  g.act(0).cast(briefing.name, { pay: true });
  g.passAll();
  g.expect.pending('arrangeCards', 0);
  g.act(0).arrange({ top: [...keep], other: [] });
}

describe('Mission Briefing, from the real text (CR 608.2c, 608.2d, 601.2, 611.2a, 614.1a)', () => {
  test('the single instant in the graveyard is chosen without a question and may be cast this turn; the spell is exiled instead of going to the graveyard', () => {
    const g = game([zap.name, bear.name]);
    afterSurveil(g);
    g.expect.pending('priority', 0);
    g.act(0).cast(zap.name, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
    g.expect.zone(zap.name, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('with two cards of the kinds the controller chooses one, and only that one can be cast', () => {
    const g = game([zap.name, study.name]);
    afterSurveil(g);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(study.name);
    expect(g.act(0).try.cast(zap.name).ok).toBe(false);
    g.act(0).cast(study.name, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
    g.expect.zone(study.name, 'exile', { seat: 0 });
  });

  test('a card that the surveil put into the graveyard can be chosen (the instructions run in order, CR 608.2c)', () => {
    const g = game([], [reuse.name, 'Island', 'Forest']);
    g.act(0).cast(briefing.name, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island'], other: [reuse.name] });
    g.expect.pending('priority', 0);
    g.expect.zone(reuse.name, 'graveyard', { seat: 0 });
    g.act(0).cast(reuse.name, { pay: true });
    g.passAll();
    g.expect.zone(reuse.name, 'exile', { seat: 0 });
  });

  test('a creature card is not a card to choose: with no instant or sorcery nothing happens', () => {
    const g = game([bear.name]);
    afterSurveil(g);
    g.expect.pending('priority', 0);
    expect(g.act(0).try.cast(bear.name).ok).toBe(false);
  });

  test('the permission ends with the turn', () => {
    const g = game([zap.name]);
    afterSurveil(g);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(zap.name, 'graveyard', { seat: 0 });
    expect(g.act(0).try.cast(zap.name).ok).toBe(false);
  });
});
