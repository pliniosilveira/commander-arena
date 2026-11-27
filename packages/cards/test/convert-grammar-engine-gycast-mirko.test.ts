// Revenant Recon deck, group B: the end step ability of Mirko, Obsessive Theorist, read from its real Oracle text and played through `applyAction`: "At the beginning of your end step, you may
// return target creature card with power less than Mirko's from your graveyard to the battlefield with a finality counter on it." (CR 603.2 the trigger, 115.1 and 404.1 a target in a graveyard,
// 208.1 the power a card has outside the battlefield, 608.2b the legality of the target on resolution, 122.6 the counter it enters with). The cards are named SYNTHETIC: the text is the real one.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const MIRKO_TEXT =
  'Flying, vigilance\nAt the beginning of your end step, you may return target creature card with power less than ~’s from your graveyard to the battlefield with a finality counter on it.';

const mirko = parsed(
  'SYNTHETIC Parsed Mirko',
  'Legendary Creature — Vampire Detective',
  MIRKO_TEXT,
  {
    manaCost: '{1}{U}{B}',
    power: '2',
    toughness: '3',
    colors: ['U', 'B'],
  },
);
const small = parsed('SYNTHETIC Parsed Small', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '1',
  toughness: '1',
  colors: ['G'],
});
const equal = parsed('SYNTHETIC Parsed Equal', 'Creature — Bear', 'Vigilance', {
  manaCost: '{2}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const big = parsed('SYNTHETIC Parsed Big', 'Creature — Giant', 'Vigilance', {
  manaCost: '{4}{G}',
  power: '5',
  toughness: '5',
  colors: ['G'],
});

function game(yard: readonly string[], opponentYard: readonly string[] = []) {
  let b = scenario()
    .define(mirko)
    .define(small)
    .define(equal)
    .define(big)
    .seat(0)
    .battlefield(mirko.name)
    .library('Swamp', 'Swamp');
  for (const name of yard) b = b.graveyard(name);
  let o = b.seat(1).library('Swamp');
  for (const name of opponentYard) o = o.graveyard(name);
  const g = o.at('precombatMain', { active: 0, turn: 1 }).build();
  g.advanceTo('end');
  return g;
}

describe('the end step ability of Mirko, from the real text (CR 603.2, 208.1, 122.6)', () => {
  test('the whole text is supported and the ability is triggered', () => {
    const triggered = mirko.faces[0]?.abilities.filter((a) => a.kind === 'triggered') ?? [];
    expect(triggered).toHaveLength(1);
  });

  test('a creature card with less power returns with a finality counter', () => {
    const g = game([small.name, equal.name, big.name]);
    g.passAll();
    g.act(0).accept();
    g.expect.zone(small.name, 'battlefield', { seat: 0 });
    g.expect.counters(small.name, { finality: 1 });
    g.expect.zone(equal.name, 'graveyard', { seat: 0 });
    g.expect.zone(big.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a card with equal or greater power is not a legal target', () => {
    const g = game([equal.name, big.name]);
    g.passAll();
    g.expect.zone(equal.name, 'graveyard', { seat: 0 });
    g.expect.zone(big.name, 'graveyard', { seat: 0 });
  });

  test('declining the offer leaves the card in the graveyard', () => {
    const g = game([small.name]);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(small.name, 'graveyard', { seat: 0 });
  });

  test('only the graveyard of the controller is looked at, never another seat', () => {
    const g = game([], [small.name]);
    g.passAll();
    g.expect.zone(small.name, 'graveyard', { seat: 1 });
  });
});
