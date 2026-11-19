// Syr Konrad, the Grim and Insidious Roots: the REAL cards of the golden corpus read through the grammar only and played through applyAction. A creature card that leaves
// your graveyard (once for each card, or "one or more" as a batch), a creature card put into a graveyard from anywhere other than the battlefield, and a trigger that joins
// these events with "or" (CR 603.2, 603.2c, 400.7, 404.1, 700.4). Stand-ins are SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import { type Action, type CardDefinition, type GameState, getView } from '@commander-arena/engine';
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

/** Passes priority until the stack is empty. */
function settle(g: {
  state: GameState;
  passAll(): unknown;
  legalActions(seat: 0 | 1): readonly Action[];
  choose(seat: 0 | 1, action: Action): unknown;
}) {
  for (let i = 0; i < 16; i += 1) {
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
const ELF = parsed('SYNTHETIC Elf', 'Creature — Elf', '', {
  manaCost: '{G}',
  power: '1',
  toughness: '1',
});
const MILL_THREE = parsed('SYNTHETIC Mill Three', 'Sorcery', 'Mill three cards.', {
  manaCost: '{1}',
});
const KILL = parsed('SYNTHETIC Kill', 'Sorcery', 'Destroy target creature.', { manaCost: '{1}' });
const EXILE_YARD = parsed(
  'SYNTHETIC Exile Yard',
  'Sorcery',
  'Exile all cards from your graveyard.',
  { manaCost: '{1}' },
);
const REANIMATE = parsed(
  'SYNTHETIC Reanimate All',
  'Sorcery',
  'Return all creature cards from your graveyard to the battlefield.',
  { manaCost: '{1}' },
);

describe('Syr Konrad, the Grim', () => {
  const KONRAD = real('Syr Konrad, the Grim');

  test('read as three events of one trigger, each dealing 1 damage to each opponent (CR 603.2c)', () => {
    const triggers = (KONRAD.faces[0]?.abilities ?? []).flatMap((a) =>
      a.kind === 'triggered' ? [a.trigger] : [],
    );
    expect(triggers).toEqual([
      { kind: 'dies', what: { types: ['creature'], other: true } },
      {
        kind: 'putIntoGraveyard',
        who: 'any',
        from: 'notBattlefield',
        filter: { types: ['creature'] },
      },
      { kind: 'leftGraveyard', who: 'you', filter: { types: ['creature'] }, each: true },
    ]);
  });

  const game = (mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
    mine(
      scenario()
        .define(KONRAD)
        .define(BEAR)
        .define(ELF)
        .define(MILL_THREE)
        .define(KILL)
        .define(EXILE_YARD)
        .define(REANIMATE)
        .seat(0)
        .life(20)
        .battlefield(KONRAD.name)
        .battlefield('Plains', { count: 4 }),
    )
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('another creature dies: 1 damage, and the card in the graveyard is not counted a second time', () => {
    const g = game((b) =>
      b
        .hand(KILL.name)
        .battlefield(BEAR.name)
        .library(...FILLER),
    );
    g.act(0).cast(KILL.name, { pay: true, targets: [BEAR.name] });
    settle(g);
    expect(g.state.seats[1]?.life).toBe(19);
  });

  test('creature cards milled: 1 damage for each creature card, none for another card', () => {
    const g = game((b) =>
      b.hand(MILL_THREE.name).library(BEAR.name, 'Island', ELF.name, ...FILLER),
    );
    g.act(0).cast(MILL_THREE.name, { pay: true });
    settle(g);
    expect(g.state.seats[1]?.life).toBe(18);
  });

  test('creature cards that leave your graveyard: 1 damage for each of the cards that return together', () => {
    const g = game((b) =>
      b
        .hand(REANIMATE.name)
        .graveyard(BEAR.name, ELF.name, 'Island')
        .library(...FILLER),
    );
    g.act(0).cast(REANIMATE.name, { pay: true });
    settle(g);
    expect(g.state.seats[1]?.life).toBe(18);
  });

  test('a card that is not a creature card leaves the graveyard: nothing', () => {
    const g = game((b) =>
      b
        .hand(EXILE_YARD.name)
        .graveyard('Island', 'Plains')
        .library(...FILLER),
    );
    g.act(0).cast(EXILE_YARD.name, { pay: true });
    settle(g);
    expect(g.state.seats[1]?.life).toBe(20);
  });
});

describe('Insidious Roots', () => {
  const ROOTS = real('Insidious Roots');

  test('read as a batch trigger of the creature cards that leave your graveyard (CR 603.2c)', () => {
    expect(ROOTS.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'leftGraveyard', who: 'you', filter: { types: ['creature'] } },
    });
    const trigger = ROOTS.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger?.kind === 'triggered' && trigger.trigger).not.toHaveProperty('each');
  });

  const plants = (g: { state: GameState }) =>
    getView(g.state, 0).battlefield.filter((o) => o.name === 'Plant');

  const game = (graveyard: readonly string[], spell: CardDefinition) =>
    scenario()
      .define(ROOTS)
      .define(BEAR)
      .define(ELF)
      .define(spell)
      .seat(0)
      .hand(spell.name)
      .battlefield(ROOTS.name)
      .battlefield('Plains', { count: 4 })
      .graveyard(...graveyard)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('two creature cards leave together: one trigger, one Plant with a +1/+1 counter', () => {
    const g = game([BEAR.name, ELF.name], EXILE_YARD);
    g.act(0).cast(EXILE_YARD.name, { pay: true });
    settle(g);
    const found = plants(g);
    expect(found).toHaveLength(1);
    expect(found[0]?.power).toBe(1);
    expect(found[0]?.toughness).toBe(2);
  });

  test('a land card leaving the graveyard does not trigger it', () => {
    const g = game(['Island'], EXILE_YARD);
    g.act(0).cast(EXILE_YARD.name, { pay: true });
    settle(g);
    expect(plants(g)).toHaveLength(0);
  });

  test('returned to the battlefield: the trigger too (CR 400.7)', () => {
    const g = game([BEAR.name], REANIMATE);
    g.act(0).cast(REANIMATE.name, { pay: true });
    settle(g);
    expect(plants(g)).toHaveLength(1);
  });
});
