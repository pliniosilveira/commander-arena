// The Animated Army deck (issue 110), the animate group: the REAL Oracle text of Bello, Bard of the Brambles, Brightcap Badger // Fungus Frolic and Llanowar Loamspeaker (golden.jsonl) goes
// through the grammar as cards with no override, is defined in an engine scenario and played through applyAction, so the nodes the parser writes are what the engine runs. The helper
// permanents are SYNTHETIC stored cards with plain types and mana costs.
// Pins: CR 613.1d (layer 4 adds types), CR 613.1f (layer 6 gives abilities), CR 613.4b (layer 7b sets base power and toughness), CR 613.6 (the parts of one effect apply to the same
// objects even when the ability is lost), CR 205.1b (in addition to its other types), CR 704.5m and 704.5n (an Aura or Equipment attached to an illegal object), CR 302.6 and 702.10b
// (summoning sickness and haste), CR 605.1a (a granted mana ability), CR 611.2a (until end of turn).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

function plain(
  name: string,
  manaCost: string,
  typeLine: string,
  oracleText = '',
  size: { power: string; toughness: string } | null = null,
): CardDefinition {
  const imported = importCard(
    syntheticCard({ name, manaCost, typeLine, oracleText, ...(size ?? {}) }),
    undefined,
    NO_OVERRIDES,
  );
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const bello = real('Bello, Bard of the Brambles');
const badger = real('Brightcap Badger // Fungus Frolic');
const loamspeaker = real('Llanowar Loamspeaker');

const BIG = plain('SYNTHETIC Big Artifact', '{4}', 'Artifact');
const SMALL = plain('SYNTHETIC Small Artifact', '{3}', 'Artifact');
const SHRINE = plain('SYNTHETIC Big Shrine', '{2}{G}{G}', 'Enchantment — Shrine');
const GEAR = plain('SYNTHETIC Big Gear', '{4}', 'Artifact — Equipment');
const AURA = plain('SYNTHETIC Big Aura', '{3}{G}', 'Enchantment — Aura', 'Enchant creature');
const WIPE = plain(
  'SYNTHETIC Forget It',
  '{U}',
  'Instant',
  'Target creature loses all abilities until end of turn.',
);
const LIB = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

function game(
  active: 0 | 1,
  mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
) {
  const b = mine(
    scenario()
      .define(bello)
      .define(badger)
      .define(loamspeaker)
      .define(BIG)
      .define(SMALL)
      .define(SHRINE)
      .define(GEAR)
      .define(AURA)
      .define(WIPE)
      .seat(0)
      .library(...LIB),
  );
  return b
    .seat(1)
    .library(...LIB)
    .at('precombatMain', { active })
    .build();
}

describe('every real card is valid', () => {
  test.each([bello, badger, loamspeaker])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Bello, Bard of the Brambles (real text)', () => {
  test('during your turn each non-Equipment artifact and non-Aura enchantment of mana value 4 or more is a 4/4 Elemental creature with indestructible and haste', () => {
    const g = game(0, (b) =>
      b
        .battlefield(bello.name)
        .battlefield(BIG.name)
        .battlefield(SHRINE.name)
        .battlefield(SMALL.name)
        .battlefield(GEAR.name),
    );
    for (const name of [BIG.name, SHRINE.name]) {
      g.expect.pt(name, 4, 4);
      g.expect.derived(name, { keywords: ['indestructible', 'haste'] });
    }
    g.expect.derived(BIG.name, { types: ['artifact', 'creature'], subtypes: ['Elemental'] });
    g.expect.derived(SHRINE.name, {
      types: ['enchantment', 'creature'],
      subtypes: ['Shrine', 'Elemental'],
    });
    // Mana value 3, an Equipment: not named.
    g.expect.derived(SMALL.name, { types: ['artifact'] });
    g.expect.derived(GEAR.name, { types: ['artifact'], subtypes: ['Equipment'] });
  });

  test('not during the turn of another player (CR 611.3a: the condition is read all the time)', () => {
    const g = game(1, (b) => b.battlefield(bello.name).battlefield(BIG.name));
    g.expect.derived(BIG.name, { types: ['artifact'] });
  });

  test('a permanent the controller does not control is not named', () => {
    const g = scenario()
      .define(bello)
      .define(BIG)
      .seat(0)
      .library(...LIB)
      .battlefield(bello.name)
      .seat(1)
      .library(...LIB)
      .battlefield(BIG.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived(BIG.name, { types: ['artifact'] });
  });

  test('an animated artifact that came under control this turn has haste and can attack, and draws a card when it deals combat damage to a player', () => {
    const g = scenario()
      .define(bello)
      .define(BIG)
      .seat(0)
      .library(...LIB)
      .battlefield(bello.name)
      .battlefield(BIG.name, { fresh: true })
      .seat(1)
      .library(...LIB)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BIG.name);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 36);
    g.expect.handSize(0, 1);
  });

  test('CR 613.6: when Bello loses all abilities during the turn, the effect still applies to the same permanents', () => {
    const g = game(0, (b) =>
      b.battlefield(bello.name).battlefield(BIG.name).hand(WIPE.name).battlefield('Island'),
    );
    g.expect.pt(BIG.name, 4, 4);
    g.act(0).cast(WIPE.name, { targets: [bello.name], pay: true });
    g.passAll();
    g.expect.derived(bello.name, { keywords: [] });
    g.expect.pt(BIG.name, 4, 4);
    g.expect.derived(BIG.name, {
      types: ['artifact', 'creature'],
      keywords: ['indestructible', 'haste'],
    });
  });

  test('an Equipment attached to a permanent that stops being a creature becomes unattached (CR 704.5n)', () => {
    const g = game(0, (b) =>
      b
        .battlefield(bello.name)
        .battlefield(BIG.name)
        .battlefield(GEAR.name, { attachedTo: BIG.name }),
    );
    g.expect.attached(GEAR.name, BIG.name);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.attached(GEAR.name, null);
    g.expect.zone(GEAR.name, 'battlefield', { seat: 0 });
  });

  test('an Aura that can no longer enchant the permanent goes to the graveyard (CR 704.5m)', () => {
    const g = game(0, (b) =>
      b
        .battlefield(bello.name)
        .battlefield(BIG.name)
        .battlefield(AURA.name, { attachedTo: BIG.name }),
    );
    g.expect.attached(AURA.name, BIG.name);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(AURA.name, 'graveyard', { seat: 0 });
  });

  test('counters stay when the permanent stops being a creature', () => {
    const g = game(0, (b) =>
      b.battlefield(bello.name).battlefield(BIG.name, { counters: { '+1/+1': 2 } }),
    );
    g.expect.pt(BIG.name, 6, 6);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.counters(BIG.name, { '+1/+1': 2 });
    g.expect.derived(BIG.name, { types: ['artifact'] });
  });

  test('the effect begins when Bello enters and ends when it leaves', () => {
    const g = game(0, (b) =>
      b
        .battlefield(BIG.name)
        .hand(bello.name)
        .battlefield('Forest', { count: 2 })
        .battlefield('Mountain'),
    );
    g.expect.derived(BIG.name, { types: ['artifact'] });
    g.act(0).cast(bello.name, { pay: true });
    g.passAll();
    g.expect.derived(BIG.name, { types: ['artifact', 'creature'] });
  });
});

