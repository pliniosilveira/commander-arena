// The Quandrix Unlimited deck, group I: the REAL Oracle text of Unbound Flourishing (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is
// defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs (and are the ones of the engine's SYNTHETIC
// fixture). The spells and abilities with an {X} are the engine's SYNTHETIC X cards (`synthetic-x.ts`). Pins: CR 107.3 and 107.3m (X on the stack, the permanent enters with it),
// CR 601.2f (the cost paid stays), CR 603.2 and 603.4 (the trigger and its "if"), CR 707.10 and 707.10c (a copy of a spell or ability, new targets), CR 602.2 (activating an ability).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
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
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const flourishing = real('Unbound Flourishing');
const CUB = 'SYNTHETIC Hydra Cub'; // {X}{G}: enters with X +1/+1 counters
const BURN = 'SYNTHETIC X Burn'; // {X}{R}: X damage to any target
const CANNON = 'SYNTHETIC X Cannon'; // {X},{T}: X damage to target creature
const NEEDLE = 'SYNTHETIC Needle Rogue'; // {T}: 1 damage to target creature
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 10 }, () => 'Swamp');

test('Unbound Flourishing is a valid card, and its abilities are the ones of the engine fixture', () => {
  expect(validateCard(flourishing)).toEqual([]);
  const fixture = syntheticCard('SYNTHETIC Unbound Doubler');
  expect(flourishing.faces[0]?.abilities).toEqual(fixture.faces[0]?.abilities);
});

const board = (hand: readonly string[], mine: readonly string[], theirs: readonly string[] = []) =>
  scenario()
    .define(flourishing)
    .seat(0)
    .library(...LIBRARY)
    .hand(...hand)
    .battlefield(flourishing.name)
    .battlefield(...mine)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...theirs)
    .at('precombatMain', { active: 0 })
    .build();

describe('Unbound Flourishing', () => {
  test('a permanent spell with {X}: its X is doubled, so the creature enters with twice as many counters', () => {
    const g = board([CUB], ['Forest', 'Forest', 'Forest']);
    g.act(0).cast(CUB).x(2).pay();
    g.expect.stack([`${flourishing.name} (ability)`, CUB]);
    g.passAll();
    g.expect.counters(CUB, { '+1/+1': 4 });
    g.expect.invariants();
  });

  test('an instant with {X} is copied, the copy has the X and may take a new target', () => {
    const g = board([BURN], ['Mountain', 'Mountain', 'Mountain']);
    g.act(0).cast(BURN, { x: 2, targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${flourishing.name} (ability)`, BURN]);
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(0, 38);
  });

  test('an activated ability with {X} in its cost is copied, and the copy may take a new target', () => {
    const g = board([], [CANNON, 'Island', 'Island'], [BEARS, BEARS]);
    g.act(0).activate(CANNON, { x: 2, targets: ['Grizzly Bears[0]'], pay: true });
    g.expect.stack([`${flourishing.name} (ability)`, `${CANNON} (ability)`]);
    g.pass();
    g.pass();
    g.act(0).chooseTargets('Grizzly Bears[1]');
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1, count: 2 });
    g.expect.invariants();
  });

  test('an ability with no {X} in its cost is not copied', () => {
    const g = board([], [NEEDLE], [BEARS]);
    g.act(0).activate(NEEDLE, { targets: ['Grizzly Bears'] });
    g.expect.stack([`${NEEDLE} (ability)`]);
  });
});
