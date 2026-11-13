// The Niv-Mizzet deck (issue 25), group 3-c (D-990 to D-994): the REAL Oracle text of Quistis Trepe (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are
// what the engine runs. The helper cards are SYNTHETIC (src/cards/fixtures) or old fixtures. Pins: CR 608.2g (the cast is part of the resolution), CR 601.2 (the
// mana cost is paid), CR 609.4b (mana of any type), CR 614.1a (the exile replaces the move to a graveyard), CR 108.3 and 400.3 (a card goes to its owner's zone).
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

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BOLT = 'Lightning Bolt'; // {R}: 3 damage to any target
const DIVINATION = 'Divination'; // {2}{U}: draw two cards
const COUNTERSPELL = 'Counterspell';

describe('Quistis Trepe: "Blue Magic — When ~ enters, you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead."', () => {
  const quistis = real('Quistis Trepe');
  const QUISTIS = quistis.name;

  /** Seat 0 holds Quistis and a Island and two Swamps (which pay her {2}{U}) beside `lands` more; the graveyards are given. */
  const start = (
    mine: readonly string[],
    theirs: readonly string[],
    lands: readonly string[] = ['Mountain', 'Mountain', 'Mountain'],
    theirHand: readonly string[] = [],
  ) =>
    scenario()
      .define(quistis)
      .seat(0)
      .hand(QUISTIS)
      .battlefield('Island')
      .battlefield('Swamp', { count: 2 })
      .battlefield(...lands)
      .graveyard(...mine)
      .library(...FILLER)
      .seat(1)
      .hand(...theirHand)
      .battlefield(...(theirHand.length > 0 ? ['Island', 'Island'] : []))
      .graveyard(...theirs)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(quistis)).toEqual([]);
  });

  test('a Bolt from the opponent’s graveyard is cast with Mountains for its {R}, resolves, and is exiled, not put into their graveyard', () => {
    const g = start([], [BOLT]);
    g.act(0).cast(QUISTIS, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    // CR 608.2g: no priority in between: the Bolt is on the stack, controlled by seat 0 and owned by seat 1.
    g.expect.stack([BOLT]);
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BOLT, 'exile', { seat: 1 });
    g.expect.noObject(BOLT, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('mana of any type: Divination’s {U} is paid by a Mountain, and the card goes to exile', () => {
    const g = start([DIVINATION], []);
    g.act(0).cast(QUISTIS, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.stack([DIVINATION]);
    g.passAll();
    g.expect.zone(DIVINATION, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('a countered spell is exiled too', () => {
    const g = start([], [BOLT], ['Mountain', 'Mountain', 'Mountain'], [COUNTERSPELL]);
    g.act(0).cast(QUISTIS, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
    g.expect.zone(BOLT, 'exile', { seat: 1 });
  });

  test('declining leaves the card in its graveyard', () => {
    const g = start([], [BOLT]);
    g.act(0).cast(QUISTIS, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.stack([]);
  });

  test('with no instant or sorcery card in a graveyard the trigger does nothing', () => {
    const g = start(['Grizzly Bears'], []);
    g.act(0).cast(QUISTIS, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });
});
