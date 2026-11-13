// The Danitha deck program (issue 26), group 2 (D-1220, D-1221 provisional): the REAL cards of the owner's golden corpus (real Oracle text, `fixtures/corpus/golden.jsonl`) read
// through the grammar only, defined in an engine scenario and played through applyAction: Ainok Wayfarer, Blanchwood Prowler, Airlift Chaplain, Cache Grab, Something Worth
// Saving, Town Greeter and Midnight Tilling all "mill N cards, you may put a card of a kind from among them into your hand" with a rider. The cards that stand in for the library
// are real engine fixtures, and two SYNTHETIC cards (a Squirrel creature card and a Town land card, which no engine fixture is).
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const real = (name: string) => {
  const golden = cards.find((c) => c.name === name);
  if (golden === undefined) throw new Error(`${name} is not in the golden corpus`);
  return { golden, card: importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES) };
};

const AINOK = real('Ainok Wayfarer');
const PROWLER = real('Blanchwood Prowler');
const CHAPLAIN = real('Airlift Chaplain');
const GRAB = real('Cache Grab');
const SAVING = real('Something Worth Saving');
const GREETER = real('Town Greeter');
const TILLING = real('Midnight Tilling');

const SQUIRREL = 'SYNTHETIC Squirrel Card';
const TOWN = 'SYNTHETIC Town Land';
const LABELS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

describe('the cards read', () => {
  test.each([AINOK, PROWLER, CHAPLAIN, GRAB, SAVING, GREETER, TILLING])(
    '$golden.name: supported, nothing left unparsed, validateCard is clean',
    ({ card }) => {
      expect(card.support.status).toBe('supported');
      expect(card.support.unparsed).toEqual([]);
      expect(card.support.reasons).toEqual([]);
      expect(validateCard(card.definition)).toEqual([]);
    },
  );

  test('Ainok Wayfarer is a mill, a choice among the cards it moved, and a counter when none is taken', () => {
    expect(AINOK.card.definition.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'mill', count: 3 },
          {
            kind: 'moveToZone',
            objects: { kind: 'choose', optional: true, fromMoved: true },
            to: 'hand',
          },
          { kind: 'conditional', condition: { kind: 'not', term: { kind: 'didPrevious' } } },
        ],
      },
    });
  });

  test('Ainok Wayfarer and Blanchwood Prowler read the same: the two wordings of the cards milled are one instruction', () => {
    expect(PROWLER.card.definition.faces[0]?.abilities).toEqual(
      AINOK.card.definition.faces[0]?.abilities,
    );
  });
});

const names = (g: ScenarioGame, zone: 'hand' | 'graveyard' | 'library') =>
  (g.state.seats[0]?.[zone] ?? []).map((id) => {
    const obj = g.state.objects[id];
    const card = obj?.card == null ? undefined : g.state.cards[obj.card];
    return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
  });

