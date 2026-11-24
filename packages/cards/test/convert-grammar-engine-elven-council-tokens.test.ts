// Elven Council deck (Tales of Middle-earth Commander), group "tokens and shuffles": Windswift Slice, the REAL card of the golden corpus, read through the grammar only and played
// through applyAction in a game of three seats. Pins: CR 120.10 and 120.6 (excess damage, counting damage already marked), CR 111.2 (the player who creates a token owns it).
// Stand-ins are the engine's real fixtures and SYNTHETIC cards written here. The other cards of the group are in the `tokens2` file.
import { readFileSync } from 'node:fs';
import type { CardDefinition, GameState } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  return imported.definition;
}

const SLICE = real('Windswift Slice');

// SYNTHETIC vanilla creatures: a big Elf and a small Elf.
const BIG_ELF = parsed('SYNTHETIC Big Elf', 'Creature — Elf Warrior', '', {
  manaCost: '{3}{G}',
  power: '5',
  toughness: '5',
});
const SCOUT = parsed('SYNTHETIC Elf Scout', 'Creature — Elf Scout', '', {
  manaCost: '{G}',
  power: '1',
  toughness: '1',
});
const BEARS = 'Grizzly Bears';

const tokensOf = (g: { readonly state: GameState }, seat: number, name?: string) =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id];
    return (
      o !== undefined &&
      o.token != null &&
      o.owner === seat &&
      o.controller === seat &&
      (name === undefined || o.token.characteristics.name === name)
    );
  }).length;

describe('Windswift Slice: the excess damage makes that many Elf Warrior tokens', () => {
  const board = (bearsDamage = 0, seats: 2 | 3 | 4 = 3) =>
    scenario({ seats })
      .define(SLICE)
      .define(BIG_ELF)
      .seat(0)
      .hand(SLICE.name)
      .battlefield('Forest', { count: 3 })
      .battlefield(BIG_ELF.name)
      .seat(1)
      .battlefield(BEARS, { damage: bearsDamage })
      .seat(2)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as a one-sided bite and a token count of the excess damage dealt this way', () => {
    const text = JSON.stringify(SLICE.faces[0]?.spell?.effect);
    expect(text).toContain('"excessDamageDealt"');
    expect(text).toContain('"dealDamage"');
  });

  test('a 5/5 against a 2/2 deals 3 excess damage: three 1/1 green Elf Warrior tokens for the caster', () => {
    const g = board();
    g.act(0).cast(SLICE.name, {
      targets: [BIG_ELF.name, { name: BEARS, seat: 1 }],
      pay: true,
    });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(tokensOf(g, 0, 'Elf Warrior')).toBe(3);
    expect(tokensOf(g, 1)).toBe(0);
    expect(tokensOf(g, 2)).toBe(0);
    const [token] = g.find({ name: 'Elf Warrior', zone: 'battlefield', seat: 0 });
    if (token === undefined) throw new Error('no token');
    g.expect.pt(token.id, 1, 1);
    g.expect.derived(token.id, { colors: ['G'], subtypes: ['Elf', 'Warrior'] });
    // The creature that dealt the damage takes none back (CR 120.1: a one-sided bite).
    g.expect.damage(BIG_ELF.name, 0);
    g.expect.invariants();
  });

  test('damage already marked on the creature is not excess: lethal damage is what is left (CR 120.10, 120.6)', () => {
    const g = board(1);
    g.act(0).cast(SLICE.name, {
      targets: [BIG_ELF.name, { name: BEARS, seat: 1 }],
      pay: true,
    });
    g.passAll();
    // A 2/2 with 1 damage needs 1 more: 5 damage is 4 excess.
    expect(tokensOf(g, 0, 'Elf Warrior')).toBe(4);
  });

  test('damage that is not more than lethal makes no tokens', () => {
    const g = scenario({ seats: 3 })
      .define(SLICE)
      .define(SCOUT)
      .seat(0)
      .hand(SLICE.name)
      .battlefield('Forest', { count: 3 })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    // A 2/2 deals 2 damage to a 2/2: exactly lethal, no excess.
    g.act(0).cast(SLICE.name, {
      targets: [
        { name: BEARS, seat: 0 },
        { name: BEARS, seat: 1 },
      ],
      pay: true,
    });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(tokensOf(g, 0)).toBe(0);
  });
});
