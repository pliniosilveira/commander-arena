// The Danitha deck program (issue 26), group 1A (D-396, D-397, CR 701.20a): the REAL cards of the owner's golden corpus (real Oracle text, `fixtures/corpus/golden.jsonl`) read
// through the grammar only, defined in an engine scenario and played through applyAction: Commune with the Gods, Satyr Wayfinder, Vessel of Nascency and Malevolent Rumble all
// "reveal the top N cards of your library, you may put <a kind of> card from among them into your hand, put the rest into your graveyard". The cards that stand in for the
// library are real engine fixtures.
import { readFileSync } from 'node:fs';
import { type GameEvent, validateCard } from '@commander-arena/engine';
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

const COMMUNE = real('Commune with the Gods');
const SATYR = real('Satyr Wayfinder');
const VESSEL = real('Vessel of Nascency');
const RUMBLE = real('Malevolent Rumble');

const REAL_TEXT: Readonly<Record<string, string>> = {
  'Commune with the Gods':
    'Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard.',
  'Satyr Wayfinder':
    'When this creature enters, reveal the top four cards of your library. You may put a land card from among them into your hand. Put the rest into your graveyard.',
  'Vessel of Nascency':
    '{1}{G}, Sacrifice this enchantment: Reveal the top four cards of your library. You may put an artifact, creature, enchantment, land, or planeswalker card from among them into your hand. Put the rest into your graveyard.',
  'Malevolent Rumble':
    'Reveal the top four cards of your library. You may put a permanent card from among them into your hand. Put the rest into your graveyard. Create a 0/1 colorless Eldrazi Spawn creature token with "Sacrifice this token: Add {C}."',
};

const LABELS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const TOP = ['Island', 'Grizzly Bears', 'Lightning Bolt', 'Serra Angel', 'Forest'];

describe('the cards read', () => {
  test.each([COMMUNE, SATYR, VESSEL, RUMBLE])(
    '$golden.name: supported, nothing left unparsed, validateCard is clean',
    ({ golden, card }) => {
      expect(golden.faces[0]?.oracleText).toBe(REAL_TEXT[golden.name]);
      expect(card.support.status).toBe('supported');
      expect(card.support.unparsed).toEqual([]);
      expect(card.support.reasons).toEqual([]);
      expect(validateCard(card.definition)).toEqual([]);
    },
  );

  test('Commune with the Gods is one lookAtTop with revealAll: five cards, a creature or enchantment, the rest into the graveyard', () => {
    expect(COMMUNE.card.definition.faces[0]?.spell?.effect).toEqual({
      kind: 'lookAtTop',
      count: 5,
      revealAll: true,
      take: { filter: { anyOf: [{ types: ['creature'] }, { types: ['enchantment'] }] }, max: 1 },
      rest: 'graveyard',
    });
  });

  test('Malevolent Rumble is that, then a 0/1 Eldrazi Spawn token with a mana ability', () => {
    const effect = RUMBLE.card.definition.faces[0]?.spell?.effect;
    expect(effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'lookAtTop', count: 4, revealAll: true },
        { kind: 'createToken', count: 1 },
      ],
    });
  });
});

const revealed = (events: readonly GameEvent[]) =>
  events.filter(
    (e): e is Extract<GameEvent, { kind: 'cardsRevealed' }> => e.kind === 'cardsRevealed',
  );

/** Seat 0 holds or controls `def` with {1}{G}; its library is `top`, then two cards that are never revealed. */
function game(
  def: ReturnType<typeof real>['card']['definition'],
  where: 'hand' | 'battlefield',
  top: readonly string[] = TOP,
) {
  let b = scenario().define(def).seat(0);
  b = where === 'hand' ? b.hand(def.name) : b.battlefield(def.name);
  b = b.pool('GC');
  for (const [i, name] of top.entries()) b = b.library(name, { label: LABELS[i] ?? `x${i}` });
  b = b.library('Swamp', { label: 'z1' }).library('Plains', { label: 'z2' });
  return b
    .seat(1)
    .library('Llanowar Elves')
    .library('Llanowar Elves')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

const names = (g: ScenarioGame, zone: 'hand' | 'graveyard' | 'library') =>
  (g.state.seats[0]?.[zone] ?? []).map((id) => {
    const obj = g.state.objects[id];
    const card = obj?.card == null ? undefined : g.state.cards[obj.card];
    return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
  });

describe('Commune with the Gods played in a game', () => {
  test('five cards are revealed to everyone; a creature or enchantment card goes to the hand and the other four to the graveyard', () => {
    const g = game(COMMUNE.card.definition, 'hand');
    g.act(0).cast('Commune with the Gods', { pay: true });
    g.passAll();
    expect(revealed(g.eventsSince(0))).toHaveLength(1);
    expect(revealed(g.eventsSince(0))[0]?.names).toEqual(TOP);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('d');
    expect(names(g, 'hand')).toEqual(['Serra Angel']);
    expect(names(g, 'graveyard').sort()).toEqual(
      ['Commune with the Gods', 'Island', 'Grizzly Bears', 'Lightning Bolt', 'Forest'].sort(),
    );
    expect(names(g, 'library')).toEqual(['Swamp', 'Plains']);
    g.expect.invariants();
  });
});

describe('Satyr Wayfinder played in a game', () => {
  test('the enters trigger reveals four and a land card may be taken', () => {
    const g = game(SATYR.card.definition, 'hand');
    g.act(0).cast('Satyr Wayfinder', { pay: true });
    g.passAll();
    expect(revealed(g.eventsSince(0))[0]?.names).toEqual(TOP.slice(0, 4));
    g.act(0).chooseCards('a');
    expect(names(g, 'hand')).toEqual(['Island']);
    expect(names(g, 'graveyard')).toHaveLength(3);
    expect(names(g, 'library')).toEqual(['Forest', 'Swamp', 'Plains']);
    g.expect.zone('Satyr Wayfinder', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Vessel of Nascency played in a game', () => {
  test('sacrificed for {1}{G}, it reveals four and an artifact, creature, enchantment, land or planeswalker card may be taken', () => {
    const g = game(VESSEL.card.definition, 'battlefield');
    g.act(0).activate('Vessel of Nascency', { pay: true });
    g.expect.zone('Vessel of Nascency', 'graveyard', { seat: 0 });
    g.passAll();
    expect(revealed(g.eventsSince(0))[0]?.names).toEqual(TOP.slice(0, 4));
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    // Lightning Bolt (an instant) is the one of the four that cannot be taken.
    expect(d.legal).toEqual(['a', 'b', 'd'].map((l) => g.id(l)));
    g.act(0).chooseCards('b');
    expect(names(g, 'hand')).toEqual(['Grizzly Bears']);
    g.expect.invariants();
  });
});

describe('Malevolent Rumble played in a game', () => {
  test('any permanent card may be taken, and the Eldrazi Spawn token is created either way', () => {
    const g = game(RUMBLE.card.definition, 'hand');
    g.act(0).cast('Malevolent Rumble', { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.legal).toEqual(['a', 'b', 'd'].map((l) => g.id(l)));
    g.act(0).chooseCards();
    expect(names(g, 'hand')).toEqual([]);
    expect(names(g, 'graveyard')).toHaveLength(5);
    g.expect.zone('Eldrazi Spawn', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});
