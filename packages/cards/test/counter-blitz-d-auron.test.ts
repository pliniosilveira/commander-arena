// Counter Blitz deck, group D: Auron, Venerated Guardian, read from its real Oracle text and run by the engine.
// "Whenever Auron attacks, put a +1/+1 counter on it. When you do, exile target creature defending player controls with power less than Auron's power until Auron leaves the battlefield."
// CR 603.12 (reflexive trigger), CR 208.1 (power: the counter is already on it), CR 610.3 (exile until it leaves), CR 506.2 (defending player, three seats).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const AURON = real('Auron, Venerated Guardian');
const OX = parsed('SYNTHETIC Parsed Ox', 'Creature — Ox', 'Vigilance', {
  manaCost: '{2}{G}',
  colors: ['G'],
  power: '3',
  toughness: '3',
});

describe('Auron, Venerated Guardian', () => {
  test('parses: a counter, then a reflexive exile of a creature with less power until Auron leaves', () => {
    const trigger = AURON.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'addCounters', counter: '+1/+1', count: 1 },
          {
            kind: 'reflexive',
            targets: [
              {
                what: {
                  kind: 'object',
                  filter: { controller: 'defendingPlayer', powerLessThanSource: true },
                },
              },
            ],
            effect: { kind: 'exile', until: 'sourceLeaves' },
          },
        ],
      },
    });
  });

  const attack = (theirs: readonly string[]) => {
    const g = scenario({ seats: 3 })
      .define(AURON)
      .define(OX)
      .seat(0)
      .battlefield(AURON.name)
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(...theirs)
      .seat(2)
      .library('Island', { count: 4 })
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(AURON.name, { player: 1 });
    return g;
  };

  test('the counter makes it 3/6, so a 2-power creature of the defending player is exiled; a 3-power one is not a target', () => {
    const g = attack(['Grizzly Bears', OX.name]);
    g.passAll();
    g.expect.counters(AURON.name, { '+1/+1': 1 });
    g.expect.pt(AURON.name, 3, 6);
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 1 });
    g.expect.zone(OX.name, 'battlefield');
    // The creature of the player who is not the defending player is untouched.
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 2 });
    g.expect.invariants();
  });

  test('with no creature of less power the reflexive ability has no target and does nothing', () => {
    const g = attack([OX.name]);
    g.passAll();
    g.passAll();
    g.expect.zone(OX.name, 'battlefield');
    g.expect.counters(AURON.name, { '+1/+1': 1 });
  });
});
