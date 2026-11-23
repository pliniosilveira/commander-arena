// Strago and Relm (deck support issue 97): the REAL Oracle text of the acceptance card (fixtures/corpus/golden.jsonl, taken from the issue) goes through the grammar as a card with
// no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins: CR 701.13 (exile from the top until a card is found), CR 608.2g and 118.9 (cast without paying its mana cost during resolution), CR 613.1f and 400.7 (the creature spell
// gains haste and the end step trigger, for as long as the permanent stays), CR 603.7 (the trigger of the permanent), CR 115.1 (one target opponent, with three seats).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const CARDS = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = CARDS.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the fixture`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const CARD = real('Strago and Relm');
const NAME = CARD.name;
const BOLT = 'Lightning Bolt'; // {R} instant
const BEARS = 'Grizzly Bears'; // {1}{G} creature
const SPIDER = 'Giant Spider'; // {3}{G} creature
const FOREST = 'Forest';
const ISLANDS = Array.from({ length: 4 }, () => 'Island');

/** Seat 0 has Strago and Relm and three Mountains; the library of seat 1 (top first) is `library`. */
const game = (library: readonly string[], seats: 2 | 3 = 2) => {
  const b = scenario({ seats })
    .define(CARD)
    .seat(0)
    .life(20)
    .battlefield(NAME, 'Mountain', 'Mountain', 'Mountain')
    .library(...ISLANDS)
    .seat(1)
    .life(20)
    .library(...library, ...ISLANDS);
  const more =
    seats === 3
      ? b
          .seat(2)
          .life(20)
          .library('Plains', ...ISLANDS)
      : b;
  return more.at('precombatMain', { active: 0, turn: 3 }).build();
};

const sketch = (g: ReturnType<typeof game>, player = 1) =>
  g.act(0).activate(NAME, { ability: 0, targets: [{ player }], pay: true });

describe('Strago and Relm: Sketch and Lore', () => {
  test('it reads as supported and is valid', () => {
    expect(validateCard(CARD)).toEqual([]);
  });

  test('a creature is found: the cards before it stay exiled, the creature is cast for free and has haste', () => {
    const g = game([FOREST, BEARS, SPIDER]);
    sketch(g);
    g.passAll();
    // The Forest and the Bears are exiled; the Spider was never reached. Only the Bears can be cast.
    g.expect.zone(FOREST, 'exile', { seat: 1 });
    g.expect.zone(SPIDER, 'library', { seat: 1 });
    const decision = g.state.pending;
    expect(decision?.kind).toBe('chooseCards');
    if (decision?.kind !== 'chooseCards') return;
    expect(decision.purpose).toBe('cast');
    expect(decision.legal).toEqual([g.id(BEARS)]);
    g.act(0).chooseCards({ name: BEARS, zone: 'exile', seat: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.derived(BEARS, { keywords: ['haste'] });
    g.expect.zone(FOREST, 'exile', { seat: 1 });
    g.expect.tapped(NAME, true);
  });

  test('the creature is sacrificed at the beginning of the end step, to its owner’s graveyard', () => {
    const g = game([BEARS]);
    sketch(g);
    g.passAll();
    g.act(0).chooseCards({ name: BEARS, zone: 'exile', seat: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
  });

  test('an instant is cast for free as a spell and does not gain anything', () => {
    const g = game([FOREST, BOLT]);
    sketch(g);
    g.passAll();
    g.act(0).chooseCards({ name: BOLT, zone: 'exile', seat: 1 });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.zone(FOREST, 'exile', { seat: 1 });
  });

  test('declining the cast leaves the card in exile', () => {
    const g = game([BEARS]);
    sketch(g);
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
  });

  test('no instant, sorcery or creature card: the whole library is exiled and nothing is offered', () => {
    const g = game([FOREST]);
    sketch(g);
    g.passAll();
    g.expect.zone(FOREST, 'exile', { seat: 1 });
    g.expect.librarySize(1, 0);
    g.expect.pending('priority', 0);
  });

  test('three seats: it is the library of the target opponent that is exiled from', () => {
    const g = game([BEARS], 3);
    sketch(g, 2);
    g.passAll();
    // The Plains were exiled from seat 2 and no spell can be cast from them; the library of seat 1 is untouched.
    g.expect.zone('Plains', 'exile', { seat: 2 });
    g.expect.librarySize(1, 1 + ISLANDS.length);
    g.expect.pending('priority', 0);
  });
});
