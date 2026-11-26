// Counter Blitz deck, group D: the first ability of Yuna, Grand Summoner, read from the real Oracle text (a SYNTHETIC card carries only that line; the real card's second ability is another group's)
// and run by the engine. "{T}: Add one mana of any color. When you next cast a creature spell this turn, that creature enters with two additional +1/+1 counters on it."
// CR 605.1a (a mana ability with an extra effect), CR 603.7 (the delayed trigger), CR 614.1c and 122.6 (enters with counters).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const YUNA = parsed(
  'SYNTHETIC Parsed Summoner',
  'Legendary Creature — Human Cleric',
  'Grand Summon — {T}: Add one mana of any color. When you next cast a creature spell this turn, that creature enters with two additional +1/+1 counters on it.',
  { manaCost: '{1}{G}{W}{U}', colors: ['G', 'W', 'U'], power: '1', toughness: '5' },
);

const board = () =>
  scenario()
    .define(YUNA)
    .seat(0)
    .battlefield(YUNA.name, 'Forest')
    .hand('Grizzly Bears', 'Giant Spider')
    .seat(1)
    .at('precombatMain', { active: 0 })
    .build();

describe('Yuna, Grand Summoner: the mana ability and the next creature spell', () => {
  test('parses: a mana ability with a delayed cast trigger as its extra effect', () => {
    expect(YUNA.faces[0]?.abilities[0]).toMatchObject({
      kind: 'mana',
      also: [
        {
          kind: 'delayedCast',
          filter: { types: ['creature'] },
          effect: { kind: 'spellEntersWithCounters', counter: '+1/+1', count: 2 },
        },
      ],
    });
  });

  test('the next creature spell cast this turn enters with two additional +1/+1 counters', () => {
    const g = board();
    g.act(0).tapForMana(YUNA.name, { color: 'G' });
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield');
    g.expect.counters('Grizzly Bears', { '+1/+1': 2 });
    g.expect.pt('Grizzly Bears', 4, 4);
    g.expect.invariants();
  });

  test('only the next creature spell: a second one this turn gets nothing', () => {
    const g = scenario()
      .define(YUNA)
      .seat(0)
      .battlefield(YUNA.name, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .hand('Grizzly Bears', 'Giant Spider')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).tapForMana(YUNA.name, { color: 'G' });
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.act(0).cast('Giant Spider', { pay: true });
    g.passAll();
    g.expect.zone('Giant Spider', 'battlefield');
    g.expect.counters('Giant Spider', {});
    expect(g.find({ name: 'Grizzly Bears', zone: 'battlefield' }).length).toBe(1);
  });

  test('a noncreature spell does not use it up', () => {
    const g = scenario()
      .define(YUNA)
      .seat(0)
      .battlefield(YUNA.name, 'Forest', 'Forest', 'Forest')
      .hand('Lightning Bolt', 'Grizzly Bears')
      .battlefield('Mountain')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).tapForMana(YUNA.name, { color: 'G' });
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.passAll();
    g.expect.counters('Grizzly Bears', { '+1/+1': 2 });
  });
});
