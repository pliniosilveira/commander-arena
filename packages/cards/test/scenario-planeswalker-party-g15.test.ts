// Planeswalker Party deck (issue 132), group 15: Silent Arbiter, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 508.1c (a restriction: a declaration of two attackers is illegal, one is legal), CR 508.1d (a requirement is obeyed as far as the restriction lets it be), CR 509.1b (the
// blockers of all the defending players together), CR 604.1. Three seats: the limit on blockers counts both defenders.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const ARBITER = real('Silent Arbiter');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Silent Arbiter', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(ARBITER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(BEARS, { label: 'b' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ARBITER.name)
      .battlefield(BEARS, { label: 'blocker one' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'blocker two' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('two attackers are refused, one is accepted', () => {
    const g = build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(
      g.act(0).try.declareAttackers([
        { attacker: 'a', target: { player: 1 } },
        { attacker: 'b', target: { player: 2 } },
      ]).ok,
    ).toBe(false);
    expect(g.act(0).try.declareAttackers([{ attacker: 'a', target: { player: 1 } }]).ok).toBe(true);
  });

  test('the legal declarations never hold two attackers', () => {
    const g = build();
    g.advanceTo('declareAttackers', { attack: false });
    const lists = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'declareAttackers' ? [a.attacks.length] : []));
    expect(Math.max(...lists)).toBe(1);
  });

  const BLOCK_LIMIT = parsed(
    'SYNTHETIC Block Limiter',
    'Artifact Creature — Construct',
    'No more than one creature can block each combat.',
    { manaCost: '{4}', power: '1', toughness: '1' },
  );
  test('the blockers of the defending players together are limited: two blockers are refused, one accepted', () => {
    const g = scenario({ seats: 3 })
      .define(BLOCK_LIMIT)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(BEARS, { label: 'b' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BLOCK_LIMIT.name)
      .battlefield(BEARS, { label: 'blocker one' })
      .battlefield(BEARS, { label: 'blocker two' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'a', target: { player: 1 } },
      { attacker: 'b', target: { player: 1 } },
    ]);
    g.passAll();
    expect(
      g.act(1).try.declareBlockers([
        { blocker: 'blocker one', attacker: 'a' },
        { blocker: 'blocker two', attacker: 'b' },
      ]).ok,
    ).toBe(false);
    expect(g.act(1).try.declareBlockers([{ blocker: 'blocker one', attacker: 'a' }]).ok).toBe(true);
  });
});
