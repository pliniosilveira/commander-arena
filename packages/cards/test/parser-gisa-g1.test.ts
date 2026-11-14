// The Gisa deck (issue 41), group 1 (D-472 to D-476): the real Oracle lines of Lost Monarch of Ifnir, Zombie Master, Zombie Trailblazer and Dreadhorde Invasion read through the
// whole pipeline, the nodes they lower to, SYNTHETIC siblings, the near misses the grammar must not read and the features the engine lacks (D-068). The engine runs what is lowered in
// convert-grammar-engine-gisa-g1.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { dropped, END, read, readAll, withoutFeature } from './parser-p5-helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const ZOMBIES_YOU = {
  kind: 'filter',
  filter: { subtypes: ['Zombie'], controller: 'you' },
  other: true,
} as const;

describe('Afflict N (CR 702.130a): the keyword line', () => {
  test('the real line of Lost Monarch of Ifnir', () => {
    expect(readAll('Afflict 3', 'creature', ['Zombie', 'Noble']).abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'afflict', count: 3 } },
    ]);
  });

  test('in a list with other keywords, and with another number (SYNTHETIC)', () => {
    expect(readAll('Menace, afflict 2', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'menace' } },
      { kind: 'keyword', keyword: { kind: 'afflict', count: 2 } },
    ]);
    expect(readAll('Afflict 1', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'afflict', count: 1 } },
    ]);
  });

  test.each(['Afflict', 'Afflict 0', 'Afflict X', 'Afflict three', 'Afflict {1}', 'Afflicted 3'])(
    'is dropped, never half read (SYNTHETIC): %s',
    (text) => {
      expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
    },
  );

  test('it names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('keyword:afflict', 'Afflict 3');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('keyword:afflict');
  });
});

describe('"Other Zombies you control have afflict 3." (CR 613.1f, 702.130a)', () => {
  test('the real line: the other Zombies of the controller are given afflict 3', () => {
    expect(
      readAll('Other Zombies you control have afflict 3.', 'creature', ['Zombie', 'Noble'])
        .abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: ZOMBIES_YOU,
          keyword: { kind: 'afflict', count: 3 },
        },
      },
    ]);
  });

  test('another number, and with other keywords (SYNTHETIC)', () => {
    expect(
      readAll('Other Zombies you control have afflict 1.', 'creature', ['Zombie']).abilities,
    ).toMatchObject([{ static: { keyword: { kind: 'afflict', count: 1 } } }]);
    expect(
      readAll('Other Zombies you control have menace and afflict 2.', 'creature').abilities,
    ).toMatchObject([
      { static: { keyword: { kind: 'menace' } } },
      { static: { keyword: { kind: 'afflict', count: 2 } } },
    ]);
  });

  test.each([
    'Other Zombies you control have afflict.',
    'Other Zombies you control have afflict 0.',
    'Other Zombies you control have afflict X.',
    'Other Zombies you control have afflict 3 until end of turn.',
    'Other Zombies you control has afflict 3.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature', ['Zombie']).unparsed.length).toBeGreaterThan(0);
  });

  test('it names the features the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'keyword:afflict',
      'Other Zombies you control have afflict 3.',
      'creature',
      ['Zombie'],
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('keyword:afflict');
  });
});

describe('Zombie Master: "Other Zombie creatures have swampwalk." (CR 702.14a, 613.1f)', () => {
  test('the real line: the other Zombie creatures, whoever controls them, are given swampwalk', () => {
    expect(
      readAll('Other Zombie creatures have swampwalk.', 'creature', ['Zombie']).abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], subtypes: ['Zombie'] },
            other: true,
          },
          keyword: { kind: 'landwalk', landType: 'Swamp' },
        },
      },
    ]);
  });

  test('the other landwalks of the engine, and in a list (SYNTHETIC siblings)', () => {
    for (const [word, landType] of [
      ['islandwalk', 'Island'],
      ['forestwalk', 'Forest'],
      ['nonbasic landwalk', 'nonbasic'],
    ] as const) {
      expect(
        readAll(`Other Zombie creatures have ${word}.`, 'creature', ['Zombie']).abilities,
        word,
      ).toMatchObject([{ static: { keyword: { kind: 'landwalk', landType } } }]);
    }
    expect(
      readAll('Other Zombie creatures have flying and swampwalk.', 'creature', ['Zombie'])
        .abilities,
    ).toMatchObject([
      { static: { keyword: { kind: 'flying' } } },
      { static: { keyword: { kind: 'landwalk', landType: 'Swamp' } } },
    ]);
  });

  test.each([
    'Other Zombie creatures have snow landwalk.',
    'Other Zombie creatures have desertwalk.',
    'Other Zombie creatures have landwalk.',
    'Other Zombie creatures have swampwalk until end of turn.',
    'Other Zombie creatures has swampwalk.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature', ['Zombie']).unparsed.length).toBeGreaterThan(0);
  });

  test('it names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'keyword:landwalk',
      'Other Zombie creatures have swampwalk.',
      'creature',
      ['Zombie'],
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('keyword:landwalk');
  });
});

