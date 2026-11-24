// The Mind Flayarrrs deck, group 10: the REAL Oracle text of From the Catacombs (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override,
// is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 400.7 and 110.2a (a card
// put onto the battlefield is a new object under the control of the player who puts it), CR 122.6 and 614.1c (it enters with the counter), CR 726.1, 726.2 and 726.5 (the initiative
// and its inherent abilities: taking it ventures into Undercity), CR 701.49 (venture), CR 614.1a and 614.6 (a replacement effect that exiles the permanent instead of letting
// it go anywhere else), CR 702.138a (escape: cast from the graveyard for {3}{B}{B} and five other cards exiled).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const CATACOMBS_CARD = real('From the Catacombs');
const CATACOMBS = CATACOMBS_CARD.name;
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 12 }, () => 'Plains');
const GRAVE_FILLER = [
  'Giant Spider',
  'Typhoid Rats',
  'Youthful Knight',
  'Fencing Ace',
  'Raging Goblin',
  'Yargle, Glutton of Urborg',
];

describe('the card is supported', () => {
  test('it reads as supported and is valid', () => {
    expect(validateCard(CATACOMBS_CARD)).toEqual([]);
  });

  test('a sorcery whose effect puts the card onto the battlefield with a counter, takes the initiative and marks the creature, with escape', () => {
    const [face] = CATACOMBS_CARD.faces;
    expect(face?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        {
          kind: 'moveToZone',
          to: 'battlefield',
          controller: 'you',
          withCounters: { counter: 'corpse', count: 1 },
        },
        { kind: 'takeInitiative', player: { kind: 'you' } },
        { kind: 'exileIfLeaves', objects: { kind: 'moved' } },
      ],
    });
    expect(face?.alternativeCosts?.map((c) => c.kind)).toEqual(['escape']);
  });
});

describe('Put target creature card from a graveyard onto the battlefield under your control with a corpse counter on it. You take the initiative.', () => {
  const game = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      scenario()
        .define(CATACOMBS_CARD)
        .seat(0)
        .hand(CATACOMBS)
        .battlefield('Swamp', { count: 5 })
        .library(...FILLER)
        .seat(1)
        .graveyard(BEARS)
        .library(...FILLER),
    )
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the creature card of an opponent’s graveyard enters under your control with a corpse counter, and you have the initiative', () => {
    const g = game();
    g.act(0).cast(CATACOMBS, { targets: [BEARS], pay: true });
    g.passAll();
    const bears = g.find({ name: BEARS })[0];
    expect(bears?.zone).toBe('battlefield');
    expect(bears?.controller).toBe(0);
    expect(bears?.counters.corpse).toBe(1);
    g.expect.initiative(0);
    g.expect.eventLog([{ kind: 'initiativeTaken', seat: 0, from: null }]);
  });

  test('taking the initiative makes you venture into Undercity: the Secret Entrance', () => {
    const g = game();
    g.act(0).cast(CATACOMBS, { targets: [BEARS], pay: true });
    g.pass();
    g.pass();
    g.expect.stack(['The initiative (ability)']);
    g.pass();
    g.pass();
    g.expect.dungeon(0, 'secretEntrance');
  });

  test('a creature card of your own graveyard is a target too, and a card of any graveyard', () => {
    const own = game((b) => b.seat(0).graveyard('Giant Spider'));
    own
      .act(0)
      .cast(CATACOMBS, { targets: [{ name: 'Giant Spider', zone: 'graveyard' }], pay: true });
    own.passAll();
    expect(own.find({ name: 'Giant Spider' })[0]?.zone).toBe('battlefield');
    expect(own.find({ name: 'Giant Spider' })[0]?.counters.corpse).toBe(1);
    own.expect.zone(BEARS, 'graveyard');
  });

  test('a card that is not a creature is not a target: with none in any graveyard the spell can’t be cast', () => {
    const g = scenario()
      .define(CATACOMBS_CARD)
      .seat(0)
      .hand(CATACOMBS)
      .battlefield('Swamp', { count: 5 })
      .library(...FILLER)
      .seat(1)
      .graveyard(BOLT)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.illegal(0, { cast: CATACOMBS });
  });
});

describe('If that creature would leave the battlefield, exile it instead of putting it anywhere else.', () => {
  test('the creature killed on the battlefield is exiled, not put into the graveyard', () => {
    const g = scenario()
      .define(CATACOMBS_CARD)
      .seat(0)
      .hand(CATACOMBS, BOLT)
      .battlefield('Swamp', { count: 5 })
      .battlefield('Mountain')
      .library(...FILLER)
      .seat(1)
      .graveyard(BEARS)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(CATACOMBS, { targets: [BEARS], pay: true });
    g.passAll();
    // The initiative sent the player into Undercity: the Secret Entrance searches for a basic land.
    g.act(0).chooseCards({ name: 'Plains', zone: 'library', nth: 0 });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.find({ name: BEARS })[0]?.zone).toBe('exile');
    expect(g.find({ name: BEARS, zone: 'graveyard' })).toHaveLength(0);
  });

  test('the creature is marked as it enters, so that leaving the battlefield exiles it (CR 614.1a)', () => {
    const g = scenario()
      .define(CATACOMBS_CARD)
      .seat(0)
      .hand(CATACOMBS)
      .battlefield('Swamp', { count: 5 })
      .library(...FILLER)
      .seat(1)
      .graveyard(BEARS)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(CATACOMBS, { targets: [BEARS], pay: true });
    g.passAll();
    const bears = g.find({ name: BEARS })[0];
    expect(bears?.exileIfLeaves).toBe(true);
  });
});

describe('Escape—{3}{B}{B}, Exile five other cards from your graveyard.', () => {
  test('from the graveyard with five other cards: cast for {3}{B}{B}, they are exiled, and the spell does what it does', () => {
    const g = scenario()
      .define(CATACOMBS_CARD)
      .seat(0)
      .graveyard(CATACOMBS, ...GRAVE_FILLER.slice(0, 5))
      .battlefield('Swamp', { count: 5 })
      .library(...FILLER)
      .seat(1)
      .graveyard(BEARS)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.legal(0, { cast: CATACOMBS, alternative: 'escape' });
    g.act(0).cast(CATACOMBS, { alternative: 'escape', targets: [BEARS], pay: true });
    // Exactly five other cards: they are all exiled, nothing is asked.
    g.passAll();
    for (const name of GRAVE_FILLER.slice(0, 5)) {
      expect(g.find({ name })[0]?.zone, name).toBe('exile');
    }
    expect(g.find({ name: BEARS })[0]?.zone).toBe('battlefield');
    g.expect.initiative(0);
  });

  test('with four other cards only, there is no escape option', () => {
    const g = scenario()
      .define(CATACOMBS_CARD)
      .seat(0)
      .graveyard(CATACOMBS, ...GRAVE_FILLER.slice(0, 4))
      .battlefield('Swamp', { count: 5 })
      .seat(1)
      .graveyard(BEARS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.illegal(0, { cast: CATACOMBS, alternative: 'escape' });
  });
});
