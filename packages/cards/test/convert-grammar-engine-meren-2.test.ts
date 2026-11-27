// Deck support issue 712 (Meren 2): the REAL cards of the golden corpus (card data from the issue's author) read through the grammar only and played through applyAction:
// Patient Naturalist and Dredger's Insight (mill, then a card from among the milled cards), Druidic Ritual (a mill that may be declined, then up to one creature card and up to one
// land card back from the graveyard). The cards that stand in for the library are real engine fixtures.
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

const NATURALIST = real('Patient Naturalist');
const INSIGHT = real("Dredger's Insight");
const RITUAL = real('Druidic Ritual');

describe('the cards read', () => {
  test.each([NATURALIST, INSIGHT, RITUAL])(
    '$golden.name: supported, nothing left unparsed, validateCard is clean',
    ({ card }) => {
      expect(card.support.unparsed).toEqual([]);
      expect(card.support.status).toBe('supported');
      expect(card.support.reasons).toEqual([]);
      expect(validateCard(card.definition)).toEqual([]);
    },
  );
});

const LABELS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

const names = (g: ScenarioGame, zone: 'hand' | 'graveyard' | 'library') =>
  (g.state.seats[0]?.[zone] ?? []).map((id) => {
    const obj = g.state.objects[id];
    const card = obj?.card == null ? undefined : g.state.cards[obj.card];
    return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
  });

