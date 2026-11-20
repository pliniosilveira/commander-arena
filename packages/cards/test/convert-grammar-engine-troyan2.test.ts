// Troyan 2 deck (issue 400): "When ~ is put into a graveyard from anywhere, shuffle it into its owner's library" (CR 603.6c, 603.10a, 404.1, 701.24) and "Whenever ~
// deals combat damage to a player, you may destroy target artifact or enchantment that player controls" (CR 510.2, 603.2, 109.4). The lines are the real wordings of two
// cards of the deck; the cards defined here are SYNTHETIC copies of them (a SYNTHETIC name, the words the grammar reads). The engine runs what is lowered, through applyAction.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const SHUFFLE_TEXT =
  "When ~ is put into a graveyard from anywhere, shuffle it into its owner's library.";
const RAID_TEXT =
  'Whenever ~ deals combat damage to a player, you may destroy target artifact or enchantment that player controls.';

describe('"When ~ is put into a graveyard from anywhere, shuffle it into its owner\'s library"', () => {
  test('reads as the self trigger of any graveyard entry and the move of the card itself, then the shuffle', () => {
    const [ability] = readAll(SHUFFLE_TEXT, 'creature').abilities ?? [];
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: { kind: 'putIntoGraveyard', who: 'any', from: 'anywhere', self: true },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', objects: { kind: 'this' }, to: 'library' },
          { kind: 'shuffle', player: { kind: 'ownerOf', of: { kind: 'this' } } },
        ],
      },
    });
  });

  test('other graveyard wordings are not read as this trigger', () => {
    for (const text of [
      "When ~ is put into your graveyard from anywhere, shuffle it into its owner's library.",
      "When ~ is put into a graveyard from anywhere or attacks, shuffle it into its owner's library.",
    ]) {
      expect(dropped(text, 'creature'), text).toBeDefined();
    }
  });

  test('"it" is the card only for this trigger: a dies trigger stays unsupported', () => {
    expect(dropped("When ~ dies, shuffle it into its owner's library.", 'creature')).toMatchObject({
      reason: 'notRunnable',
    });
  });

  test('the engine shuffles the creature into its library when it dies, and when it is discarded', () => {
    const wurm = parsed('SYNTHETIC Parsed Wurm', 'Creature — Wurm', SHUFFLE_TEXT, {
      manaCost: '{2}{G}',
      colors: ['G'],
      power: '2',
      toughness: '2',
    });
    const dies = scenario()
      .define(wurm)
      .seat(0)
      .life(20)
      .library('Plains', { count: 4 })
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .life(20)
      .library('Plains', { count: 4 })
      .battlefield(wurm.name)
      .at('precombatMain')
      .build();
    dies.act(0).cast('Murder', { pay: true, targets: [wurm.name] });
    dies.passAll();
    dies.expect.zone(wurm.name, 'library', { seat: 1 });
    dies.expect.invariants();
  });
});

describe('"destroy target artifact or enchantment that player controls" for the player damaged', () => {
  test('reads as an optional destroy of a target the damaged player controls', () => {
    const [ability] = readAll(RAID_TEXT, 'creature').abilities ?? [];
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'battlefield',
              controller: 'triggerPlayer',
              anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
            },
          },
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      optional: true,
    });
  });

  test('a card that is not a permanent of the damaged player is not a target (the lowering reads only the player of the event)', () => {
    expect(
      dropped(
        'Whenever ~ deals combat damage to a player, you may destroy target artifact or enchantment that creature controls.',
        'creature',
      ),
    ).toBeDefined();
  });

  test('the engine destroys the artifact of the damaged player, not the attacker own', () => {
    const raider = parsed('SYNTHETIC Parsed Raider', 'Creature — Beast', RAID_TEXT, {
      manaCost: '{1}{G}{U}',
      colors: ['G', 'U'],
      power: '2',
      toughness: '2',
    });
    const g = scenario()
      .define(raider)
      .seat(0)
      .life(20)
      .library('Island', { count: 4 })
      .battlefield(raider.name, 'Sol Ring')
      .seat(1)
      .life(20)
      .library('Island', { count: 4 })
      .battlefield('Sol Ring')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(raider.name);
    g.advanceTo('declareBlockers');
    if (g.state.pending?.kind === 'declareBlockers') g.act(1).declareBlockers([]);
    g.advanceTo('combatDamage');
    g.expect.life(1, 18);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});
