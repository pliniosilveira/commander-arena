// Parsed text is only worth something if the engine runs it as written (stage P7b). These tests
// import SYNTHETIC multi-face cards through the grammar (never through a fixture), define them in
// an engine scenario and play them through applyAction: both halves of a split card (CR 709.3), an
// Adventure and then the creature from exile (CR 715.3d), a modal double-faced card played as its
// back-face land and as its front-face creature (CR 712.12, 305.2), and a creature that transforms
// at the beginning of its controller's upkeep or for mana (CR 701.27, 712.18). Every card name
// starts with "SYNTHETIC"; the cards are the shapes of the engine's own synthetic layouts, with
// names that differ so the parsed definition is the one played.
import { type CardDefinition, checkInvariants } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticFace } from './convert-helpers';
import { creature, instant, multi } from './convert-layout-helpers';

/** Imports a stored card through the grammar only and requires that it is fully supported. */
function parsed(card: ReturnType<typeof multi>): CardDefinition {
  const imported = importCard(
    { ...card, name: `SYNTHETIC Parsed ${card.name}` },
    undefined,
    NO_OVERRIDES,
  );
  expect(imported.support.unparsed, card.name).toEqual([]);
  expect(imported.support.reasons, card.name).toEqual([]);
  expect(imported.support.status, card.name).toBe('supported');
  return imported.definition;
}

const land = (name: string, oracleText: string) =>
  syntheticFace({ name, manaCost: '', typeLine: 'Land', oracleText });

const EMBER = parsed(
  multi(
    'split',
    [
      instant('Ember', 'Ember deals 2 damage to target creature.'),
      instant('Salve', 'You gain 4 life.', { manaCost: '{1}{W}', colors: ['W'] }),
    ],
    ['W', 'R'],
  ),
);

const HEWER = parsed(
  multi(
    'adventure',
    [
      creature('Hewer Bear'),
      instant('Hew', 'Hew deals 2 damage to target creature. (Then exile this card.)', {
        typeLine: 'Instant — Adventure',
      }),
    ],
    ['R', 'G'],
  ),
);

const DRAKE = parsed(
  multi(
    'modal_dfc',
    [
      creature('Cinder Drake', {
        manaCost: '{2}{R}',
        typeLine: 'Creature — Dragon',
        power: '3',
        toughness: '2',
        colors: ['R'],
      }),
      land('Cinder Pass', '{T}: Add {R}.'),
    ],
    ['R'],
  ),
);

const CUB = parsed(
  multi(
    'transform',
    [
      creature('Dusk Cub', {
        typeLine: 'Creature — Wolf',
        oracleText: 'At the beginning of your upkeep, transform Dusk Cub.',
      }),
      creature('Dusk Beast', {
        manaCost: '',
        typeLine: 'Creature — Wolf Werewolf',
        power: '4',
        toughness: '4',
        oracleText: 'Trample\nAt the beginning of your upkeep, transform Dusk Beast.',
      }),
    ],
    ['G'],
  ),
);

const SQUIRE = parsed(
  multi(
    'transform',
    [
      creature('Page', {
        manaCost: '{W}',
        typeLine: 'Creature — Human',
        power: '1',
        toughness: '1',
        colors: ['W'],
        oracleText: '{1}{W}: Transform Page. Activate only as a sorcery.',
      }),
      creature('Champion', {
        manaCost: '',
        typeLine: 'Creature — Human Knight',
        power: '3',
        toughness: '3',
        colors: ['W'],
        oracleText: 'First strike\n{1}{W}: Transform Champion. Activate only as a sorcery.',
      }),
    ],
    ['W'],
  ),
);

type G = ReturnType<ReturnType<typeof scenario>['build']>;
const nameOf = (g: G, card: string): string | undefined =>
  g.view(0).battlefield.find((o) => o.id === g.id(card))?.name;

