// The Gisa deck (issue 41), group 5 (D-478 to D-482): the REAL Oracle text of Crowded Crypt, Jadar, Ghoulcaller of Nephalia, Gempalm Polluter and Woe Strider (the corpus's
// golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the
// parser writes for the real text are what the engine runs. The abilities of each real card are also the ones of its SYNTHETIC sibling of the engine fixtures
// (`synthetic-gisa-g5.ts`), which the engine tests and the AI soak play (the costs of the fixtures are smaller, so they are put equal before the comparison).
// Pins: CR 702.147a (Decayed), CR 113.7a (last-known information of a sacrificed source), CR 603.4 (intervening "if"), CR 702.29c (when you cycle this card), CR 702.138b-c (escape).
import { readFileSync } from 'node:fs';
import {
  type Ability,
  type CardDefinition,
  syntheticCard,
  validateCard,
} from '@commander-arena/engine';
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
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const crypt = real('Crowded Crypt');
const jadar = real('Jadar, Ghoulcaller of Nephalia');
const polluter = real('Gempalm Polluter');
const strider = real('Woe Strider');

const abilitiesOf = (card: CardDefinition): readonly Ability[] => card.faces[0]?.abilities ?? [];

describe('every card is valid and shares its AST with its SYNTHETIC sibling', () => {
  test.each([crypt, jadar, polluter, strider])('$name is valid', (card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Crowded Crypt: the same abilities as the Corpse Vault, but for the cost of the last', () => {
    const twin = abilitiesOf(syntheticCard('SYNTHETIC Corpse Vault')).map((a) =>
      a.kind === 'activated'
        ? { ...a, cost: [{ kind: 'mana', symbols: ['4', 'B', 'B'] }, ...a.cost.slice(1)] }
        : a,
    );
    expect(abilitiesOf(crypt)).toEqual(twin);
  });

  test('Jadar: the same abilities as the Husk Raiser', () => {
    expect(abilitiesOf(jadar)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Husk Raiser')));
  });

  test('Gempalm Polluter: the same abilities as the Rot Cycler', () => {
    expect(abilitiesOf(polluter)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Rot Cycler')));
  });

  test('Woe Strider: the replacement of its escape is the one of the Grave Strider', () => {
    const replacement = (card: CardDefinition) =>
      abilitiesOf(card).filter((a) => a.kind === 'replacement');
    expect(replacement(strider)).toEqual(replacement(syntheticCard('SYNTHETIC Grave Strider')));
    expect(replacement(strider)).toHaveLength(1);
  });
});

describe('Crowded Crypt: "... Create a 2/2 black Zombie creature token with decayed for each corpse counter on this artifact."', () => {
  const NAME = crypt.name;
  const start = (counters: number) =>
    scenario()
      .define(crypt)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(NAME, counters > 0 ? { counters: { corpse: counters } } : {})
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('two corpse counters make two Zombies with decayed, and the Crypt is sacrificed', () => {
    const g = start(2);
    g.act(0).activate(NAME, { ability: 2, pay: true });
    g.expect.zone(NAME, 'graveyard', { seat: 0 });
    g.passAll();
    const zombies = g.view(0).battlefield.filter((o) => o.name === 'Zombie');
    expect(zombies).toHaveLength(2);
    for (const z of zombies) {
      expect(z.keywords).toContain('decayed');
      expect([z.power, z.toughness]).toEqual([2, 2]);
    }
    g.expect.invariants();
  });

  test('a creature of yours that dies feeds it: one counter for each', () => {
    const g = scenario()
      .define(crypt)
      .seat(0)
      .library(...LIBRARY)
      .hand('Lightning Bolt')
      .battlefield(NAME)
      .battlefield('Mountain')
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.counters(NAME, { corpse: 1 });
  });
});

describe('Jadar, Ghoulcaller of Nephalia: "At the beginning of your end step, if you control no creatures with decayed, create a 2/2 black Zombie creature token with decayed."', () => {
  const NAME = jadar.name;
  const start = (...mine: string[]) =>
    scenario()
      .define(jadar)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(NAME)
      .battlefield(...mine)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('no creature with decayed: a Zombie with decayed arrives at the end step', () => {
    const g = start();
    g.advanceTo('end');
    g.expect.stack([`${NAME} (ability)`]);
    g.passAll();
    expect(g.find({ name: 'Zombie', zone: 'battlefield' })).toHaveLength(1);
    g.expect.derived({ name: 'Zombie', seat: 0 }, { keywords: ['decayed'] });
  });

  test('once the Zombie is there it is a creature with decayed that you control: the next end steps make no other', () => {
    const g = start(BEARS);
    g.advanceTo('end');
    g.passAll();
    expect(g.find({ name: 'Zombie', zone: 'battlefield' })).toHaveLength(1);
    // the Zombie of the first end step is the creature with decayed: the second end step makes no other
    g.advanceTo('end', { turn: 'next' });
    g.advanceTo('end', { turn: 'next' });
    g.expect.stack([]);
    expect(g.find({ name: 'Zombie', zone: 'battlefield' })).toHaveLength(1);
  });

  test('the Zombie attacks: it is sacrificed at end of combat, and the next end step makes another', () => {
    const g = start();
    g.advanceTo('end');
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers');
    g.act(0).attack({ name: 'Zombie', seat: 0 });
    g.passAll();
    g.advanceTo('endOfCombat');
    g.passAll();
    expect(g.find({ name: 'Zombie', zone: 'battlefield' })).toHaveLength(0);
    g.advanceTo('end');
    g.passAll();
    expect(g.find({ name: 'Zombie', zone: 'battlefield' })).toHaveLength(1);
  });
});

describe('Gempalm Polluter: "When you cycle this card, you may have target player lose life equal to the number of Zombies on the battlefield."', () => {
  const NAME = polluter.name;
  const start = (...battlefield: string[]) =>
    scenario()
      .define(polluter)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(NAME)
      .battlefield('Swamp', 'Swamp')
      .battlefield(...battlefield)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the Polluter on the battlefield is a Zombie too; cycled, it is in the graveyard and does not count', () => {
    const g = start(NAME);
    g.act(0).activate({ name: NAME, zone: 'hand' }, { pay: true });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.act(0).accept();
    // one Zombie on the battlefield: the other copy
    g.expect.life(1, 19);
  });

  test('declined: no life is lost', () => {
    const g = start(NAME);
    g.act(0).activate({ name: NAME, zone: 'hand' }, { pay: true });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.act(0).decline();
    g.expect.life(1, 20);
  });
});

describe('Woe Strider: "This creature escapes with two +1/+1 counters on it." with its other abilities', () => {
  const NAME = strider.name;
  const OTHERS = ['Grizzly Bears', 'Giant Spider', 'Typhoid Rats', 'Youthful Knight'] as const;

  test('cast from the graveyard for {3}{B}{B} and four other cards: it enters with two +1/+1 counters, and makes its Goat', () => {
    const b = scenario()
      .define(strider)
      .seat(0)
      .library(...LIBRARY)
      .graveyard(NAME);
    for (const other of OTHERS) b.graveyard(other);
    const g = b
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(NAME, { alternative: 'escape', pay: true });
    g.passAll();
    g.expect.counters(NAME, { '+1/+1': 2 });
    g.expect.pt(NAME, 5, 4);
    g.passAll();
    expect(g.find({ name: 'Goat', zone: 'battlefield' })).toHaveLength(1);
    g.expect.invariants();
  });

  test('cast from the hand: 3/2 with no counters', () => {
    const g = scenario()
      .define(strider)
      .seat(0)
      .library(...LIBRARY)
      .hand(NAME)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.counters(NAME, {});
    g.expect.pt(NAME, 3, 2);
  });
});
