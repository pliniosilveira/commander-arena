/**
 * The words of group 3 of the Danitha deck (D-1230 to D-1236 provisional) as pure models: the Auras and the creature that count or check what is attached, the group of
 * creatures that are not enchanted, the conditions about the host and about the turn the Aura entered, and the reductions of Equip abilities and Aura spells that target the
 * enchanted creature. Read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here. No DOM.
 */
import { type Ability, type ObjectFilter, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { thingsPhrase } from '../src/game/filter-text';
import { lordWordings } from '../src/game/static-text';
import { gameConditionWords } from '../src/game/condition-text';
import { triggerGist } from '../src/ui/decisions/ability-label';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

const aura = (name: string) => lordWordings(abilitiesOf(name), { noun: 'enchantment', subtypes: ['Aura'] });

describe('the static abilities of the group', () => {
  test('"This creature gets +2/+2 for each Aura attached to it" (Kor Spiritdancer)', () => {
    expect(
      lordWordings(abilitiesOf('SYNTHETIC Aura Weaver'), { noun: 'creature', subtypes: ['Kor'] }),
    ).toEqual(['This creature gets +2/+2 for each Aura attached to it.']);
  });

  test('the bonus per Aura of yours on a creature (Sage\'s Reverie)', () => {
    expect(aura('SYNTHETIC Aura Scholar')).toEqual([
      "Enchanted creature gets +1/+1 for each Aura you control that's attached to a creature.",
    ]);
  });

  test('the bonus and the keyword of an Aura that counts enchantments (Ethereal Armor)', () => {
    expect(aura('SYNTHETIC Armor of Many')).toEqual([
      'Enchanted creature gets +1/+1 for each enchantment you control.',
      'Enchanted creature has first strike.',
    ]);
  });

  test('"as long as another Aura is attached" is said of the permanent this is attached to (Face of Divinity)', () => {
    expect(aura('SYNTHETIC Twin Face Aura')).toEqual([
      'Enchanted creature gets +2/+2.',
      'Enchanted creature has first strike as long as another Aura is attached to the permanent this is attached to.',
      'Enchanted creature has lifelink as long as another Aura is attached to the permanent this is attached to.',
    ]);
  });

  test('the color of the host is worded as the host is a permanent this is attached to (Shield of the Oversoul)', () => {
    expect(aura('SYNTHETIC Dual Hue Aura')).toEqual([
      'Enchanted creature gets +1/+1 as long as this permanent is attached to a green creature.',
      'Enchanted creature has indestructible as long as this permanent is attached to a green creature.',
      'Enchanted creature gets +1/+1 as long as this permanent is attached to a white creature.',
      'Enchanted creature has flying as long as this permanent is attached to a white creature.',
    ]);
  });

  test('"as long as this permanent entered this turn" (Shardmage\'s Rescue)', () => {
    expect(aura('SYNTHETIC Flash Ward Aura')).toEqual([
      'Enchanted creature has hexproof as long as this permanent entered this turn.',
      'Enchanted creature gets +1/+1.',
    ]);
  });

  test('the two reductions that read what is targeted, and the bonus for each attachment (Strong Back)', () => {
    expect(aura('SYNTHETIC Strong Spine Aura')).toEqual([
      'Equip abilities you activate that target enchanted creature cost {3} less to activate.',
      'Aura spells you cast that target enchanted creature cost {3} less to cast.',
      'Enchanted creature gets +2/+2 for each Aura and Equipment attached to it.',
    ]);
  });

  test('another reduction is not worded: a spell of any kind, an amount that is not a number, another target', () => {
    const say = (effect: Ability): string[] =>
      lordWordings([effect], { noun: 'enchantment', subtypes: ['Aura'] });
    const reduce = (spells: ObjectFilter, amount: number | { kind: 'x' }): Ability =>
      ({
        kind: 'static',
        static: { kind: 'costReduction', spells, amount },
      }) as unknown as Ability;
    // Without a target condition the reduction is not worded here (older cards keep their text), nor are other kinds of spell or controller.
    expect(say(reduce({ subtypes: ['Aura'], controller: 'you' }, 3))).toEqual([]);
    expect(
      say(
        reduce(
          { types: ['creature'], controller: 'you', targetsObject: { hostOfSource: true } },
          3,
        ),
      ),
    ).toEqual([]);
    expect(
      say(
        reduce(
          { subtypes: ['Aura'], controller: 'you', targetsObject: { hostOfSource: true } },
          { kind: 'x' },
        ),
      ),
    ).toEqual([]);
    expect(
      say(
        reduce(
          { subtypes: ['Aura'], controller: 'you', targetsObject: { types: ['creature'] } },
          3,
        ),
      ),
    ).toEqual([]);
    expect(
      lordWordings(
        [
          {
            kind: 'static',
            static: {
              kind: 'abilityCostReduction',
              abilities: 'equip',
              targeting: { types: ['creature'] },
              amount: 3,
            },
          },
        ],
        { noun: 'enchantment', subtypes: ['Aura'] },
      ),
    ).toEqual([]);
  });
});

describe('a group named by what is attached to it', () => {
  test('creatures that are not enchanted, with no "on the battlefield"', () => {
    expect(thingsPhrase({ types: ['creature'], enchanted: false }, true)).toBe(
      "creatures that aren't enchanted",
    );
    expect(thingsPhrase({ types: ['creature'], enchanted: true }, false)).toBe(
      'creature that is enchanted',
    );
    expect(thingsPhrase({ types: ['creature'], controller: 'you', enchanted: false }, true)).toBe(
      "creatures you control that aren't enchanted",
    );
  });

  test('the Auras, in the plural and with their controller', () => {
    expect(
      thingsPhrase(
        {
          subtypes: ['Aura'],
          controller: 'you',
          attachedTo: { kind: 'matching', filter: { types: ['creature'] } },
        },
        true,
      ),
    ).toBe("Auras you control that are attached to a creature");
    expect(thingsPhrase({ subtypes: ['Equipment'], attachedTo: { kind: 'source' } }, true)).toBe(
      'Equipment attached to it',
    );
    expect(
      thingsPhrase(
        {
          anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
          other: true,
          attachedTo: { kind: 'host' },
        },
        false,
      ),
    ).toBe('other Aura and Equipment attached to it');
  });

  test('a host or a filter the words cannot say is not worded (never guessed)', () => {
    expect(
      thingsPhrase(
        {
          subtypes: ['Aura'],
          attachedTo: { kind: 'matching', filter: { types: ['creature'], colors: ['G'] } },
        },
        false,
      ),
    ).toBeNull();
    expect(
      thingsPhrase({ subtypes: ['Aura'], tapped: true, attachedTo: { kind: 'source' } }, false),
    ).toBeNull();
    expect(
      thingsPhrase({ subtypes: ['Vehicle'], attachedTo: { kind: 'source' } }, false),
    ).not.toBe('Vehicle attached to it');
  });

  test('"Destroy each creature that isn\'t enchanted. It can\'t be regenerated" (Winds of Rath)', () => {
    const gist = triggerGist(
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'destroy',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], enchanted: false },
          },
          cantBeRegenerated: true,
        },
      } as never,
      undefined,
    );
    expect(gist).toBe("Destroy each creature that isn't enchanted. It can't be regenerated");
  });
});

