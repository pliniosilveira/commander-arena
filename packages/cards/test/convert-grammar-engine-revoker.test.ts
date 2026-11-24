// "As this creature enters, choose a nonland card name." / "Activated abilities of sources with the chosen name can't be activated." (Phyrexian Revoker): the REAL Oracle text
// (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario and is played through applyAction.
// Pins (numbers as the code and docs already cite them; the CR text was not available here, so they are unchecked against it): CR 614.12a (the choice as the permanent enters),
// CR 607.2d (what reads the choice), CR 201.2 (a card name), CR 602.5 (an ability that can't be activated), CR 605.1a (a mana ability is an activated ability), CR 113.6b.
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const FIREBREATHER = 'SYNTHETIC Firebreather'; // {R}: +1/+0 until end of turn
const LIFE_TAP = 'SYNTHETIC Life Tap'; // {T}, pay 2 life: draw a card
const CYCLING_BEAR = 'SYNTHETIC Cycling Bear';
const SOL_RING = 'Sol Ring';
const BEARS = 'Grizzly Bears';

describe('Phyrexian Revoker', () => {
  const revoker = real('Phyrexian Revoker');
  const NAME = revoker.name;

  test('the card is valid and says what the engine runs', () => {
    expect(validateCard(revoker)).toEqual([]);
    expect(revoker.faces[0]?.abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'cardName' } },
      { kind: 'static', static: { kind: 'cantActivateChosenName' } },
    ]);
  });

  const cast = () => {
    const g = scenario()
      .define(revoker)
      .seat(0)
      .hand(NAME)
      .library(...FILLER)
      .battlefield('Mountain', 'Mountain', FIREBREATHER, LIFE_TAP, SOL_RING, BEARS)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    return g;
  };

  test('the controller is asked for a name as it enters, with the visible nonland names as suggestions', () => {
    const g = cast();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseOption');
    if (d?.kind !== 'chooseOption') return;
    expect(d.purpose).toBe('cardName');
    expect(d.seat).toBe(0);
    expect(d.options).toEqual([NAME, FIREBREATHER, LIFE_TAP, SOL_RING, BEARS].sort());
    // A land is never suggested.
    expect(d.options).not.toContain('Mountain');
    g.expect.zone(NAME, 'stack');
    g.expect.invariants();
  });

  test('any one-line name is an answer (the suggestions are only suggestions), an empty or padded one is not', () => {
    const g = cast();
    for (const bad of ['', '  ', ' Sol Ring', 'Sol Ring ', 'Sol\nRing', 'x'.repeat(201)]) {
      expect(g.act(0).try.action({ kind: 'chooseOption', option: bad }).ok, bad).toBe(false);
    }
    expect(g.act(1).try.action({ kind: 'chooseOption', option: SOL_RING }).ok).toBe(false);
    g.act(0).chooseOption('A Card Nobody Sees');
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    g.expect.chosen(NAME, { cardName: 'A Card Nobody Sees' });
    g.expect.invariants();
  });

  const locked = (name: string) => {
    const g = cast();
    g.act(0).chooseOption(name);
    return g;
  };

  test('no activated ability of a source with the chosen name can be activated, whoever controls it', () => {
    const g = locked(FIREBREATHER);
    expect(g.act(0).try.activate(FIREBREATHER).ok).toBe(false);
    // Another name is not stopped.
    expect(g.act(0).try.activate(LIFE_TAP).ok).toBe(true);
  });

  test('a mana ability is an activated ability: the chosen name stops it too', () => {
    const board = (name: string) =>
      scenario()
        .define(revoker)
        .seat(0)
        .battlefield(NAME, { chosen: { cardName: name } })
        .battlefield(SOL_RING, BEARS)
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .build();
    expect(board(SOL_RING).act(0).try.tapForMana(SOL_RING).ok).toBe(false);
    expect(board(BEARS).act(0).try.tapForMana(SOL_RING).ok).toBe(true);
  });

  test("the lock is on every source with the name, the opponent's too", () => {
    const g = scenario()
      .at('precombatMain', { active: 1, turn: 2 })
      .define(revoker)
      .seat(0)
      .battlefield(NAME, { chosen: { cardName: FIREBREATHER } })
      .library(...FILLER)
      .seat(1)
      .battlefield('Mountain', FIREBREATHER, LIFE_TAP)
      .library(...FILLER)
      .build();
    expect(g.act(1).try.activate(FIREBREATHER).ok).toBe(false);
    expect(g.act(1).try.activate(LIFE_TAP).ok).toBe(true);
  });

  test('a card in a hand with an activated ability of that name (cycling) cannot be cycled', () => {
    const g = scenario()
      .define(revoker)
      .seat(0)
      .battlefield(NAME, { chosen: { cardName: CYCLING_BEAR } })
      .battlefield('Plains', 'Plains')
      .hand(CYCLING_BEAR)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    expect(g.act(0).try.activate(CYCLING_BEAR).ok).toBe(false);
  });

  test('when the Revoker is gone the name is free again (CR 400.7: the choice is gone with it)', () => {
    const g = scenario()
      .define(revoker)
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield(NAME, { chosen: { cardName: FIREBREATHER } })
      .battlefield('Mountain', 'Mountain', FIREBREATHER)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    expect(g.act(0).try.activate(FIREBREATHER).ok).toBe(false);
    g.act(0).cast('Lightning Bolt', { targets: [{ name: NAME, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(NAME, 'graveyard', { seat: 0 });
    expect(g.act(0).try.activate(FIREBREATHER).ok).toBe(true);
  });
});
