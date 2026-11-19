// Fertile Ground (the top-5 card ranking): the REAL card of the golden corpus, read through the grammar only and played through applyAction. "Whenever enchanted land is tapped
// for mana, its controller adds an additional one mana of any color." is the engine's triggered mana ability `tappedForMana` of the land the Aura is attached to, for whoever
// taps it (CR 106.12, 605.1b, 303.4), adding one mana of a color named as the land is tapped (CR 106.1b, 605.3b). Stand-ins are the engine's real fixtures.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const GROUND = real('Fertile Ground');
const WILD = real('Wild Growth');
const BOLT = 'Lightning Bolt'; // {R}
const BEARS = 'Grizzly Bears';

describe('Fertile Ground', () => {
  test('reads as Enchant land and a triggered mana ability of the land it enchants', () => {
    const abilities = GROUND.faces[0]?.abilities ?? [];
    expect(abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered']);
    const ast = JSON.stringify(abilities[1]);
    expect(ast).toContain('"by":"tapper"');
    expect(ast).toContain('hostOfSource');
    expect(ast).toContain('"anyColor"');
  });

  test('tapping the enchanted land by hand: the color of the additional mana is asked, then both are added', () => {
    const g = scenario()
      .define(GROUND)
      .seat(0)
      .battlefield('Forest')
      .battlefield(GROUND.name, { attachedTo: 'Forest' })
      .build();
    const refused = g.act(0).try.tapForMana('Forest');
    expect(refused.ok).toBe(false);
    g.expect.pool(0, '');
    g.act(0).tapForMana('Forest', { extraColors: ['U'] });
    g.expect.pool(0, 'GU');
  });

  test('paying a spell: one enchanted Forest pays {R} for Lightning Bolt and {1}{G} for Grizzly Bears', () => {
    const bolt = scenario()
      .define(GROUND)
      .seat(0)
      .hand(BOLT)
      .battlefield('Forest')
      .battlefield(GROUND.name, { attachedTo: 'Forest' })
      .seat(1)
      .battlefield(BEARS)
      .build();
    bolt.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    bolt.expect.stack([BOLT]);
    const bears = scenario()
      .define(GROUND)
      .seat(0)
      .hand(BEARS)
      .battlefield('Forest')
      .battlefield(GROUND.name, { attachedTo: 'Forest' })
      .build();
    bears.act(0).cast(BEARS, { pay: true });
    bears.expect.stack([BEARS]);
  });

  test('on an opponent’s land: its controller taps it and gets the mana, not the Aura’s controller', () => {
    const g = scenario()
      .define(GROUND)
      .seat(0)
      .battlefield(GROUND.name, { attachedTo: 'Forest' })
      .seat(1)
      .battlefield('Forest')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).tapForMana('Forest', { extraColors: ['W'] });
    g.expect.pool(1, 'GW');
    g.expect.pool(0, '');
  });

  test('a land it does not enchant makes its own mana only', () => {
    const g = scenario()
      .define(GROUND)
      .seat(0)
      .battlefield('Forest', 'Mountain')
      .battlefield(GROUND.name, { attachedTo: 'Forest' })
      .build();
    g.act(0).tapForMana('Mountain');
    g.expect.pool(0, 'R');
  });
});

describe('Wild Growth (the same trigger with mana of a fixed type)', () => {
  test('reads as a triggered mana ability that adds {G}, with nothing to choose', () => {
    const ast = JSON.stringify(WILD.faces[0]?.abilities?.[1]);
    expect(ast).toContain('"by":"tapper"');
    expect(ast).toContain('"fixed"');
  });

  test('tapping the enchanted land adds {G} on top of what it makes, with no color to name', () => {
    const g = scenario()
      .define(WILD)
      .seat(0)
      .battlefield('Mountain')
      .battlefield(WILD.name, { attachedTo: 'Mountain' })
      .build();
    g.act(0).tapForMana('Mountain');
    g.expect.pool(0, 'RG');
  });
});
