// Sigil of Sleep (deck support issue 578): "Whenever enchanted creature deals damage to a player, return target creature that player controls to its owner's hand." (CR 603.2, 115.1,
// 109.4, 400.3, 102.1). The card name is SYNTHETIC; the Oracle text is the real wording of the ability.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const LIBRARY = Array.from({ length: 20 }, () => 'Island');

const sigil = parsed(
  'SYNTHETIC Parsed Sigil',
  'Enchantment — Aura',
  "Enchant creature\nWhenever enchanted creature deals damage to a player, return target creature that player controls to its owner's hand.",
  { manaCost: '{U}', colors: ['U'] },
);
const raider = parsed('SYNTHETIC Parsed Raider', 'Creature — Rogue', 'Vigilance', {
  manaCost: '{1}{B}',
  power: '2',
  toughness: '2',
  colors: ['B'],
});
const guard = parsed('SYNTHETIC Parsed Guard', 'Creature — Soldier', 'Vigilance', {
  manaCost: '{1}{W}',
  power: '1',
  toughness: '4',
  colors: ['W'],
});
const sentry = parsed('SYNTHETIC Parsed Sentry', 'Creature — Soldier', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '1',
  toughness: '4',
  colors: ['G'],
});

describe('the lowering', () => {
  test('the target is a creature of the player the damage was dealt to', () => {
    expect(sigil.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dealsDamage', what: { kind: 'attached' }, to: 'player' },
      targets: [{ what: { kind: 'object', filter: { controller: 'triggerPlayer' } } }],
      effect: { kind: 'moveToZone', to: 'hand' },
    });
  });
});

describe('playing it with 3 seats', () => {
  test('only a creature of the player who was dealt damage returns to its owner’s hand', () => {
    const g = scenario({ seats: 3 })
      .define(sigil)
      .define(raider)
      .define(guard)
      .define(sentry)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(raider.name, { label: 'raider' })
      .battlefield(sigil.name, { attachedTo: 'raider' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(guard.name)
      .seat(2)
      .library(...LIBRARY)
      .battlefield(sentry.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: raider.name, target: { player: 1 } }]);
    g.advanceTo('end');
    g.expect.life(1, 38);
    g.expect.zone(guard.name, 'hand', { seat: 1 });
    g.expect.zone(sentry.name, 'battlefield', { seat: 2 });
  });
});
