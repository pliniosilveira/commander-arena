// Lord of the Nazgûl: protection from the Ring-bearer designation and the Wraith threshold.
import { describe, expect, test } from 'vitest';
import { FIXTURE_CARDS, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const LORD = 'Lord of the Nazgûl';
const SPELL = 'Divination';

function game(spells: number) {
  let b = scenario()
    .seat(0)
    .handSizeMax(50)
    .battlefield(LORD, { counters: { '+1/+1': 1 } })
    .battlefield('Grizzly Bears');
  for (let i = 0; i < spells; i++) {
    b = b.hand(SPELL).pool('U').pool('U').pool('U').pool('U');
  }
  b = b.library(...Array.from({ length: 100 }, () => 'Island'));
  b = b.seat(1).library(...Array.from({ length: 100 }, () => 'Island'));
  return b.at('precombatMain').build();
}

function castDivinations(g: ReturnType<typeof game>, count: number) {
  for (let i = 0; i < count; i++) {
    g.act(0).cast({ name: SPELL, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll();
  }
}

describe('Lord of the Nazgûl', () => {
  test('the real-card fixture validates', () => {
    const fixture = FIXTURE_CARDS[LORD];
    if (fixture === undefined) throw new Error(`${LORD} fixture is missing`);
    expect(validateCard(fixture)).toEqual([]);
  });

  test('casting an instant or sorcery makes a 3/3 Wraith with menace and grants protection', () => {
    const g = game(1);
    castDivinations(g, 1);
    g.expect.pt({ name: 'Wraith', seat: 0, nth: 0 }, 3, 3);
    g.expect.derived('Wraith', { subtypes: ['Wraith'], keywords: ['menace', 'protection'] });
  });

  test('a Wraith with protection from Ring-bearers cannot be blocked by one', () => {
    const g = scenario()
      .seat(0)
      .ring(1)
      .battlefield(LORD, { ringBearer: true })
      .seat(1)
      .ring(1)
      .battlefield('Serra Angel', { ringBearer: true })
      .at('precombatMain', { active: 0 })
      .build();

    expect(() =>
      g.playCombat({
        attack: [LORD],
        block: [{ blocker: 'Serra Angel', attacker: LORD }],
        until: 'declareBlockers',
      }),
    ).toThrow();
  });

  test('the eighth cast reaches nine Wraiths including Lord and sets their base power and toughness', () => {
    const g = game(9);
    castDivinations(g, 7);
    g.expect.pt(LORD, 5, 4);
    g.expect.pt({ name: 'Wraith', seat: 0, nth: 0 }, 3, 3);

    castDivinations(g, 1);
    g.expect.pt(LORD, 10, 10);
    g.expect.pt({ name: 'Wraith', seat: 0, nth: 0 }, 9, 9);
    g.expect.pt('Grizzly Bears', 2, 2);

    castDivinations(g, 1);
    g.expect.pt(LORD, 10, 10);
    g.expect.pt({ name: 'Wraith', seat: 0, nth: 0 }, 9, 9);

    g.advanceTo('end');
    g.passAll();
    g.expect.step('upkeep', { turn: 4, active: 1 });
    g.expect.pt(LORD, 5, 4);
    g.expect.pt({ name: 'Wraith', seat: 0, nth: 0 }, 3, 3);
  });
});
