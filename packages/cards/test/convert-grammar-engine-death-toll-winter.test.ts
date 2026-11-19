// Death Toll deck: the delirium ability of Winter, Cynical Opportunist, read from its real Oracle text and played through `applyAction`: "At the beginning of your end step, you may exile
// any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield with a finality counter on it."
// (CR 205.2a card types, 608.2c "if you do" and "among them", 608.2d the choice, 122.6 a permanent entering with a counter, 603.2 the trigger). The card is named SYNTHETIC: the text is
// the real one, the creature is not the real card (the golden corpus holds that).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const WINTER_TEXT =
  'Deathtouch\nWhenever ~ attacks, mill three cards.\nDelirium — At the beginning of your end step, you may exile any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield with a finality counter on it.';

const winter = parsed(
  'SYNTHETIC Parsed Winter',
  'Legendary Creature — Human Warlock',
  WINTER_TEXT,
  {
    manaCost: '{2}{B}{G}',
    power: '2',
    toughness: '5',
    colors: ['B', 'G'],
  },
);

const relic = parsed('SYNTHETIC Parsed Relic', 'Artifact', 'Flash', { manaCost: '{2}' });
const bear = parsed('SYNTHETIC Parsed Cub', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const idol = parsed('SYNTHETIC Parsed Idol', 'Enchantment', 'Flash', {
  manaCost: '{2}{W}',
  colors: ['W'],
});
const zap = parsed('SYNTHETIC Parsed Zap', 'Instant', 'Draw a card.', {
  manaCost: '{U}',
  colors: ['U'],
});

function game(yard: readonly string[]) {
  let b = scenario()
    .define(winter)
    .define(relic)
    .define(bear)
    .define(idol)
    .define(zap)
    .seat(0)
    .battlefield(winter.name)
    .library('Swamp', 'Swamp', 'Swamp');
  for (const name of yard) b = b.graveyard(name);
  const g = b.seat(1).library('Swamp').at('precombatMain', { active: 0, turn: 1 }).build();
  g.advanceTo('end');
  g.passAll();
  return g;
}

const exiledNames = (g: ReturnType<typeof game>): string[] =>
  Object.values(g.state.objects)
    .filter((o) => o.zone === 'exile' && o.owner === 0)
    .map((o) => {
      const card = o.card === null ? undefined : g.state.cards[o.card];
      return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
    })
    .sort();

describe('the delirium ability of Winter, from the real text (CR 205.2a, 608.2c)', () => {
  test('the ability is read: the whole text is supported', () => {
    const triggered = winter.faces[0]?.abilities.filter((a) => a.kind === 'triggered') ?? [];
    expect(triggered).toHaveLength(2);
  });

  test('four card types among the cards chosen: they are exiled, one permanent card among them returns with a finality counter', () => {
    const g = game([relic.name, bear.name, idol.name, zap.name, 'Island']);
    g.act(0).chooseCards(relic.name, bear.name, idol.name, 'Island');
    g.act(0).chooseCards(idol.name);
    g.expect.zone(idol.name, 'battlefield', { seat: 0 });
    g.expect.counters(idol.name, { finality: 1 });
    expect(exiledNames(g)).toEqual([relic.name, bear.name, 'Island'].sort());
    g.expect.zone(zap.name, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('fewer than four card types are refused by the engine', () => {
    const g = game([relic.name, bear.name, idol.name, zap.name]);
    const before = g.hash();
    expect(() => g.act(0).chooseCards(relic.name, bear.name, zap.name)).toThrow();
    expect(g.hash()).toBe(before);
  });

  test('declining exiles nothing', () => {
    const g = game([relic.name, bear.name, idol.name, zap.name]);
    g.act(0).chooseCards();
    expect(exiledNames(g)).toEqual([]);
    g.expect.pending('priority', 0);
  });

  test('three card types in the whole graveyard: nothing is asked', () => {
    const g = game([relic.name, bear.name, idol.name]);
    g.expect.pending('priority', 0);
    expect(exiledNames(g)).toEqual([]);
  });

  test('a dying permanent that entered with the finality counter is exiled instead (CR 122.1h)', () => {
    const g = game([relic.name, bear.name, idol.name, zap.name]);
    g.act(0).chooseCards(relic.name, bear.name, idol.name, zap.name);
    g.act(0).chooseCards(bear.name);
    g.expect.zone(bear.name, 'battlefield', { seat: 0 });
    g.expect.counters(bear.name, { finality: 1 });
  });
});
