// From a report to the engine: `toDeckConfig` ordering and counts, labels, and whole games played
// with imported (SYNTHETIC) decks, including cards the parser does not understand.
import { RandomLegalAgent, runGame } from '@commander-arena/ai';
import { createGame, type GameConfig } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { deckLabel, toDeckConfig, unplayableReason, unsupportedCount } from '../src/import';
import { harness, hundredCardText, supportedHundredText } from './import-helpers';

async function importDeck(text = supportedHundredText(), name = 'Synthetic Deck') {
  return harness().service.run({ text, deckName: name });
}

test('toDeckConfig puts the commander first and repeats every card by its count', async () => {
  const report = await importDeck();
  const deck = toDeckConfig(report);
  expect(deck.cards).toHaveLength(100);
  expect(deck.commanders).toEqual([0]);
  expect(deck.cards[0]?.name).toBe('Synthetic Commander');
  expect(deck.cards.filter((card) => card.name === 'Forest')).toHaveLength(39);
  expect(deck.cards.filter((card) => card.name === 'Synthetic Commander')).toHaveLength(1);
  expect(deck.cards.filter((card) => card.name === 'Synthetic Flyer 3')).toHaveLength(1);
  // Every card of a playable deck is supported (D-056).
  expect(deck.cards.every((c) => c.support === 'supported')).toBe(true);
});

test('two partner commanders come first, as indices 0 and 1', async () => {
  // Two commanders that are not partners fail validation, so build the report by hand from a
  // valid one: the ordering logic does not depend on the partner rules.
  const report = await importDeck();
  const second = report.entries.find((entry) => entry.card.stored.name === 'Synthetic Vanilla 1');
  if (!second) throw new Error('missing card');
  const [first] = report.commanders;
  if (!first) throw new Error('missing commander');
  const two = {
    ...report,
    commanders: [first, second.card],
    entries: report.entries.filter((e) => e !== second).concat({ ...second, section: 'commander' }),
  };
  const deck = toDeckConfig({ ...two, entries: [...two.entries] });
  expect(deck.commanders).toEqual([0, 1]);
  expect(deck.cards.slice(0, 2).map((c) => c.name)).toEqual([
    'Synthetic Commander',
    'Synthetic Vanilla 1',
  ]);
});

test('toDeckConfig refuses a report that is not playable, with a clear reason', async () => {
  const bad = await importDeck('1 Synthetic Commander *CMDR*\n1 Nonexistent Card');
  expect(unplayableReason(bad)).toMatch(/not found/);
  expect(() => toDeckConfig(bad)).toThrow(/cannot be played: 1 card name\(s\) were not found/);

  const none = await importDeck('1 Synthetic Commander\n1 Synthetic Vanilla 1');
  expect(() => toDeckConfig(none)).toThrow(/no commander is set/);

  const short = await importDeck('1 Synthetic Commander *CMDR*\n1 Synthetic Vanilla 1');
  expect(() => toDeckConfig(short)).toThrow(/100/);

  const empty = await importDeck('');
  expect(() => toDeckConfig(empty)).toThrow(/cannot be played/);
});

test('a deck with unsupported cards is not playable, and says why (D-056)', async () => {
  const report = await importDeck(hundredCardText());
  expect(report.playable).toBe(false);
  expect(unplayableReason(report)).toMatch(/7 card\(s\) have abilities the engine cannot run yet/);
  expect(() => toDeckConfig(report)).toThrow(/cannot run yet/);
  const issue = report.validation?.issues.find((i) => i.code === 'unsupported');
  expect(issue?.severity).toBe('error');
  expect(issue?.cards).toHaveLength(7);
  expect(report.validation?.ok).toBe(false);
});

test('unsupportedCount counts distinct unsupported cards; deckLabel names deck and commander', async () => {
  const report = await importDeck();
  expect(unsupportedCount(report)).toBe(0);
  expect(unsupportedCount(await importDeck(hundredCardText()))).toBe(7);
  expect(unplayableReason(report)).toBeNull();
  expect(deckLabel(report)).toBe('Synthetic Deck (Synthetic Commander)');
  expect(deckLabel({ ...report, deckName: '  ' })).toBe('Untitled deck (Synthetic Commander)');
  expect(deckLabel({ ...report, commanders: [] })).toBe('Synthetic Deck');
});

// ---------------------------------------------------------------- engine integration

const LIMITS = { maxTurns: 150, maxActions: 20_000 };

test('imported decks play whole games: no rejection, no fallback, every game ends', async () => {
  const report = await importDeck();
  const deck = toDeckConfig(report);
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const config: GameConfig = { seed, decks: [deck, deck] };
    expect(createGame(config).state.pending).not.toBeNull();
    const agents = [
      new RandomLegalAgent({ seed: 100 + seed }),
      new RandomLegalAgent({ seed: 200 + seed }),
    ] as const;
    const run = await runGame(config, agents, LIMITS);
    const label = `seed ${seed}`;
    expect(run.counters.rejectedActions, label).toBe(0);
    expect(run.counters.fallbacks, label).toBe(0);
    expect(run.agentErrors, label).toEqual([]);
    expect(run.reason, label).toBe('result');
    expect(run.log.length, label).toBeGreaterThan(20);
  }
}, 120_000);

test('the engine survives a deck full of unsupported cards (the UI refuses it, D-056)', async () => {
  const lines = ['Commander', '1 Synthetic Commander', 'Deck', '40 Forest'];
  for (let i = 1; i <= 5; i += 1) lines.push(`1 Synthetic Oddity ${i}`);
  for (let i = 1; i <= 53; i += 1) lines.push(`1 Synthetic Vanilla ${i}`);
  lines.push('1 Synthetic Daybreak // Synthetic Nightfall');
  const report = await importDeck(lines.join('\n'));
  // The deck is refused (D-056), but the engine must still survive such cards: it drops what it
  // cannot read, never half-runs it. Build the deck without the playability guard.
  expect(report.playable).toBe(false);
  expect(report.coverage.unsupported.length).toBe(6);
  const commanders = report.entries.filter((e) => e.section === 'commander');
  const rest = report.entries.filter((e) => e.section !== 'commander');
  const deck = {
    cards: [...commanders, ...rest].flatMap((e) =>
      Array.from({ length: e.count }, () => e.card.definition),
    ),
    commanders: commanders.map((_, i) => i),
  };
  for (const seed of [11, 12, 13]) {
    const config: GameConfig = { seed, decks: [deck, deck] };
    const run = await runGame(
      config,
      [new RandomLegalAgent({ seed }), new RandomLegalAgent({ seed: seed + 1 })],
      LIMITS,
    );
    expect(run.counters.rejectedActions).toBe(0);
    expect(run.counters.fallbacks).toBe(0);
    expect(run.agentErrors).toEqual([]);
    expect(run.reason).toBe('result');
  }
}, 120_000);