describe('a split card read from text: each half is cast alone (CR 709.3)', () => {
  const build = () =>
    scenario()
      .define(EMBER)
      .seat(0)
      .life(10)
      .hand(EMBER.name)
      .battlefield('Mountain', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();

  test('the parsed card is the one name Scryfall writes and two halves', () => {
    expect(EMBER.name).toBe('SYNTHETIC Parsed Ember // Salve');
    expect(EMBER.layout).toBe('split');
    expect(EMBER.faces.map((f) => f.name)).toEqual(['Ember', 'Salve']);
  });

  test('the first half deals 2 damage to its target and the card goes to the graveyard', () => {
    const g = build();
    g.act(0).cast(EMBER.name, { face: 0, targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone(EMBER.name, 'graveyard', { seat: 0 });
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('the second half gains 4 life, and needs no target', () => {
    const g = build();
    g.act(0).cast(EMBER.name, { face: 1, pay: true });
    g.passAll();
    g.expect.life(0, 14);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.zone(EMBER.name, 'graveyard', { seat: 0 });
  });
});

describe('an Adventure read from text, then the creature from exile (CR 715.3d)', () => {
  test('the Adventure resolves to exile and the creature is then cast from there', () => {
    const g = scenario()
      .define(HEWER)
      .seat(0)
      .hand(HEWER.name)
      .battlefield('Mountain', 'Forest', 'Forest', 'Mountain')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();
    g.act(0).cast(HEWER.name, { face: 1, targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone(HEWER.name, 'exile');
    expect(g.object(HEWER.name).onAdventure).toBe(true);
    g.act(0).cast(HEWER.name, { face: 0, pay: true });
    g.passAll();
    g.expect.zone(HEWER.name, 'battlefield', { seat: 0 });
    g.expect.derived(HEWER.name, { types: ['creature'], subtypes: ['Bear'], colors: ['G'] });
    g.expect.pt(HEWER.name, 2, 2);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('cast from the hand as the creature, it is never exiled', () => {
    const g = scenario()
      .define(HEWER)
      .seat(0)
      .hand(HEWER.name)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(HEWER.name, { face: 0, pay: true });
    g.passAll();
    g.expect.zone(HEWER.name, 'battlefield', { seat: 0 });
  });
});

describe('a modal double-faced card read from text (CR 712.12)', () => {
  test('the back-face land is played as the land, counts as the land drop and taps for its mana', () => {
    const g = scenario()
      .define(DRAKE)
      .seat(0)
      .hand(DRAKE.name, 'Forest')
      .battlefield('Mountain')
      .seat(1)
      .build();
    g.act(0).playLand(DRAKE.name, { face: 1 });
    g.expect.zone(DRAKE.name, 'battlefield', { seat: 0 });
    expect(g.object(DRAKE.name).face).toBe(1);
    expect(nameOf(g, DRAKE.name)).toBe('Cinder Pass');
    g.expect.illegal(0, { playLand: 'Forest' });
    g.act(0).tapForMana(DRAKE.name);
    g.expect.pool(0, 'R');
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('the front-face creature is cast with the front-face cost', () => {
    const g = scenario()
      .define(DRAKE)
      .seat(0)
      .hand(DRAKE.name)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .build();
    g.act(0).cast(DRAKE.name, { face: 0, pay: true });
    g.passAll();
    g.expect.zone(DRAKE.name, 'battlefield', { seat: 0 });
    expect(nameOf(g, DRAKE.name)).toBe('Cinder Drake');
    g.expect.pt(DRAKE.name, 3, 2);
  });
});

describe('a transforming creature read from text (CR 701.27)', () => {
  test('"At the beginning of your upkeep, transform ~." turns it over at each of your upkeeps', () => {
    const g = scenario()
      .define(CUB)
      .seat(0)
      .battlefield(CUB.name, { label: 'cub' })
      .library('Plains', { count: 6 })
      .seat(1)
      .library('Plains', { count: 6 })
      .at('end', { active: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    g.passAll();
    expect(nameOf(g, 'cub')).toBe('Dusk Beast');
    g.expect.pt('cub', 4, 4);
    g.expect.derived('cub', { keywords: ['trample'], subtypes: ['Wolf', 'Werewolf'] });
    // The back face has the same sentence, read from its own text: the next upkeep turns it back.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(nameOf(g, 'cub')).toBe('Dusk Cub');
    g.expect.pt('cub', 2, 2);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('"{M}: Transform ~. Activate only as a sorcery." pays, transforms and is a sorcery-speed ability', () => {
    const g = scenario()
      .define(SQUIRE)
      .seat(0)
      .battlefield(SQUIRE.name, { label: 'page' })
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).activate('page', { pay: true });
    g.passAll();
    expect(nameOf(g, 'page')).toBe('Champion');
    g.expect.pt('page', 3, 3);
    g.expect.derived('page', { keywords: ['firstStrike'] });
    g.act(0).activate('page', { pay: true });
    g.passAll();
    expect(nameOf(g, 'page')).toBe('Page');
    g.expect.pt('page', 1, 1);

    const theirs = scenario()
      .define(SQUIRE)
      .seat(0)
      .battlefield(SQUIRE.name, 'Plains', 'Plains')
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    theirs.expect.illegal(0, { activate: SQUIRE.name });
  });
});
