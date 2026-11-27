// The creature group of the Elven Council deck (issue 98), run through the engine as written. The cards are SYNTHETIC variants whose wording is that of the real cards
// (names replaced by ~); every name starts with "SYNTHETIC". The engine's own test cards fill the rest of the table.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const ANGEL = 'Serra Angel'; // 4/4 flying vigilance
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function main(mine: (b: Builder) => Builder) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return a
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain')
    .build();
}

describe('"Enchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities." (CR 613.1d, 613.1f, 613.4b)', () => {
  const lignify = () =>
    parsed(
      'SYNTHETIC Parsed Lignify',
      'Kindred Enchantment — Treefolk Aura',
      'Enchant creature\nEnchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities.',
      { manaCost: '{1}{G}', colors: ['G'] },
    );

  test('the Angel becomes a 0/4 Treefolk with no abilities; its card type stays (layers 4, 6 and 7b)', () => {
    const aura = lignify();
    const g = main((b) =>
      b
        .define(aura)
        .battlefield(ANGEL, { label: 'angel' })
        .battlefield(aura.name, { attachedTo: 'angel' }),
    );
    g.expect.derived('angel', { types: ['creature'], subtypes: ['Treefolk'], keywords: [] });
    g.expect.pt('angel', 0, 4);
    g.expect.invariants();
  });

  test('a +1/+1 counter and a later +2/+2 Aura still apply on top of the base 0/4 (layer 7b, then 7c)', () => {
    const aura = lignify();
    const boost = parsed(
      'SYNTHETIC Parsed Boost Aura',
      'Enchantment — Aura',
      'Enchant creature\nEnchanted creature gets +2/+2.',
      { manaCost: '{1}{G}', colors: ['G'] },
    );
    const g = main((b) =>
      b
        .define(aura)
        .define(boost)
        .battlefield(ANGEL, { label: 'angel', counters: { '+1/+1': 1 } })
        .battlefield(aura.name, { attachedTo: 'angel' })
        .battlefield(boost.name, { attachedTo: 'angel' }),
    );
    g.expect.pt('angel', 3, 7);
  });

  test('an ability another Aura gives after it was attached is kept (layer 6 timestamp order, CR 613.7e)', () => {
    const aura = lignify();
    const fly = parsed(
      'SYNTHETIC Parsed Flying Aura',
      'Enchantment — Aura',
      'Enchant creature\nEnchanted creature has flying.',
      { manaCost: '{1}{G}', colors: ['G'] },
    );
    const g = main((b) =>
      b
        .define(aura)
        .define(fly)
        .battlefield(ANGEL, { label: 'angel' })
        .battlefield(aura.name, { attachedTo: 'angel' })
        .battlefield(fly.name, { attachedTo: 'angel' }),
    );
    g.expect.derived('angel', { subtypes: ['Treefolk'], keywords: ['flying'] });
  });
});

const BEARS = 'Grizzly Bears'; // 2/2
const LANDS = ['Plains', 'Plains', 'Plains', 'Plains', 'Forest', 'Forest'] as const;

describe('"Each other creature you control enters with a number of additional +1/+1 counters on it equal to ~\'s toughness." (CR 614.1c, 614.12, 122.6)', () => {
  const weaver = () =>
    parsed(
      'SYNTHETIC Parsed Weaver',
      'Legendary Creature — Elf Noble',
      "Each other creature you control enters with a number of additional +1/+1 counters on it equal to ~'s toughness.",
      { manaCost: '{1}{G}{G}', power: '2', toughness: '3', colors: ['G'] },
    );

  test('a creature cast with Weaver out enters with 3 counters; Weaver gets none', () => {
    const card = weaver();
    const g = main((b) =>
      b
        .define(card)
        .hand(BEARS)
        .battlefield(card.name)
        .battlefield(...LANDS),
    );
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 3 });
    g.expect.pt(BEARS, 5, 5);
    g.expect.counters(card.name, {});
  });

  test("the amount is Weaver's toughness as the creature enters: a +1/+1 counter on Weaver makes it 4 (layer 7c)", () => {
    const card = weaver();
    const g = main((b) =>
      b
        .define(card)
        .hand(BEARS)
        .battlefield(card.name, { counters: { '+1/+1': 1 } })
        .battlefield(...LANDS),
    );
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 4 });
  });

  test("an opponent's creature enters with none (the permanents are those of the controller of Weaver)", () => {
    const card = weaver();
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .define(card)
      .battlefield(card.name)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .hand(BEARS)
      .battlefield(...LANDS)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
  });
});
