// The import service end to end over a SYNTHETIC Scryfall (M4, SPEC 6, 7.1, 26, 27, 30): a full
// 100-card list, the export formats, unresolved and fuzzy names, commanders, validation, coverage
// and the support cache. HTTP is faked with an injected `fetch`; nothing here is real card data.
import { PARSER_VERSION, type SupportReport } from '@commander-arena/cards';
import { expect, test } from 'vitest';
import type { ImportProgress } from '../src/import';
import { harness, hundredCardText, supportedHundredText } from './import-helpers';

const names = (report: { entries: readonly { card: { stored: { name: string } } }[] }) =>
  report.entries.map((entry) => entry.card.stored.name);

test('a full 100-card list imports end to end with the right coverage', async () => {
  const h = harness();
  const report = await h.service.run({ text: hundredCardText(), deckName: 'Synthetic Deck' });
  // Seven cards are unsupported, so the deck is invalid and cannot be played (D-056).
  expect(report.playable).toBe(false);
  expect(report.notFound).toEqual([]);
  expect(report.fuzzy).toEqual([]);
  expect(report.validation?.ok).toBe(false);
  expect(report.validation?.issues.map((i) => i.code)).toEqual(['unsupported']);
  expect(report.validation?.issues[0]?.cards).toHaveLength(7);
  expect(report.commanders.map((c) => c.stored.name)).toEqual(['Synthetic Commander']);
  expect(report.commanderChoices).toEqual([]);
  // The marked commander is entries[0]; the rest is main, sorted by name.
  expect(report.entries[0]).toMatchObject({ section: 'commander', count: 1 });
  expect(report.entries.slice(1).every((entry) => entry.section === 'main')).toBe(true);
  expect(report.entries.reduce((sum, entry) => sum + entry.count, 0)).toBe(100);
  // 62 distinct cards: commander, Forest, 3 taplands, 1 odd land, 40 vanilla, 10 flyers,
  // 5 oddities, 1 meld card. Unsupported: the odd land, the 5 oddities, the meld card.
  expect(report.coverage).toMatchObject({
    distinctCards: 62,
    supportedDistinct: 55,
    copies: 100,
    supportedCopies: 93,
    percentCopies: 93,
    // 61 nonbasic cards, 54 supported: 88.5 percent.
    percentNonbasic: 88.5,
  });
  expect(report.coverage.unsupported.map((e) => e.card.stored.name)).toEqual([
    'Synthetic Daybreak // Synthetic Nightfall',
    'Synthetic Odd Land 1',
    'Synthetic Oddity 1',
    'Synthetic Oddity 2',
    'Synthetic Oddity 3',
    'Synthetic Oddity 4',
    'Synthetic Oddity 5',
  ]);
  // One collection request: 61 distinct names fit in a batch of 75.
  expect(h.fake.calls).toHaveLength(1);
  expect(h.fake.calls[0]?.url).toBe('https://api.scryfall.com/cards/collection');
});

test('more than 75 distinct names use several collection requests of at most 75', async () => {
  const h = harness();
  const lines = ['Commander', '1 Synthetic Commander', 'Deck'];
  for (let i = 1; i <= 90; i += 1) lines.push(`1 Synthetic Vanilla ${i}`);
  const report = await h.service.run({ text: lines.join('\n'), deckName: 'Big' });
  expect(report.notFound).toEqual([]);
  expect(report.entries).toHaveLength(91);
  const sizes = h.fake.calls.map(
    (call) => (call.body as { identifiers: unknown[] }).identifiers.length,
  );
  expect(sizes).toEqual([75, 16]);
});

