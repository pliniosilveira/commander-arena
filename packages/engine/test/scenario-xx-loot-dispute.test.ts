// "Whenever you attack the player who has the initiative, create a Treasure token." and "Whenever you complete a dungeon, create a 5/5 red Dragon creature token with flying."
// (Loot Dispute; CR 726.1, 508.1b, 603.2c, 309.7, 701.49c).
// Pins: the attack trigger is once for the declaration (not for each creature) and only when the player who has the initiative was attacked as a player; attacking another player
// or attacking while nobody has the initiative does not trigger it; the dungeon trigger is the controller's own completion only.
// The card is the SYNTHETIC "Dispute Probe", written to the AST the parser lowers; the creatures are real fixtures.
import { describe, expect, test } from 'vitest';
import type { TokenDefinition } from '../src/index';
import { validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { settle } from './dungeon-helpers';

const PROBE = 'SYNTHETIC Dispute Probe';
const DELVE = 'SYNTHETIC Delve Into Undercity'; // {1}{B} sorcery: you venture into Undercity
const MASS = 'SYNTHETIC Mass Venture'; // {2}{B} sorcery: each player ventures into Undercity
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const DRAGON: TokenDefinition = {
  name: 'Dragon',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Dragon'],
  colors: ['R'],
  power: 5,
  toughness: 5,
  loyalty: null,
  defense: null,
  oracleText: 'Flying',
  abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
};

const treasure = { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 };

const probe = singleFaceCard({
  name: PROBE,
  manaCost: ['3', 'R'],
  types: ['enchantment'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText:
    'When this enchantment enters, you take the initiative and create a Treasure token.\nWhenever you attack the player who has the initiative, create a Treasure token.\nWhenever you complete a dungeon, create a 5/5 red Dragon creature token with flying.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'takeInitiative', player: { kind: 'you' } }, treasure],
      },
    },
    {
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'you', atLeast: 1, attackedInitiativeHolder: true },
      effect: treasure,
    },
    {
      kind: 'triggered',
      trigger: { kind: 'dungeonCompleted' },
      effect: {
        kind: 'createToken',
        token: { kind: 'custom', definition: DRAGON },
        count: 1,
      },
    },
  ],
} as unknown as Parameters<typeof singleFaceCard>[0]);

type Builder = ReturnType<typeof scenario>;

function table(seats: 2 | 3 | 4, build: (b: Builder) => Builder = (b) => b): Builder {
  let b = scenario({ seats })
    .define(probe)
    .seat(0)
    .life(20)
    .library(...FILLER);
  for (let seat = 1; seat < seats; seat += 1)
    b = b
      .seat(seat)
      .life(20)
      .library(...FILLER);
  return build(b);
}

const resolveAll = (g: ScenarioGame): void => void settle(g);

describe('the card is valid', () => {
  test('validateCard', () => {
    expect(validateCard(probe)).toEqual([]);
  });

  test('attackedInitiativeHolder does not go with attackedYou', () => {
    const issues = validateCard({
      ...probe,
      faces: [
        {
          ...probe.faces[0],
          abilities: [
            {
              kind: 'triggered',
              trigger: {
                kind: 'attackBatch',
                who: 'any',
                atLeast: 1,
                attackedYou: true,
                attackedInitiativeHolder: true,
              },
              effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
            },
          ],
        },
      ],
    } as unknown as typeof probe);
    expect(issues.map((i) => i.message).join('\n')).toMatch(/attackedInitiativeHolder does not go/);
  });
});

