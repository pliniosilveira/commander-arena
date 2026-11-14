// Parsed text is only worth something if the engine runs it as written. These tests import
// SYNTHETIC spells through the grammar (never through a fixture), define the resulting
// definitions in an engine scenario and cast them through applyAction.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parseOnly, spellCard } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

function supported(
  name: string,
  text: string,
  manaCost = '{R}',
  type: 'Instant' | 'Sorcery' = 'Instant',
): CardDefinition {
  const imported = parseOnly(spellCard(name, text, { manaCost, type }));
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.reasons).toEqual([]);
  expect(imported.support.status).toBe('supported');
  return imported.definition;
}

describe('the engine runs what the grammar reads', () => {
  test('each opponent takes damage (CR 120.3)', () => {
    const spell = supported('SYNTHETIC Singe', 'SYNTHETIC Singe deals 3 damage to each opponent.');
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Singe')
      .battlefield('Mountain')
      .seat(1)
      .life(20)
      .build();
    g.act(0).cast('SYNTHETIC Singe', { pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.life(0, 40);
  });

  test('damage to target player or creature goes where it was aimed', () => {
    const spell = supported('SYNTHETIC Zap', '~ deals 2 damage to target creature.');
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Zap')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Zap', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('"Destroy all creatures" takes every creature, whoever controls it (CR 701.8)', () => {
    const spell = supported('SYNTHETIC Wipe', 'Destroy all creatures.', '{R}', 'Sorcery');
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Wipe')
      .battlefield('Mountain')
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Wipe', { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('two targets in one text, each destroyed (the Decimate shape)', () => {
    const spell = supported(
      'SYNTHETIC Split',
      'Destroy target creature and target land.',
      '{R}',
      'Sorcery',
    );
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Split')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .battlefield('Forest')
      .build();
    g.act(0).cast('SYNTHETIC Split', {
      targets: [
        { name: 'Grizzly Bears', seat: 1 },
        { name: 'Forest', seat: 1 },
      ],
      pay: true,
    });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('Forest', 'graveyard', { seat: 1 });
  });

  test('"Exile two target creatures" takes a count of two in one slot', () => {
    const spell = supported('SYNTHETIC Twin', 'Exile two target creatures.', '{R}', 'Sorcery');
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Twin')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears', { count: 2 })
      .build();
    g.act(0).cast('SYNTHETIC Twin', {
      targets: [
        { name: 'Grizzly Bears', nth: 0 },
        { name: 'Grizzly Bears', nth: 1 },
      ],
      pay: true,
    });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile', { count: 2 });
  });

  test('a chosen player can draw and lose life in one sentence', () => {
    const spell = supported(
      'SYNTHETIC Bargain',
      'Target player draws two cards and loses 2 life.',
      '{R}',
      'Sorcery',
    );
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Bargain')
      .battlefield('Mountain')
      .library('Forest', 'Forest', 'Forest')
      .build();
    g.act(0).cast('SYNTHETIC Bargain', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.life(0, 38);
  });

  test('sentences run in order: gain life, then draw', () => {
    const spell = supported('SYNTHETIC Tonic', 'You gain 3 life. Draw a card.');
    const g = scenario()
      .define(spell)
      .seat(0)
      .life(10)
      .hand('SYNTHETIC Tonic')
      .battlefield('Mountain')
      .library('Forest')
      .build();
    g.act(0).cast('SYNTHETIC Tonic', { pay: true });
    g.passAll();
    g.expect.life(0, 13);
    g.expect.handSize(0, 1);
  });

  test('"Return all creatures to their owners\' hands" bounces both sides', () => {
    const spell = supported(
      'SYNTHETIC Tide',
      "Return all creatures to their owners' hands.",
      '{R}',
      'Sorcery',
    );
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Tide')
      .battlefield('Mountain')
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Tide', { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'hand', { seat: 1 });
  });

  test('land cards come back from your graveyard tapped (the Splendid Reclamation shape)', () => {
    const spell = supported(
      'SYNTHETIC Revival',
      'Return all land cards from your graveyard to the battlefield tapped.',
      '{R}',
      'Sorcery',
    );
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Revival')
      .battlefield('Mountain')
      .graveyard('Forest', 'Island')
      .seat(1)
      .graveyard('Swamp')
      .build();
    g.act(0).cast('SYNTHETIC Revival', { pay: true });
    g.passAll();
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest', true);
    g.expect.tapped('Island', true);
    g.expect.zone('Swamp', 'graveyard', { seat: 1 });
  });

  test('a creature card returns from your graveyard to your hand', () => {
    const spell = supported(
      'SYNTHETIC Raise Dead',
      'Return target creature card from your graveyard to your hand.',
      '{R}',
      'Sorcery',
    );
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Raise Dead')
      .battlefield('Mountain')
      .graveyard('Grizzly Bears')
      .seat(1)
      .graveyard('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Raise Dead', {
      targets: [{ name: 'Grizzly Bears', zone: 'graveyard', seat: 0 }],
      pay: true,
    });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('"Add {R}{R}" puts that mana in the pool', () => {
    const spell = supported('SYNTHETIC Ritual', 'Add {R}{R}.');
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Ritual')
      .battlefield('Mountain')
      .build();
    g.act(0).cast('SYNTHETIC Ritual', { pay: true });
    g.passAll();
    g.expect.pool(0, 'RR');
  });

  test('"Tap target creature" taps it (CR 701.26)', () => {
    const spell = supported('SYNTHETIC Freeze', 'Tap target creature.');
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Freeze')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Freeze', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.tapped('Grizzly Bears', true);
  });

  test('"Untap all lands you control" untaps only your lands', () => {
    const spell = supported('SYNTHETIC Thaw', 'Untap all lands you control.', '{R}', 'Sorcery');
    const g = scenario()
      .define(spell)
      .seat(0)
      .hand('SYNTHETIC Thaw')
      .battlefield('Mountain')
      .battlefield('Plains', { tapped: true })
      .seat(1)
      .battlefield('Forest', { tapped: true })
      .build();
    g.act(0).cast('SYNTHETIC Thaw', { pay: true });
    g.passAll();
    g.expect.tapped('Mountain', false);
    g.expect.tapped('Plains', false);
    g.expect.tapped('Forest', true);
  });
});

describe('the engine runs the parsed replacements', () => {
  test('"~ enters tapped." makes the land enter tapped (CR 614.12)', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Tapland',
        typeLine: 'Land',
        oracleText: 'SYNTHETIC Tapland enters tapped.\n{T}: Add {G}.',
      }),
    );
    expect(imported.support.status).toBe('supported');
    const g = scenario().define(imported.definition).seat(0).hand('SYNTHETIC Tapland').build();
    g.act(0).playLand('SYNTHETIC Tapland');
    g.expect.zone('SYNTHETIC Tapland', 'battlefield', { seat: 0 });
    g.expect.tapped('SYNTHETIC Tapland', true);
  });

  test('"~ enters with two +1/+1 counters on it." puts the counters on it (CR 122.6)', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Hatchling',
        manaCost: '{1}{G}',
        typeLine: 'Creature — Beast',
        oracleText: 'SYNTHETIC Hatchling enters with two +1/+1 counters on it.',
        power: '0',
        toughness: '0',
        colors: ['G'],
      }),
    );
    expect(imported.support.status).toBe('supported');
    const g = scenario()
      .define(imported.definition)
      .seat(0)
      .hand('SYNTHETIC Hatchling')
      .battlefield('Forest', 'Forest')
      .build();
    g.act(0).cast('SYNTHETIC Hatchling', { pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Hatchling', 'battlefield', { seat: 0 });
    g.expect.counters('SYNTHETIC Hatchling', { '+1/+1': 2 });
  });
});

describe('X in a spell (D-103)', () => {
  test('X in a spell parses and is supported since the engine runs X (D-103)', () => {
    const imported = parseOnly(
      spellCard('SYNTHETIC Blast', '~ deals X damage to any target.', { manaCost: '{X}{R}' }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.support.reasons).toEqual([]);
    expect(imported.definition.faces[0]?.spell?.x).toBe(true);
  });
});
