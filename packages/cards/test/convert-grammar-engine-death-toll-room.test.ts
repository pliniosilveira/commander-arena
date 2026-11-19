// The Death Toll deck, the Room subsystem (CR 709.5): the REAL card Polluted Cistern // Dim Oubliette of the golden corpus read through the grammar only and played through
// applyAction. Either half is cast as a permanent spell; the half cast is unlocked as the permanent enters; "When you unlock this door" (CR 709.5h); "for each card type among those
// cards" of a batch of cards put into your graveyard from your library (CR 603.2c, 205.2a). Stand-ins are SYNTHETIC (named so).
import { readFileSync } from 'node:fs';
import type { Action, CardDefinition, GameState } from '@commander-arena/engine';
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

const ROOM = real('Polluted Cistern // Dim Oubliette');
const FILLER = Array.from({ length: 30 }, () => 'Island');

/** Passes priority until the stack is empty and nothing is pending but priority. */
function settle(g: {
  state: GameState;
  passAll(): unknown;
  legalActions(seat: 0 | 1): readonly Action[];
  choose(seat: 0 | 1, action: Action): unknown;
}) {
  for (let i = 0; i < 20; i += 1) {
    const d = g.state.pending;
    if (d !== null && d.kind === 'orderTriggers') {
      g.choose(d.seat as 0 | 1, g.legalActions(d.seat as 0 | 1)[0] as Action);
    } else if (g.state.stack.length > 0) g.passAll();
    else break;
  }
}

const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const GEM = parsed('SYNTHETIC Gem', 'Artifact Creature — Construct', '', {
  manaCost: '{3}',
  power: '1',
  toughness: '1',
});
const MILL_THREE = parsed('SYNTHETIC Mill Three', 'Sorcery', 'Mill three cards.', {
  manaCost: '{1}',
});
const MILL_THEM = parsed('SYNTHETIC Mill Them', 'Sorcery', 'Each opponent mills three cards.', {
  manaCost: '{1}',
});
const DISCARD = parsed('SYNTHETIC Discard Two', 'Sorcery', 'You discard two cards.', {
  manaCost: '{1}',
});

describe('read through the grammar', () => {
  test('both halves are Enchantment — Room permanent halves of a split card', () => {
    expect(ROOM.layout).toBe('split');
    expect(ROOM.faces.map((f) => f.types)).toEqual([['enchantment'], ['enchantment']]);
    expect(ROOM.faces.map((f) => f.subtypes)).toEqual([['Room'], ['Room']]);
    expect(ROOM.faces.map((f) => f.manaCost)).toEqual([
      ['1', 'B'],
      ['4', 'B'],
    ]);
  });

  test('Polluted Cistern: a batch trigger of the cards put into your graveyard from your library, a life loss for each card type among them', () => {
    expect(ROOM.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'putIntoGraveyard', who: 'you', from: 'library', batch: true },
        effect: {
          kind: 'loseLife',
          player: { kind: 'eachOpponent' },
          amount: { kind: 'cardTypesAmongTriggerCards' },
        },
      },
    ]);
  });

  test('Dim Oubliette: the trigger of unlocking its own door, mill three cards, then return a creature card from your graveyard to the battlefield', () => {
    const ability = ROOM.faces[1]?.abilities[0];
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'doorUnlocked', who: 'you', door: 'this' },
    });
    expect(JSON.stringify(ability)).toContain('"kind":"mill"');
    expect(JSON.stringify(ability)).toContain('"to":"battlefield"');
  });
});

