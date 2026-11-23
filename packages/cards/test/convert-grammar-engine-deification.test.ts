// "As this enchantment enters, choose a planeswalker type." / "Planeswalkers you control of the chosen type have hexproof." / the damage replacement that keeps
// one loyalty counter (issue 576): the REAL Oracle text of Deification (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no
// override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins: CR 614.12a (the choice as the permanent enters), CR 205.3j (planeswalker types), CR 607.2d (the choice is read by what is linked to it), CR 614.1a and 120.3c
// (the replaced result of damage to a planeswalker), CR 702.11b (hexproof). Rule numbers are as the code and docs already cite them; the CR text was not available here.
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

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const DACK = 'SYNTHETIC Dack Walker';
const AJANI = 'SYNTHETIC Ajani Walker';

describe('Deification', () => {
  const deification = real('Deification');
  const NAME = deification.name;
  const CHOSEN = { types: ['planeswalker'], controller: 'you', chosenPlaneswalkerType: true };

  test('the card is valid and says what the engine runs', () => {
    expect(validateCard(deification)).toEqual([]);
    const [face] = deification.faces;
    expect(face?.abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'planeswalkerType' } },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: CHOSEN },
          keyword: { kind: 'hexproof' },
        },
      },
      {
        kind: 'replacement',
        replacement: {
          kind: 'keepOneLoyalty',
          planeswalkers: CHOSEN,
          while: { kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: 1 },
        },
      },
    ]);
  });

  test('it asks for a planeswalker type as it enters, and keeps the answer', () => {
    const g = scenario()
      .define(deification)
      .seat(0)
      .hand(NAME)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseOption');
    if (d?.kind !== 'chooseOption') return;
    expect(d.purpose).toBe('planeswalkerType');
    expect(d.options).toContain('Elminster');
    g.act(0).chooseOption('Dack');
    g.expect.chosen(NAME, { planeswalkerType: 'Dack' });
  });

  const board = (chosen: string) =>
    scenario()
      .define(deification)
      .seat(0)
      .library(...FILLER)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain')
      .battlefield(NAME, { chosen: { planeswalkerType: chosen } })
      .battlefield(DACK, AJANI, BEARS)
      .seat(1)
      .library(...FILLER)
      .build();

  test('damage that would remove every loyalty counter of a walker of the chosen type leaves one', () => {
    const g = board('Dack');
    g.act(0).cast(BOLT, { targets: [{ name: DACK, seat: 0 }], pay: true });
    g.passAll();
    g.expect.counters(DACK, { loyalty: 1 });
    g.expect.zone(DACK, 'battlefield', { seat: 0 });
  });

  test('a walker of another type is not protected', () => {
    const g = board('Dack');
    g.act(0).cast(BOLT, { targets: [{ name: AJANI, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(AJANI, 'graveyard', { seat: 0 });
  });
});
