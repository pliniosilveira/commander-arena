// The Eternal Might deck (issue 104), the group of static and continuous effects: the REAL Oracle text of On Wings of Gold, Maskwood Nexus and Rhet-Tomb Mystic
// (the corpus's golden.jsonl) goes through the grammar as a card with no override and is played through applyAction, so the nodes the parser writes for the real text
// are what the engine runs. Stand-ins are SYNTHETIC (named so). Pins: CR 613.1d (layer 4), 613.1f (layer 6), 613.4c (layer 7c), 611.3a (the group is whatever matches
// at any moment), 111.1 (tokens), 603.2c (a batch trigger once), 702.73a (changeling), 604.3 (works in every zone), 702.29a (cycling).
import { readFileSync } from 'node:fs';
import {
  type Action,
  type CardDefinition,
  CREATURE_TYPES,
  FIXTURE_CARDS,
  type GameState,
  getView,
} from '@commander-arena/engine';
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
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const names = (state: GameState, seat: 0 | 1): string[] =>
  getView(state, seat).battlefield.map((o) => o.name);

const SMALL = { manaCost: '{1}', power: '2', toughness: '2' } as const;
const ZOMBIE = parsed('SYNTHETIC Zombie', 'Creature — Zombie', '', SMALL);
const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', SMALL);
const RECALL = parsed(
  'SYNTHETIC Recall',
  'Sorcery',
  'Return target creature card from your graveyard to your hand.',
  { manaCost: '{1}' },
);
const BANISH = parsed('SYNTHETIC Banish', 'Sorcery', "Exile target player's graveyard.", {
  manaCost: '{1}',
});
const TWINS = parsed(
  'SYNTHETIC Twins',
  'Sorcery',
  'Create two 1/1 white Spirit creature tokens with flying.',
  { manaCost: '{1}' },
);

function settle(g: {
  state: GameState;
  passAll(): unknown;
  legalActions(seat: 0 | 1): readonly Action[];
}) {
  for (let i = 0; i < 16 && g.state.stack.length > 0; i += 1) g.passAll();
}

describe('On Wings of Gold', () => {
  const WINGS = real('On Wings of Gold');

  const board = () =>
    scenario()
      .define(WINGS)
      .define(ZOMBIE)
      .define(BEAR)
      .define(RECALL)
      .define(BANISH)
      .define(TWINS)
      .seat(0)
      .hand(TWINS.name, BANISH.name)
      .graveyard(BEAR.name, ZOMBIE.name)
      .battlefield(WINGS.name)
      .battlefield(ZOMBIE.name, { label: 'zombie' })
      .battlefield(BEAR.name, { label: 'bear' })
      .battlefield('Plains', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .battlefield(ZOMBIE.name, { label: 'theirs' })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('a Zombie you control gets +1/+1 and flying; a Bear does not; an opposing Zombie does not', () => {
    const g = board();
    g.expect.pt('zombie', 3, 3);
    g.expect.derived('zombie', { keywords: ['flying'] });
    g.expect.pt('bear', 2, 2);
    g.expect.derived('bear', { keywords: [] });
    g.expect.pt('theirs', 2, 2);
    g.expect.invariants();
  });

  test('a token that is not a Zombie gets it too, and the group is read at any moment (CR 611.3a)', () => {
    const g = board();
    g.act(0).cast(TWINS.name, { pay: true });
    settle(g);
    expect(g.find({ name: 'Spirit', zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.expect.pt('Spirit[0]', 2, 2);
    g.expect.derived('Spirit[0]', { keywords: ['flying'] });
    g.expect.invariants();
  });

  test('cards leaving the graveyard together make one 1/1 white Zombie token (CR 603.2c), which is a Zombie and gets the bonus', () => {
    const g = board();
    g.act(0).cast(BANISH.name, { pay: true, targets: [{ player: 0 }] });
    settle(g);
    expect(names(g.state, 0).filter((n) => n === 'Zombie')).toHaveLength(1);
    g.expect.pt('Zombie[0]', 2, 2);
    g.expect.derived('Zombie[0]', { keywords: ['flying'] });
    g.expect.invariants();
  });

  test('a card leaving another graveyard makes nothing', () => {
    const g = board();
    g.act(0).cast(BANISH.name, { pay: true, targets: [{ player: 1 }] });
    settle(g);
    expect(names(g.state, 0).filter((n) => n === 'Zombie')).toHaveLength(0);
  });
});

describe('Maskwood Nexus', () => {
  const NEXUS = real('Maskwood Nexus');
  const WINGS = real('On Wings of Gold');
  const ALL = [...new Set([...CREATURE_TYPES, 'Bear'])];

  test('the AST the grammar writes is the one of the hand-written engine fixture (but for the words of the token)', () => {
    const fixture = FIXTURE_CARDS['Maskwood Nexus'];
    const strip = (c: CardDefinition | undefined) =>
      JSON.parse(JSON.stringify(c?.faces[0]?.abilities ?? []), (k, v) =>
        k === 'oracleText' ? '' : v,
      );
    expect(strip(NEXUS)).toEqual(strip(fixture));
  });

  const board = () =>
    scenario()
      .define(NEXUS)
      .define(WINGS)
      .define(BEAR)
      .seat(0)
      .battlefield(NEXUS.name)
      .battlefield(BEAR.name, { label: 'mine' })
      .hand(BEAR.name)
      .graveyard(BEAR.name)
      .library(...FILLER)
      .pool('C')
      .pool('C')
      .pool('C')
      .seat(1)
      .battlefield(BEAR.name, { label: 'theirs' })
      .hand(BEAR.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the creatures you control are every creature type, and keep the ones they have (CR 205.3m, 613.1d)', () => {
    const g = board();
    g.expect.derived('mine', { subtypes: ALL });
    g.expect.derived('theirs', { subtypes: ['Bear'] });
    g.expect.invariants();
  });

  test('creature cards you own that are not on the battlefield are every creature type too (CR 604.3), and those of another player are not', () => {
    const g = board();
    g.expect.derived({ name: BEAR.name, zone: 'hand', seat: 0 }, { subtypes: ALL });
    g.expect.derived({ name: BEAR.name, zone: 'graveyard', seat: 0 }, { subtypes: ALL });
    g.expect.derived({ name: BEAR.name, zone: 'hand', seat: 1 }, { subtypes: ['Bear'] });
  });

  test('{3}, {T}: a 2/2 blue Shapeshifter token with changeling, which is every creature type', () => {
    const g = board();
    g.act(0).activate(NEXUS.name, { pay: true });
    g.passAll();
    g.expect.pt('Shapeshifter', 2, 2);
    g.expect.derived('Shapeshifter', {
      subtypes: [...new Set([...CREATURE_TYPES, 'Shapeshifter'])],
      keywords: ['changeling'],
      colors: ['U'],
    });
    g.expect.invariants();
  });

  test('layer 4 comes first: with On Wings of Gold, every creature is a Zombie and gets +1/+1 and flying (CR 613.1d, 613.1f, 613.4c)', () => {
    const g = scenario()
      .define(NEXUS)
      .define(WINGS)
      .define(BEAR)
      .seat(0)
      .battlefield(NEXUS.name)
      .battlefield(WINGS.name)
      .battlefield(BEAR.name, { label: 'mine' })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name, { label: 'theirs' })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.expect.pt('mine', 3, 3);
    g.expect.derived('mine', { keywords: ['flying'] });
    g.expect.pt('theirs', 2, 2);
    g.expect.invariants();
  });
});
