// Stage P70 (D-259): Commander's Plate, the Bruna deck program (issue 5). The lines are the real Oracle text of the acceptance card of the golden corpus,
// names replaced by ~, with the nodes the grammar produces; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The real
// card is also read through the whole importer and played through applyAction (the engine scenario test of the same rules is
// packages/engine/test/scenario-xx-commander-plate.test.ts).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const PLATE_TEXT =
  "Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity.\nEquip commander {3}\nEquip {5}";

describe('"Equip commander {3}" (CR 702.6c, 903.3)', () => {
  test("Commander's Plate: the commander equip, the plain equip, +3/+3 and the identity protection", () => {
    const parsed = readAll(PLATE_TEXT, 'artifact', ['Equipment']);
    expect(parsed.abilities).toEqual([
      { kind: 'static', static: expect.objectContaining({ kind: 'modifyPt', power: 3 }) },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached', types: ['creature'] },
          keyword: { kind: 'protection', from: 'colorsNotInCommanderIdentity' },
        },
      },
      {
        kind: 'keyword',
        keyword: {
          kind: 'equip',
          cost: [{ kind: 'mana', symbols: ['3'] }],
          restriction: { commander: true },
        },
      },
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['5'] }] } },
    ]);
  });

  test('another cost of mana (SYNTHETIC)', () => {
    const parsed = readAll('Equip commander {1}{W}', 'artifact', ['Equipment']);
    expect(parsed.abilities).toEqual([
      {
        kind: 'keyword',
        keyword: {
          kind: 'equip',
          cost: [{ kind: 'mana', symbols: ['1', 'W'] }],
          restriction: { commander: true },
        },
      },
    ]);
  });

  test.each([
    'Equip commander—Pay 2 life',
    'Equip commander {X}',
    'Equip your commander {3}',
    'Equip commander creature {3}',
    'Equip legendary creature {3}',
  ])('"%s" is not read (SYNTHETIC)', (text) => {
    expect(dropped(text, 'artifact', ['Equipment']).reason).toBeDefined();
  });
});

describe('a static ability that gives protection from colors (CR 702.16, 903.4)', () => {
  test('protection from named colors (SYNTHETIC)', () => {
    const parsed = readAll(
      'Equipped creature gets +1/+1 and has protection from red and from blue.\nEquip {2}',
      'artifact',
      ['Equipment'],
    );
    expect(parsed.abilities).toContainEqual({
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'attached', types: ['creature'] },
        keyword: { kind: 'protection', from: 'color', colors: ['R', 'U'] },
      },
    });
  });

  test('"each color that is not in your commander\'s color identity" with no other words (SYNTHETIC)', () => {
    const parsed = readAll(
      "Equipped creature has protection from each color that's not in your commander's color identity.\nEquip {2}",
      'artifact',
      ['Equipment'],
    );
    expect(parsed.abilities[0]).toEqual({
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'attached', types: ['creature'] },
        keyword: { kind: 'protection', from: 'colorsNotInCommanderIdentity' },
      },
    });
  });

  test.each([
    'Equipped creature has protection from everything.\nEquip {2}',
    "Equipped creature has protection from each color that's in your commander's color identity.\nEquip {2}",
    'Equipped creature has protection from red and blue.\nEquip {2}',
  ])('"%s" is not read (SYNTHETIC)', (text) => {
    expect(dropped(text, 'artifact', ['Equipment']).reason).toBeDefined();
  });
});

// The real card through the importer, then played.
const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

describe("Commander's Plate, the real card, played through applyAction", () => {
  const PLATE = real("Commander's Plate");
  const commander = (name: string, identity: CardDefinition['colorIdentity']): CardDefinition => {
    const bears = real('Grizzly Bears');
    return {
      ...bears,
      name,
      colorIdentity: identity,
      faces: bears.faces.map((f) => ({ ...f, name })),
    };
  };
  const GOLD = commander('SYNTHETIC Plate Commander', ['W', 'U']);

  test('is supported: the card reads and validates', () => {
    expect(PLATE.faces[0]?.abilities).toHaveLength(4);
  });

  test('equips the commander for {3} and gives it +3/+3 and protection from black, red and green', () => {
    const g = scenario()
      .define(PLATE)
      .define(GOLD)
      .seat(0)
      .battlefield(PLATE.name, 'Plains', 'Plains', 'Plains')
      .battlefield(GOLD.name, { commander: true })
      .seat(1)
      .build();
    const equips = [
      ...new Set(
        getLegalActions(g.state, 0).flatMap((a) =>
          a.kind === 'activate' && a.object === g.id(PLATE.name) ? [a.abilityIndex] : [],
        ),
      ),
    ].sort((a, b) => a - b);
    // Only {3}: three lands cannot pay {5}. The commander is the one target.
    expect(equips).toHaveLength(1);
    g.act(0).activate(PLATE.name, { ability: equips[0] ?? 0, targets: [GOLD.name], pay: true });
    g.passAll();
    g.expect.attached(PLATE.name, GOLD.name);
    const view = getView(g.state, 0).battlefield.find((o) => o.name === GOLD.name);
    expect([view?.power, view?.toughness]).toEqual([5, 5]);
    g.expect.invariants();
  });

  const attacked = () =>
    scenario()
      .define(PLATE)
      .define(GOLD)
      .seat(0)
      .battlefield(GOLD.name, { commander: true })
      .battlefield(PLATE.name, { attachedTo: GOLD.name })
      .seat(1)
      .hand('Lightning Bolt', 'Unsummon')
      .battlefield('Mountain', 'Island')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test('the equipped commander cannot be targeted by a red spell: red is outside white and blue (CR 702.16b)', () => {
    expect(() =>
      attacked()
        .act(1)
        .cast('Lightning Bolt', { pay: true, targets: [GOLD.name] }),
    ).toThrow();
  });

  test('a blue spell can still target it: blue is in the color identity of the commander', () => {
    expect(() =>
      attacked()
        .act(1)
        .cast('Unsummon', { pay: true, targets: [GOLD.name] }),
    ).not.toThrow();
  });
});
