// The Mind Flayarrrs deck, group 8: Nihilith, the REAL card of the golden corpus read through the grammar only and played through applyAction. "Whenever a card is put into an
// opponent's graveyard from anywhere, if this card is suspended, you may remove a time counter from this card." (CR 113.6b, 702.62b, 603.4, 404.1.)
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const NIHILITH = real('Nihilith');
const FILLER = Array.from({ length: 30 }, () => 'Island');

describe('Nihilith (suspended: a card put into an opponent’s graveyard)', () => {
  test('read as an ability that works from exile, for a card put into an opponent’s graveyard, if suspended', () => {
    const triggered = NIHILITH.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(triggered).toMatchObject({
      trigger: { kind: 'putIntoGraveyard', who: 'opponent', from: 'anywhere' },
      interveningIf: { kind: 'thisSuspended' },
      functionsIn: 'exile',
      optional: true,
      effect: { kind: 'removeCounters', objects: { kind: 'this' }, counter: 'time', count: 1 },
    });
    expect(
      NIHILITH.faces[0]?.abilities.some(
        (a) => a.kind === 'keyword' && a.keyword.kind === 'suspend',
      ),
    ).toBe(true);
  });

  function game(seats: 2 | 3) {
    const b = scenario({ seats })
      .define(NIHILITH)
      .seat(0)
      .hand(NIHILITH.name)
      .battlefield('Swamp', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain', { count: 2 })
      .library(...FILLER);
    const g = (
      seats === 3
        ? b
            .seat(2)
            .hand('Lightning Bolt')
            .battlefield('Mountain', { count: 2 })
            .library(...FILLER)
        : b
    )
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).suspend(NIHILITH.name, { pay: true });
    return g;
  }

  const time = (g: ReturnType<typeof game>): number | undefined =>
    g.find({ name: NIHILITH.name, zone: 'exile' })[0]?.counters?.time;

  test('an opponent’s card put into their graveyard: the owner may remove a time counter', () => {
    const g = game(2);
    expect(time(g)).toBe(7);
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.passAll();
    g.act(0).accept();
    expect(time(g)).toBe(6);
    g.expect.invariants();
  });

  test('with three seats the third seat’s card triggers it too', () => {
    const g = game(3);
    g.act(0).pass();
    g.act(1).pass();
    g.act(2).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.passAll();
    g.act(0).accept();
    expect(time(g)).toBe(6);
  });

  test('without a card put into an opponent’s graveyard nothing triggers', () => {
    const g = game(2);
    g.act(0).pass();
    g.act(1).pass(); // nothing happens in the opponent's graveyard
    expect(time(g)).toBe(7);
    expect(g.state.pendingTriggers).toHaveLength(0);
  });
});
