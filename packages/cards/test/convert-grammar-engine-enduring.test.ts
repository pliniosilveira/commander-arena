// Enduring Tenacity (deck support issue 578): "When ~ dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment." (CR 603.4, 603.10a,
// 400.7, 205.1a, 205.3d, 613.1d). The card name is SYNTHETIC; the Oracle text is the real wording of the ability.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const LIBRARY = Array.from({ length: 20 }, () => 'Island');

const enduring = parsed(
  'SYNTHETIC Parsed Enduring',
  'Enchantment Creature — Snake Glimmer',
  "When ~ dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment.",
  { manaCost: '{2}{B}{B}', power: '4', toughness: '3', colors: ['B'] },
);
const kill = parsed('SYNTHETIC Parsed Kill', 'Instant', 'Destroy target creature.', {
  manaCost: '{B}',
  colors: ['B'],
});
const dispel = parsed('SYNTHETIC Parsed Dispel', 'Instant', 'Destroy target enchantment.', {
  manaCost: '{W}',
  colors: ['W'],
});

describe('the lowering', () => {
  test('the "if" reads the card as it last was, and the return makes it only an enchantment for good', () => {
    expect(enduring.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      interveningIf: { kind: 'thisMatches', filter: { types: ['creature'] } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', to: 'battlefield', controller: 'owner' },
          {
            kind: 'setTypes',
            objects: { kind: 'moved' },
            types: ['enchantment'],
            duration: 'permanent',
          },
        ],
      },
    });
  });
});

describe('playing it with 3 seats', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(enduring)
      .define(kill)
      .define(dispel)
      .seat(0)
      .library(...LIBRARY)
      .hand(kill.name, dispel.name)
      .battlefield('Swamp', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(enduring.name)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('it dies as a creature and comes back, under its owner, as an enchantment that is not a creature', () => {
    const g = build();
    g.expect.derived(enduring.name, { types: ['enchantment', 'creature'] });
    g.act(0).cast(kill.name, { targets: [enduring.name], pay: true });
    g.passAll();
    g.expect.zone(enduring.name, 'battlefield', { seat: 1 });
    g.expect.derived(enduring.name, { types: ['enchantment'], subtypes: [] });
  });

  test('it does not come back when it was not a creature as it died', () => {
    const g = build();
    g.act(0).cast(kill.name, { targets: [enduring.name], pay: true });
    g.passAll();
    g.act(0).cast(dispel.name, { targets: [enduring.name], pay: true });
    g.passAll();
    g.expect.zone(enduring.name, 'graveyard', { seat: 1 });
  });
});
