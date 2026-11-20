// The Blight Curse deck, group "blight" (Lorwyn Eclipsed): the REAL Oracle text of Burning Curiosity ("As an additional cost to cast this spell, you may blight 1." and "If this
// spell's additional cost was paid, exile the top three cards instead."), Sinister Gnarlbark ("draw a card and blight 1") and Auntie Ool, Cursewretch ("Ward—Blight 2.") from the
// golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real
// text are what the engine runs. Auntie Ool's other ability ("Whenever one or more -1/-1 counters are put on a creature, ...") belongs to another group (convert-grammar-engine-blight-curse-counters.test.ts), and only
// her ward line is checked here. Pins: CR 701.68a and 701.68b (Blight), CR 118.8 and 601.2b (an additional cost, the optional one may be declined), CR 608.2c and 614.1a ("exile the top
// three cards instead"), CR 702.21a and 118.12a (Ward), CR 611.2a and 514.2 (until the end of your next turn).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function imported(name: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
}

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = imported(name);
  expect(card.support.unparsed, name).toEqual([]);
  expect(card.support.status, name).toBe('supported');
  return card.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Burning Curiosity', () => {
  const curiosity = real('Burning Curiosity');
  const CURIOSITY = curiosity.name;

  /** Seat 0 has the sorcery in hand, three Mountains and `mine`; the library starts with a Forest, the Bears and the Elves. */
  const start = (...mine: readonly string[]) =>
    scenario()
      .define(curiosity)
      .seat(0)
      .hand(CURIOSITY)
      .library('Forest', { label: 'forest' })
      .library(BEARS, { label: 'bears' })
      .library(ELVES, { label: 'elves' })
      .library(...LIBRARY)
      .battlefield('Mountain', { count: 3 })
      .battlefield(...mine)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(curiosity)).toEqual([]);
    const face = curiosity.faces[0];
    expect(face?.additionalCosts).toEqual([{ kind: 'blight', count: 1, optional: true }]);
    expect(face?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'conditional',
          condition: { kind: 'additionalCostPaid' },
          effect: { kind: 'exileTop', count: 3 },
          else: { kind: 'exileTop', count: 2 },
        },
        { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfYourNextTurn' },
      ],
    });
  });

  test('blighting a creature pays the cost: it gets the counter, three cards are exiled and may be played', () => {
    const g = start(SPIDER);
    g.act(0).cast(CURIOSITY, { pay: true });
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(SPIDER);
    g.expect.counters(SPIDER, { '-1/-1': 1 });
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ELVES, 'exile', { seat: 0 });
    // The cards may be played: the land as a land drop, a creature spell by casting it (mana from the Mountains is spent on the sorcery; the rest are untapped).
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declining the blight exiles only two cards, and nothing is put on a creature', () => {
    const g = start(SPIDER);
    g.act(0).cast(CURIOSITY, { pay: true });
    g.act(0).choosePermanents();
    g.expect.counters(SPIDER, {});
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ELVES, 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('with no creature to blight the spell is cast without a question and exiles two cards', () => {
    const g = start();
    g.act(0).cast(CURIOSITY, { pay: true });
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ELVES, 'library', { seat: 0 });
  });

  test('the permission lasts until the end of the controller’s next turn, and no longer', () => {
    const g = start(SPIDER);
    g.act(0).cast(CURIOSITY, { pay: true });
    g.act(0).choosePermanents();
    g.passAll();
    // This turn's end, then the opponent's turn: the Bears may still be cast on the controller's next turn.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0, turn: 5 });
    expect(g.act(0).try.playLand('Forest').ok).toBe(true);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0, turn: 7 });
    expect(g.act(0).try.cast(BEARS).ok).toBe(false);
  });
});

describe('Sinister Gnarlbark', () => {
  const gnarlbark = real('Sinister Gnarlbark');
  const GNARLBARK = gnarlbark.name;

  const start = (...mine: readonly string[]) =>
    scenario()
      .define(gnarlbark)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GNARLBARK, ...mine)
      .seat(1)
      .library(...LIBRARY)
      .at('postcombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(gnarlbark)).toEqual([]);
    expect(gnarlbark.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: { kind: 'you' }, count: 1 },
            { kind: 'blight', count: 1 },
          ],
        },
      },
    ]);
  });

  test('at the beginning of the controller’s end step a card is drawn and the creature they choose gets a -1/-1 counter', () => {
    const g = start(SPIDER, ELVES);
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end');
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(SPIDER);
    g.expect.counters(SPIDER, { '-1/-1': 1 });
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
    g.expect.invariants();
  });

  test('alone, the Gnarlbark is the only creature, so it blights itself without a question', () => {
    const g = start();
    g.advanceTo('end');
    g.passAll();
    g.expect.counters(GNARLBARK, { '-1/-1': 1 });
    g.expect.pt(GNARLBARK, -1, 3);
  });
});

describe('Auntie Ool, Cursewretch: "Ward—Blight 2."', () => {
  const ool = imported('Auntie Ool, Cursewretch');

  test('the ward line is read into the engine ward keyword with a blight cost, and her counter trigger (the counter triggers group) makes the card supported', () => {
    expect(ool.definition.faces[0]?.abilities).toContainEqual({
      kind: 'keyword',
      keyword: { kind: 'ward', cost: [{ kind: 'blight', count: 2 }] },
    });
    expect(ool.support.unparsed).toEqual([]);
    expect(ool.support.status).toBe('supported');
  });

  test('the ward line alone, as a card, makes the opponent put two counters on a creature of theirs to keep a spell', () => {
    const warden: CardDefinition = {
      ...ool.definition,
      name: 'SYNTHETIC Ward Only Ool',
      faces: ool.definition.faces.map((f) => ({
        ...f,
        name: 'SYNTHETIC Ward Only Ool',
        abilities: f.abilities.filter((a) => a.kind === 'keyword'),
        oracleText: 'Ward—Blight 2.',
      })),
    };
    expect(validateCard(warden)).toEqual([]);
    const g = scenario()
      .define(warden)
      .seat(0)
      .hand(BOLT)
      .library(...LIBRARY)
      .battlefield('Mountain', { count: 2 })
      .battlefield(SPIDER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(warden.name)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BOLT, { targets: [warden.name], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.counters(SPIDER, { '-1/-1': 2 });
    g.passAll();
    // The Bolt resolved (the Warden is a 4/4 here only in name: it keeps the real card's toughness).
    g.expect.damage(warden.name, 3);
  });
});
