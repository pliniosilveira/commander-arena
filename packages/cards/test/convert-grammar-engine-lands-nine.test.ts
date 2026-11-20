// Nine requested lands of the "deck support" issues, run as written. Each group imports a SYNTHETIC card through the grammar, defines it in an engine scenario and plays it through
// applyAction. The wording of each text is that of the real card, taken from the card data the deck support workflow fetched from Scryfall for the issue.
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const GOLDEN: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));

const real = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
};

// ---- Raging Ravine: "{2}{R}{G}: Until end of turn, this land becomes a 3/3 red and green Elemental creature with \"Whenever this creature attacks, put a +1/+1 counter on it.\" It's still
// a land." (CR 205.1b, 611.2a, 613.1d, 613.1f, 613.4b, 603.1).

const RAVINE = parsed(
  'SYNTHETIC Parsed Ravine',
  'Land',
  'This land enters tapped.\n{T}: Add {R} or {G}.\n{2}{R}{G}: Until end of turn, this land becomes a 3/3 red and green Elemental creature with "Whenever this creature attacks, put a +1/+1 counter on it." It\'s still a land.',
);

describe('Raging Ravine: a land that becomes a 3/3 Elemental and grows when it attacks', () => {
  const start = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(RAVINE)
      .battlefield(RAVINE.name, { tapped: false })
      .battlefield('Mountain', 'Forest', 'Mountain', 'Forest')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it becomes a 3/3 red and green Elemental creature and is still a land', () => {
    const g = start();
    g.act(0).activate(RAVINE.name, { pay: true });
    g.passAll();
    g.expect.derived(RAVINE.name, {
      types: ['land', 'creature'],
      subtypes: ['Elemental'],
      colors: ['R', 'G'],
    });
    g.expect.pt(RAVINE.name, 3, 3);
    g.expect.invariants();
  });

  test('attacking puts a +1/+1 counter on it (CR 603.1)', () => {
    const g = start();
    g.act(0).activate(RAVINE.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack([RAVINE.name]);
    g.passAll();
    expect(g.state.objects[g.id(RAVINE.name)]?.counters['+1/+1']).toBe(1);
    g.expect.pt(RAVINE.name, 4, 4);
  });
});

// ---- Shrine of the Forsaken Gods: "{T}: Add {C}{C}. Spend this mana only to cast colorless spells. Activate only if you control seven or more lands." (CR 106.6, 105.2c, 605.1a, 602.5).

const SHRINE = parsed(
  'SYNTHETIC Parsed Shrine',
  'Land',
  '{T}: Add {C}.\n{T}: Add {C}{C}. Spend this mana only to cast colorless spells. Activate only if you control seven or more lands.',
);
const ARTIFACT = parsed('SYNTHETIC Parsed Colorless Rock', 'Artifact', '', { manaCost: '{2}' });
const GREEN = parsed('SYNTHETIC Parsed Green Bear', 'Creature — Bear', '', {
  manaCost: '{2}',
  colors: ['G'],
  power: '2',
  toughness: '2',
});

test('the real Shrine of the Forsaken Gods is supported and lowers to a restricted, conditional mana ability', () => {
  const imported = real('Shrine of the Forsaken Gods');
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.status).toBe('supported');
  expect(imported.definition.faces[0]?.abilities[1]).toMatchObject({
    kind: 'mana',
    production: { kind: 'fixed', mana: ['C', 'C'] },
    spendOnly: { qualities: [{ kind: 'colorless' }] },
    activateOnlyIf: { kind: 'controlsAtLeast' },
  });
});

describe('Shrine of the Forsaken Gods: two colorless mana for colorless spells, with seven lands', () => {
  const start = (lands: number) =>
    scenario()
      .seat(0)
      .life(20)
      .define(SHRINE)
      .define(ARTIFACT)
      .define(GREEN)
      .hand(ARTIFACT.name, GREEN.name)
      .battlefield(SHRINE.name, { tapped: false })
      .battlefield(...Array.from({ length: lands - 1 }, () => 'Plains'))
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('with seven lands its mana pays for a colorless spell', () => {
    const g = start(7);
    g.act(0).cast(ARTIFACT.name, { pay: true });
    g.passAll();
    g.expect.zone(ARTIFACT.name, 'battlefield', { seat: 0 });
  });

  test('with six lands the second ability cannot be activated (the first one still adds one)', () => {
    const g = start(6);
    g.act(0).tapForMana(SHRINE.name);
    g.expect.pool(0, 'C');
  });
});

// ---- Command Beacon: "{T}, Sacrifice this land: Put your commander into your hand from the command zone." (CR 903.3, 408.3, 608.2d, 701.21).

const BEACON = parsed(
  'SYNTHETIC Parsed Beacon',
  'Land',
  '{T}: Add {C}.\n{T}, Sacrifice this land: Put your commander into your hand from the command zone.',
);
const CAPTAIN = parsed('SYNTHETIC Parsed Captain', 'Legendary Creature — Human', '', {
  manaCost: '{2}',
  power: '2',
  toughness: '2',
});

test('the real Command Beacon is supported', () => {
  const imported = real('Command Beacon');
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.status).toBe('supported');
});

describe('Command Beacon: sacrifice it to put your commander from the command zone into your hand', () => {
  test('the commander goes to the hand and the land is sacrificed', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(BEACON)
      .define(CAPTAIN)
      .commander(CAPTAIN.name)
      .battlefield(BEACON.name, { tapped: false })
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(BEACON.name, { pay: true });
    g.passAll();
    // CR 903.9b (Commander): a commander that would be put into its owner's hand from anywhere may go to the command zone instead, so the owner is asked; declining puts it into the hand.
    expect(g.state.pending?.kind).toBe('commanderZone');
    g.act(0).declineCommandZone();
    g.passAll();
    g.expect.zone(CAPTAIN.name, 'hand', { seat: 0 });
    g.expect.zone(BEACON.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('with no commander in the command zone nothing is put into the hand', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(BEACON)
      .define(CAPTAIN)
      .battlefield(CAPTAIN.name)
      .battlefield(BEACON.name, { tapped: false })
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(BEACON.name, { pay: true });
    g.passAll();
    g.expect.zone(BEACON.name, 'graveyard', { seat: 0 });
    g.expect.zone(CAPTAIN.name, 'battlefield', { seat: 0 });
  });
});
