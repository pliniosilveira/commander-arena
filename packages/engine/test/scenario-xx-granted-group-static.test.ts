// An Equipment that gives the equipped creature a static ability that gives "+N/+N" and a keyword to a group: Dancer's Chakrams, "Equipped creature gets +2/+2, has lifelink and
// \"Other commanders you control get +2/+2 and have lifelink,\"". The cards here are SYNTHETIC (defined in this file); the real card goes through the parser in
// packages/cards/test/convert-grammar-engine-final-fantasy-b.test.ts.
// Pins: CR 604.1 and 613.1f (a static ability the creature was given is its own, read after layer 6), CR 613.7a (it has the timestamp of the creature), CR 613.8 (nothing the group is
// named by depends on the layers that follow), CR 903.3 (a commander is a card its owner designated; "you" is the controller of the creature that has the ability, so only its
// controller's commanders), CR 613.4c (counted additions of layer 7c commute), CR 613.1f ("loses all abilities" takes the given ability and so what it gave).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Ability, CardDefinition, ObjectFilter } from '../src/index';
import { validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const ATTACHED = { kind: 'attached' } as const;
const COMMANDER: ObjectFilter = { commander: true, controller: 'you' };
const given = (inner: Ability): Ability => ({
  kind: 'static',
  static: { kind: 'grantAbility', subject: ATTACHED, ability: inner as never },
});
const others = (effect: 'pt' | 'lifelink'): Ability => ({
  kind: 'static',
  static:
    effect === 'pt'
      ? {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: COMMANDER, other: true },
          power: 2,
          toughness: 2,
        }
      : {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: COMMANDER, other: true },
          keyword: { kind: 'lifelink' },
        },
});

const SASH = 'SYNTHETIC Chakram Sash';
const sash: CardDefinition = singleFace({
  name: SASH,
  manaCost: ['3', 'W'],
  types: ['artifact'],
  subtypes: ['Equipment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    'Equipped creature gets +2/+2, has lifelink and "Other commanders you control get +2/+2 and have lifelink,"',
  abilities: [
    { kind: 'static', static: { kind: 'modifyPt', subject: ATTACHED, power: 2, toughness: 2 } },
    {
      kind: 'static',
      static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'lifelink' } },
    },
    given(others('pt')),
    given(others('lifelink')),
    { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['3'] }] } },
  ],
});

const DULL = 'SYNTHETIC Dulling Aura';
const dull: CardDefinition = singleFace({
  name: DULL,
  manaCost: ['1', 'U'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Enchant creature. Enchanted creature loses all abilities.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    { kind: 'static', static: { kind: 'loseAllAbilities', subject: ATTACHED } },
  ],
});

const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance
const OGRE = 'Isamaru, Hound of Konda'; // 2/2
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

const stats = (g: ReturnType<ReturnType<typeof board>['build']>, label: string) => {
  const d = derive(g.state, g.object(label));
  return {
    pt: `${d.power}/${d.toughness}`,
    lifelink: d.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'lifelink'),
  };
};

/** Seat 0: the equipped creature "host", a commander "cmd", a plain creature "plain", and the Sash. Seat 1 has a commander of its own. */
const board = (seats: 2 | 3 | 4 = 2) => {
  const b = scenario({ seats })
    .define(sash)
    .define(dull)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'host' })
    .battlefield(ANGEL, { label: 'cmd', commander: true })
    .battlefield(OGRE, { label: 'plain' })
    .battlefield(SASH, { attachedTo: 'host', label: 'sash' })
    .seat(1)
    .library(...LIBRARY)
    .battlefield('Grizzly Bears', { label: 'foe', commander: true });
  return b;
};

describe('the cards are valid', () => {
  test.each([sash, dull])('$name', (def) => {
    expect(validateCard(def)).toEqual([]);
  });
});

