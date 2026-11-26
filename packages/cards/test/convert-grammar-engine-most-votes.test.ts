// Council's Judgment: the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in an engine scenario and is played through
// applyAction with two, three and four seats. Pins: CR 701.38a (each player votes, in turn order from the controller, and sees the earlier votes), 701.38b (the choices are permanents, not
// targets), 406.1 (exile), 608.2c (the exile follows the vote). The synthetic scenario is packages/engine/test/scenario-xx-most-votes.test.ts.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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

const JUDGMENT = real("Council's Judgment");
const BEAR = 'SYNTHETIC Council Elf';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

describe("Council's Judgment", () => {
  test('the card is valid and its spell votes for permanents then exiles the most voted', () => {
    expect(validateCard(JUDGMENT)).toEqual([]);
    expect(JSON.stringify(JUDGMENT.faces[0]?.spell)).toContain('mostVotedObjects');
  });

  function table(seats: 2 | 3 | 4) {
    let b = scenario({ seats }).define(JUDGMENT);
    for (let seat = 0; seat < seats; seat += 1) {
      b = b
        .seat(seat)
        .life(20)
        .hand(...(seat === 0 ? [JUDGMENT.name] : []))
        .battlefield(
          ...(seat === 0 ? ['Plains', 'Plains', 'Plains'] : [BEAR, 'Forest']),
        )
        .library(...FILLER);
    }
    return b.at('precombatMain', { active: 0 }).build();
  }

  test.each([2, 3, 4] as const)(
    '%i seats: every player votes in turn order and the permanents with the most votes are exiled, lands are not offered',
    (seats) => {
      const g = table(seats);
      g.act(0).cast(JUDGMENT.name, { pay: true });
      g.passAll();
      const others = Array.from({ length: seats - 1 }, (_, i) => i + 1);
      const pick = (seat: number, which: number) => {
        g.expect.pending('chooseOption', seat);
        const d = g.state.pending;
        if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a vote');
        // one nonland permanent for each opponent (the lands are not choices, the caster's own are not either)
        expect(d.options).toHaveLength(seats - 1);
        const choice = d.vote?.choices?.[which];
        if (choice?.kind !== 'object') throw new Error('no choice');
        expect(choice.name).toBe(BEAR);
        g.act(seat).chooseOption(`object:${choice.object}`);
      };
      // everyone votes for the first creature: it alone has the most votes.
      pick(0, 0);
      for (const seat of others) pick(seat, 0);
      g.expect.zone(BEAR, 'exile', { seat: 1 });
      for (const seat of others.slice(1)) g.expect.zone(BEAR, 'battlefield', { seat });
      g.expect.zone('Forest', 'battlefield', { seat: 1 });
      g.expect.invariants();
    },
  );

  test('four seats: a tie for the most votes exiles every tied permanent, the one with fewer stays', () => {
    const g = table(4);
    g.act(0).cast(JUDGMENT.name, { pay: true });
    g.passAll();
    const vote = (seat: number, which: number) => {
      const d = g.state.pending;
      if (d?.kind !== 'chooseOption') throw new Error('no vote');
      const choice = d.vote?.choices?.[which];
      if (choice?.kind !== 'object') throw new Error('no choice');
      g.act(seat).chooseOption(`object:${choice.object}`);
    };
    // the choices are the creatures of seats 1, 2, 3 in that order: two votes each for the first two.
    vote(0, 0);
    vote(1, 1);
    vote(2, 0);
    vote(3, 1);
    g.expect.zone(BEAR, 'exile', { seat: 1 });
    g.expect.zone(BEAR, 'exile', { seat: 2 });
    g.expect.zone(BEAR, 'battlefield', { seat: 3 });
    g.expect.invariants();
  });
});
