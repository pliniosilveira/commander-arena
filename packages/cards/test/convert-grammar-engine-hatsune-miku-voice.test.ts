// Voice of Resurgence: the REAL Oracle text of the golden corpus ("Whenever an opponent casts a spell during your turn and when this creature dies, create a green and white
// Elemental creature token ...") goes through the grammar as a card with no override and is played through applyAction. Pins: CR 603.2 (a triggered ability triggers once each time
// its event happens, and only when the event fits the words, here "during your turn" is the active player), CR 603.2c ("A and when B" are two abilities, each with its own event),
// CR 601.2i (a spell becomes cast), CR 700.4 (dies), CR 111.1 (a token is a permanent made by an effect).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

/** A card of the golden corpus with its text replaced, imported through the grammar. */
function withText(name: string, text: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

const VOICE = real('Voice of Resurgence');
const SPELL = parsed('SYNTHETIC Quick Gain', 'Instant', 'You gain 1 life.');
const KILL = parsed('SYNTHETIC Quick Kill', 'Instant', 'Destroy target creature.');
const LIBRARY = Array.from({ length: 20 }, () => 'Island');
const BEARS = 'Grizzly Bears';

describe('Voice of Resurgence', () => {
  // Seat 0 controls the Voice; `active` is whose turn it is.
  const game = (active: 0 | 1, extra: readonly string[] = []) =>
    scenario()
      .define(VOICE)
      .define(SPELL)
      .define(KILL)
      .seat(0)
      .battlefield(VOICE.name, ...extra)
      .hand(SPELL.name, KILL.name)
      .battlefield('Island', { count: 4 })
      .library(...LIBRARY)
      .seat(1)
      .hand(SPELL.name, KILL.name)
      .battlefield('Island', { count: 4 })
      .library(...LIBRARY)
      .at('precombatMain', { active, turn: active === 0 ? 1 : 2 })
      .build();

  test('the card is valid and is two triggered abilities that share the effect', () => {
    expect(validateCard(VOICE)).toEqual([]);
    const triggered = VOICE.faces[0]?.abilities.filter((a) => a.kind === 'triggered') ?? [];
    expect(triggered.map((a) => a.trigger.kind).sort()).toEqual(['castSpell', 'dies']);
    expect(triggered.find((a) => a.trigger.kind === 'castSpell')?.trigger).toMatchObject({
      by: 'opponent',
      duringTurn: 'you',
    });
    expect(triggered[0]?.effect).toEqual(triggered[1]?.effect);
  });

  test('an opponent casting a spell during your turn makes a token', () => {
    const g = game(0);
    g.act(0).pass();
    g.act(1).cast(SPELL.name, { pay: true });
    g.passAll();
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('an opponent casting a spell during their own turn makes nothing', () => {
    const g = game(1);
    g.act(1).cast(SPELL.name, { pay: true });
    g.passAll();
    g.expect.noObject('Elemental');
    g.expect.invariants();
  });

  test('you casting a spell during your turn makes nothing', () => {
    const g = game(0);
    g.act(0).cast(SPELL.name, { pay: true });
    g.passAll();
    g.expect.noObject('Elemental');
    g.expect.invariants();
  });

  test('you casting a spell during an opponent turn makes nothing', () => {
    const g = game(1);
    g.act(1).pass();
    g.act(0).cast(SPELL.name, { pay: true });
    g.passAll();
    g.expect.noObject('Elemental');
    g.expect.invariants();
  });

  test('when it dies, the controller gets a token', () => {
    const g = game(0);
    g.act(0).cast(KILL.name, { targets: [{ name: VOICE.name }], pay: true });
    g.passAll();
    g.expect.zone(VOICE.name, 'graveyard', { seat: 0 });
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 1 });
    // CR 208.2a style count: the token is the only creature left, so it is 1/1.
    g.expect.pt('Elemental', 1, 1);
    g.expect.invariants();
  });

  test("the token's power and toughness are the number of creatures you control", () => {
    const g = game(0, [BEARS]);
    g.act(0).pass();
    g.act(1).cast(SPELL.name, { pay: true });
    g.passAll();
    // Voice, Bears and the token.
    g.expect.pt('Elemental', 3, 3);
    g.expect.derived('Elemental', { colors: ['G', 'W'], subtypes: ['Elemental'] });
    g.expect.invariants();
  });
});

describe('texts that are not Voice of Resurgence are dropped, never half run (SYNTHETIC)', () => {
  const TOKEN =
    'create a green and white Elemental creature token with "This token\'s power and toughness are each equal to the number of creatures you control."';
  test.each([
    // another turn qualifier
    `Whenever an opponent casts a spell during their turn and when this creature dies, ${TOKEN}`,
    `Whenever an opponent casts a spell during your turn or when this creature dies, ${TOKEN}`,
    // a missing event after "and when"
    `Whenever an opponent casts a spell during your turn and when, ${TOKEN}`,
    // "and whenever" with an event the grammar does not read
    `Whenever an opponent casts a spell during your turn and when this creature wiggles, ${TOKEN}`,
    // a trailing qualifier after the turn
    `Whenever an opponent casts a spell during your turn if you control a creature, ${TOKEN}`,
    `Whenever an opponent casts a spell during your end step, ${TOKEN}`,
  ])('%s', (text) => {
    const imported = withText('Voice of Resurgence', text);
    expect(imported.support.status).not.toBe('supported');
  });
});
