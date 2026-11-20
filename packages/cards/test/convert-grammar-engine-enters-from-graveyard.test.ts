// Twilight Diviner: the REAL card of the golden corpus read through the grammar only and played through applyAction. "Whenever one or more other creatures you control enter, if they
// entered or were cast from a graveyard, create a token that's a copy of one of them. This ability triggers only once each turn." (CR 603.2c, 603.4, 603.6a, 601.2a, 707.2).
// Stand-ins are SYNTHETIC (named so), with invented power and toughness.
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
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');

/** Passes priority until the stack is empty; a surveil or an order of triggers is answered with the first legal action. */
function settle(g: {
  state: GameState;
  passAll(): unknown;
  legalActions(seat: 0 | 1): readonly Action[];
  choose(seat: 0 | 1, action: Action): unknown;
}) {
  for (let i = 0; i < 24; i += 1) {
    const d = g.state.pending;
    if (d !== null && d.kind !== 'priority') {
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
const PRIEST = parsed(
  'SYNTHETIC Priest',
  'Creature — Cleric',
  'When this creature enters, you gain 3 life.',
  { manaCost: '{1}{W}', power: '1', toughness: '1' },
);
const REANIMATE = parsed(
  'SYNTHETIC Reanimate All',
  'Sorcery',
  'Return all creature cards from your graveyard to the battlefield.',
  { manaCost: '{1}' },
);

describe('Twilight Diviner', () => {
  const DIVINER = real('Twilight Diviner');

  test('the second ability is read as a batch enters trigger from a graveyard, once each turn', () => {
    const abilities = DIVINER.faces[0]?.abilities ?? [];
    expect(abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'entersBattlefield' }, effect: { kind: 'surveil' } },
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBatch',
          what: { types: ['creature'], controller: 'you', other: true },
          fromGraveyard: true,
        },
        effect: { kind: 'copyOneOfTriggerCards' },
        oncePerTurn: true,
      },
    ]);
  });

  const game = (mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
    mine(
      scenario()
        .define(DIVINER)
        .define(BEAR)
        .define(PRIEST)
        .define(REANIMATE)
        .seat(0)
        .life(20)
        .battlefield(DIVINER.name)
        .battlefield('Plains', { count: 4 }),
    )
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  const tokens = (g: { state: GameState }, name: string) =>
    g.state.battlefield
      .map((id) => g.state.objects[id])
      .filter((o) => o?.token?.characteristics.name === name);

  test('a creature put onto the battlefield from the graveyard is copied', () => {
    const g = game((b) =>
      b
        .hand(REANIMATE.name)
        .graveyard(BEAR.name)
        .library(...FILLER),
    );
    g.act(0).cast(REANIMATE.name, { pay: true });
    settle(g);
    expect(tokens(g, BEAR.name)).toHaveLength(1);
  });

  test('the copy of a creature with an enters ability triggers it', () => {
    const g = game((b) =>
      b
        .hand(REANIMATE.name)
        .graveyard(PRIEST.name)
        .library(...FILLER),
    );
    g.act(0).cast(REANIMATE.name, { pay: true });
    settle(g);
    expect(tokens(g, PRIEST.name)).toHaveLength(1);
    expect(g.state.seats[0]?.life).toBe(26);
  });

  test('a creature cast from the hand is not copied', () => {
    const g = game((b) =>
      b
        .hand(BEAR.name)
        .battlefield('Forest', { count: 2 })
        .library(...FILLER),
    );
    g.act(0).cast(BEAR.name, { pay: true });
    settle(g);
    expect(tokens(g, BEAR.name)).toHaveLength(0);
  });
});