describe('the granted group ability (CR 604.1, 613.1f)', () => {
  test('the equipped creature gets the Equipment bonus; the commander it grants to gets +2/+2 and lifelink', () => {
    const g = board().at('precombatMain').build();
    expect(stats(g, 'host')).toEqual({ pt: '4/4', lifelink: true });
    expect(stats(g, 'cmd')).toEqual({ pt: '6/6', lifelink: true });
  });

  test('a creature that is not a commander is not affected', () => {
    const g = board().at('precombatMain').build();
    expect(stats(g, 'plain')).toEqual({ pt: '2/2', lifelink: false });
  });

  test('another player\'s commander is not affected: "you" is the controller of the creature that has the ability', () => {
    const g = board().at('precombatMain').build();
    expect(stats(g, 'foe')).toEqual({ pt: '2/2', lifelink: false });
  });

  test('"other" leaves out the equipped creature itself when it is a commander: it gets the Equipment bonus once', () => {
    const g = scenario()
      .define(sash)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ANGEL, { label: 'cmd', commander: true })
      .battlefield(SASH, { attachedTo: 'cmd' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    expect(stats(g, 'cmd')).toEqual({ pt: '6/6', lifelink: true });
  });

  test('two commanders of the equipped creature controller both get it; a second Equipment gives it again', () => {
    const g = scenario()
      .define(sash)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'host' })
      .battlefield(ANGEL, { label: 'one', commander: true })
      .battlefield(OGRE, { label: 'two', commander: true })
      .battlefield(SASH, { attachedTo: 'host' })
      .battlefield(SASH, { attachedTo: 'host' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    expect(stats(g, 'one')).toEqual({ pt: '8/8', lifelink: true });
    expect(stats(g, 'two')).toEqual({ pt: '6/6', lifelink: true });
  });

  test('the Equipment attached to nothing gives nothing', () => {
    const g = scenario()
      .define(sash)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ANGEL, { label: 'cmd', commander: true })
      .battlefield(SASH)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    expect(stats(g, 'cmd')).toEqual({ pt: '4/4', lifelink: false });
  });
});

describe('losing the ability (CR 613.1f, 613.7)', () => {
  test('a creature that loses all abilities loses the ability it was given, and what it gave', () => {
    const g = board().battlefield(DULL, { attachedTo: 'host' }).at('precombatMain').build();
    // The Equipment's own bonus is the Equipment's, not the creature's: it stays. The grant to the commander is the creature's ability: gone.
    expect(stats(g, 'host')).toEqual({ pt: '4/4', lifelink: false });
    expect(stats(g, 'cmd')).toEqual({ pt: '4/4', lifelink: false });
  });
});

describe('three and four seats', () => {
  test.each([3, 4] as const)(
    '%s seats: only the commanders of the creature controller',
    (seats) => {
      const b = board(seats);
      for (let seat = 2; seat < seats; seat += 1) {
        b.seat(seat as 2 | 3)
          .library(...LIBRARY)
          .battlefield(ANGEL, { label: `foe${seat}`, commander: true });
      }
      const g = b.at('precombatMain').build();
      expect(stats(g, 'cmd')).toEqual({ pt: '6/6', lifelink: true });
      expect(stats(g, 'foe')).toEqual({ pt: '2/2', lifelink: false });
      for (let seat = 2; seat < seats; seat += 1) {
        expect(stats(g, `foe${seat}`)).toEqual({ pt: '4/4', lifelink: false });
      }
    },
  );

  test('the Equipment of seat 2 on its own creature reaches the commanders of seat 2 only', () => {
    const g = scenario({ seats: 3 })
      .define(sash)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ANGEL, { label: 'mine', commander: true })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'host' })
      .battlefield(OGRE, { label: 'cmd2', commander: true })
      .battlefield(SASH, { attachedTo: 'host' })
      .at('precombatMain')
      .build();
    expect(stats(g, 'cmd2')).toEqual({ pt: '4/4', lifelink: true });
    expect(stats(g, 'mine')).toEqual({ pt: '4/4', lifelink: false });
  });
});

describe('validateCard refuses what the second pass would get wrong', () => {
  const withInner = (inner: Ability): CardDefinition =>
    singleFace({
      name: 'SYNTHETIC Bad Sash',
      manaCost: ['1'],
      types: ['artifact'],
      subtypes: ['Equipment'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC',
      abilities: [given(inner)],
    });
  const messages = (def: CardDefinition) =>
    validateCard(def)
      .map((i) => i.message)
      .join(' | ');

  test('a group named by a keyword or by power', () => {
    const keyed = (filter: ObjectFilter): Ability => ({
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'filter', filter },
        power: 1,
        toughness: 1,
      },
    });
    expect(messages(withInner(keyed({ types: ['creature'], keywords: ['flying'] })))).toContain(
      'not named by a keyword',
    );
    expect(
      messages(withInner(keyed({ types: ['creature'], power: { op: 'gte', value: 3 } } as never))),
    ).toContain('not named by a keyword');
  });

  test('a subject that is not a group, an amount that is counted, a condition', () => {
    expect(
      messages(
        withInner({
          kind: 'static',
          static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 1, toughness: 1 },
        }),
      ),
    ).toContain('a filter subject');
    expect(
      messages(
        withInner({
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'filter', filter: COMMANDER },
            power: { kind: 'commanderCasts' },
            toughness: 0,
          },
        }),
      ),
    ).toContain('fixed number');
    expect(
      messages(
        withInner({
          kind: 'static',
          condition: { kind: 'yourTurn' },
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'filter', filter: COMMANDER },
            keyword: { kind: 'lifelink' },
          },
        }),
      ),
    ).toContain('no condition');
  });
});
