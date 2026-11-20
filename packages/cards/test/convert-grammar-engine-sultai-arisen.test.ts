// The Sultai Arisen precon (issue 102), read by the grammar and run by the engine. Every card here is SYNTHETIC: its only text is a real line of the deck
// (the name replaced by ~), run through `applyAction` with the scenario DSL. Every synthetic name starts with "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const LIB = Array.from({ length: 12 }, () => 'Plains');
const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

const creature = (name: string, color: 'B' | 'G') =>
  parsed(name, 'Creature — Zombie', '', {
    manaCost: `{1}{${color}}`,
    power: '1',
    toughness: '1',
    colors: [color],
  });

describe('"Add {B} for each black creature card in your graveyard." (CR 106.1, 608.2c, 105.2)', () => {
  const crypt = parsed(
    'SYNTHETIC Parsed Crypt',
    'Land',
    '{T}: Add {B} for each black creature card in your graveyard.',
  );
  test('counts the black creature cards of its controller, not green ones or the opponent’s', () => {
    const b1 = creature('SYNTHETIC Black One', 'B');
    const b2 = creature('SYNTHETIC Black Two', 'B');
    const g1 = creature('SYNTHETIC Green One', 'G');
    const theirs = creature('SYNTHETIC Black Theirs', 'B');
    const g = base()
      .define(crypt)
      .define(b1)
      .define(b2)
      .define(g1)
      .define(theirs)
      .battlefield(crypt.name)
      .graveyard(b1.name, b2.name, g1.name)
      .seat(1)
      .graveyard(theirs.name)
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(crypt.name);
    g.expect.pool(0, 'BB');
  });
});

describe('"Pay 1 life: Add {C}. Spend this mana only to cast a spell from your graveyard." (CR 106.6, 601.2a, 119.4)', () => {
  const lord = parsed(
    'SYNTHETIC Parsed Forsaken',
    'Creature — Demon',
    'Pay 1 life: Add {C}. Spend this mana only to cast a spell from your graveyard.',
    { manaCost: '{B}', power: '1', toughness: '1', colors: ['B'] },
  );
  const spell = parsed(
    'SYNTHETIC Parsed Grave Spell',
    'Sorcery',
    'You gain 3 life.\nFlashback {1}',
    { manaCost: '{1}', colors: [] },
  );
  test('lowers to a fromGraveyard restriction', () => {
    expect(lord.faces[0]?.abilities[0]).toMatchObject({
      kind: 'mana',
      spendOnly: { fromGraveyard: true },
    });
  });
  test('the mana pays for a spell cast from the graveyard, not one cast from the hand', () => {
    const hand = base()
      .define(lord)
      .define(spell)
      .battlefield(lord.name)
      .hand(spell.name)
      .at('precombatMain')
      .build();
    hand.act(0).tapForMana(lord.name);
    hand.expect.pool(0, 'C');
    hand.expect.life(0, 39);
    hand.expect.illegal(0, { cast: spell.name });

    const grave = base()
      .define(lord)
      .define(spell)
      .battlefield(lord.name)
      .graveyard(spell.name)
      .at('precombatMain')
      .build();
    grave.act(0).tapForMana(lord.name);
    grave.act(0).cast(spell.name, { alternative: 'flashback', pay: true });
    grave.passAll();
    grave.expect.life(0, 42);
    grave.expect.zone(spell.name, 'exile');
    grave.expect.pool(0, '');
  });
});

describe('"{T}, Sacrifice ~: Put your commander into your hand from the command zone." (CR 903.3, 400.3)', () => {
  test('the commander leaves the command zone for its owner’s hand', () => {
    const beacon = parsed(
      'SYNTHETIC Parsed Beacon',
      'Land',
      '{T}, Sacrifice ~: Put your commander into your hand from the command zone.',
    );
    const g = base()
      .define(beacon)
      .battlefield(beacon.name)
      .commander('Grizzly Bears')
      .at('precombatMain')
      .build();
    g.expect.zone('Grizzly Bears', 'command');
    g.act(0).activate(beacon.name);
    g.passAll();
    // CR 903.9b: a commander that would be put into its owner's hand may go to the command zone instead; the owner declines.
    g.expect.pending('commanderZone', 0);
    g.act(0).declineCommandZone();
    g.expect.zone('Grizzly Bears', 'hand');
    g.expect.zone(beacon.name, 'graveyard');
  });
});