describe('Zombie Trailblazer: the cost "Tap an untapped Zombie you control" and its two effects', () => {
  test('the real line: a land becomes a Swamp until end of turn (CR 305.7)', () => {
    const [ability] = readAll(
      'Tap an untapped Zombie you control: Target land becomes a Swamp until end of turn.',
      'creature',
      ['Zombie', 'Scout'],
    ).abilities;
    expect(ability).toEqual({
      kind: 'activated',
      cost: [
        { kind: 'tapPermanents', filter: { subtypes: ['Zombie'], controller: 'you' }, count: 1 },
      ],
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['land'] } } },
      ],
      effect: { kind: 'setTypes', objects: T1, subtypes: ['Swamp'], duration: END },
    });
  });

  test('the real line: a creature gains swampwalk until end of turn (CR 702.14a)', () => {
    const [ability] = readAll(
      'Tap an untapped Zombie you control: Target creature gains swampwalk until end of turn.',
      'creature',
      ['Zombie', 'Scout'],
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'tapPermanents', count: 1 }],
      effect: {
        kind: 'grantKeyword',
        objects: T1,
        keyword: { kind: 'landwalk', landType: 'Swamp' },
        duration: END,
      },
    });
  });

  test('the other basic land types, and a gain of another keyword with afflict (SYNTHETIC siblings)', () => {
    for (const [article, land] of [
      ['an', 'Island'],
      ['a', 'Plains'],
      ['a', 'Mountain'],
      ['a', 'Forest'],
    ] as const) {
      expect(
        readAll(`{T}: Target land becomes ${article} ${land} until end of turn.`, 'creature')
          .abilities,
        land,
      ).toMatchObject([{ effect: { kind: 'setTypes', subtypes: [land], duration: END } }]);
    }
    expect(
      readAll(
        'Tap an untapped Zombie you control: Target creature gains afflict 2 until end of turn.',
        'creature',
      ).abilities,
    ).toMatchObject([{ effect: { kind: 'grantKeyword', keyword: { kind: 'afflict', count: 2 } } }]);
  });

  test.each([
    'Tap an untapped Zombie you control: Target land becomes a Swamp.',
    'Tap an untapped Zombie you control: Target land becomes a swamp until end of turn.',
    'Tap an untapped Zombie you control: Target creature becomes a Swamp until end of turn.',
    'Tap an untapped Zombie you control: Target land becomes a Swamp until your next turn.',
    'Tap an untapped Zombie you control: Target land becomes a Swamp in addition to its other land types until end of turn.',
    'Tap an untapped Zombie you control: Target land becomes a Swamp Forest until end of turn.',
    'Tap an untapped Zombie you control: Target creature gains swampwalk.',
    'Tap an untapped Zombie you control: Target creature gains snow swampwalk until end of turn.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature', ['Zombie']).unparsed.length).toBeGreaterThan(0);
  });

  test('the first names the features the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'effect:setTypes',
      'Tap an untapped Zombie you control: Target land becomes a Swamp until end of turn.',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:setTypes');
    const walk = withoutFeature(
      'keyword:landwalk',
      'Tap an untapped Zombie you control: Target creature gains swampwalk until end of turn.',
    );
    expect(walk).toMatchObject({ reason: 'notRunnable' });
    expect(walk.needs).toContain('keyword:landwalk');
  });
});

describe('Lost Monarch of Ifnir: "if a player was dealt combat damage by a Zombie this turn" (CR 120.2a, 603.4)', () => {
  const REAL =
    'At the beginning of your second main phase, if a player was dealt combat damage by a Zombie this turn, mill three cards, then you may return a creature card from your graveyard to your hand.';

  test('the real line: an intervening "if" that reads the log of the turn, then the mill and the optional return', () => {
    const [ability] = readAll(REAL, 'creature', ['Zombie', 'Noble']).abilities;
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'main2', whose: 'you' },
      interveningIf: { kind: 'combatDamagedBy', filter: { subtypes: ['Zombie'] } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'mill', player: { kind: 'you' }, count: 3 },
          {
            kind: 'moveToZone',
            objects: {
              kind: 'choose',
              filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
              optional: true,
            },
            to: 'hand',
          },
        ],
      },
    });
  });

  test('other kinds of source: a type, a type you control (SYNTHETIC siblings)', () => {
    const when = (kind: string) =>
      readAll(
        `At the beginning of your end step, if a player was dealt combat damage by ${kind} this turn, draw a card.`,
        'creature',
      ).abilities[0];
    expect(when('a creature')).toMatchObject({
      interveningIf: { kind: 'combatDamagedBy', filter: { types: ['creature'] } },
    });
    expect(when('a creature you control')).toMatchObject({
      interveningIf: {
        kind: 'combatDamagedBy',
        filter: { types: ['creature'], controller: 'you' },
      },
    });
    expect(when('an Elf you control')).toMatchObject({
      interveningIf: {
        kind: 'combatDamagedBy',
        filter: { subtypes: ['Elf'], controller: 'you' },
      },
    });
  });

  test.each([
    'a player was dealt combat damage by a Zombie',
    'a player was dealt combat damage by a Zombie this combat',
    'a player was dealt damage by a Zombie this turn',
    'an opponent was dealt combat damage by a Zombie this turn',
    'a player was dealt combat damage by Zombies this turn',
    'a player was dealt combat damage by a tapped creature this turn',
    'a player was dealt combat damage by a white creature this turn',
  ])('is dropped, never half read (SYNTHETIC): %s', (condition) => {
    expect(
      read(`At the beginning of your end step, if ${condition}, draw a card.`, 'creature').unparsed
        .length,
    ).toBeGreaterThan(0);
  });

  test('it names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('condition:combatDamagedBy', REAL, 'creature', ['Zombie']);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('condition:combatDamagedBy');
  });
});

