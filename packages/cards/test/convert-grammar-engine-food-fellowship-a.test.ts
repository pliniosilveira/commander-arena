// Food and Fellowship, group A (life gain): the REAL Oracle text of the golden corpus goes through the grammar with no override and is played through applyAction, so the nodes the
// parser writes are what the engine runs. Stand-ins that gain life are SYNTHETIC (named so). Pins: CR 119.3 (life gain), CR 111.2 (tokens), CR 122.1 (counters), CR 608.2c.
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 10 }, () => 'Plains');
/** SYNTHETIC: gains the controller 3 life. */
const SIP = parsed('Synthetic Sip', 'Instant', 'You gain 3 life.', { manaCost: '{W}' });
/** SYNTHETIC: loses the controller 3 life. */
const NICK = parsed('Synthetic Nick', 'Instant', 'You lose 3 life.', { manaCost: '{B}' });

describe('Assemble the Entmoot', () => {
  const entmoot = real('Assemble the Entmoot');
  const start = (hand: readonly string[]) =>
    scenario()
      .define(entmoot)
      .define(SIP)
      .define(NICK)
      .seat(0)
      .battlefield(entmoot.name)
      .battlefield('Plains', 'Swamp', 'Grizzly Bears')
      .hand(...hand)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  const treefolk = (g: ReturnType<typeof start>) =>
    g.state.battlefield
      .map((id) => g.state.objects[id])
      .filter((o) => o?.token?.characteristics.name === 'Treefolk');

  test('the card is valid', () => {
    expect(validateCard(entmoot)).toEqual([]);
  });

  test('sacrificed after gaining 3 life: three tapped 3/3 Treefolk, each with a reach counter', () => {
    const g = start([SIP.name]);
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.expect.life(0, 43);
    g.act(0).activate(entmoot.name);
    g.passAll();
    g.expect.zone(entmoot.name, 'graveyard', { seat: 0 });
    const tokens = treefolk(g);
    expect(tokens).toHaveLength(3);
    for (const t of tokens) {
      expect(t?.tapped).toBe(true);
      expect(t?.counters).toEqual({ reach: 1 });
      expect(t?.token?.characteristics.power).toBe(3);
      expect(t?.token?.characteristics.toughness).toBe(3);
    }
    g.expect.invariants();
  });

  test('life lost the same turn does not reduce the count (ruling 2023-06-16)', () => {
    const g = start([SIP.name, NICK.name]);
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.act(0).cast(NICK.name).pay();
    g.passAll();
    g.expect.life(0, 40);
    g.act(0).activate(entmoot.name);
    g.passAll();
    const tokens = treefolk(g);
    expect(tokens).toHaveLength(3);
    expect(tokens.every((t) => t?.token?.characteristics.power === 3)).toBe(true);
  });

  test('with no life gained, the tokens are 0/0 and die; creatures you control have reach', () => {
    const g = start([]);
    g.expect.derived('Grizzly Bears', { keywords: ['reach'] });
    g.act(0).activate(entmoot.name);
    g.passAll();
    expect(treefolk(g)).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('Field-Tested Frying Pan', () => {
  const pan = real('Field-Tested Frying Pan');
  const start = () =>
    scenario()
      .define(pan)
      .define(SIP)
      .seat(0)
      .hand(pan.name, SIP.name, SIP.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Grizzly Bears')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  const permanents = (g: ReturnType<typeof start>, name: string) =>
    g.state.battlefield
      .map((id) => g.state.objects[id])
      .filter((o) => o?.token?.characteristics.name === name);

  test('the card is valid', () => {
    expect(validateCard(pan)).toEqual([]);
  });

  test('enters with a Food and an attached 1/1 Halfling that grows by the life gained', () => {
    const g = start();
    g.act(0).cast(pan.name).pay();
    g.passAll();
    expect(permanents(g, 'Food')).toHaveLength(1);
    expect(permanents(g, 'Halfling')).toHaveLength(1);
    g.expect.attached(pan.name, 'Halfling');
    g.expect.pt('Halfling', 1, 1);
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.expect.life(0, 43);
    g.expect.pt('Halfling', 4, 4);
    g.expect.pt('Grizzly Bears', 2, 2);
    g.expect.invariants();
  });

  test('each gain is its own trigger with its own amount (CR 603.2c)', () => {
    const g = start();
    g.act(0).cast(pan.name).pay();
    g.passAll();
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.expect.pt('Halfling', 7, 7);
  });

  test('the bonus lasts until end of turn only', () => {
    const g = start();
    g.act(0).cast(pan.name).pay();
    g.passAll();
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.expect.pt('Halfling', 4, 4);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('Halfling', 1, 1);
  });
});