describe('Whenever you attack the player who has the initiative (CR 726.1, 508.1b, 603.2c)', () => {
  test('entering: the controller takes the initiative and creates a Treasure token', () => {
    const g = table(2, (b) => b.seat(0).hand(PROBE).battlefield('Mountain', { count: 4 }))
      .at('precombatMain')
      .build();
    g.act(0).cast(PROBE, { pay: true });
    g.pass();
    resolveAll(g);
    g.expect.initiative(0);
    g.expect.zone('Treasure', 'battlefield', { count: 1, seat: 0 });
  });

  test('attacking the holder with two creatures: one Treasure, once for the declaration', () => {
    const g = table(2, (b) => b.seat(0).battlefield(PROBE, BEARS, ELVES))
      .at('precombatMain', { initiative: 1 })
      .build();
    g.playCombat({
      attack: [
        { attacker: BEARS, target: { player: 1 } },
        { attacker: ELVES, target: { player: 1 } },
      ],
      until: 'declareBlockers',
    });
    resolveAll(g);
    g.expect.zone('Treasure', 'battlefield', { count: 1, seat: 0 });
  });

  test('three seats: attacking another player while seat 2 has the initiative does not trigger it', () => {
    const g = table(3, (b) => b.seat(0).battlefield(PROBE, BEARS))
      .at('precombatMain', { initiative: 2 })
      .build();
    g.playCombat({
      attack: [{ attacker: BEARS, target: { player: 1 } }],
      until: 'declareBlockers',
    });
    resolveAll(g);
    g.expect.noObject('Treasure');
  });

  test('three seats: attacking the holder (seat 2) triggers it, even with another creature on seat 1', () => {
    const g = table(3, (b) => b.seat(0).battlefield(PROBE, BEARS, ELVES))
      .at('precombatMain', { initiative: 2 })
      .build();
    g.playCombat({
      attack: [
        { attacker: BEARS, target: { player: 1 } },
        { attacker: ELVES, target: { player: 2 } },
      ],
      until: 'declareBlockers',
    });
    resolveAll(g);
    g.expect.zone('Treasure', 'battlefield', { count: 1, seat: 0 });
  });

  test('nobody has the initiative: no Treasure', () => {
    const g = table(2, (b) => b.seat(0).battlefield(PROBE, BEARS))
      .at('precombatMain')
      .build();
    g.playCombat({ attack: [BEARS], until: 'declareBlockers' });
    resolveAll(g);
    g.expect.noObject('Treasure');
  });

  test('the controller holds the initiative and attacks another player: no Treasure', () => {
    const g = table(2, (b) => b.seat(0).battlefield(PROBE, BEARS))
      .at('precombatMain', { initiative: 0 })
      .build();
    g.playCombat({ attack: [BEARS], until: 'declareBlockers' });
    resolveAll(g);
    g.expect.noObject('Treasure');
  });
});

describe('Whenever you complete a dungeon (CR 309.7, 701.49c)', () => {
  test('completing Undercity creates a 5/5 red Dragon with flying', () => {
    const g = table(2, (b) =>
      b
        .seat(0)
        .battlefield(PROBE)
        .hand(DELVE)
        .battlefield('Swamp', { count: 2 })
        .dungeon('archives'),
    )
      .at('precombatMain')
      .build();
    g.act(0).cast(DELVE, { pay: true });
    g.pass();
    g.pass();
    resolveAll(g);
    g.expect.zone('Dragon', 'battlefield', { count: 1, seat: 0 });
    g.expect.pt('Dragon', 5, 5);
  });

  test('a venture that does not complete the dungeon creates nothing', () => {
    const g = table(2, (b) =>
      b.seat(0).battlefield(PROBE).hand(DELVE).battlefield('Swamp', { count: 2 }),
    )
      .at('precombatMain')
      .build();
    g.act(0).cast(DELVE, { pay: true });
    g.pass();
    g.pass();
    resolveAll(g);
    g.expect.noObject('Dragon');
  });

  test('an opponent completing their dungeon does not trigger it', () => {
    const g = table(2, (b) =>
      b
        .seat(0)
        .battlefield(PROBE)
        .hand(MASS)
        .battlefield('Swamp', { count: 3 })
        .seat(1)
        .dungeon('archives'),
    )
      .at('precombatMain')
      .build();
    g.act(0).cast(MASS, { pay: true });
    g.pass();
    g.pass();
    resolveAll(g);
    g.expect.eventLog([{ kind: 'dungeonCompleted', seat: 1, dungeon: 'undercity' }]);
    g.expect.noObject('Dragon');
  });
});
