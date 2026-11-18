// The First Flight starter Commander decks, the Jubilant Skybonder group (D-149): the REAL card of the golden corpus goes through the grammar with no override and is played through
// applyAction: `Creatures you control with flying have "Spells your opponents cast that target this creature cost {2} more to cast."` Pins: CR 613.1f (layer 6, the grant reads flying
// after every grant of keywords), 604.1 and 113.6 (a static ability the creature has, "this creature" being the one that has it), 601.2c and 601.2f (targets are chosen, then the cost
// is determined with the increase), 702.9a (flying). The other cards are SYNTHETIC stand-ins, named so; their ability lines are written as Oracle text and read by the grammar too.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const golden = parseGolden(readFileSync(CORPUS, 'utf8')).find(
  (c) => c.name === 'Jubilant Skybonder',
);
if (golden === undefined) throw new Error('the golden corpus has no Jubilant Skybonder');
const imported = importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
const SKYBONDER = imported.definition;

const BIRD = parsed('SYNTHETIC Small Bird', 'Creature — Bird', 'Flying', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const BEAR = parsed('SYNTHETIC Ground Bear', 'Creature — Bear', '', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const LORD = parsed(
  'SYNTHETIC Wing Lord',
  'Creature — Bird',
  'Creatures you control have flying.',
  { manaCost: '{1}', power: '1', toughness: '1' },
);
const BOLT_NAME = 'Lightning Bolt';
const FILLER = Array.from({ length: 10 }, () => 'Island');

/** Seat 0 has the permanents; seat 1 is the active player with `lands` Mountains and a Lightning Bolt. */
function game(mine: readonly CardDefinition[], lands: number) {
  const b = scenario()
    .seat(0)
    .library(...FILLER);
  for (const card of [SKYBONDER, BIRD, BEAR, LORD]) b.define(card);
  for (const card of mine) b.battlefield(card.name, { label: card.name });
  return b
    .seat(1)
    .hand(BOLT_NAME)
    .battlefield('Mountain', { count: lands })
    .library(...FILLER)
    .at('precombatMain', { active: 1 })
    .build();
}

describe('Jubilant Skybonder, the real card', () => {
  test('it is fully supported with no override', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('a Bolt at a flyer I control costs {2} more: three Mountains, not two', () => {
    const short = game([SKYBONDER, BIRD], 2);
    expect(() => short.act(1).cast(BOLT_NAME, { targets: [BIRD.name], pay: true })).toThrow(
      /not a legal target|cannot pay/,
    );
    const enough = game([SKYBONDER, BIRD], 3);
    enough.act(1).cast(BOLT_NAME, { targets: [BIRD.name], pay: true });
    enough.passAll();
    enough.expect.noObject(BIRD.name, { zone: 'battlefield' });
  });

  test('the Skybonder has flying itself, so it is taxed too', () => {
    const short = game([SKYBONDER], 2);
    expect(() => short.act(1).cast(BOLT_NAME, { targets: [SKYBONDER.name], pay: true })).toThrow(
      /not a legal target|cannot pay/,
    );
    const enough = game([SKYBONDER], 3);
    enough.act(1).cast(BOLT_NAME, { targets: [SKYBONDER.name], pay: true });
    enough.passAll();
    enough.expect.invariants();
  });

  test('a creature without flying costs no more: one Mountain pays', () => {
    const g = game([SKYBONDER, BEAR], 1);
    g.act(1).cast(BOLT_NAME, { targets: [BEAR.name], pay: true });
    g.passAll();
    g.expect.noObject(BEAR.name, { zone: 'battlefield' });
  });

  test('a creature that gets flying from another static ability is taxed, whichever came first on the battlefield', () => {
    for (const order of [
      [SKYBONDER, BEAR, LORD],
      [LORD, SKYBONDER, BEAR],
    ]) {
      const g = game(order, 2);
      expect(() => g.act(1).cast(BOLT_NAME, { targets: [BEAR.name], pay: true })).toThrow(
        /not a legal target|cannot pay/,
      );
      const h = game(order, 3);
      h.act(1).cast(BOLT_NAME, { targets: [BEAR.name], pay: true });
      h.passAll();
      h.expect.noObject(BEAR.name, { zone: 'battlefield' });
    }
  });

  test('two Skybonders stack: {4} more', () => {
    const b = scenario()
      .seat(0)
      .library(...FILLER);
    for (const card of [SKYBONDER]) b.define(card);
    b.battlefield(SKYBONDER.name, { count: 2 });
    const short = b
      .seat(1)
      .hand(BOLT_NAME)
      .battlefield('Mountain', { count: 4 })
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    expect(() =>
      short.act(1).cast(BOLT_NAME, { targets: [`${SKYBONDER.name}[1]`], pay: true }),
    ).toThrow(/not a legal target|cannot pay/);
  });
});