/** Seat 0 holds `def` with {1}{G}{W}; its library is `top` (labelled a, b, ...), then two cards never milled. */
function game(
  def: ReturnType<typeof real>['card']['definition'],
  top: readonly string[],
  battlefield: readonly string[] = [],
) {
  let b = scenario().define(def).seat(0).hand(def.name).pool('GWC');
  for (const name of battlefield) b = b.battlefield(name);
  for (const [i, name] of top.entries()) b = b.library(name, { label: LABELS[i] ?? `x${i}` });
  b = b.library('Swamp', { label: 'z1' }).library('Plains', { label: 'z2' });
  return b
    .seat(1)
    .library('Llanowar Elves')
    .library('Llanowar Elves')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

function cast(
  def: ReturnType<typeof real>['card']['definition'],
  top: readonly string[],
  battlefield: readonly string[] = [],
) {
  const g = game(def, top, battlefield);
  g.act(0).cast(def.name, { pay: true });
  g.passAll();
  return g;
}

describe('Ainok Wayfarer and Blanchwood Prowler played in a game', () => {
  test.each([AINOK, PROWLER])(
    '$golden.name: three are milled, a land card among them goes to the hand and no counter is put on it',
    ({ card }) => {
      const g = cast(card.definition, ['Island', 'Grizzly Bears', 'Forest', 'Mountain']);
      g.expect.pending('chooseCards', 0);
      g.act(0).chooseCards('c');
      expect(names(g, 'hand')).toEqual(['Forest']);
      expect(names(g, 'graveyard').sort()).toEqual(['Grizzly Bears', 'Island']);
      expect(names(g, 'library')).toEqual(['Mountain', 'Swamp', 'Plains']);
      g.expect.counters(card.definition.name, {});
      g.expect.invariants();
    },
  );

  test.each([AINOK, PROWLER])(
    '$golden.name: taking none, or no land among the three, puts a +1/+1 counter on it',
    ({ card }) => {
      const declined = cast(card.definition, ['Island', 'Grizzly Bears', 'Forest', 'Mountain']);
      declined.act(0).chooseCards();
      expect(names(declined, 'hand')).toEqual([]);
      declined.expect.counters(card.definition.name, { '+1/+1': 1 });
      declined.expect.pt(card.definition.name, 2, 2);
      const none = cast(card.definition, ['Grizzly Bears', 'Serra Angel', 'Lightning Bolt']);
      none.expect.pending('priority', 0);
      none.expect.counters(card.definition.name, { '+1/+1': 1 });
    },
  );
});

describe('Airlift Chaplain played in a game', () => {
  test('a Plains card or a creature card with mana value 3 or less, not a bigger creature or another land', () => {
    const g = cast(CHAPLAIN.card.definition, ['Island', 'Serra Angel', 'Grizzly Bears']);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('c');
    expect(names(g, 'hand')).toEqual(['Grizzly Bears']);
    g.expect.counters('Airlift Chaplain', {});
    const plains = cast(CHAPLAIN.card.definition, ['Plains', 'Serra Angel', 'Island']);
    plains.act(0).chooseCards('a');
    expect(names(plains, 'hand')).toEqual(['Plains']);
    const neither = cast(CHAPLAIN.card.definition, ['Island', 'Serra Angel', 'Lightning Bolt']);
    neither.expect.pending('priority', 0);
    neither.expect.counters('Airlift Chaplain', { '+1/+1': 1 });
  });
});

describe('Cache Grab, Something Worth Saving and Midnight Tilling played in a game', () => {
  const TOP = ['Lightning Bolt', 'Island', 'Grizzly Bears', 'Serra Angel'];

  test('Cache Grab: a Squirrel card put into the hand makes a Food token; another card does not', () => {
    const squirrel = cast(GRAB.card.definition, [SQUIRREL, 'Island', 'Lightning Bolt', 'Forest']);
    squirrel.act(0).chooseCards('a');
    expect(names(squirrel, 'hand')).toEqual([SQUIRREL]);
    squirrel.expect.zone('Food', 'battlefield', { seat: 0 });
    const other = cast(GRAB.card.definition, [SQUIRREL, 'Island', 'Lightning Bolt', 'Forest']);
    other.act(0).chooseCards('b');
    other.expect.noObject('Food', { zone: 'battlefield' });
    const declined = cast(GRAB.card.definition, [SQUIRREL, 'Island', 'Lightning Bolt', 'Forest']);
    declined.act(0).chooseCards();
    declined.expect.noObject('Food', { zone: 'battlefield' });
  });

  test('Cache Grab: controlling a Squirrel is enough', () => {
    const g = cast(
      GRAB.card.definition,
      ['Island', 'Lightning Bolt', 'Forest', 'Mountain'],
      [SQUIRREL],
    );
    g.act(0).chooseCards();
    g.expect.zone('Food', 'battlefield', { seat: 0 });
  });

  test('Something Worth Saving: a permanent card (an instant is not one), and 1 life either way', () => {
    const g = cast(SAVING.card.definition, TOP);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('d');
    expect(names(g, 'hand')).toEqual(['Serra Angel']);
    g.expect.life(0, 41);
    const none = cast(SAVING.card.definition, TOP);
    none.act(0).chooseCards();
    none.expect.life(0, 41);
  });

  test('Midnight Tilling: a permanent card from among the four cards milled', () => {
    const g = cast(TILLING.card.definition, TOP);
    g.act(0).chooseCards('c');
    expect(names(g, 'hand')).toEqual(['Grizzly Bears']);
    expect(names(g, 'graveyard').sort()).toEqual(
      ['Island', 'Lightning Bolt', 'Midnight Tilling', 'Serra Angel'].sort(),
    );
    g.expect.invariants();
  });
});

describe('Town Greeter played in a game', () => {
  test('a Town card put into the hand gains 2 life; another land, or none, does not', () => {
    const town = cast(GREETER.card.definition, [TOWN, 'Island', 'Grizzly Bears', 'Forest']);
    town.act(0).chooseCards('a');
    expect(names(town, 'hand')).toEqual([TOWN]);
    town.expect.life(0, 42);
    const island = cast(GREETER.card.definition, [TOWN, 'Island', 'Grizzly Bears', 'Forest']);
    island.act(0).chooseCards('b');
    island.expect.life(0, 40);
    const none = cast(GREETER.card.definition, [TOWN, 'Island', 'Grizzly Bears', 'Forest']);
    none.act(0).chooseCards();
    none.expect.life(0, 40);
    none.expect.invariants();
  });
});
