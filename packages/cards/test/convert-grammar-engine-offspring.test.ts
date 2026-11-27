// The Animated Army deck (issue 110), group offspring: the REAL Oracle text of Prosperous Bandit (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card
// with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins: CR 702.175a (Offspring: the optional additional cost and the enters trigger), 601.2b and 601.2f (the cost is announced and is in the total), 707.2 and 707.9b (the token
// copy and its exception), 702.7 (first strike), 510.2 and 603.2 (combat damage dealt to a player and the trigger that counts it), 111.10 (the Treasure token), and the rulings of the
// card: the token copies what is printed except that it is 1/1, and is not cast (no offspring of its own).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const bandit = real('Prosperous Bandit');
const LIB = Array.from({ length: 8 }, () => 'Mountain');

describe('Prosperous Bandit (real text)', () => {
  test('the card is valid: offspring {1}, first strike and the Treasure trigger', () => {
    expect(validateCard(bandit)).toEqual([]);
    expect(bandit.faces[0]?.abilities).toMatchObject([
      { kind: 'keyword', keyword: { kind: 'offspring', cost: [{ kind: 'mana', symbols: ['1'] }] } },
      { kind: 'keyword', keyword: { kind: 'firstStrike' } },
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        effect: { kind: 'createToken', count: { kind: 'triggerDamage' }, tapped: true },
      },
    ]);
  });

  const casting = (lands: number) =>
    scenario()
      .define(bandit)
      .seat(0)
      .library(...LIB)
      .hand(bandit.name)
      .battlefield('Mountain', { count: lands })
      .seat(1)
      .library(...LIB)
      .at('precombatMain', { active: 0 })
      .build();

  test('offspring paid: {2}{R} and {1} are paid, and a 1/1 token copy with first strike enters', () => {
    const g = casting(4);
    g.act(0).cast(bandit.name);
    g.expect.pending('confirmOptional', 0);
    expect(g.state.pending?.kind === 'confirmOptional' && g.state.pending.purpose).toBe(
      'offspring',
    );
    g.act(0).accept();
    g.act(0).payAuto();
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).every((o) => o.tapped)).toBe(true);
    g.passAll();
    const bandits = g.find({ name: bandit.name, zone: 'battlefield' });
    expect(bandits).toHaveLength(2);
    const token = bandits.find((o) => o.token !== null);
    const card = bandits.find((o) => o.token === null);
    const view = g.view(0);
    const seen = (id: unknown) => view.battlefield.find((o) => o.id === id);
    expect([seen(card?.id)?.power, seen(card?.id)?.toughness]).toEqual([2, 2]);
    expect([seen(token?.id)?.power, seen(token?.id)?.toughness]).toEqual([1, 1]);
    expect(seen(token?.id)?.keywords).toContain('firstStrike');
    expect(seen(token?.id)?.subtypes).toEqual(['Raccoon', 'Rogue']);
    g.expect.invariants();
  });

  test('offspring not paid: three lands are tapped and no token is made', () => {
    const g = casting(4);
    g.act(0).cast(bandit.name);
    g.act(0).decline();
    g.act(0).payAuto();
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(
      3,
    );
    g.passAll();
    expect(g.find({ name: bandit.name, zone: 'battlefield' })).toHaveLength(1);
  });

  test('combat damage to a player: that many tapped Treasure tokens', () => {
    const g = scenario()
      .define(bandit)
      .seat(0)
      .library(...LIB)
      .battlefield(bandit.name)
      .seat(1)
      .library(...LIB)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(bandit.name);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 38);
    const treasures = g.find({ name: 'Treasure', zone: 'battlefield' });
    expect(treasures).toHaveLength(2);
    expect(treasures.every((o) => o.tapped && o.token !== null)).toBe(true);
    g.expect.invariants();
  });
});
