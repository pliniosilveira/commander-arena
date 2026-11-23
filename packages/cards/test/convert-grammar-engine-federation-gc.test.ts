// The Federation Fleet deck (Star Trek Commander), group C: the REAL Oracle text of Captain Janeway, Endgame and Worf, Son of Mogh (golden.jsonl) goes through the grammar as a card with
// no override and is played through applyAction. Pins (rule numbers the repository's own comments already use; the CR text file is not in this worktree, so none was looked up): CR 510.2
// (combat damage is dealt at once in a step) and CR 603.2c (one trigger for the whole batch: "one or more Officers" triggers once however many Officers deal damage), CR 613 (layers: the
// +1/+1 of a static ability is a layer 7c effect and "other" leaves the source out).
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  CREATURE_TYPES as TABLE,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  creatureTypeOf,
  UNLISTED_CREATURE_TYPES,
} from '../src/convert/parser/rules/noun/creature-types';
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

const janeway = real('Captain Janeway, Endgame');
const worf = real('Worf, Son of Mogh');
const ezri = real('Ezri Dax, Newly Joined');
const OFFICER = parsed('SYNTHETIC Officer', 'Creature — Human Officer', '', {
  power: '2',
  toughness: '2',
});
const OFFICER_TWO = parsed('SYNTHETIC Second Officer', 'Creature — Bajoran Officer', '', {
  power: '2',
  toughness: '2',
});
const NOT_AN_OFFICER = parsed('SYNTHETIC Plain Bear', 'Creature — Bear', '', {
  power: '2',
  toughness: '2',
});
const CANTRIP = parsed('SYNTHETIC Two Cards', 'Sorcery', 'Draw two cards.', {
  manaCost: '{1}',
});
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

function game(setup: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) {
  let b = scenario();
  for (const card of [janeway, worf, ezri, OFFICER, OFFICER_TWO, NOT_AN_OFFICER, CANTRIP]) {
    b = b.define(card);
  }
  b = setup(b.seat(0).library(...LIBRARY));
  return b
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
}

const officerTokens = (g: ReturnType<typeof game>) =>
  g.find({ name: 'Officer', zone: 'battlefield', seat: 0 }).filter((o) => o.token !== null);

describe('the creature types the real cards use that the repository CR text does not list yet', () => {
  test('Officer and Trill read in the singular and the plural, and are not in the engine table', () => {
    for (const type of UNLISTED_CREATURE_TYPES) {
      expect(TABLE).not.toContain(type);
      expect(creatureTypeOf(type)).toBe(type);
      expect(creatureTypeOf(`${type}s`)).toBe(type);
    }
    expect([...UNLISTED_CREATURE_TYPES]).toEqual(['Officer', 'Trill']);
  });
});

describe('both cards are valid and read as the whole text', () => {
  test('valid', () => {
    expect(validateCard(janeway)).toEqual([]);
    expect(validateCard(worf)).toEqual([]);
  });
});

describe('Captain Janeway, Endgame', () => {
  test('two Officers deal combat damage to a player: one trigger, one card and one 1/1 red Officer token', () => {
    const g = game((b) =>
      b.battlefield(janeway.name, { label: 'janeway' }).battlefield(OFFICER.name, { label: 'a' }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(['janeway', 'a']);
    g.passAll();
    g.advanceTo('combatDamage');
    // One trigger for the batch (CR 510.2, 603.2c), though two Officers dealt damage.
    g.expect.stack([`${janeway.name} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
    const [token, ...rest] = officerTokens(g);
    expect(rest).toHaveLength(0);
    const characteristics = token?.token?.characteristics;
    expect(characteristics?.colors).toEqual(['R']);
    expect(characteristics?.subtypes).toEqual(['Officer']);
    expect(characteristics?.power).toBe(1);
    expect(characteristics?.toughness).toBe(1);
    g.expect.invariants();
  });

  test('a creature that is not an Officer dealing damage does not trigger it', () => {
    const g = game((b) =>
      b.battlefield(janeway.name, { label: 'janeway' }).battlefield(NOT_AN_OFFICER.name, {
        label: 'bear',
      }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack('bear');
    g.passAll();
    g.advanceTo('combatDamage');
    g.expect.stack([]);
  });
});

describe('Worf, Son of Mogh', () => {
  test('other Officers you control get +1/+1; Worf and non-Officers do not', () => {
    const g = game((b) =>
      b
        .battlefield(worf.name, { label: 'worf' })
        .battlefield(OFFICER.name, { label: 'officer' })
        .battlefield(NOT_AN_OFFICER.name, { label: 'bear' })
        .seat(1)
        .battlefield(OFFICER_TWO.name, { label: 'theirs' })
        .seat(0),
    );
    g.expect.pt('worf', 3, 3);
    g.expect.pt('officer', 3, 3);
    g.expect.pt('bear', 2, 2);
    g.expect.pt('theirs', 2, 2);
  });

  test('seek out: drawing the second card of the turn makes a 1/1 red Officer token, only once', () => {
    const g = game((b) => b.battlefield(worf.name).battlefield('Plains').hand(CANTRIP.name));
    g.act(0).cast({ name: CANTRIP.name, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
    g.passAll();
    // The spell drew two cards this turn: the second one made a token, and only that one.
    g.passAll();
    expect(officerTokens(g)).toHaveLength(1);
    g.expect.invariants();
  });
});

describe('Ezri Dax, Newly Joined', () => {
  const LANDS = ['Plains', 'Plains', 'Swamp', 'Swamp', 'Swamp'] as const;

  test('the real text reads as the engine rule: the graveyard, this turn, her name, legendary and a Trill', () => {
    expect(validateCard(ezri)).toEqual([]);
    const rule = ezri.faces[0]?.abilities.find((a) => a.kind === 'replacement');
    expect(rule?.kind === 'replacement' ? rule.replacement : null).toMatchObject({
      kind: 'entersAsCopy',
      what: {
        types: ['creature'],
        controller: 'you',
        zone: 'graveyard',
        putFromBattlefieldThisTurn: true,
      },
      optional: true,
      duration: 'permanent',
      addSubtypes: ['Trill'],
      fromGraveyard: true,
      keepName: true,
      addSupertypes: ['legendary'],
    });
  });

  test('flash: cast after a creature of mine died this turn, it enters as a copy of that card, with her name, legendary and a Trill', () => {
    const g = game((b) =>
      b
        .hand(ezri.name, 'Murder')
        .battlefield(...LANDS)
        .battlefield(NOT_AN_OFFICER.name),
    );
    g.act(0).cast('Murder', { targets: [NOT_AN_OFFICER.name], pay: true });
    g.passAll();
    g.act(0).cast(ezri.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    g.act(0).choosePermanents({ name: NOT_AN_OFFICER.name, zone: 'graveyard', seat: 0 });
    g.expect.derived(ezri.name, {
      supertypes: ['legendary'],
      subtypes: ['Bear', 'Trill'],
    });
    expect(g.view(0).battlefield.map((o) => o.name)).toContain(ezri.name);
    g.expect.zone(NOT_AN_OFFICER.name, 'graveyard');
    g.expect.invariants();
  });

  test('a creature card that was in the graveyard before this turn is not a choice: it enters as itself', () => {
    const g = game((b) =>
      b
        .hand(ezri.name)
        .battlefield(...LANDS)
        .graveyard(NOT_AN_OFFICER.name),
    );
    g.act(0).cast(ezri.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.derived(ezri.name, { subtypes: ['Trill', 'Advisor'] });
  });
});
