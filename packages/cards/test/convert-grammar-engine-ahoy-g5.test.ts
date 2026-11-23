// Ahoy Mateys deck, group 5 (Treasure conditions and triggers): Enterprising Scallywag ("At the beginning of your end step, if you descended this
// turn, create a Treasure token") and Blood Money ("Destroy all creatures. For each nontoken creature destroyed this way, you create a tapped Treasure
// token"), read by the grammar and run by the engine. The first block parses the REAL Oracle text of each card from the golden corpus, whole; the rest
// play the real cards through `applyAction` with the scenario DSL, plus the near misses the grammar must not read. Pins: CR 603.4 (an intervening "if" is
// checked as the trigger event happens and again as the ability resolves), CR 608.2c and 701.8 (what "destroyed this way" counts), CR 111.1 (a token is
// no card), CR 400.7 (a card put into a graveyard). The rule text of "descended" is not checked against the CR text in this sandbox (unverified).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const real = (name: string): CardDefinition => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
};

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BOLT = 'Lightning Bolt';

const SCALLYWAG = real('Enterprising Scallywag');
const BLOOD = real('Blood Money');

const BEAR = parsed('SYNTHETIC Ahoy Bear', 'Creature — Bear', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const TOKENMAKER = parsed(
  'SYNTHETIC Ahoy Spirit Maker',
  'Sorcery',
  'Create a 1/1 white Spirit creature token.',
  { manaCost: '{1}' },
);

const treasures = (g: { state: Parameters<typeof getView>[0] }, seat: 0 | 1) =>
  getView(g.state, seat).battlefield.filter((o) => o.name === 'Treasure' && o.controller === seat);

describe('the real cards, whole', () => {
  test('both are supported', () => {
    expect(SCALLYWAG.name).toBe('Enterprising Scallywag');
    expect(BLOOD.name).toBe('Blood Money');
  });
});

describe('the grammar reads the two lines', () => {
  test('"you descended this turn" is the intervening if of the end-step trigger', () => {
    const [trigger] = readAll(
      'At the beginning of your end step, if you descended this turn, create a Treasure token.',
      'creature',
    ).abilities;
    expect(trigger).toMatchObject({
      kind: 'triggered',
      interveningIf: { kind: 'descendedThisTurn' },
      effect: { kind: 'createToken' },
    });
  });

  test('"for each nontoken creature destroyed this way" counts the destroyed nontoken creatures of any player', () => {
    const spell = readAll(
      'Destroy all creatures. For each nontoken creature destroyed this way, you create a tapped Treasure token.',
      'sorcery',
    ).spell;
    expect(JSON.stringify(spell)).toContain('"what":"destroyedNontokenCreatures"');
    expect(JSON.stringify(spell)).toContain('"tapped":true');
  });

  test.each([
    ['an opponent descended', 'if an opponent descended this turn'],
    ['a count', 'if you descended twice this turn'],
    ['no time', 'if you descended'],
  ])('%s is not read', (_what, cond) => {
    expect(
      dropped(`At the beginning of your end step, ${cond}, create a Treasure token.`, 'creature'),
    ).toBeDefined();
  });

  test('tokens or a controller in the count are the other rules, not this one', () => {
    expect(
      dropped(
        'Destroy all creatures. For each nontoken permanent destroyed this way, you create a tapped Treasure token.',
        'sorcery',
      ),
    ).toBeDefined();
  });
});

describe('Enterprising Scallywag: a Treasure at my end step if I descended', () => {
  const build = () =>
    scenario()
      .define(SCALLYWAG)
      .define(BEAR)
      .seat(0)
      .battlefield(SCALLYWAG.name, BEAR.name, 'Mountain')
      .hand(BOLT)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('no card went into my graveyard: no Treasure (CR 603.4: the condition is false as the turn ends)', () => {
    const g = build();
    g.advanceTo('end');
    g.passAll();
    expect(treasures(g, 0)).toHaveLength(0);
    g.expect.invariants();
  });

  test('a permanent card of mine died this turn: one Treasure', () => {
    const g = build();
    g.act(0).cast(BOLT, { targets: [BEAR.name], pay: true });
    g.passAll();
    g.expect.zone(BEAR.name, 'graveyard');
    g.advanceTo('end');
    g.passAll();
    expect(treasures(g, 0)).toHaveLength(1);
    g.expect.invariants();
  });

  test('an instant going to my graveyard is not a permanent card: no Treasure', () => {
    const g = build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard');
    g.advanceTo('end');
    g.passAll();
    expect(treasures(g, 0)).toHaveLength(0);
  });

  test('a token dying is not a card (CR 111.1): no Treasure', () => {
    const g = scenario()
      .define(SCALLYWAG)
      .define(TOKENMAKER)
      .seat(0)
      .battlefield(SCALLYWAG.name, 'Mountain', 'Mountain')
      .hand(TOKENMAKER.name, BOLT)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(TOKENMAKER.name, { pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: ['Spirit'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    expect(treasures(g, 0)).toHaveLength(0);
  });
});

describe('Blood Money: a tapped Treasure for each nontoken creature destroyed', () => {
  test('every nontoken creature of every player counts, tokens do not; the Treasures enter tapped', () => {
    const g = scenario()
      .define(BLOOD)
      .define(BEAR)
      .define(TOKENMAKER)
      .seat(0)
      .hand(BLOOD.name, TOKENMAKER.name)
      .battlefield(BEAR.name)
      .battlefield('Swamp', { count: 8 })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(TOKENMAKER.name, { pay: true });
    g.passAll();
    g.act(0).cast(BLOOD.name, { pay: true });
    g.passAll();
    expect(getView(g.state, 0).battlefield.filter((o) => o.name === 'Spirit')).toHaveLength(0);
    const mine = treasures(g, 0);
    expect(mine).toHaveLength(2);
    expect(mine.every((o) => o.tapped === true)).toBe(true);
    expect(treasures(g, 1)).toHaveLength(0);
    g.expect.invariants();
  });

  test('no creature on the battlefield: no Treasure', () => {
    const g = scenario()
      .define(BLOOD)
      .seat(0)
      .hand(BLOOD.name)
      .battlefield('Swamp', { count: 8 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(BLOOD.name, { pay: true });
    g.passAll();
    expect(treasures(g, 0)).toHaveLength(0);
  });
});
