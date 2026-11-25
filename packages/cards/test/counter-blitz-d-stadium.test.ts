// Counter Blitz deck, group D: the "Go for the Goal!" ability of Blitzball Stadium, read from the real Oracle text (a SYNTHETIC card carries only that line; the real card's support trigger is another
// group's) and run by the engine. "{3}, {T}: Until end of turn, target creature gains "Whenever this creature deals combat damage to a player, draw a card for each kind of counter on it"
// and it can't be blocked this turn." CR 122.1 (kinds of counters), CR 603.2 (the granted trigger), CR 509.1b (can't be blocked), CR 611.2a.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const STADIUM = parsed(
  'SYNTHETIC Parsed Stadium',
  'Artifact',
  'Go for the Goal! — {3}, {T}: Until end of turn, target creature gains "Whenever ~ deals combat damage to a player, draw a card for each kind of counter on it" and it can\'t be blocked this turn.',
  { manaCost: '{X}{U}', colors: ['U'] },
);

const play = (counters: Readonly<Record<string, number>>) => {
  const g = scenario()
    .define(STADIUM)
    .seat(0)
    .library('Island', { count: 6 })
    .battlefield(STADIUM.name, 'Island', 'Island', 'Island')
    .battlefield('Grizzly Bears', { counters, label: 'mine' })
    .seat(1)
    .library('Island', { count: 6 })
    .battlefield('Grizzly Bears', { label: 'theirs' })
    .at('precombatMain', { active: 0 })
    .build();
  return g;
};

describe('Blitzball Stadium: Go for the Goal!', () => {
  test('parses: a granted trigger that draws for each kind of counter, and the creature cannot be blocked', () => {
    expect(STADIUM.faces[0]?.abilities[0]).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'grantAbility',
            abilities: [
              {
                kind: 'triggered',
                trigger: { kind: 'dealsCombatDamage', to: 'player' },
                effect: {
                  kind: 'draw',
                  count: { kind: 'countersOn', of: { kind: 'this' }, kinds: true },
                },
              },
            ],
            duration: 'untilEndOfTurn',
          },
          { kind: 'restrict', restriction: 'cantBeBlocked', duration: 'untilEndOfTurn' },
        ],
      },
    });
  });

  test('a creature with two kinds of counters draws two cards on combat damage, whatever the number of counters', () => {
    const g = play({ '+1/+1': 3, stun: 0, shield: 1 });
    g.act(0).activate(STADIUM.name, { targets: ['mine'], pay: true });
    g.passAll();
    g.playCombat({ attack: ['mine'], until: 'combatDamage' });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.life(1, 40 - 5);
    g.expect.invariants();
  });

  test('it cannot be blocked this turn', () => {
    const g = play({ '+1/+1': 1 });
    g.act(0).activate(STADIUM.name, { targets: ['mine'], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['mine']);
    g.advanceTo('declareBlockers');
    // The only creature of the defending player cannot block it, so no block is even offered.
    g.expect.combat({ unblocked: ['mine'] });
  });

  test('a creature with no counters draws nothing', () => {
    const g = play({});
    g.act(0).activate(STADIUM.name, { targets: ['mine'], pay: true });
    g.passAll();
    g.playCombat({ attack: ['mine'], until: 'combatDamage' });
    g.passAll();
    g.expect.handSize(0, 0);
    expect(g.find({ name: 'Island', zone: 'hand', seat: 0 }).length).toBe(0);
  });
});
