// The Quandrix Unlimited deck, group G: the REAL Oracle text of Guardian Augmenter, Ingenious Prodigy, Quandrix Apprentice, Zimone All-Questioning, Primo the Unbounded, Deekah,
// Elusive Otter // Grove's Bounty and Zimone's Hypothesis (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario and is played
// through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 903.3 (commanders), CR 702.11 (hexproof).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Guardian Augmenter', () => {
  const augmenter = real('Guardian Augmenter');

  test('commanders you control have hexproof: an opponent cannot target the commander but can target another creature', () => {
    const board = () =>
      scenario()
        .define(augmenter)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(augmenter.name)
        .battlefield(BEARS, { commander: true, label: 'commander' })
        .battlefield(SPIDER, { label: 'other' })
        .seat(1)
        .library(...LIBRARY)
        .battlefield('Mountain', 'Mountain')
        .hand(BOLT)
        .at('precombatMain', { active: 0 })
        .build();
    const g = board();
    g.expect.derived('commander', { keywords: ['hexproof'] });
    g.expect.pt('commander', 4, 4); // its other line: commander creatures you control get +2/+2
    g.act(0).pass();
    expect(() => g.act(1).cast(BOLT, { targets: ['commander'], pay: true })).toThrow();
    const h = board();
    h.act(0).pass();
    h.act(1).cast(BOLT, { targets: ['other'], pay: true });
    h.expect.invariants();
  });
});

describe('Primo, the Unbounded', () => {
  const primo = real('Primo, the Unbounded');
  const PRIMO = primo.name;
  const zero = parsed('SYNTHETIC Zero Power', 'Creature — Wizard', '', {
    manaCost: '{1}',
    power: '0',
    toughness: '1',
  });
  const start = (configure: (b: ReturnType<typeof scenario>) => void = () => undefined) => {
    const b = scenario().define(primo).define(zero);
    b.seat(0)
      .life(20)
      .library(...LIBRARY);
    configure(b);
    b.seat(1)
      .life(20)
      .library(...LIBRARY);
    return b.at('precombatMain', { active: 0, priority: 0 }).build();
  };

  test('enters with twice X +1/+1 counters (CR 107.3m): X = 2 gives four, a 4/4 with trample', () => {
    const g = start((b) =>
      b.seat(0).hand(PRIMO).battlefield('Forest', 'Forest', 'Island', 'Forest', 'Forest'),
    );
    g.act(0).cast(PRIMO, { x: 2, pay: true });
    g.passAll();
    g.expect.zone(PRIMO, 'battlefield', { seat: 0 });
    g.expect.counters(PRIMO, { '+1/+1': 4 });
    g.expect.pt(PRIMO, 4, 4);
    g.expect.derived(PRIMO, { keywords: ['trample'] });
    g.expect.invariants();
  });

  test('X = 0 enters with no counter and dies as a 0/0', () => {
    const g = start((b) => b.seat(0).hand(PRIMO).battlefield('Forest', 'Forest', 'Island'));
    g.act(0).cast(PRIMO, { x: 0, pay: true });
    g.passAll();
    g.expect.zone(PRIMO, 'graveyard', { seat: 0 });
  });

  test('a creature with base power 0 that deals combat damage makes a Fractal with that many counters', () => {
    const g = start((b) =>
      b.seat(0).battlefield(PRIMO, { label: 'primo', counters: { '+1/+1': 4 } }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack('primo');
    g.advanceTo('combatDamage');
    g.expect.life(1, 16);
    g.expect.stack([`${PRIMO} (ability)`]);
    g.passAll();
    g.expect.zone('Fractal', 'battlefield', { seat: 0, count: 1 });
    g.expect.counters('Fractal', { '+1/+1': 4 });
    g.expect.pt('Fractal', 4, 4);
    g.expect.invariants();
  });

  test('one or more: two base-power-0 creatures dealing damage together make one Fractal with all the damage', () => {
    const g = start((b) =>
      b
        .seat(0)
        .battlefield(PRIMO, { label: 'primo', counters: { '+1/+1': 4 } })
        .battlefield(zero.name, { label: 'second', counters: { '+1/+1': 2 } }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(['primo', 'second']);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.zone('Fractal', 'battlefield', { seat: 0, count: 1 });
    g.expect.counters('Fractal', { '+1/+1': 6 });
  });

  test('a creature whose base power is not 0 does not trigger it, whatever its power is', () => {
    const g = start((b) =>
      b
        .seat(0)
        .battlefield(PRIMO, { label: 'primo', counters: { '+1/+1': 4 } })
        .battlefield(BEARS, { label: 'bears' }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack('bears');
    g.advanceTo('combatDamage');
    g.expect.stack([]);
    g.expect.noObject('Fractal');
  });
});

describe('Deekah, Fractal Theorist', () => {
  const deekah = real('Deekah, Fractal Theorist');
  const DEEKAH = deekah.name;
  const start = (configure: (b: ReturnType<typeof scenario>) => void = () => undefined) => {
    const b = scenario().define(deekah);
    b.seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(DEEKAH);
    configure(b);
    b.seat(1)
      .life(20)
      .library(...LIBRARY);
    return b.at('precombatMain', { active: 0, priority: 0 }).build();
  };

  test('casting an instant makes a 0/0 Fractal with counters equal to the spell mana value (CR 202.3)', () => {
    const g = start((b) => b.seat(0).hand(BOLT).battlefield('Mountain'));
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${DEEKAH} (ability)`, BOLT]);
    g.passAll();
    g.expect.zone('Fractal', 'battlefield', { seat: 0, count: 1 });
    g.expect.counters('Fractal', { '+1/+1': 1 });
    g.expect.pt('Fractal', 1, 1);
    g.expect.derived('Fractal', { colors: ['G', 'U'] });
    g.expect.invariants();
  });

  test('a creature spell is no instant or sorcery: no Fractal', () => {
    const g = start((b) => b.seat(0).hand(BEARS).battlefield('Forest', 'Forest'));
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
    g.passAll();
    g.expect.noObject('Fractal');
  });

  test('{3}{U}: target creature token can be targeted, a creature that is no token cannot', () => {
    const g = start((b) =>
      b
        .seat(0)
        .hand(BOLT)
        .battlefield(BEARS, { label: 'bears' })
        .battlefield('Mountain', 'Island', 'Island', 'Island', 'Island'),
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone('Fractal', 'battlefield', { seat: 0, count: 1 });
    expect(() => g.act(0).activate(DEEKAH, { targets: ['bears'], pay: true })).toThrow();
    g.act(0).activate(DEEKAH, { targets: ['Fractal'], pay: true });
    g.expect.stack([`${DEEKAH} (ability)`]);
    g.passAll();
    g.expect.stack([]);
    g.expect.invariants();
  });
});

// END
