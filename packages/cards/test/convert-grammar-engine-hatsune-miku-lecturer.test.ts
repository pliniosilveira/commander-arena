// The Hatsune Miku - Secret Lair Commander deck (issue 145): the REAL Oracle text of Silverquill Lecturer (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a
// card with no override and is played through applyAction. Pins: CR 702.144a (Demonstrate: "When you cast this spell, you may copy it ... If you copy the spell, choose an opponent.
// That player copies the spell"), CR 601.2i and 603.2 (the spell is cast, and its ability triggers, once it is on the stack), CR 613.1f (layer 6: a static ability gives a spell an
// ability), CR 707.10 (a copy of a spell is not cast), CR 113.7a (a trigger on the stack is independent of its source).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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

const LECTURER = 'Silverquill Lecturer';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

describe('Silverquill Lecturer: creature spells you cast have demonstrate', () => {
  const lecturer = real(LECTURER);
  const build = () =>
    scenario()
      .define(lecturer)
      .seat(0)
      .hand(BEARS, BOLT)
      .battlefield(LECTURER)
      .library('Island', 'Island', 'Island')
      .pool('GGRR')
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  const tokens = (g: ScenarioGame, seat: 0 | 1) =>
    g.state.battlefield.filter((id) => {
      const o = g.state.objects[id];
      return o !== undefined && o.controller === seat && o.token !== null;
    });

  test('the card is valid', () => {
    expect(validateCard(lecturer)).toEqual([]);
  });

  test('a creature spell you cast triggers demonstrate: the controller copies, then the opponent copies', () => {
    const g = build();
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([`${BEARS} (ability)`, BEARS]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    g.passAll();
    expect(tokens(g, 0)).toHaveLength(1);
    expect(tokens(g, 1)).toHaveLength(1);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declining: no copy, and the opponent does not copy either', () => {
    const g = build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    expect(tokens(g, 0)).toHaveLength(0);
    expect(tokens(g, 1)).toHaveLength(0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('a noncreature spell you cast has no demonstrate', () => {
    const g = build();
    g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('a creature spell an opponent casts has no demonstrate', () => {
    const g = scenario()
      .define(lecturer)
      .seat(0)
      .battlefield(LECTURER)
      .seat(1)
      .hand(BEARS)
      .pool('GG')
      .library('Island', 'Island')
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    g.act(1).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
  });

  test('without the Lecturer on the battlefield a creature spell has no demonstrate', () => {
    const g = scenario()
      .define(lecturer)
      .seat(0)
      .hand(BEARS, LECTURER)
      .pool('GGGGGGG')
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    // The Lecturer in the hand gives nothing, and neither does the one that is itself being cast.
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
  });

  test('the Lecturer itself, cast with no other Lecturer on the battlefield, has no demonstrate', () => {
    const g = scenario()
      .define(lecturer)
      .seat(0)
      .hand(LECTURER)
      .pool('WWWWW')
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(LECTURER, { pay: true });
    g.expect.stack([LECTURER]);
  });

  test('the grant ends when the Lecturer leaves; a trigger already on the stack still resolves', () => {
    const g = scenario()
      .define(lecturer)
      .seat(0)
      .hand(BEARS)
      .battlefield(LECTURER)
      .pool('GG')
      .library('Island', 'Island')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.act(0).pass();
    g.act(1).cast(BOLT, { pay: true, targets: [{ name: LECTURER, zone: 'battlefield', seat: 0 }] });
    g.passAll();
    g.expect.zone(LECTURER, 'graveyard', { seat: 0 });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    expect(tokens(g, 0)).toHaveLength(1);
    expect(tokens(g, 1)).toHaveLength(1);
  });
});

describe('the same static ability with convoke (CR 702.51a, 702.51b), the text of another card of the deck (SYNTHETIC text)', () => {
  const imported = withText(LECTURER, 'Creature spells you cast have convoke.');

  test('it reads as supported', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(imported.definition)).toEqual([]);
  });

  test('a creature spell you cast is paid for by tapping creatures, a noncreature spell is not', () => {
    const g = scenario()
      .define(imported.definition)
      .seat(0)
      .hand(BEARS, BOLT)
      .battlefield(LECTURER, 'Llanowar Elves')
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    // No mana at all: the Bolt cannot be cast, the Bears can by tapping the Lecturer and the Elves ({1}{G}).
    expect(g.act(0).try.cast(BOLT).ok).toBe(false);
    g.act(0).cast(BEARS);
    expect(g.state.pending?.kind).toBe('choosePayOptions');
  });
});

describe('texts that are not Silverquill Lecturer are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    'Creature spells you cast have demonstrate',
    'Creature spells have demonstrate.',
    'Creature spells your opponents cast have demonstrate.',
    'Creature spells you cast have flying.',
    'Creature spells you cast have demonstrate and flying.',
    'Creature spells you cast have demonstrate {1}.',
    'Creature cards in your hand have demonstrate.',
    'Creature spells you cast have flash.',
    'Creature spells you cast have convoke and demonstrate.',
    'Creature spells you cast have improvise.',
    'Spells you cast from your graveyard have demonstrate.',
    'Creature spells you cast with flying have demonstrate.',
    'Creature spells you cast have demonstrate until end of turn.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(LECTURER, text).support.status).toBe('unsupported');
    });
  }
});
