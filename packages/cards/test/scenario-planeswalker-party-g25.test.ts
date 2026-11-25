// Planeswalker Party deck (issue 132), group 25: Vronos, Masked Inquisitor, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 603.7 and 603.7c (the +1 phases the targets out at the beginning of the next end step, not at once), CR 702.26a (phased out, back at their controller's untap step), CR 115.1 and 601.2c
// (-2: at most one target for each opponent, each returned to its owner's hand), CR 613.1d, 613.1f, 613.4b and 509.1b (-7: a 9/9 Construct artifact creature with vigilance, indestructible
// and unable to be blocked, for the rest of the game). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const VRONOS = real('Vronos, Masked Inquisitor');
const walker = (name: string, type: string) =>
  parsed(name, `Legendary Planeswalker — ${type}`, '+1: You gain 1 life.', {
    manaCost: '{2}',
    loyalty: '4',
  });
const ONE = walker('SYNTHETIC Quiet Walker', 'Nahiri');
const TWO = walker('SYNTHETIC Loud Walker', 'Gideon');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const build = (loyalty = 4) =>
  scenario({ seats: 3 })
    .define(VRONOS)
    .define(ONE)
    .define(TWO)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(VRONOS.name, { counters: { loyalty } })
    .battlefield(ONE.name, { counters: { loyalty: 4 } })
    .battlefield(TWO.name, { counters: { loyalty: 4 } })
    .battlefield('Sol Ring')
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'bear one' })
    .battlefield('Plains')
    .seat(2)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'bear two' })
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('Vronos, Masked Inquisitor', () => {
  test('+1: the two other planeswalkers phase out at the next end step, not before', () => {
    const g = build();
    g.act(0).activate(VRONOS.name, { ability: 0, targets: [ONE.name, TWO.name] });
    g.passAll();
    g.expect.zone(ONE.name, 'battlefield');
    g.expect.zone(TWO.name, 'battlefield');
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(ONE.name, 'phased');
    g.expect.zone(TWO.name, 'phased');
    g.expect.zone(VRONOS.name, 'battlefield');
  });

  test('+1: Vronos itself is not a legal target ("other")', () => {
    const g = build();
    g.act(0).activate(VRONOS.name, { ability: 0 });
    g.expect.pending('targets', 0);
  });

  test('-2: one nonland permanent of each opponent goes to its owner’s hand; a land is not a target', () => {
    const g = build();
    g.act(0).activate(VRONOS.name, { ability: 1, targets: ['bear one', 'bear two'] });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 1 });
    g.expect.zone(BEARS, 'hand', { seat: 2 });
    g.expect.zone('Plains', 'battlefield', { seat: 1 });
  });

  test('-7: a target artifact becomes a 9/9 Construct artifact creature with vigilance and indestructible', () => {
    const g = build(7);
    g.act(0).activate(VRONOS.name, { ability: 2, targets: ['Sol Ring'] });
    g.passAll();
    g.expect.derived('Sol Ring', {
      types: ['artifact', 'creature'],
      subtypes: ['Construct'],
      keywords: ['vigilance', 'indestructible'],
    });
    g.expect.pt('Sol Ring', 9, 9);
  });

  test('-7: the new creature cannot be blocked', () => {
    const g = build(7);
    g.act(0).activate(VRONOS.name, { ability: 2, targets: ['Sol Ring'] });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('Sol Ring', { player: 1 });
    g.passAll();
    // The Bears of seat 1 could block any other attacker: here nobody is asked to block.
    g.expect.combat({ unblocked: ['Sol Ring'] });
  });
});
