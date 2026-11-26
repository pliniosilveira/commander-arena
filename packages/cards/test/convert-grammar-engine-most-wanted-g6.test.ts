// Most Wanted deck, group 6 (granted keywords): We Ride at Dawn, "Legendary creature spells you cast have convoke.", and Graywater's Fixer, "Each outlaw creature card in your graveyard
// has encore {X}, where X is its mana value." (golden.jsonl, real Oracle text, issue 120), read by the grammar with no override and run by the engine. Pins (looked up with `pnpm rule`):
// CR 702.51a (Convoke), CR 702.141a (Encore), CR 700.12 (outlaw), CR 202.3 (mana value), CR 613.1f, CR 604.2, CR 604.3.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const DAWN = real('We Ride at Dawn');
const FIXER = real("Graywater's Fixer");
const LEGEND = parsed('SYNTHETIC Legend Two Drop', 'Legendary Creature — Human', '', {
  manaCost: '{1}{W}',
  power: '2',
  toughness: '2',
  colors: ['W'],
});
const PLAIN = parsed('SYNTHETIC Plain Two Drop', 'Creature — Human', '', {
  manaCost: '{1}{W}',
  power: '2',
  toughness: '2',
  colors: ['W'],
});
const BOLTISH = parsed('SYNTHETIC Legend Relic', 'Legendary Artifact', '', { manaCost: '{1}{R}' });
const ROGUE = parsed('SYNTHETIC Dock Rogue', 'Creature — Human Rogue', '', {
  manaCost: '{2}{B}',
  power: '2',
  toughness: '2',
  colors: ['B'],
});
const BEAR = parsed('SYNTHETIC Dock Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});

describe('We Ride at Dawn: legendary creature spells you cast have convoke (CR 702.51a)', () => {
  test('is valid and the line is a grant of convoke to legendary creature spells', () => {
    expect(validateCard(DAWN)).toEqual([]);
    expect(
      readAll('Legendary creature spells you cast have convoke.', 'enchantment').abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordToSpells',
          what: { types: ['creature'], supertypes: ['legendary'], controller: 'you' },
          keyword: { kind: 'convoke' },
        },
      },
    ]);
  });

  test('near misses stay unread', () => {
    for (const text of [
      'Historic spells you cast have convoke.',
      'Nonlegendary creature spells you cast have convoke.',
      'Legendary creature spells have convoke.',
    ]) {
      expect(dropped(text, 'enchantment').text, text).toBe(text);
    }
  });

  const build = () =>
    scenario()
      .define(DAWN)
      .define(LEGEND)
      .define(PLAIN)
      .define(BOLTISH)
      .seat(0)
      .hand(LEGEND.name, PLAIN.name, BOLTISH.name)
      .battlefield(DAWN.name)
      .battlefield(PLAIN.name, { count: 2 })
      .seat(1)
      .build();

  test('a legendary creature spell can be paid by tapping creatures, with no mana', () => {
    const g = build();
    g.act(0).cast(LEGEND.name);
    expect(g.state.pending?.kind).toBe('choosePayOptions');
  });

  test('a nonlegendary creature spell and a legendary noncreature spell have no convoke', () => {
    const g = build();
    expect(g.act(0).try.cast(PLAIN.name).ok).toBe(false);
    expect(g.act(0).try.cast(BOLTISH.name).ok).toBe(false);
  });

  test('a legendary creature spell an opponent casts has no convoke', () => {
    const g = scenario()
      .define(DAWN)
      .define(LEGEND)
      .define(PLAIN)
      .seat(0)
      .battlefield(DAWN.name)
      .seat(1)
      .hand(LEGEND.name)
      .battlefield(PLAIN.name, { count: 2 })
      .at('precombatMain', { active: 1 })
      .build();
    expect(g.act(1).try.cast(LEGEND.name).ok).toBe(false);
  });
});

/** Whether seat 0 has a legal action that activates an ability of the card in its graveyard. */
const activatable = (g: ScenarioGame, name: string): boolean => {
  const id = g.id({ name, zone: 'graveyard', seat: 0 });
  return getLegalActions(g.state, 0).some((a) => a.kind === 'activate' && a.object === id);
};

describe("Graywater's Fixer: outlaw creature cards in your graveyard have encore {X} (CR 702.141a, 700.12)", () => {
  test('is valid and the line is a grant of encore to the outlaw creature cards', () => {
    expect(validateCard(FIXER)).toEqual([]);
    expect(
      readAll(
        'Each outlaw creature card in your graveyard has encore {X}, where X is its mana value.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantEncoreToGraveyardCards',
          what: { types: ['creature'], outlaw: true },
        },
      },
    ]);
  });

  test('near misses stay unread', () => {
    for (const text of [
      'Each non-outlaw creature card in your graveyard has encore {X}, where X is its mana value.',
      'Each outlaw card in your graveyard has encore {X}, where X is its mana value.',
      'Each outlaw creature card in your graveyard has encore {X}.',
    ]) {
      expect(dropped(text, 'creature').text, text).toBe(text);
    }
  });

  const build = (mana: number) =>
    scenario()
      .define(FIXER)
      .define(ROGUE)
      .define(BEAR)
      .seat(0)
      .battlefield(FIXER.name)
      .battlefield('Forest', { count: mana })
      .graveyard(ROGUE.name, BEAR.name)
      .seat(1)
      .build();

  test('an outlaw creature card is activated for its mana value and makes a token copy', () => {
    const g = build(3);
    expect(activatable(g, ROGUE.name)).toBe(true);
    g.act(0).activate(ROGUE.name, { pay: true });
    g.passAll();
    expect(
      g.find({ name: ROGUE.name, zone: 'battlefield', seat: 0 }).filter((o) => o.token !== null),
    ).toHaveLength(1);
    expect(g.find({ name: ROGUE.name, zone: 'graveyard', seat: 0 })).toHaveLength(0);
  });

  test('the cost is its mana value: two lands are not enough for a three-drop', () => {
    const g = build(2);
    expect(g.act(0).try.activate(ROGUE.name).ok).toBe(false);
  });

  test('a creature card that is no outlaw has no encore', () => {
    const g = build(5);
    expect(activatable(g, BEAR.name)).toBe(false);
  });

  test('the card of an opponent has no encore, and with Graywater gone neither has the rogue', () => {
    const g = scenario()
      .define(FIXER)
      .define(ROGUE)
      .seat(0)
      .battlefield('Forest', { count: 5 })
      .graveyard(ROGUE.name)
      .seat(1)
      .battlefield(FIXER.name)
      .build();
    expect(activatable(g, ROGUE.name)).toBe(false);
  });
});
