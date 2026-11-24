// The Party Time deck, group "library": the REAL cards of the owner's golden corpus (real Oracle text, `fixtures/corpus/golden.jsonl`), imported through the
// grammar only and played through applyAction. No Scryfall ruling could be fetched here; the rulings quoted come from the deck issue's rulings comment.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';

describe("Galepowder Mage (Whenever this creature attacks, exile another target creature. Return that card to the battlefield under its owner's control at the beginning of the next end step.)", () => {
  const MAGE = real('Galepowder Mage');
  const board = () =>
    scenario()
      .define(MAGE)
      .seat(0)
      .battlefield(MAGE.name, { label: 'mage' })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the creature of another player is exiled when the Mage attacks and returns under its owner at the next end step', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['mage']);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    expect(getView(g.state, 1).battlefield.some((o) => o.name === BEARS)).toBe(true);
  });

  test('"another": alone on the battlefield the Mage has no target and exiles nothing', () => {
    const g = scenario()
      .define(MAGE)
      .seat(0)
      .battlefield(MAGE.name, { label: 'mage' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['mage']);
    g.passAll();
    g.expect.zone(MAGE.name, 'battlefield', { seat: 0 });
  });
});

describe('Glorious Protector (When this creature enters, you may exile any number of non-Angel creatures you control until this creature leaves the battlefield.)', () => {
  const PROTECTOR = real('Glorious Protector');
  const SERRA = 'Serra Angel';
  const protector = () =>
    scenario()
      .define(PROTECTOR)
      .seat(0)
      .hand(PROTECTOR.name)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield('Giant Spider', { label: 'spider' })
      .battlefield(SERRA, { label: 'angel' })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test("the creatures chosen are exiled; Angels and other players' creatures are not offered (CR 608.2d)", () => {
    const g = protector();
    g.act(0).cast(PROTECTOR.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    const pending = g.state.pending;
    expect(pending?.kind).toBe('choosePermanent');
    if (pending?.kind !== 'choosePermanent') return;
    expect(pending.min).toBe(0);
    expect(pending.max).toBe(2);
    expect(pending.legal).toHaveLength(2);
    g.act(0).choosePermanents('bears', 'spider');
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone('Giant Spider', 'exile', { seat: 0 });
    g.expect.zone(SERRA, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('"any number" includes none: the creatures stay', () => {
    const g = protector();
    g.act(0).cast(PROTECTOR.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).choosePermanents();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
  });

  const withMurder = () =>
    scenario()
      .define(PROTECTOR)
      .seat(0)
      .hand(PROTECTOR.name)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS, { label: 'bears' })
      .library(...FILLER)
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the creatures return, under their owner, when the Protector leaves the battlefield (CR 610.3)', () => {
    const g = withMurder();
    g.act(0).cast(PROTECTOR.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).choosePermanents('bears');
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.act(0).pass();
    g.act(1).cast('Murder', { pay: true, targets: [{ name: PROTECTOR.name }] });
    g.passAll();
    g.expect.zone(PROTECTOR.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('a Protector that left before its ability resolves exiles nothing (CR 610.3a)', () => {
    const g = withMurder();
    g.act(0).cast(PROTECTOR.name, { pay: true });
    g.pass();
    g.pass();
    // The enters trigger is on the stack: the opponent kills the Protector in response.
    g.act(0).pass();
    g.act(1).cast('Murder', { pay: true, targets: [{ name: PROTECTOR.name }] });
    g.passAll();
    g.act(0).accept();
    g.expect.zone(PROTECTOR.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.state.pending?.kind).toBe('priority');
  });
});
