// Counter Blitz deck, group D: Summoner's Sending, read from its real Oracle text and run by the engine.
// "At the beginning of your end step, you may exile target creature card from a graveyard. If you do, create a 1/1 white Spirit creature token with flying.
// Put a +1/+1 counter on it if the exiled card's mana value is 4 or greater." (CR 202.3, 608.2c, 608.2h, 603.5, 111.2)
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const SENDING = real("Summoner's Sending");

const endStep = (graveyard: readonly string[], seat = 0) => {
  const b = scenario().define(SENDING).seat(0).battlefield(SENDING.name);
  const g = (seat === 0 ? b.graveyard(...graveyard).seat(1) : b.seat(1).graveyard(...graveyard))
    .at('postcombatMain', { active: 0 })
    .build();
  g.advanceTo('end');
  return g;
};

describe("Summoner's Sending", () => {
  test('parses: a conditional counter on the token after the exile, read from the exiled card', () => {
    expect(SENDING.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'may', effect: { kind: 'exile' } },
          { kind: 'conditional', condition: { kind: 'didPrevious' } },
          {
            kind: 'conditional',
            condition: { kind: 'manaValueAtLeastAmount', amount: 4 },
            effect: { kind: 'addCounters', counter: '+1/+1', count: 1 },
          },
        ],
      },
    });
  });

  const resolve = (g: ReturnType<typeof endStep>, accept: boolean) => {
    g.passAll();
    if (accept) g.act(0).accept();
    else g.act(0).decline();
  };

  test('a card with mana value 4 from a graveyard: exiled, and the Spirit gets a +1/+1 counter', () => {
    const g = endStep(['Giant Spider']);
    resolve(g, true);
    g.expect.zone('Giant Spider', 'exile');
    g.expect.pt('Spirit', 2, 2);
    g.expect.counters('Spirit', { '+1/+1': 1 });
    g.expect.derived('Spirit', { colors: ['W'], keywords: ['flying'] });
    g.expect.invariants();
  });

  test('a card with mana value 2: the Spirit stays 1/1', () => {
    const g = endStep(['Grizzly Bears']);
    resolve(g, true);
    g.expect.zone('Grizzly Bears', 'exile');
    g.expect.pt('Spirit', 1, 1);
  });

  test("a card of an opponent's graveyard is a legal target (any graveyard)", () => {
    const g = endStep(['Giant Spider'], 1);
    resolve(g, true);
    g.expect.zone('Giant Spider', 'exile');
    g.expect.pt('Spirit', 2, 2);
  });

  test('declining exiles nothing and makes no Spirit', () => {
    const g = endStep(['Giant Spider']);
    resolve(g, false);
    g.expect.zone('Giant Spider', 'graveyard');
    expect(g.find({ name: 'Spirit', zone: 'battlefield' }).length).toBe(0);
  });
});
