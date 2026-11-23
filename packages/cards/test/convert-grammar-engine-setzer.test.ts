// Setzer, Wandering Gambler (Revival Trance deck): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario
// and is played through applyAction. "When ~ enters, create The Blackjack, a legendary 3/3 colorless Vehicle artifact token with flying and crew 2.", "Whenever a Vehicle you
// control deals combat damage to a player, flip a coin." and "Whenever you win a coin flip, create two tapped Treasure tokens."
// Pins: CR 111.4 and 205.4 (a token with a name of its own and the legendary supertype), CR 301.7 and 702.122a (a Vehicle is an artifact and a creature only while crewed), CR 510.2
// (combat damage), CR 705.2 (the player who flips calls heads or tails and wins when the call matches the result), CR 603.2 (a trigger for the win), CR 111.10 (Treasure tokens).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const SETZER = real('Setzer, Wandering Gambler');
const BLACKJACK = 'The Blackjack';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

test('the card is valid', () => {
  expect(validateCard(SETZER)).toEqual([]);
});

/** Setzer is cast and the token created; two turns later the Blackjack is crewed and attacks seat 1, whose life is 20. */
function attack(seed: number): ScenarioGame {
  const g = scenario()
    .define(SETZER)
    .seed(seed)
    .seat(0)
    .life(20)
    .library(...LIBRARY)
    .hand(SETZER.name)
    .battlefield('Mountain', 'Mountain', 'Swamp', 'Swamp')
    .seat(1)
    .life(20)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast(SETZER.name, { pay: true });
  g.passAll();
  g.passAll();
  return g;
}

describe('The Blackjack', () => {
  test('is a legendary 3/3 colorless Vehicle artifact token with flying and crew 2', () => {
    const g = attack(1);
    const token = g.object(BLACKJACK);
    expect(token.token).toBeTruthy();
    g.expect.derived(BLACKJACK, {
      types: ['artifact'],
      subtypes: ['Vehicle'],
      supertypes: ['legendary'],
      keywords: ['flying', 'crew'],
    });
    // A Vehicle has power and toughness printed but is no creature until crewed (CR 301.7).
    expect(token.token?.characteristics).toMatchObject({ power: 3, toughness: 3 });
  });
});

describe('a Vehicle you control deals combat damage to a player: flip a coin (CR 705.2)', () => {
  function flipped(seed: number): { wins: boolean; treasures: number } {
    const g = attack(seed);
    g.advanceTo('precombatMain', { turn: 5 });
    g.act(0).activate(BLACKJACK);
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BLACKJACK]);
    // Combat damage: the Blackjack deals 3 to the opponent and its controller's trigger asks for the call.
    g.advanceTo('combatDamage', { block: false });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the call of the flip');
    expect(d.options).toEqual(['Heads', 'Tails']);
    g.act(0).chooseOption('Heads');
    g.passAll();
    g.expect.life(1, 17);
    const treasures = g.find({ name: 'Treasure' });
    g.expect.invariants();
    // "Two tapped Treasure tokens" enter tapped (CR 110.5, 111.10).
    expect(treasures.every((t) => t.tapped === true)).toBe(true);
    return { wins: treasures.length > 0, treasures: treasures.length };
  }

  test('a won flip creates two tapped Treasure tokens, a lost one nothing, and both happen', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20 && seen.size < 2; seed += 1) {
      const result = flipped(seed);
      expect(result.treasures).toBe(result.wins ? 2 : 0);
      seen.add(String(result.wins));
    }
    expect([...seen].sort()).toEqual(['false', 'true']);
  });
});