describe('Brightcap Badger (real text)', () => {
  test('each Fungus and Saproling its controller controls has "{T}: Add {G}."', () => {
    const fungus = plain('SYNTHETIC Mushroom', '{1}{G}', 'Creature — Fungus', '', {
      power: '1',
      toughness: '1',
    });
    const saproling = plain('SYNTHETIC Sapling', '{1}{G}', 'Creature — Saproling', '', {
      power: '1',
      toughness: '1',
    });
    const other = plain('SYNTHETIC Wolf', '{1}{G}', 'Creature — Wolf', '', {
      power: '1',
      toughness: '1',
    });
    const g = scenario()
      .define(badger)
      .define(fungus)
      .define(saproling)
      .define(other)
      .seat(0)
      .library(...LIB)
      .battlefield(badger.name)
      .battlefield(fungus.name, { label: 'f' })
      .battlefield(saproling.name, { label: 's' })
      .battlefield(other.name, { label: 'w' })
      .seat(1)
      .library(...LIB)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).tapForMana('f');
    g.act(0).tapForMana('s');
    g.expect.pool(0, 'GG');
    g.expect.tapped('w', false);
  });
});

describe('Llanowar Loamspeaker (real text)', () => {
  test('a target land becomes a 3/3 Elemental creature with haste until end of turn, is still a land, and is not untapped', () => {
    const g = game(0, (b) =>
      b.battlefield(loamspeaker.name).battlefield('Forest', { fresh: true, label: 'land' }),
    );
    g.act(0).activate(loamspeaker.name, { targets: ['land'], pay: true });
    g.passAll();
    g.expect.pt('land', 3, 3);
    g.expect.derived('land', {
      types: ['land', 'creature'],
      subtypes: ['Forest', 'Elemental'],
      keywords: ['haste'],
    });
    g.expect.tapped('land', false);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived('land', { types: ['land'] });
  });

  test('only as a sorcery: not on the turn of another player', () => {
    const g = game(1, (b) => b.battlefield(loamspeaker.name).battlefield('Forest'));
    expect(g.act(0).try.activate(loamspeaker.name, { ability: 1 }).ok).toBe(false);
  });
});