test('the report is the same for the same input (stable order)', async () => {
  const a = await harness().service.run({ text: hundredCardText(), deckName: 'X' });
  const b = await harness().service.run({ text: hundredCardText(), deckName: 'X' });
  expect(names(a)).toEqual(names(b));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

test('progress goes through the phases in order and ends with done', async () => {
  const seen: ImportProgress[] = [];
  await harness().service.run({
    text: hundredCardText(),
    deckName: 'P',
    onProgress: (progress) => seen.push(progress),
  });
  const phases = seen.map((p) => p.phase).filter((phase, i, all) => all[i - 1] !== phase);
  expect(phases).toEqual(['parsing', 'resolving', 'converting', 'validating', 'done']);
  expect(seen.at(-1)).toEqual({ phase: 'done', done: 1, total: 1 });
  const converting = seen.filter((p) => p.phase === 'converting');
  expect(converting.at(-1)).toMatchObject({ done: 62, total: 62 });
});

test('an empty text gives an empty, unplayable report', async () => {
  const h = harness();
  for (const text of ['', '   \n\n']) {
    const report = await h.service.run({ text, deckName: 'Empty' });
    expect(report.playable).toBe(false);
    expect(report.entries).toEqual([]);
    expect(report.commanders).toEqual([]);
    expect(report.validation).toBeNull();
    expect(report.coverage).toMatchObject({ copies: 0, percentCopies: 0, percentNonbasic: 0 });
  }
  expect(h.fake.calls).toHaveLength(0);
});

// ---------------------------------------------------------------- the export formats

const FORMATS: readonly (readonly [string, string])[] = [
  [
    'Moxfield',
    [
      '1 Synthetic Commander (SYN) 1 *CMDR*',
      '2 Forest (SYN) 99 *F*',
      '1 Synthetic Vanilla 1 (SYN) 2',
      '1 Synthetic Daybreak // Synthetic Nightfall (SYN) 3',
    ].join('\n'),
  ],
  [
    'Arena',
    [
      'About',
      'Name Synthetic',
      '',
      'Commander',
      '1 Synthetic Commander (SYN) 1',
      '',
      'Deck',
      '2 Forest (SYN) 99',
      '1 Synthetic Vanilla 1 (SYN) 2',
      '1 Synthetic Daybreak (SYN) 3',
    ].join('\n'),
  ],
  [
    'Archidekt',
    [
      '1x Synthetic Commander (syn) 1 [Commander{top}]',
      '2x Forest (syn) 99 [Land]',
      '1x Synthetic Vanilla 1 (syn) 2 [Creature]',
      '1x Synthetic Daybreak // Synthetic Nightfall (syn) 3 [Creature]',
    ].join('\n'),
  ],
];

test.each(FORMATS)('%s export imports to the same deck', async (_format, text) => {
  const report = await harness().service.run({ text, deckName: 'F' });
  expect(report.notFound).toEqual([]);
  expect(report.parse.hasCommanderMarking).toBe(true);
  expect(report.commanders.map((c) => c.stored.name)).toEqual(['Synthetic Commander']);
  expect(report.entries.map((e) => [e.card.stored.name, e.count, e.section])).toEqual([
    ['Synthetic Commander', 1, 'commander'],
    ['Forest', 2, 'main'],
    ['Synthetic Daybreak // Synthetic Nightfall', 1, 'main'],
    ['Synthetic Vanilla 1', 1, 'main'],
  ]);
});

test('the MTGO layout (no commander, blank line before the sideboard) ignores the sideboard', async () => {
  const text = ['1 Synthetic Commander', '1 Synthetic Vanilla 1', '', '1 Synthetic Flyer 1'].join(
    '\n',
  );
  const h = harness();
  const report = await h.service.run({ text, deckName: 'M' });
  expect(report.ignored).toEqual([{ name: 'Synthetic Flyer 1', section: 'sideboard', count: 1 }]);
  expect(names(report)).toEqual(['Synthetic Commander', 'Synthetic Vanilla 1']);
  // The sideboard card is never even looked up.
  const asked = h.fake.calls.flatMap(
    (c) => (c.body as { identifiers: { name: string }[] }).identifiers,
  );
  expect(asked.map((i) => i.name)).not.toContain('Synthetic Flyer 1');
});

test('sideboard, maybeboard and companion are ignored and never resolved', async () => {
  const text = [
    'Commander',
    '1 Synthetic Commander',
    'Deck',
    '1 Synthetic Vanilla 1',
    'Sideboard',
    '1 Synthetic Vanilla 2',
    'Maybeboard',
    '2 Nonexistent Maybe Card',
    'Companion',
    '1 Synthetic Vanilla 3',
  ].join('\n');
  const h = harness();
  const report = await h.service.run({ text, deckName: 'I' });
  expect(report.ignored.map((i) => [i.section, i.name, i.count])).toEqual([
    ['sideboard', 'Synthetic Vanilla 2', 1],
    ['maybeboard', 'Nonexistent Maybe Card', 2],
    ['companion', 'Synthetic Vanilla 3', 1],
  ]);
  expect(report.notFound).toEqual([]);
  expect(names(report)).toEqual(['Synthetic Commander', 'Synthetic Vanilla 1']);
});

// ---------------------------------------------------------------- not found and fuzzy

test('a name Scryfall does not know is listed in notFound and makes the deck unplayable', async () => {
  const text = '1 Synthetic Commander *CMDR*\n1 Synthetic Vanilla 1\n3 Nonexistent Card';
  const report = await harness().service.run({ text, deckName: 'N' });
  expect(report.notFound).toEqual([
    { name: 'Nonexistent Card', count: 3, line: 3, reason: 'not-found' },
  ]);
  expect(names(report)).toEqual(['Synthetic Commander', 'Synthetic Vanilla 1']);
  expect(report.playable).toBe(false);
});

test('a fuzzy candidate is not used until it is accepted', async () => {
  const text = '1 Synthetic Commander *CMDR*\n1 Synthetic Vanila 1';
  const options = { fuzzy: { 'synthetic vanila 1': 'Synthetic Vanilla 1' } };
  const h = harness(options);
  const first = await h.service.run({ text, deckName: 'Z' });
  expect(first.entries.map((e) => e.card.stored.name)).toEqual(['Synthetic Commander']);
  expect(first.fuzzy).toHaveLength(1);
  expect(first.fuzzy[0]).toMatchObject({ requested: 'Synthetic Vanila 1', count: 1 });
  expect(first.fuzzy[0]?.candidate.name).toBe('Synthetic Vanilla 1');
  expect(first.playable).toBe(false);

  // Accepting it (compared with the name key: case and spacing do not matter) uses the card.
  const second = await h.service.run({
    text,
    deckName: 'Z',
    acceptedFuzzy: ['  synthetic VANILA 1'],
  });
  expect(second.fuzzy).toEqual([]);
  expect(second.entries.map((e) => e.card.stored.name)).toEqual([
    'Synthetic Commander',
    'Synthetic Vanilla 1',
  ]);
  // Not a real 100-card deck, so not playable, but nothing is awaiting confirmation.
  expect(second.validation?.issues.map((i) => i.code)).toContain('deck-size');
});

test('network trouble becomes a problem per name, never a throw', async () => {
  const text = '1 Synthetic Commander *CMDR*\n1 Synthetic Vanilla 1';
  const report = await harness({ offline: true }).service.run({ text, deckName: 'O' });
  expect(report.entries).toEqual([]);
  expect(report.notFound.map((p) => p.name)).toEqual([
    'Synthetic Commander',
    'Synthetic Vanilla 1',
  ]);
  expect(report.notFound.every((p) => p.reason !== 'not-found' && p.reason.length > 0)).toBe(true);
  expect(report.playable).toBe(false);
});

// ---------------------------------------------------------------- commanders

const UNMARKED = [
  '1 Synthetic Commander',
  '1 Synthetic Red Commander',
  '1 Synthetic Vanilla 1',
  '38 Forest',
].join('\n');

test('without a marked commander the eligible cards are offered as choices', async () => {
  const report = await harness().service.run({ text: UNMARKED, deckName: 'C' });
  expect(report.parse.hasCommanderMarking).toBe(false);
  expect(report.commanders).toEqual([]);
  expect(report.validation).toBeNull();
  expect(report.playable).toBe(false);
  expect(report.commanderChoices.map((c) => c.name)).toEqual([
    'Synthetic Commander',
    'Synthetic Red Commander',
  ]);
  // Every resolved card stays in main until one is chosen.
  expect(report.entries.every((e) => e.section === 'main')).toBe(true);
});

test('a chosen commander is taken out of the main deck, its other copies stay', async () => {
  const report = await harness().service.run({
    text: UNMARKED,
    deckName: 'C',
    commanderNames: ['synthetic  commander'],
  });
  expect(report.commanders.map((c) => c.stored.name)).toEqual(['Synthetic Commander']);
  expect(report.entries[0]).toMatchObject({ section: 'commander', count: 1 });
  expect(report.entries.filter((e) => e.card.stored.name === 'Synthetic Commander')).toHaveLength(
    1,
  );
  // The choices stay available so the player can change their mind.
  expect(report.commanderChoices).toHaveLength(2);
  // 1 + 1 + 1 + 38 = 41 cards: deck-size is the (only) error, and the Red Commander is off identity.
  expect(report.validation?.issues.map((i) => i.code)).toEqual(
    expect.arrayContaining(['deck-size', 'color-identity']),
  );
});

test('a marked commander wins over commanderNames', async () => {
  const text = `${hundredCardText()}`;
  const report = await harness().service.run({
    text,
    deckName: 'C',
    commanderNames: ['Synthetic Vanilla 1'],
  });
  expect(report.commanders.map((c) => c.stored.name)).toEqual(['Synthetic Commander']);
  expect(report.commanderChoices).toEqual([]);
});

test('a commander name that is not in the list chooses nothing', async () => {
  const report = await harness().service.run({
    text: UNMARKED,
    deckName: 'C',
    commanderNames: ['Synthetic Flyer 9'],
  });
  expect(report.commanders).toEqual([]);
});

test('a card chosen as commander with two copies leaves one copy in the main deck', async () => {
  const text = '2 Synthetic Commander\n1 Synthetic Vanilla 1';
  const report = await harness().service.run({
    text,
    deckName: 'C',
    commanderNames: ['Synthetic Commander'],
  });
  expect(report.entries.map((e) => [e.card.stored.name, e.count, e.section])).toEqual([
    ['Synthetic Commander', 1, 'commander'],
    ['Synthetic Commander', 1, 'main'],
    ['Synthetic Vanilla 1', 1, 'main'],
  ]);
  expect(report.validation?.issues.map((i) => i.code)).toContain('singleton');
  expect(report.coverage.distinctCards).toBe(2);
});

test('a list of supported cards only is valid and playable', async () => {
  const report = await harness().service.run({ text: supportedHundredText(), deckName: 'Ok' });
  expect(report.validation).toEqual({ ok: true, issues: [] });
  expect(report.coverage.unsupported).toEqual([]);
  expect(report.coverage.percentCopies).toBe(100);
  expect(report.playable).toBe(true);
});

// ---------------------------------------------------------------- validation

test('99 cards are reported with a deck-size error and are not playable', async () => {
  const lines = supportedHundredText().split('\n');
  const dropped = lines.indexOf('1 Synthetic Vanilla 40');
  lines.splice(dropped, 1);
  const report = await harness().service.run({ text: lines.join('\n'), deckName: 'S' });
  expect(report.notFound).toEqual([]);
  expect(report.validation?.ok).toBe(false);
  expect(report.validation?.issues.map((i) => i.code)).toEqual(['deck-size']);
  expect(report.playable).toBe(false);
});

test('an off-identity card and a duplicate are reported', async () => {
  const lines = supportedHundredText().split('\n');
  lines.splice(lines.indexOf('1 Synthetic Vanilla 40'), 1, '1 Synthetic Red Commander');
  lines.splice(lines.indexOf('1 Synthetic Vanilla 39'), 1, '1 Synthetic Vanilla 38');
  const report = await harness().service.run({ text: lines.join('\n'), deckName: 'S' });
  const codes = report.validation?.issues.map((i) => i.code) ?? [];
  expect(codes).toContain('color-identity');
  expect(codes).toContain('singleton');
  expect(codes).not.toContain('deck-size');
  expect(report.playable).toBe(false);
});

test('a commander that is also listed in the main deck is a duplicate', async () => {
  const lines = supportedHundredText().split('\n');
  lines.splice(lines.indexOf('1 Synthetic Vanilla 40'), 1, '1 Synthetic Commander');
  const report = await harness().service.run({ text: lines.join('\n'), deckName: 'S' });
  expect(report.validation?.issues.map((i) => i.code)).toEqual(['singleton']);
  expect(report.coverage.distinctCards).toBe(61);
  expect(report.coverage.copies).toBe(100);
});

test('a commander that cannot be one is a validation error', async () => {
  const lines = supportedHundredText({ commanderLine: '1 Synthetic Vanilla 1' }).split('\n');
  lines.splice(lines.indexOf('1 Synthetic Vanilla 1', 6), 1, '1 Synthetic Vanilla 41');
  const report = await harness().service.run({ text: lines.join('\n'), deckName: 'S' });
  expect(report.validation?.issues.map((i) => i.code)).toContain('commander');
  expect(report.playable).toBe(false);
});

// ---------------------------------------------------------------- the support cache

function supportedReport(parserVersion: number): SupportReport {
  return { status: 'supported', parserVersion, source: 'parser', unparsed: [], reasons: [] };
}

const ODD_LIST = '1 Synthetic Commander *CMDR*\n1 Synthetic Oddity 1';
const ODD_ORACLE_ID = 'synthetic-oracle-synthetic-oddity-1';

test('support statuses are cached per parser version and recomputed after a change', async () => {
  const h = harness();
  const first = await h.service.run({ text: ODD_LIST, deckName: 'V' });
  const cached = await h.supportCache.get(ODD_ORACLE_ID);
  expect(cached).toMatchObject({ status: 'unsupported', parserVersion: PARSER_VERSION });
  expect(first.coverage.unsupported).toHaveLength(1);

  // A cached report of the same version is trusted: no recomputation.
  await h.supportCache.put(ODD_ORACLE_ID, supportedReport(PARSER_VERSION));
  const trusted = await h.service.run({ text: ODD_LIST, deckName: 'V' });
  expect(trusted.coverage.unsupported).toHaveLength(0);

  // After a parser version bump the cached report is stale and the status is recomputed.
  const bumped = harness({ parserVersion: PARSER_VERSION + 1 });
  await bumped.supportCache.put(ODD_ORACLE_ID, supportedReport(PARSER_VERSION));
  const recomputed = await bumped.service.run({ text: ODD_LIST, deckName: 'V' });
  expect(recomputed.coverage.unsupported).toHaveLength(1);
  expect(await bumped.supportCache.get(ODD_ORACLE_ID)).toMatchObject({
    status: 'unsupported',
    parserVersion: PARSER_VERSION + 1,
  });
});
