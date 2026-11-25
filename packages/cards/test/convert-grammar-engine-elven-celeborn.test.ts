// Celeborn the Wise (Elven Council deck, issue 98), run through the engine as written: a SYNTHETIC card with the wording of the real one (name replaced by ~).
// "Whenever you attack with one or more Elves, scry 1. / Whenever you scry, ~ gets +1/+1 until end of turn for each card looked at while scrying this way."
// Pins: CR 701.22 (scry: the cards looked at), CR 603.2 (the trigger of the scry event), CR 611.2a and 613.4c (the pump is a layer 7c effect until end of turn).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const ELVES = 'Llanowar Elves'; // 1/1 Elf Druid
const BEARS = 'Grizzly Bears'; // 2/2
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

const celeborn = parsed(
  'SYNTHETIC Parsed Wise',
  'Legendary Creature — Elf Noble',
  'Whenever you attack with one or more Elves, scry 1.\nWhenever you scry, ~ gets +1/+1 until end of turn for each card looked at while scrying this way.',
  { manaCost: '{3}{G}', power: '2', toughness: '4', colors: ['G'] },
);
const sight = parsed('SYNTHETIC Parsed Clear Sight', 'Sorcery', 'Scry 2.', {
  manaCost: '{U}',
  colors: ['U'],
});

describe('the lowering', () => {
  test('the pump counts the cards of the scry that caused the trigger', () => {
    expect(celeborn.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'scries' },
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'this' },
        power: { kind: 'triggerDamage' },
        toughness: { kind: 'triggerDamage' },
        duration: 'untilEndOfTurn',
      },
    });
  });
});

describe('playing it', () => {
  test('attacking with an Elf scries 1: Celeborn gets +1/+1 for the one card looked at', () => {
    const g = scenario()
      .define(celeborn)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(celeborn.name)
      .battlefield(ELVES)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([ELVES]);
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]'] });
    g.passAll();
    g.expect.pt(celeborn.name, 3, 5);
    g.expect.invariants();
  });

  test('attacking with creatures that are not Elves does not scry', () => {
    const g = scenario()
      .define(celeborn)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(celeborn.name)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.passAll();
    g.expect.pt(celeborn.name, 2, 4);
  });

  test('any scry counts: scry 2 gives +2/+2', () => {
    const g = scenario()
      .define(celeborn)
      .define(sight)
      .seat(0)
      .library(...LIBRARY)
      .hand(sight.name)
      .battlefield('Island')
      .battlefield(celeborn.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(sight.name, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.passAll();
    g.expect.pt(celeborn.name, 4, 6);
  });
});
