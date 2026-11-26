// Planeswalker Party deck (issue 132), group 11: Deploy the Gatewatch, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 401.2 and 701.20 (look at the top seven cards), CR 110.2a (the planeswalkers enter under the caster's control), CR 306.5b (they enter with their loyalty), CR 401.4 (the rest
// go to the bottom of the library). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const DEPLOY = real('Deploy the Gatewatch');
const NAHIRI = real('Nahiri, the Harbinger');
const NARSET = real('Narset, Parter of Veils');
const GIDEON = real('Gideon Jura');
const BEARS = 'Grizzly Bears';

describe('Deploy the Gatewatch', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(DEPLOY)
      .define(NAHIRI)
      .define(NARSET)
      .define(GIDEON)
      .seat(0)
      .library(
        NAHIRI.name,
        BEARS,
        NARSET.name,
        GIDEON.name,
        'Plains',
        'Plains',
        'Plains',
        'Island',
        'Island',
      )
      .hand(DEPLOY.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .seat(2)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('up to two of the three planeswalkers among the top seven enter; the other cards go to the bottom', () => {
    const g = build();
    g.act(0).cast(DEPLOY.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(NAHIRI.name, NARSET.name);
    g.expect.zone(NAHIRI.name, 'battlefield', { seat: 0 });
    g.expect.zone(NARSET.name, 'battlefield', { seat: 0 });
    g.expect.zone(GIDEON.name, 'library', { seat: 0 });
    g.expect.librarySize(0, 7);
  });

  test('three cannot be chosen: only up to two are accepted', () => {
    const g = build();
    g.act(0).cast(DEPLOY.name, { pay: true });
    g.passAll();
    expect(
      g.act(0).try.action({
        kind: 'chooseCards',
        objects: [g.id(NAHIRI.name), g.id(NARSET.name), g.id(GIDEON.name)],
      }).ok,
    ).toBe(false);
  });
});
