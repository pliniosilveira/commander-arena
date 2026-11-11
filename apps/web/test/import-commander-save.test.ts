// Issue 123: a commander the player chooses on the import screen must survive Save and a reload.
// The saved record holds only the decklist text, so the choice has to be written into that text.
// Everything is SYNTHETIC: the cards are the invented "Synthetic ..." ones of the fake Scryfall.
import { parseDecklist } from '@commander-arena/cards';
import { expect, test } from 'vitest';
import { MemoryDeckStore, markCommanders } from '../src/import';
import { commanderNameOf, deckChoices } from '../src/precons';
import { harness, supportedHundredText } from './import-helpers';

/** The shipped list without its Commander section: the commander is one more line of the deck. */
const unmarkedText = (): string =>
  `${supportedHundredText().replace('Commander\n1 Synthetic Commander\n\nDeck\n', '')}\n1 Synthetic Commander`;

test('a deck saved after choosing its commander reloads with that commander', async () => {
  const h = harness();
  const text = unmarkedText();
  // What the screen does today: the report knows the commander, the saved text does not.
  const chosen = await h.service.run({
    text,
    deckName: 'Mine',
    commanderNames: ['Synthetic Commander'],
  });
  expect(chosen.commanders.map((c) => c.stored.name)).toEqual(['Synthetic Commander']);

  const store = new MemoryDeckStore(() => 1_000);
  const saved = await store.save({
    name: 'Mine',
    text: markCommanders(text, ['Synthetic Commander']),
  });

  // Reload: only the stored record is left.
  const [record] = await store.list();
  expect(record?.id).toBe(saved.id);
  const reloaded = await h.service.run({ text: record?.text ?? '', deckName: 'Mine' });
  expect(reloaded.commanders.map((c) => c.stored.name)).toEqual(['Synthetic Commander']);
  expect(reloaded.entries.reduce((sum, entry) => sum + entry.count, 0)).toBe(100);
  expect(reloaded.playable).toBe(true);
  // The menu and the decks page read the commander from the same text.
  expect(commanderNameOf(record?.text ?? '')).toBe('Synthetic Commander');
  expect(deckChoices([], [], [saved])[0]?.commander).toBe('Synthetic Commander');
});

test('without the commander in the text, a reload forgets it (the report of issue 123)', async () => {
  const h = harness();
  const reloaded = await h.service.run({ text: unmarkedText(), deckName: 'Mine' });
  expect(reloaded.commanders).toEqual([]);
  expect(reloaded.playable).toBe(false);
});

test('markCommanders marks one copy of the chosen card and touches nothing else', () => {
  const text = '1 Synthetic Commander\n1 Synthetic Vanilla 1\n38 Forest';
  expect(markCommanders(text, ['Synthetic Commander'])).toBe(
    '1 Synthetic Commander *CMDR*\n1 Synthetic Vanilla 1\n38 Forest',
  );
});

test('a card with two copies keeps the other copy in the main deck', async () => {
  const text = '2 Synthetic Commander\n1 Synthetic Vanilla 1';
  const marked = markCommanders(text, ['Synthetic Commander']);
  const report = await harness().service.run({ text: marked, deckName: 'C' });
  expect(report.entries.map((e) => [e.card.stored.name, e.count, e.section]).sort()).toEqual([
    ['Synthetic Commander', 1, 'commander'],
    ['Synthetic Commander', 1, 'main'],
    ['Synthetic Vanilla 1', 1, 'main'],
  ]);
});

test('two partner commanders are both marked; names compare like the importer does', () => {
  const text = '1 synthetic  commander (SYN) 12\n1 Synthetic Red Commander\n1 Forest';
  const marked = markCommanders(text, ['Synthetic Commander', 'SYNTHETIC RED COMMANDER']);
  const parsed = parseDecklist(marked);
  expect(parsed.sections.commander.map((e) => e.name)).toEqual([
    'synthetic commander',
    'Synthetic Red Commander',
  ]);
  expect(parsed.sections.main.map((e) => e.name)).toEqual(['Forest']);
});

test('a card written by its front face matches the double-faced name that was chosen', () => {
  const marked = markCommanders('1 Synthetic Daybreak\n1 Forest', [
    'Synthetic Daybreak // Synthetic Nightfall',
  ]);
  expect(parseDecklist(marked).sections.commander.map((e) => e.name)).toEqual([
    'Synthetic Daybreak',
  ]);
});

test('a list that already marks its commander is kept as it is', () => {
  const text = supportedHundredText();
  expect(markCommanders(text, ['Synthetic Vanilla 1'])).toBe(text);
  expect(markCommanders('1 Synthetic Commander *CMDR*\n1 Forest', ['Forest'])).toBe(
    '1 Synthetic Commander *CMDR*\n1 Forest',
  );
});

test('no choice, or a name that is not in the main deck, leaves the text alone', () => {
  const text = '1 Synthetic Commander\nSideboard\n1 Synthetic Red Commander';
  expect(markCommanders(text, [])).toBe(text);
  expect(markCommanders(text, ['Synthetic Red Commander'])).toBe(text);
  expect(markCommanders(text, ['Not In The List'])).toBe(text);
});

test('line endings and the other lines of the list are kept', () => {
  const text = '1 Synthetic Commander (SYN) 12\r\n// a note\r\n38 Forest\r\n';
  expect(markCommanders(text, ['Synthetic Commander'])).toBe(
    '1 Synthetic Commander (SYN) 12 *CMDR*\r\n// a note\r\n38 Forest\r\n',
  );
});

test('an old saved record, with no commander in its text, still loads and lists', async () => {
  const store = new MemoryDeckStore(() => 5);
  await store.save({ name: 'Old', text: unmarkedText() });
  const [record] = await store.list();
  expect(record?.name).toBe('Old');
  expect(deckChoices([], [], record === undefined ? [] : [record])[0]?.commander).toBe('');
  const report = await harness().service.run({ text: record?.text ?? '', deckName: 'Old' });
  // The player picks the commander again and saves again.
  expect(report.commanderChoices.map((c) => c.name)).toContain('Synthetic Commander');
});
