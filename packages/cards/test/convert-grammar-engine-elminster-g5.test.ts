// The Elminster deck (issue 576), group 5: the front face of Emeria's Call, "Create two 4/4 white Angel Warrior creature tokens with flying. Non-Angel creatures you control gain
// indestructible until your next turn." The text is written in a SYNTHETIC single-faced sorcery (the real card is a modal double-faced card whose back face already parsed)
// and goes through the grammar with no override, then is played through applyAction. Pins: CR 611.2a (the duration the text states), CR 611.2c (the set is fixed as the effect
// resolves), CR 613.1f (layer 6), CR 500.1 (the next turn of its controller), CR 205.3d (a subtype after "non-"). Written for any number of opponents: it names none.
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const NAME = 'SYNTHETIC Skyclave Call';
const TEXT =
  'Create two 4/4 white Angel Warrior creature tokens with flying. Non-Angel creatures you control gain indestructible until your next turn.';

function spell(text: string, name = NAME) {
  return importCard(
    syntheticCard({ name, manaCost: '{4}{W}{W}', typeLine: 'Sorcery', oracleText: text }),
    undefined,
    NO_OVERRIDES,
  );
}

function supported(): CardDefinition {
  const imported = spell(TEXT);
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.status).toBe('supported');
  return imported.definition;
}

describe('"Non-Angel creatures you control gain indestructible until your next turn"', () => {
  const card = supported();
  const start = () =>
    scenario({ seats: 3 })
      .define(card)
      .seat(0)
      .life(20)
      .hand(NAME)
      .battlefield(
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Grizzly Bears',
        'Serra Angel',
      )
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(2)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(card)).toEqual([]);
  });

  test('your non-Angel creatures gain indestructible; an Angel and another player creature do not (CR 205.3d, 611.2c)', () => {
    const g = start();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.derived({ name: 'Grizzly Bears', seat: 0 }, { keywords: ['indestructible'] });
    g.expect.derived('Serra Angel', { keywords: ['flying', 'vigilance'] });
    g.expect.derived({ name: 'Grizzly Bears', seat: 1 }, { keywords: [] });
    g.expect.invariants();
  });

  test('the grant ends when your next turn begins, through the opponents turns (CR 500.1, 611.2a)', () => {
    const g = start();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived({ name: 'Grizzly Bears', seat: 0 }, { keywords: ['indestructible'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived({ name: 'Grizzly Bears', seat: 0 }, { keywords: ['indestructible'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived({ name: 'Grizzly Bears', seat: 0 }, { keywords: [] });
  });

  test('the Angel Warrior tokens are Angels: they have flying only (CR 205.3d)', () => {
    const g = start();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.derived('Angel Warrior[0]', { keywords: ['flying'] });
    g.expect.derived('Angel Warrior[1]', { keywords: ['flying'] });
  });
});

describe('texts that are not read are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    'Non-Angel creatures you control gain indestructible until end of the next turn.',
    'Non-Angel creatures you control gain indestructible',
    'Non-Angel creatures you control gains indestructible until your next turn.',
    'Non-Angel creatures you control gain flash until your next turn.',
    'Non-Angel creatures you control gain protection from red until your next turn.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(spell(text).support.status).toBe('unsupported');
    });
  }
});
