// Living Death (the Meren deck): the REAL Oracle text from the corpus's golden.jsonl goes through the grammar as a card with no override, is compared with the SYNTHETIC card of the
// engine fixtures that the engine scenarios of `scenario-xx-living-death.test.ts` run, and is played through applyAction.
// Pins: CR 404.1 (each player's own graveyard), CR 608.2c (the cards "exiled this way" are the ones the first instruction exiled), CR 701.21a (all creatures are sacrificed by their
// controllers), CR 110.2 (the cards come back under their owner's control).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly, spellCard } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const golden = GOLDEN.find((c) => c.name === 'Living Death');
if (golden === undefined) throw new Error('Living Death is not in the golden corpus');
const imported = importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
const LIVING_DEATH: CardDefinition = imported.definition;

const spellOf = (card: CardDefinition) => card.faces[0]?.spell;

describe('the real card is the nodes the engine fixture holds', () => {
  test('it is supported and valid', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(LIVING_DEATH)).toEqual([]);
  });

  test('its spell is the one of the SYNTHETIC Mass Revival', () => {
    expect(spellOf(LIVING_DEATH)).toEqual(spellOf(syntheticCard('SYNTHETIC Mass Revival')));
  });
});

describe('the sentence is read only as what it says', () => {
  const sorcery = (text: string) =>
    parseOnly(spellCard('SYNTHETIC Yard Probe', text, { type: 'Sorcery' }));
  const EXILE = 'Each player exiles all creature cards from their graveyard';
  const PUT = 'puts all cards they exiled this way onto the battlefield';

  test('an exile of each graveyard followed by the return of what was exiled lowers to exile and move', () => {
    const card = sorcery(`${EXILE}, then ${PUT}.`);
    expect(card.support.status).toBe('supported');
    expect(card.definition.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'exile',
          objects: { kind: 'each', filter: { zone: 'graveyard', types: ['creature'] } },
        },
        { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield', controller: 'owner' },
      ],
    });
  });

  test('the return is read after a sacrifice that comes between, and in a sentence of its own', () => {
    expect(
      sorcery(`${EXILE}, then sacrifices all creatures they control, then ${PUT}.`).support.status,
    ).toBe('supported');
    expect(sorcery(`${EXILE}. Each player ${PUT}.`).support.status).toBe('supported');
  });

  test('the return needs the exile before it', () => {
    expect(sorcery(`Each player ${PUT}.`).support.status).toBe('unsupported');
    // Another move between the two replaces what "exiled this way" means.
    expect(
      sorcery(
        `${EXILE}. Return target creature card from your graveyard to your hand. Each player ${PUT}.`,
      ).support.status,
    ).toBe('unsupported');
  });

  test('another subject, zone or count is not read', () => {
    for (const text of [
      'Exile all creature cards from their graveyard.',
      'Each opponent exiles all creature cards from their graveyard.',
      'Each player exiles a creature card from their graveyard.',
      'Each player exiles all creature cards from your graveyard.',
      `${EXILE}. You put all cards they exiled this way onto the battlefield.`,
    ]) {
      expect(sorcery(text).support.status, text).toBe('unsupported');
    }
  });
});

describe('Living Death is played', () => {
  const BEARS = 'Grizzly Bears';
  const SPIDER = 'Giant Spider';
  const ELVES = 'Llanowar Elves';
  const RATS = 'Typhoid Rats';
  const BOLT = 'Lightning Bolt';
  const game = (
    mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
    theirs: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
  ) =>
    theirs(
      mine(
        scenario()
          .define(LIVING_DEATH)
          .seat(0)
          .library(...Array.from({ length: 8 }, () => 'Plains')),
      )
        .seat(1)
        .library(...Array.from({ length: 8 }, () => 'Plains')),
    )
      .at('precombatMain')
      .build();

  test('each player gets back the creature cards of their own graveyard and loses the creatures they had', () => {
    const g = game(
      (b) =>
        b
          .hand(LIVING_DEATH.name)
          .battlefield('Swamp', { count: 5 })
          .battlefield(BEARS)
          .graveyard(ELVES, BOLT),
      (b) => b.battlefield(SPIDER).graveyard(RATS),
    );
    g.act(0).cast(LIVING_DEATH.name, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(RATS, 'battlefield', { seat: 1, count: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 1, count: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});
