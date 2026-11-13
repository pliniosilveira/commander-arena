// The Hashaton deck (issue 31), group 4 (D-367 to D-371): "amass Zombies 1", "Zombie tokens you control have hexproof and menace." (Gleaming Overseer) and "Until end
// of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and hexproof." (Enter the Avatar
// State). The first line of each describe is the real Oracle text of the acceptance card of the golden corpus read through the whole pipeline; the other lines are
// SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-hashaton-group-4.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const ENTERS = { kind: 'entersBattlefield', what: { kind: 'this' } };
const T1 = { kind: 'target', id: 't1' };
const ZOMBIE_TOKENS = { subtypes: ['Zombie'], token: true, controller: 'you' };
const STATIC = (filter: object, keyword: string) => ({
  kind: 'static',
  static: { kind: 'grantKeyword', subject: { kind: 'filter', filter }, keyword: { kind: keyword } },
});
const OVERSEER =
  "When this creature enters, amass Zombies 1. (Put a +1/+1 counter on an Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)\nZombie tokens you control have hexproof and menace.";
const AVATAR =
  "Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and hexproof. (A creature with hexproof can't be the target of spells or abilities your opponents control.)";

describe('"amass Zombies 1" (CR 701.47a)', () => {
  test('the real text of Gleaming Overseer: the trigger amasses, and the static gives the Zombie tokens hexproof and menace', () => {
    const parsed = readAll(OVERSEER, 'creature', ['Zombie', 'Wizard']);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: ENTERS,
        effect: { kind: 'amass', subtype: 'Zombie', count: 1 },
      },
      STATIC(ZOMBIE_TOKENS, 'hexproof'),
      STATIC(ZOMBIE_TOKENS, 'menace'),
    ]);
  });

  test.each([
    ['amass Zombies 3', 'Zombie', 3],
    ['amass Orcs 2', 'Orc', 2],
    ['amass Elves 1', 'Elf', 1],
    ['amass Zombies two', 'Zombie', 2],
  ] as const)(
    'another type and number, in a trigger and a spell (SYNTHETIC): %s',
    (words, subtype, count) => {
      const trigger = readAll(`When this creature enters, ${words}.`, 'creature', ['Wizard']);
      expect(trigger.abilities[0]).toMatchObject({
        kind: 'triggered',
        effect: { kind: 'amass', subtype, count },
      });
      const spell = readAll(`${words[0]?.toUpperCase()}${words.slice(1)}.`, 'sorcery');
      expect(spell.spell?.effect).toEqual({ kind: 'amass', subtype, count });
    },
  );

  test('X is an amount read as the effect resolves (SYNTHETIC)', () => {
    const spell = readAll('Amass Zombies X.', 'sorcery');
    expect(spell.spell?.effect).toMatchObject({ kind: 'amass', subtype: 'Zombie' });
    expect(spell.spell?.effect).toMatchObject({ count: { kind: 'x' } });
  });

  test('with another instruction, in order (SYNTHETIC)', () => {
    const spell = readAll('Amass Zombies 2, then draw a card.', 'sorcery');
    expect(spell.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'amass', subtype: 'Zombie', count: 2 }, { kind: 'draw' }],
    });
  });

  test.each([
    // the form without a type has been given one by errata (CR 701.47d)
    'When this creature enters, amass 1.',
    // the type is said in the plural, with a number
    'When this creature enters, amass Zombie 1.',
    'When this creature enters, amass Zombies.',
    'When this creature enters, amass zombies 1.',
    'When this creature enters, amass Treasures 1.',
    'When this creature enters, amass Zombies and Orcs 1.',
    'When this creature enters, amass Zombies 1 times.',
    'When this creature enters, amass the Zombies 1.',
    'When this creature enters, amass Zombies minus 1.',
    'When this creature enters, amass Zombies 1 on target creature.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Wizard']);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('"Zombie tokens you control have hexproof and menace." (CR 111.1, 205.3m, 611.3a)', () => {
  test('one keyword, two, and a pump (SYNTHETIC)', () => {
    expect(
      readAll('Soldier tokens you control have vigilance.', 'creature', ['Wizard']).abilities,
    ).toEqual([STATIC({ subtypes: ['Soldier'], token: true, controller: 'you' }, 'vigilance')]);
    expect(
      readAll('Zombie tokens you control get +1/+1.', 'creature', ['Wizard']).abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: ZOMBIE_TOKENS },
          power: 1,
          toughness: 1,
        },
      },
    ]);
  });

  test.each([
    'Zombies tokens you control have hexproof and menace.',
    'Zombie token you control has hexproof.',
    'Treasure tokens you control have hexproof.',
    'Other Zombie tokens you control have hexproof and menace.',
    'Zombie tokens your opponents control have hexproof and menace.',
    'Zombie tokens have hexproof and menace.',
    'Zombie Wizard tokens you control have hexproof and menace.',
    'Zombie tokens you control have flash.',
    'Zombie tokens you control have hexproof and flash.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Wizard']);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('"Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains ..." (CR 205.1b, 613.1d, 613.1f, 611.2a)', () => {
  const END = 'untilEndOfTurn';
  const grant = (keyword: string) => ({
    kind: 'grantKeyword',
    objects: T1,
    keyword: { kind: keyword },
    duration: END,
  });

  test('the real text of Enter the Avatar State: one additive setTypes and four grants, on one target chosen once', () => {
    const parsed = readAll(AVATAR, 'instant');
    expect(parsed.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'setTypes',
            objects: T1,
            subtypes: ['Avatar'],
            additive: true,
            duration: END,
          },
          grant('flying'),
          grant('firstStrike'),
          grant('lifelink'),
          grant('hexproof'),
        ],
      },
    });
  });

  test('one keyword, another type, any target creature (SYNTHETIC)', () => {
    const parsed = readAll(
      'Until end of turn, target creature becomes a Wizard in addition to its other types and gains flying.',
      'instant',
    );
    expect(parsed.spell?.targets).toEqual([
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ]);
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'setTypes', objects: T1, subtypes: ['Wizard'], additive: true, duration: END },
        grant('flying'),
      ],
    });
  });

  test('without the keywords the line reads as before: the type alone', () => {
    const parsed = readAll(
      'Until end of turn, target creature you control becomes an Avatar in addition to its other types.',
      'instant',
    );
    expect(parsed.spell?.effect).toEqual({
      kind: 'setTypes',
      objects: T1,
      subtypes: ['Avatar'],
      additive: true,
      duration: END,
    });
  });

  test.each([
    // the keywords of a type that replaces, a card type, a color: not read together with "gains"
    'Until end of turn, target creature you control becomes an Avatar and gains flying.',
    'Until end of turn, target creature you control becomes an artifact creature in addition to its other types and gains flying.',
    'Until end of turn, target creature you control becomes red and gains flying.',
    // what is said after "gains"
    'Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains.',
    'Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flash.',
    'Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying and draws a card.',
    'Until end of turn, target creature you control becomes an Avatar in addition to its other types and has flying.',
    'Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying until end of turn.',
    'Until your next turn, target creature you control becomes an Avatar in addition to its other types and gains flying.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'instant');
    expect(parsed.spell).toBeNull();
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('a line whose engine feature is not listed names it (D-068)', () => {
  const CASES = [
    ['effect:amass', 'When this creature enters, amass Zombies 1.', 'creature'],
    ['effect:setTypes', AVATAR, 'instant'],
    ['effect:grantKeyword', AVATAR, 'instant'],
    ['static:grantKeyword', 'Zombie tokens you control have hexproof and menace.', 'creature'],
  ] as const;

  test.each(CASES)('without %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type, ['Wizard']);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type, ['Wizard']);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
        expect(parsed.spell, `${ref}: ${text}`).toBeNull();
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowering of this slice names is declared', () => {
    for (const ref of ['effect:amass', 'effect:setTypes', 'effect:grantKeyword'] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
