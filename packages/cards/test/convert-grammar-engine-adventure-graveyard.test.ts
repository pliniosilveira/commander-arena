// Hildibrand Manderville // Gentleman's Rise (issue 98): "When Hildibrand Manderville dies, you may cast it from your graveyard as an Adventure until the end of your next turn.",
// the real card imported from the golden corpus by the grammar alone and played through the engine, in two, three and four seat games.
// Pins: CR 603.10a (the dies trigger looks back to the card in the graveyard), CR 601.2 (casting from a graveyard when an effect permits it), CR 715.3 and 715.3d (the Adventure half
// only; exiled on an adventure when it resolves, then the creature may be cast from exile), CR 611.2a and 500.1 (to the end of the controller's next turn), CR 400.7.
import { readFileSync } from 'node:fs';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const found = cards.find((c) => c.name === "Hildibrand Manderville // Gentleman's Rise");
if (found === undefined) throw new Error('Hildibrand is not in the golden corpus');
const imported = importCard(fromGoldenCard(found), undefined, NO_OVERRIDES);
const hildibrand = imported.definition;
const NAME = hildibrand.name;
const BOLT = 'Lightning Bolt';

test('the real card is supported: nothing is left unread', () => {
  expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
  expect(imported.support.unparsed).toEqual([]);
});

test('the dies ability is a permission to cast the Adventure until the end of your next turn', () => {
  expect(hildibrand.faces[0]?.abilities).toContainEqual({
    kind: 'triggered',
    trigger: { kind: 'dies', what: { kind: 'this' } },
    effect: {
      kind: 'mayCast',
      objects: { kind: 'thisCard' },
      duration: 'untilEndOfNextTurn',
      adventure: true,
    },
    optional: true,
  });
});

function game(seats: 2 | 3 | 4 = 2) {
  let b = scenario({ seats })
    .define(hildibrand)
    .seat(0)
    .hand(BOLT)
    .battlefield(NAME)
    .battlefield('Mountain', 'Swamp', 'Swamp', 'Swamp', 'Plains', 'Plains')
    .library('Island', 'Island', 'Island', 'Island');
  for (let s = 1; s < seats; s++) b = b.seat(s as 1 | 2 | 3).library('Island', 'Island', 'Island');
  return b.at('precombatMain', { active: 0, turn: 1 }).build();
}

function die(g: ScenarioGame, accept = true) {
  g.act(0).cast(BOLT, { targets: [NAME], pay: true });
  g.passAll(); // Bolt resolves, Hildibrand dies, the trigger goes on the stack
  g.passAll(); // the trigger resolves: "you may"
  if (accept) g.act(0).accept();
  else g.act(0).decline();
}

describe('played through the engine', () => {
  test('the Adventure is cast from the graveyard, then the creature from exile', () => {
    const g = game();
    die(g);
    g.expect.zone(NAME, 'graveyard', { seat: 0 });
    g.advanceTo('postcombatMain'); // a main phase, where a creature spell could be cast
    g.expect.illegal(0, { cast: NAME, face: 0 });
    g.act(0).cast(NAME, { face: 1, pay: true });
    g.passAll();
    g.expect.zone(NAME, 'exile', { seat: 0 });
    expect(g.object(NAME).onAdventure).toBe(true);
    expect(g.find({ name: 'Zombie', zone: 'battlefield' })).toHaveLength(1);
    g.advanceTo('postcombatMain');
    g.act(0).cast(NAME, { face: 0, pay: true });
    g.passAll();
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
  });

  test('declined, there is no permission', () => {
    const g = game();
    die(g, false);
    g.expect.illegal(0, { cast: NAME, face: 1 });
    g.expect.illegal(0, { cast: NAME, face: 0 });
  });

  test('it lasts to the end of your next turn and no longer', () => {
    const g = game();
    die(g);
    g.advanceTo('end', { turn: 3 });
    g.expect.legal(0, { cast: NAME, face: 1 });
    g.advanceTo('upkeep', { turn: 4 });
    g.expect.illegal(0, { cast: NAME, face: 1 });
  });

  test.each([3, 4] as const)('with %i seats only the controller may cast it', (seats) => {
    const g = game(seats);
    die(g);
    g.expect.legal(0, { cast: NAME, face: 1 });
    for (let s = 1; s < seats; s++) {
      const other = g.legalActions(s as 1 | 2 | 3).filter((a) => a.kind === 'castSpell');
      expect(other).toEqual([]);
    }
    g.advanceTo('end', { turn: seats + 1 });
    g.expect.legal(0, { cast: NAME, face: 1 });
    g.advanceTo('upkeep', { turn: seats + 2 });
    g.expect.illegal(0, { cast: NAME, face: 1 });
  });
});
