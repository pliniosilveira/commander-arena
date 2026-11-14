// The Gisa deck (issue 41), group 2 (D-1410 to D-1414): the REAL Oracle text of Gisa, the Hellraiser, Forsaken Miner, Mirkwood Bats and Morbid Opportunist (the corpus's
// golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the
// parser writes for the real text are what the engine runs. The abilities of each real card are also the ones of its SYNTHETIC sibling of the engine fixtures
// (`synthetic-gisa-g2.ts`), which the engine tests and the AI soak play. Pins: CR 700.13 (committing a crime), CR 702.21a (ward), CR 111.2 (creating a token), CR 701.21
// (sacrifice), CR 603.2c (once for each event), CR 603.10a (a creature that dies with the others is seen), CR 113.6b (an ability that works from the graveyard).
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

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';
const SWARM = 'SYNTHETIC Rat Swarm';
const SWEEP = 'SYNTHETIC Grim Sweep';
const ALTAR = 'SYNTHETIC Altar';
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');

const gisa = real('Gisa, the Hellraiser');
const miner = real('Forsaken Miner');
const bats = real('Mirkwood Bats');
const opportunist = real('Morbid Opportunist');

describe('every card is valid and has the AST of its SYNTHETIC sibling', () => {
  test.each([
    ['Gisa, the Hellraiser', gisa, 'SYNTHETIC Crypt Warlock'],
    ['Forsaken Miner', miner, 'SYNTHETIC Restless Digger'],
    ['Mirkwood Bats', bats, 'SYNTHETIC Token Leech'],
    ['Morbid Opportunist', opportunist, 'SYNTHETIC Grave Scholar'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    const face = card.faces[0];
    const twin = syntheticCard(sibling).faces[0];
    expect(face?.abilities).toEqual(twin?.abilities);
  });
});

describe('Gisa, the Hellraiser', () => {
  const board = () =>
    scenario()
      .define(gisa)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield(gisa.name)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('a crime makes two tapped 2/2 Zombie Rogues, which get +1/+1 and menace', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.zone('Zombie Rogue', 'battlefield', { seat: 0, count: 2 });
    for (const o of g.find({ name: 'Zombie Rogue', zone: 'battlefield', seat: 0 })) {
      expect(o.tapped).toBe(true);
    }
    g.expect.pt('Zombie Rogue[0]', 3, 3);
    g.expect.derived('Zombie Rogue[0]', { keywords: ['menace'] });
    g.expect.pt(gisa.name, 4, 4);
    g.expect.invariants();
  });

  test('ward—{2}, pay 2 life: the opponent pays both or the spell is countered', () => {
    const g = scenario()
      .define(gisa)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(gisa.name)
      .seat(1)
      .library(...LIBRARY)
      .life(40)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [gisa.name], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.life(1, 38);
    g.act(1).payAuto();
    g.passAll();
    g.expect.damage(gisa.name, 3);
    g.expect.invariants();
  });
});

describe('Forsaken Miner', () => {
  test('a crime: pay {B}, and the card returns from the graveyard to the battlefield', () => {
    const g = scenario()
      .define(miner)
      .seat(0)
      .library(...LIBRARY)
      .graveyard(miner.name)
      .hand(BOLT)
      .battlefield('Mountain', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(miner.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Mirkwood Bats', () => {
  test('two tokens created: each opponent loses 2 life; a token sacrificed: 1 more', () => {
    const g = scenario()
      .define(bats)
      .define(syntheticCard(SWARM))
      .define(syntheticCard(ALTAR))
      .seat(0)
      .library(...LIBRARY)
      .hand(SWARM)
      .battlefield('Swamp', 'Swamp')
      .battlefield(bats.name)
      .battlefield(ALTAR)
      .seat(1)
      .life(40)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    g.expect.life(1, 38);
    g.act(0).activate(ALTAR);
    g.act(0).choosePermanents('Rat[0]');
    g.passAll();
    g.expect.life(1, 37);
    g.expect.invariants();
  });
});

describe('Morbid Opportunist', () => {
  test('creatures dying together: one card; a second death the same turn: none', () => {
    const g = scenario()
      .define(opportunist)
      .define(syntheticCard(SWEEP))
      .seat(0)
      .library(...LIBRARY)
      .hand(SWEEP, BOLT)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Mountain')
      .battlefield(opportunist.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER)
      .battlefield(BEARS, { label: 'victim' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: ['victim'], pay: true });
    g.passAll();
    g.expect.librarySize(0, 7);
    g.act(0).cast(SWEEP, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 7);
    g.expect.invariants();
  });
});
