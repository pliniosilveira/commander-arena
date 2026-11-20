// Agatha deck (issue 345), group 15: Redshift, Rocketeer Chief.
// "{T}: Add X mana of any one color, where X is ~'s power. Spend this mana only to activate abilities." (CR 106.1b, 107.3c, 106.6, 605.1a) and "Exhaust — {10}{R}{G}: Put any number
// of permanent cards from your hand onto the battlefield." (CR 702.177a: activated only once; CR 608.2d, 110.2a).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const REDSHIFT = real('Redshift, Rocketeer Chief');
const SAGE = parsed('SYNTHETIC Sage', 'Creature — Human', '{2}: You gain 1 life.', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});

describe('Redshift: the mana', () => {
  const game = () =>
    scenario()
      .define(REDSHIFT)
      .define(SAGE)
      .seat(0)
      .battlefield(REDSHIFT.name)
      .battlefield(SAGE.name)
      .hand('Grizzly Bears')
      .seat(1)
      .library('Forest')
      .build();

  test('adds as much mana of one color as its power, restricted to abilities', () => {
    const g = game();
    g.act(0).tapForMana(REDSHIFT.name, { color: 'G' });
    g.expect.pool(0, { G: 2 });
    g.expect.invariants();
  });

  test('the mana pays for an activated ability but not for a spell', () => {
    const g = game();
    g.act(0).tapForMana(REDSHIFT.name, { color: 'G' });
    expect(g.act(0).try.cast('Grizzly Bears').ok).toBe(false);
    g.act(0).activate(SAGE.name).pay();
    g.passAll();
    g.expect.life(0, 41);
    g.expect.pool(0, {});
  });
});

describe('Redshift: exhaust', () => {
  const game = () =>
    scenario()
      .define(REDSHIFT)
      .seat(0)
      .battlefield(REDSHIFT.name)
      .battlefield('Mountain', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .hand('Grizzly Bears', 'Lightning Bolt', 'Serra Angel')
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Forest', 'Forest', 'Forest')
      .build();

  test('puts the permanent cards the player chooses from the hand onto the battlefield', () => {
    const g = game();
    g.act(0).activate(REDSHIFT.name).pay();
    g.passAll();
    g.act(0).chooseCards('Grizzly Bears', 'Serra Angel');
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('it can be activated only once', () => {
    const g = game();
    g.act(0).activate(REDSHIFT.name).pay();
    g.passAll();
    g.act(0).chooseCards();
    expect(g.act(0).try.activate(REDSHIFT.name).ok).toBe(false);
    // Not even in a later turn.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(
      g.legalActions(0).some((a) => a.kind === 'activate' && a.object === g.id(REDSHIFT.name)),
    ).toBe(false);
  });
});