describe('Polluted Cistern (each opponent loses 1 life for each card type among the cards put into your graveyard from your library)', () => {
  const game = (top: readonly string[], unlocked: readonly number[] = [0]) =>
    scenario()
      .define(ROOM)
      .define(MILL_THREE)
      .define(DISCARD)
      .define(BEAR)
      .define(GEM)
      .seat(0)
      .hand(MILL_THREE.name, DISCARD.name, BEAR.name, 'Forest')
      .battlefield(ROOM.name, { unlocked })
      .battlefield('Plains', { count: 4 })
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('three cards of three types milled together: one trigger, three life', () => {
    const g = game([BEAR.name, 'Forest', 'Sol Ring']);
    g.act(0).cast(MILL_THREE.name, { pay: true });
    settle(g);
    expect(g.state.seats[1]?.life).toBe(37);
    g.expect.invariants();
  });

  test('each card type counts once: two creatures and a land are two types', () => {
    const g = game([BEAR.name, BEAR.name, 'Forest']);
    g.act(0).cast(MILL_THREE.name, { pay: true });
    settle(g);
    expect(g.state.seats[1]?.life).toBe(38);
  });

  test('a card with two card types counts both: an artifact creature is two types', () => {
    const g = game([GEM.name, GEM.name, GEM.name]);
    g.act(0).cast(MILL_THREE.name, { pay: true });
    settle(g);
    expect(g.state.seats[1]?.life).toBe(38);
  });

  test('cards put into the graveyard from somewhere else (discarded) do not trigger it', () => {
    const g = game([BEAR.name, 'Forest', 'Sol Ring']);
    g.act(0).cast(DISCARD.name, { pay: true });
    settle(g);
    const d = g.state.pending;
    if (d !== null && d.kind === 'discard') {
      g.act(0).chooseCards(BEAR.name, 'Forest');
      settle(g);
    }
    expect(g.state.seats[1]?.life).toBe(40);
  });

  test('with the half locked it does nothing', () => {
    const g = game([BEAR.name, 'Forest', 'Sol Ring'], [1]);
    g.act(0).cast(MILL_THREE.name, { pay: true });
    settle(g);
    expect(g.state.seats[1]?.life).toBe(40);
  });

  test('only the cards of your own library: cards an opponent mills are not put into your graveyard', () => {
    const g = scenario()
      .define(ROOM)
      .define(MILL_THEM)
      .seat(0)
      .hand(MILL_THEM.name)
      .battlefield(ROOM.name, { unlocked: [0] })
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library('Forest', 'Sol Ring', 'Island', ...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(MILL_THEM.name, { pay: true });
    settle(g);
    expect(g.state.seats[1]?.life).toBe(40);
  });
});

describe('Dim Oubliette (when you unlock this door, mill three cards, then return a creature card from your graveyard to the battlefield)', () => {
  const game = (graveyard: readonly string[], unlocked: readonly number[]) =>
    scenario()
      .define(ROOM)
      .define(BEAR)
      .define(GEM)
      .seat(0)
      .hand(ROOM.name)
      .graveyard(...graveyard)
      .battlefield(ROOM.name, { unlocked, label: 'room' })
      .battlefield('Swamp', { count: 6 })
      .library(BEAR.name, 'Forest', 'Sol Ring', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('cast as Dim Oubliette: it enters with that door unlocked, which triggers it', () => {
    const g = scenario()
      .define(ROOM)
      .define(BEAR)
      .seat(0)
      .hand(ROOM.name)
      .battlefield('Swamp', { count: 5 })
      .library(BEAR.name, 'Forest', 'Sol Ring', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(ROOM.name, { face: 1, pay: true });
    g.passAll();
    g.expect.zone(ROOM.name, 'battlefield', { seat: 0 });
    expect(g.state.objects[g.id(ROOM.name)]?.unlockedDoors).toEqual([1]);
    settle(g);
    // The three cards milled are the top three: the Bear (a creature card) is the one that can come back.
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.zone('Sol Ring', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('unlocked later with the special action: the same trigger', () => {
    const g = game([GEM.name], [0]);
    g.act(0).unlock('room', 1, { pay: true });
    settle(g);
    // The milled Bear and the Gem in the graveyard are both creature cards: the player chooses one.
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards(GEM.name);
    settle(g);
    g.expect.zone(GEM.name, 'battlefield', { seat: 0 });
    g.expect.zone(BEAR.name, 'graveyard', { seat: 0 });
    expect(g.state.objects[g.id('room')]?.unlockedDoors).toEqual([0, 1]);
  });

  test('unlocking the other half does not trigger it', () => {
    const g = game([GEM.name], [1]);
    const top = g.state.seats[0]?.library.length ?? 0;
    g.act(0).unlock('room', 0, { pay: true });
    settle(g);
    expect(g.state.seats[0]?.library.length).toBe(top);
  });
});
