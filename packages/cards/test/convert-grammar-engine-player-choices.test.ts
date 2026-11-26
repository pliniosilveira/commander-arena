// Seize the Spotlight: the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in an engine scenario and is played through
// applyAction with two, three and four seats. Pins: CR 101.4 (each opponent chooses in turn, the active player first, then the actions happen), 608.2d (the controller chooses the creature of
// each player who chose fame), 613.1b and 611.2 (control until end of turn), 701.26a (untap), 702.10 (haste), 121.1 (draw), 111.10a (Treasure), 701.38c (a choice is not a vote).
// The synthetic scenario is packages/engine/test/scenario-xx-player-choices.test.ts.
import { readFileSync } from 'node:fs';
import { type CardDefinition, type GameEvent, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
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

const SPOTLIGHT = real('Seize the Spotlight');
const ELF = 'SYNTHETIC Council Elf'; // {G} Elf 1/1, a body to take
const FILLER = Array.from({ length: 12 }, () => 'Plains');

function table(seats: 2 | 3 | 4, boards: Readonly<Record<number, readonly string[]>>) {
  let b = scenario({ seats }).define(SPOTLIGHT);
  for (let seat = 0; seat < seats; seat += 1) {
    b = b
      .seat(seat)
      .life(20)
      .hand(...(seat === 0 ? [SPOTLIGHT.name] : []))
      .battlefield(
        ...(boards[seat] ?? []),
        ...(seat === 0 ? ['Mountain', 'Mountain', 'Mountain'] : []),
      )
      .library(...FILLER);
  }
  return b.at('precombatMain', { active: 0 }).build();
}

describe('Seize the Spotlight', () => {
  test('the card is valid', () => {
    expect(validateCard(SPOTLIGHT)).toEqual([]);
    const text = JSON.stringify(SPOTLIGHT.faces[0]?.spell);
    expect(text).toContain('eachPlayerChooses');
    expect(text).toContain('perChoice');
    expect(text).toContain('eachPlayerWhoChose');
  });

  test('two seats: fame takes the creature, untapped, with haste, for the turn', () => {
    const g = table(2, { 1: [ELF] });
    g.act(0).cast(SPOTLIGHT.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption('fame');
    g.act(0).choosePermanents({ name: ELF, seat: 1 });
    g.expect.zone(ELF, 'battlefield', { seat: 0 });
    g.expect.derived(ELF, { keywords: ['haste'] });
    g.expect.handSize(0, 0);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.zone(ELF, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('two seats: fortune gives a card and a Treasure', () => {
    const g = table(2, { 1: [ELF] });
    g.act(0).cast(SPOTLIGHT.name, { pay: true });
    g.passAll();
    g.act(1).chooseOption('fortune');
    g.expect.zone(ELF, 'battlefield', { seat: 1 });
    g.expect.handSize(0, 1);
    g.expect.zone('Treasure', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('four seats: each opponent chooses in turn, the choice is not a vote, and each player is rewarded for their own choice', () => {
    const g = table(4, { 1: [ELF], 2: [ELF], 3: [ELF] });
    const mark = g.mark();
    g.act(0).cast(SPOTLIGHT.name, { pay: true });
    g.passAll();
    g.act(1).chooseOption('fame');
    g.act(2).chooseOption('fortune');
    g.act(3).chooseOption('fortune');
    g.act(0).choosePermanents({ name: ELF, seat: 1 });
    // two players chose fortune: two cards and two Treasures; one chose fame: one creature.
    g.expect.zone(ELF, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
    expect(g.eventsSince(mark).some((e: GameEvent) => e.kind === 'votesRevealed')).toBe(false);
    g.expect.invariants();
  });
});