describe('the conditions', () => {
  test('this permanent entered this turn, and its negation', () => {
    expect(gameConditionWords({ kind: 'thisEnteredThisTurn' })).toBe(
      'this permanent entered this turn',
    );
    expect(gameConditionWords({ kind: 'not', term: { kind: 'thisEnteredThisTurn' } })).toBe(
      "this permanent didn't enter this turn",
    );
  });

  test('another attachment on the host, and the negation of it', () => {
    const count = {
      kind: 'amountIs',
      amount: {
        kind: 'countOf',
        filter: { subtypes: ['Aura'], other: true, attachedTo: { kind: 'host' } },
      },
      compare: { cmp: 'atLeast', value: 1 },
    } as const;
    expect(gameConditionWords(count)).toBe(
      'another Aura is attached to the permanent this is attached to',
    );
    expect(gameConditionWords({ kind: 'not', term: count })).toBe(
      'no other Aura is attached to the permanent this is attached to',
    );
  });

  test('another count of attachments keeps the older words, a count the words cannot say is left out', () => {
    expect(
      gameConditionWords({
        kind: 'amountIs',
        amount: { kind: 'countOf', filter: { subtypes: ['Aura'], attachedTo: { kind: 'source' } } },
        compare: { cmp: 'atLeast', value: 2 },
      }),
    ).toBe('the number of Auras attached to it is 2 or greater');
    expect(
      gameConditionWords({
        kind: 'amountIs',
        amount: {
          kind: 'countOf',
          filter: { subtypes: ['Aura'], tapped: true, attachedTo: { kind: 'source' } },
        },
        compare: { cmp: 'atLeast', value: 1 },
      }),
    ).toBeNull();
  });
});
