// The Niv-Mizzet deck (issue 25), group 3-a (D-970, D-971): the REAL Oracle text of Galvanic Iteration and Thunderclap Drake (the corpus's golden.jsonl, taken from
// the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser
// writes for the real text are what the engine runs. The helper cards are SYNTHETIC (src/cards/fixtures) or old fixtures. Pins: CR 603.7, 603.7a, 603.7b (a
// delayed triggered ability waits for an event after it was created and triggers once), CR 514.2 ("this turn"), CR 707.10 and 707.10c (the copies are not cast;
// new targets are optional), CR 702.34a (Flashback), CR 903.8 (the times a commander was cast from the command zone), CR 601.2f (the cost reduction).
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
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 12 }, () => 'Island');
const BOLT = 'Lightning Bolt'; // {R}: 3 damage to any target
const BLUE_BOLT = 'SYNTHETIC Blue Bolt'; // {1}{U} instant: 2 damage to any target
const COMMANDER = 'Grizzly Bears'; // a creature card as the commander

describe('Galvanic Iteration: "When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy." and Flashback {1}{U}{R}', () => {
  const galvanic = real('Galvanic Iteration');
  const GALVANIC = galvanic.name;

  const start = (hand: readonly string[], graveyard: readonly string[] = []) =>
    scenario()
      .define(galvanic)
      .seat(0)
      .hand(...hand)
      .graveyard(...graveyard)
      .battlefield('Island', { count: 4 })
      .battlefield('Mountain', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card is valid', () => {
    expect(validateCard(galvanic)).toEqual([]);
  });

  test('the next instant is copied, with new targets for the copy, and the copy is not cast', () => {
    const g = start([GALVANIC, BOLT]);
    g.act(0).cast(GALVANIC, { pay: true });
    g.pass();
    g.pass();
    expect(g.state.delayedTriggers).toHaveLength(1);
    const mark = g.mark();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${GALVANIC} (ability)`, BOLT]);
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 0 });
    g.expect.stack([BOLT, BOLT]);
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'spellCopied')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'spellCast')).toHaveLength(1); // the Bolt itself
    g.passAll();
    g.expect.life(0, 37);
    g.expect.life(1, 37);
    // Used once: a second Bolt is not copied.
    expect(g.state.delayedTriggers).toHaveLength(0);
    g.expect.invariants();
  });

  test('cast again from the graveyard with flashback, it sets up another copy and is exiled', () => {
    const g = start([BOLT, BOLT], [GALVANIC]);
    g.act(0).cast(GALVANIC, { alternative: 'flashback', pay: true });
    g.pass();
    g.pass();
    g.expect.zone(GALVANIC, 'exile', { seat: 0 });
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.act(0).cast(
      { name: BOLT, zone: 'hand', seat: 0, nth: 0 },
      {
        targets: [{ player: 1 }],
        pay: true,
      },
    );
    g.expect.stack([`${GALVANIC} (ability)`, BOLT]);
  });

  test('it ends with the turn', () => {
    const g = start([GALVANIC, BOLT]);
    g.act(0).cast(GALVANIC, { pay: true });
    g.pass();
    g.pass();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.delayedTriggers).toHaveLength(0);
  });
});

describe('Thunderclap Drake: "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you\'ve cast your commander ..." and the cost reduction', () => {
  const drake = real('Thunderclap Drake');
  const DRAKE = drake.name;

  const start = (casts: number, hand: readonly string[] = [BOLT]) =>
    scenario()
      .define(drake)
      .seat(0)
      .hand(...hand)
      .battlefield(DRAKE)
      .battlefield('Island', { count: 4 })
      .battlefield('Mountain', { count: 4 })
      .commander(COMMANDER, { casts })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card is valid', () => {
    expect(validateCard(drake)).toEqual([]);
  });

  test('instant and sorcery spells cost {1} less while it is on the battlefield (CR 601.2f)', () => {
    const base = (withDrake: boolean) => {
      const b = scenario().define(drake).seat(0).hand(BLUE_BOLT).battlefield('Island');
      return (withDrake ? b.battlefield(DRAKE) : b)
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .at('precombatMain')
        .build();
    };
    // The blue bolt is {1}{U}: one Island pays for it with the Drake, not without.
    base(true).expect.legal(0, { cast: BLUE_BOLT });
    base(false).expect.illegal(0, { cast: BLUE_BOLT });
  });

  test('a copy for each time the commander was cast from the command zone', () => {
    const g = start(2);
    g.act(0).activate(DRAKE, { pay: true });
    g.expect.zone(DRAKE, 'graveyard', { seat: 0 });
    g.pass();
    g.pass();
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${DRAKE} (ability)`, BOLT]);
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).chooseTargets({ player: 0 });
    g.expect.stack([BOLT, BOLT, BOLT]);
    g.passAll();
    g.expect.life(1, 34); // the original and one copy
    g.expect.life(0, 37);
    g.expect.invariants();
  });

  test('no commander cast from the command zone: no copy', () => {
    const g = start(0);
    g.act(0).activate(DRAKE, { pay: true });
    g.pass();
    g.pass();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([BOLT]);
    g.expect.pending('priority', 0);
  });
});