describe('Dreadhorde Invasion: "Whenever a Zombie token you control with power 6 or greater attacks, it gains lifelink until end of turn." (CR 111.1, 603.2)', () => {
  test('the real line: an attack trigger whose subject is a Zombie token of the controller with a power filter; "it" is that creature', () => {
    const [ability] = readAll(
      'Whenever a Zombie token you control with power 6 or greater attacks, it gains lifelink until end of turn.',
      'enchantment',
    ).abilities;
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'attacks',
        what: {
          subtypes: ['Zombie'],
          token: true,
          controller: 'you',
          power: { cmp: 'atLeast', value: 6 },
        },
      },
      effect: {
        kind: 'grantKeyword',
        objects: { kind: 'triggerSubject' },
        keyword: { kind: 'lifelink' },
        duration: END,
      },
    });
  });

  test('a creature token, and a token without a power filter (SYNTHETIC siblings)', () => {
    expect(
      readAll(
        'Whenever a creature token you control attacks, it gains menace until end of turn.',
        'enchantment',
      ).abilities[0],
    ).toMatchObject({
      trigger: { kind: 'attacks', what: { types: ['creature'], token: true, controller: 'you' } },
    });
    expect(
      readAll(
        'Whenever a Goblin token you control attacks, it gets +1/+0 until end of turn.',
        'enchantment',
      ).abilities[0],
    ).toMatchObject({
      trigger: { kind: 'attacks', what: { subtypes: ['Goblin'], token: true } },
    });
  });

  test('a token is read in the subject of a trigger only: the same words in other places are still unread', () => {
    // "tokens" mid-phrase of an effect noun is not read by this change.
    expect(dropped('Destroy target creature token.').reason).toBe('unrecognised');
  });

  test.each([
    'Whenever a Zombie token you control with power 6 or greater attack, it gains lifelink until end of turn.',
    'Whenever a Zombie token you control with power 6 or greater attacks, it gains lifelink.',
    'Whenever a Zombie token you control with power 6 or greater attacks, they gain lifelink until end of turn.',
    'Whenever Zombie tokens you control attack, they gain lifelink until end of turn.',
    'Whenever a Zombie tokens you control attacks, it gains lifelink until end of turn.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'enchantment').unparsed.length).toBeGreaterThan(0);
  });

  test('it names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'selector:token',
      'Whenever a Zombie token you control with power 6 or greater attacks, it gains lifelink until end of turn.',
      'enchantment',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('what the lowerings declare they need (D-068)', () => {
  test('the keyword, the condition and the grant words are in the declared needs', () => {
    expect(DECLARED_NEEDS).toEqual(
      expect.arrayContaining(['keyword:afflict', 'keyword:landwalk', 'condition:combatDamagedBy']),
    );
  });
});

describe('the same lines as one card', () => {
  test('all the lines of the four real cards read in a face with nothing left over', () => {
    readAll(
      [
        'Afflict 3',
        'Other Zombies you control have afflict 3.',
        'At the beginning of your second main phase, if a player was dealt combat damage by a Zombie this turn, mill three cards, then you may return a creature card from your graveyard to your hand.',
      ].join('\n'),
      'creature',
      ['Zombie', 'Noble'],
    );
    readAll(
      'Other Zombie creatures have swampwalk.\nOther Zombies have "{B}: Regenerate this permanent."',
      'creature',
      ['Zombie'],
    );
    readAll(
      'Tap an untapped Zombie you control: Target land becomes a Swamp until end of turn.\nTap an untapped Zombie you control: Target creature gains swampwalk until end of turn.',
      'creature',
      ['Zombie', 'Scout'],
    );
    readAll(
      'At the beginning of your upkeep, you lose 1 life and amass Zombies 1.\nWhenever a Zombie token you control with power 6 or greater attacks, it gains lifelink until end of turn.',
      'enchantment',
    );
  });
});