/** Seat 0 holds `def` with {1}{G}{W} to spend; its library is `top` (labelled a, b, ...), then two cards never milled. Seat 1 is an opponent whose zones the cards never touch. */
function game(
  def: ReturnType<typeof real>['card']['definition'],
  top: readonly string[],
  graveyard: readonly string[] = [],
) {
  let b = scenario().define(def).seat(0).hand(def.name).pool('GWC');
  for (const name of graveyard) b = b.graveyard(name);
  for (const [i, name] of top.entries()) b = b.library(name, { label: LABELS[i] ?? `x${i}` });
  b = b.library('Swamp', { label: 'z1' }).library('Plains', { label: 'z2' });
  return b
    .seat(1)
    .graveyard('Grizzly Bears')
    .library('Llanowar Elves')
    .library('Llanowar Elves')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

function cast(
  def: ReturnType<typeof real>['card']['definition'],
  top: readonly string[],
  graveyard: readonly string[] = [],
) {
  const g = game(def, top, graveyard);
  g.act(0).cast(def.name, { pay: true });
  g.passAll();
  return g;
}

describe('Patient Naturalist played in a game', () => {
  test('is a mill of three, then a land card from among them into the hand, then a Treasure when none', () => {
    expect(NATURALIST.card.definition.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'mill', count: 3 },
          { kind: 'moveToZone', objects: { kind: 'choose', fromMoved: true }, to: 'hand' },
          { kind: 'conditional', condition: { kind: 'not', term: { kind: 'didPrevious' } } },
        ],
      },
    });
    const effects = JSON.stringify(NATURALIST.card.definition.faces[0]?.abilities[0]);
    expect(effects).not.toContain('"optional":true');
  });

  test('a land card among the three goes to the hand, no Treasure is made', () => {
    const g = cast(NATURALIST.card.definition, ['Island', 'Grizzly Bears', 'Forest', 'Mountain']);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('c');
    expect(names(g, 'hand')).toEqual(['Forest']);
    expect(names(g, 'graveyard').sort()).toEqual(['Grizzly Bears', 'Island']);
    expect(names(g, 'library')).toEqual(['Mountain', 'Swamp', 'Plains']);
    g.expect.noObject('Treasure', { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('no land among the three makes a Treasure token and takes nothing', () => {
    const g = cast(NATURALIST.card.definition, ['Grizzly Bears', 'Serra Angel', 'Lightning Bolt']);
    g.expect.pending('priority', 0);
    expect(names(g, 'hand')).toEqual([]);
    expect(names(g, 'graveyard').sort()).toEqual([
      'Grizzly Bears',
      'Lightning Bolt',
      'Serra Angel',
    ]);
    g.expect.zone('Treasure', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe("Dredger's Insight played in a game", () => {
  test('mills four, and a card of the three kinds from among them goes to the hand (a spell does not)', () => {
    const g = cast(INSIGHT.card.definition, [
      'Lightning Bolt',
      'Island',
      'Grizzly Bears',
      'Serra Angel',
    ]);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('c');
    expect(names(g, 'hand')).toEqual(['Grizzly Bears']);
    expect(names(g, 'graveyard').sort()).toEqual(['Island', 'Lightning Bolt', 'Serra Angel']);
  });

  test('a creature card that leaves the graveyard gains 1 life, once (a land card does not)', () => {
    const creature = cast(INSIGHT.card.definition, [
      'Lightning Bolt',
      'Island',
      'Grizzly Bears',
      'Serra Angel',
    ]);
    creature.act(0).chooseCards('c');
    creature.passAll();
    creature.expect.life(0, 41);
    const land = cast(INSIGHT.card.definition, [
      'Lightning Bolt',
      'Island',
      'Grizzly Bears',
      'Serra Angel',
    ]);
    land.act(0).chooseCards('b');
    land.passAll();
    land.expect.life(0, 40);
    const none = cast(INSIGHT.card.definition, [
      'Lightning Bolt',
      'Island',
      'Grizzly Bears',
      'Serra Angel',
    ]);
    none.act(0).chooseCards();
    none.passAll();
    none.expect.life(0, 40);
    none.expect.invariants();
  });

  test('the trigger watches the graveyard of its controller only', () => {
    const g = game(INSIGHT.card.definition, ['Island', 'Island', 'Island', 'Island']);
    g.act(0).cast(INSIGHT.card.definition.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.life(0, 40);
    g.expect.life(1, 40);
  });
});

describe('Druidic Ritual played in a game', () => {
  const TOP = ['Island', 'Lightning Bolt', 'Serra Angel'];

  test('is an offer to mill three, then a choice of none or one creature card and of none or one land card', () => {
    expect(RITUAL.card.definition.faces[0]?.spell).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'may', effect: { kind: 'mill', count: 3 } },
          {
            kind: 'moveToZone',
            objects: {
              kind: 'choose',
              filter: { types: ['creature'], zone: 'graveyard' },
              optional: true,
            },
            to: 'hand',
          },
          {
            kind: 'moveToZone',
            objects: {
              kind: 'choose',
              filter: { types: ['land'], zone: 'graveyard' },
              optional: true,
            },
            to: 'hand',
          },
        ],
      },
    });
  });

  test('mills three, then a creature card and a land card come back, from the milled cards or from before', () => {
    const g = cast(RITUAL.card.definition, TOP, ['Grizzly Bears', 'Forest']);
    g.act(0).accept();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Serra Angel');
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Forest');
    expect(names(g, 'hand').sort()).toEqual(['Forest', 'Serra Angel']);
    expect(names(g, 'graveyard').sort()).toEqual(
      ['Druidic Ritual', 'Grizzly Bears', 'Island', 'Lightning Bolt'].sort(),
    );
    expect(names(g, 'library')).toEqual(['Swamp', 'Plains']);
    g.expect.invariants();
  });

  test('declining the mill still returns the cards already in the graveyard', () => {
    const g = cast(RITUAL.card.definition, TOP, ['Grizzly Bears', 'Forest']);
    g.act(0).decline();
    g.act(0).chooseCards('Grizzly Bears');
    g.act(0).chooseCards('Forest');
    expect(names(g, 'hand').sort()).toEqual(['Forest', 'Grizzly Bears']);
    expect(names(g, 'library')).toEqual([...TOP, 'Swamp', 'Plains']);
  });

  test('each choice may be none, and nothing is asked when no card of the kind is there', () => {
    const none = cast(RITUAL.card.definition, TOP, ['Grizzly Bears', 'Forest']);
    none.act(0).decline();
    none.act(0).chooseCards();
    none.act(0).chooseCards();
    expect(names(none, 'hand')).toEqual([]);
    const bare = cast(RITUAL.card.definition, ['Island', 'Island', 'Island']);
    bare.act(0).decline();
    bare.expect.pending('priority', 0);
    bare.expect.invariants();
  });

  test('only the controller graveyard is looked at, never an opponent’s', () => {
    const g = cast(RITUAL.card.definition, ['Island', 'Island', 'Island']);
    g.act(0).decline();
    g.expect.pending('priority', 0);
    expect(names(g, 'hand')).toEqual([]);
  });
});

describe('what is not read', () => {
  const withText = (text: string) =>
    importCard(
      fromGoldenCard({
        ...NATURALIST.golden,
        faces: [{ ...NATURALIST.golden.faces[0], oracleText: text }] as never,
      }),
      undefined,
      NO_OVERRIDES,
    );

  test('the same wording read with the matching rider is supported (the refusals below are the rider, not the words)', () => {
    const text =
      "When this creature enters, mill three cards. Put a land card from among the milled cards into your hand. If you can't, create a Treasure token.";
    expect(withText(text).support.status).toBe('supported');
  });

  test('"If you can\'t" after a "you may" choice stays unsupported (declining is not being unable)', () => {
    const text =
      "When this creature enters, mill three cards. You may put a land card from among the milled cards into your hand. If you can't, create a Treasure token.";
    expect(withText(text).support.status).toBe('unsupported');
  });

  test('"If you don\'t" after a mandatory choice stays unsupported (nothing was declined)', () => {
    const text =
      "When this creature enters, mill three cards. Put a land card from among the milled cards into your hand. If you don't, create a Treasure token.";
    expect(withText(text).support.status).toBe('unsupported');
  });

  test('two kinds are one trigger of either kind, and a second kind that repeats the first is not read', () => {
    const text =
      'Whenever one or more artifact and/or artifact cards leave your graveyard, you gain 1 life.';
    expect(withText(text).support.status).toBe('unsupported');
  });
});
