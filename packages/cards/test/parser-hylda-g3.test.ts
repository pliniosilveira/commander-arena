// The Hylda deck (issue 42), group 3: the lines of Theft of Dreams and Borrowing 100,000 Arrows, Gadwick, Loyal Warhound, Floodpits Drowner, Cloud's Limit Break, Ojutai Exemplars,
// Retreat to Coralhelm, You See a Guard Approach and Surge of Salvation. The first lines of each block are the real Oracle text of the acceptance cards of the golden corpus read through the
// whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-hylda-g3.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { readAll, read as readFace, withoutFeature } from './parser-p5-helpers';

type Type = Parameters<typeof readFace>[1];

const NOT_READ = (text: string, type: Type = 'instant') => {
  const parsed = readFace(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell, text).toBeNull();
  expect(parsed.unparsed, text).toHaveLength(1);
};

const TARGET_OPPONENT = { id: 't1', what: { kind: 'player', filter: 'opponent' } };

describe('"Draw a card for each tapped creature target opponent controls." (CR 109.4, 608.2c)', () => {
  const LINE = 'Draw a card for each tapped creature target opponent controls.';

  test('the real line: a count of the tapped creatures of the targeted opponent', () => {
    expect(readAll(LINE, 'sorcery').spell).toEqual({
      targets: [TARGET_OPPONENT],
      effect: {
        kind: 'draw',
        player: { kind: 'you' },
        count: {
          kind: 'countOf',
          filter: {
            types: ['creature'],
            tapped: true,
            controlledBy: { kind: 'target', id: 't1' },
          },
        },
      },
    });
  });

  test('another kind of permanent and any player (SYNTHETIC)', () => {
    expect(readAll('Draw a card for each artifact target player controls.', 'sorcery').spell).toMatchObject({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: {
        count: { kind: 'countOf', filter: { types: ['artifact'], controlledBy: { kind: 'target', id: 't1' } } },
      },
    });
  });

  test('the plural count of a number (SYNTHETIC)', () => {
    expect(
      readAll('You gain life equal to the number of creatures target opponent controls.', 'sorcery').spell,
    ).toMatchObject({
      targets: [TARGET_OPPONENT],
      effect: { kind: 'gainLife', amount: { kind: 'countOf', filter: { controlledBy: { kind: 'target' } } } },
    });
  });

  test.each([
    'Draw a card for each tapped creature target creature controls.',
    'Draw a card for each tapped creatures target opponent controls.',
    'Draw a card for each tapped creature target opponents control.',
    'Draw a card for each tapped creature target opponent controls on the battlefield.',
    'Draw a card for each tapped creature.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'sorcery');
  });

  test('a static ability does not read it (the player is a target)', () => {
    NOT_READ('Creatures you control get +1/+1 for each creature target opponent controls.', 'creature' as Type);
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('selector:controllerRef', LINE, 'sorcery');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:controllerRef');
    expect(DECLARED_NEEDS).toContain('selector:controllerRef');
  });
});

describe('Gadwick: "When ~ enters, draw X cards." (CR 107.3m)', () => {
  const LINE = 'When ~ enters, draw X cards.';

  test('the real line: the X of the spell the permanent came from', () => {
    expect(readAll(LINE, 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'enteredX' } },
      },
    ]);
  });

  test('another amount of X (SYNTHETIC)', () => {
    expect(readAll('When ~ enters, you gain X life.', 'creature').abilities).toMatchObject([
      { trigger: { kind: 'entersBattlefield' }, effect: { kind: 'gainLife', amount: { kind: 'enteredX' } } },
    ]);
  });

  test.each([
    'Whenever you cast a blue spell, draw X cards.',
    'Whenever ~ attacks, draw X cards.',
    'When ~ dies, draw X cards.',
    'Whenever another creature enters, draw X cards.',
    'At the beginning of your upkeep, draw X cards.',
  ])('X of another trigger is still not read (CR 107.3j): %s', (text) => {
    NOT_READ(text, 'creature');
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('amount:enteredX', LINE, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('amount:enteredX');
    expect(DECLARED_NEEDS).toContain('amount:enteredX');
  });
});

describe('Loyal Warhound: "if an opponent controls more lands than you" (CR 603.4, 102.2)', () => {
  const LINE =
    'When ~ enters, if an opponent controls more lands than you, search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle.';

  test('the real line: the intervening "if" is the opponents with more lands', () => {
    expect(readAll(LINE, 'creature').abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        interveningIf: {
          kind: 'amountIs',
          amount: { kind: 'opponentsWithMore', stat: 'lands' },
          compare: { cmp: 'atLeast', value: 1 },
        },
        effect: { kind: 'search', filter: { supertypes: ['basic'], subtypes: ['Plains'] } },
      },
    ]);
  });

  test('the old counts are untouched', () => {
    expect(
      readAll('When ~ enters, if an opponent controls more creatures than you, you gain 2 life.', 'creature')
        .abilities,
    ).toMatchObject([{ interveningIf: { amount: { kind: 'opponentsWithMore', stat: 'creatures' } } }]);
  });

  test.each([
    'When ~ enters, if an opponent has more lands than you, you gain 2 life.',
    'When ~ enters, if each opponent controls more lands than you, you gain 2 life.',
    'When ~ enters, if an opponent controls more lands than each other player, you gain 2 life.',
    'When ~ enters, if an opponent controls fewer lands than you, you gain 2 life.',
    'When ~ enters, if an opponent controls more artifacts than you, you gain 2 life.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'creature');
  });
});

describe('Floodpits Drowner: "Shuffle ~ and target creature with a stun counter on it into their owners\' libraries." (CR 701.24, 108.3)', () => {
  const LINE =
    "{1}{U}, {T}: Shuffle ~ and target creature with a stun counter on it into their owners' libraries.";

  test('the real line: both go to their owners\' libraries, then each owner shuffles', () => {
    expect(readAll(LINE, 'creature').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1', 'U'] }, { kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], hasCounter: 'stun' },
            },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'moveToZone', objects: { kind: 'this' }, to: 'library' },
            { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'library' },
            {
              kind: 'shuffle',
              player: {
                kind: 'all',
                of: [
                  { kind: 'ownerOf', of: { kind: 'this' } },
                  { kind: 'ownerOf', of: { kind: 'target', id: 't1' } },
                ],
              },
            },
          ],
        },
      },
    ]);
  });

  test("one target into its owner's library (SYNTHETIC)", () => {
    expect(readAll("{2}, {T}: Shuffle target creature into its owner's library.", 'creature').abilities).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'library' },
            { kind: 'shuffle', player: { kind: 'ownerOf', of: { kind: 'target', id: 't1' } } },
          ],
        },
      },
    ]);
  });

  test("the Niv-Mizzet shuffle with a graveyard is still its own rule", () => {
    expect(
      readAll("Whenever you draw your second card each turn, shuffle ~ and your graveyard into their owner's library.", 'creature')
        .abilities,
    ).toMatchObject([{ kind: 'triggered' }]);
  });

  test.each([
    "{1}{U}, {T}: Shuffle ~ and target creature into its owner's library.",
    "{1}{U}, {T}: Shuffle target creature into their owners' libraries.",
    '{1}{U}, {T}: Shuffle ~ and target creature into your library.',
    "{1}{U}, {T}: Shuffle ~ and each creature into their owners' libraries.",
    "{1}{U}, {T}: Shuffle ~ and two target creatures into their owners' libraries.",
    "{1}{U}, {T}: Shuffle ~ and up to one target creature into their owners' libraries.",
    "{1}{U}, {T}: Shuffle it into its owner's library.",
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'creature');
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('selector:ownerOf', LINE, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:ownerOf');
    expect(DECLARED_NEEDS).toContain('selector:ownerOf');
  });
});

describe("Cloud's Limit Break: \"any number of target tapped creatures with different controllers\" (CR 115.1, 601.2c)", () => {
  const BLADE_BEAM = 'Destroy any number of target tapped creatures with different controllers.';

  test('the real line of the mode: a slot of any number of targets, one for each controller', () => {
    expect(readAll(BLADE_BEAM, 'instant').spell).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], tapped: true },
          },
          anyNumber: true,
          differentControllers: true,
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    });
  });

  test('another verb and another kind of permanent (SYNTHETIC)', () => {
    expect(readAll('Tap any number of target artifacts with different controllers.', 'instant').spell).toMatchObject({
      targets: [{ anyNumber: true, differentControllers: true, what: { filter: { types: ['artifact'] } } }],
      effect: { kind: 'tap' },
    });
  });

  test('the old any-number slot is untouched: no fewest and no most is still not read', () => {
    NOT_READ('Destroy any number of target creatures.', 'instant');
  });

  test.each([
    'Destroy any number of target tapped creatures you control with different controllers.',
    'Destroy any number of target tapped creatures with different owners.',
    'Destroy any number of target tapped creature with different controllers.',
    'Destroy any number of other target creatures with different controllers.',
    'Destroy up to two target tapped creatures with different controllers.',
    'Destroy any number of target creatures and/or planeswalkers with different controllers.',
    'Destroy target tapped creatures with different controllers.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'instant');
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('selector:differentControllers', BLADE_BEAM, 'instant');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:differentControllers');
    expect(DECLARED_NEEDS).toContain('selector:differentControllers');
  });
});

describe('Ojutai Exemplars: "Exile ~, then return it to the battlefield tapped under its owner\'s control." (CR 400.7, 110.2)', () => {
  test('the real mode: an exile and the return of what it moved, tapped, under the owner', () => {
    expect(
      readAll(
        "Whenever ~ attacks, exile ~, then return it to the battlefield tapped under its owner's control.",
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'this' } },
            {
              kind: 'moveToZone',
              objects: { kind: 'moved' },
              to: 'battlefield',
              tapped: true,
              controller: 'owner',
            },
          ],
        },
      },
    ]);
  });

  test('a flicker of ~ in a triggered ability (SYNTHETIC)', () => {
    expect(
      readAll(
        "At the beginning of your end step, exile ~, then return it to the battlefield under its owner's control.",
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'this' } },
            { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield', controller: 'owner' },
          ],
        },
      },
    ]);
  });

  test('a spell cannot flicker itself, and a creature that dies is gone already', () => {
    NOT_READ("Exile ~, then return it to the battlefield under its owner's control.", 'instant');
    NOT_READ(
      "When ~ dies, exile ~, then return it to the battlefield under its owner's control.",
      'creature',
    );
  });
});

describe('Retreat to Coralhelm: "You may tap or untap target creature." (CR 701.26, 608.2d)', () => {
  const LINE = 'You may tap or untap target creature.';

  test('the real line of the mode: the controller chooses to tap, untap or do neither', () => {
    expect(readAll(`Choose one —\n• ${LINE}\n• Scry 1.`, 'instant').spell).toMatchObject({
      modes: [
        {
          targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
          effect: {
            kind: 'chooseOne',
            options: [
              { label: 'Tap it', effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } } },
              { label: 'Untap it', effect: { kind: 'untap', objects: { kind: 'target', id: 't1' } } },
            ],
            optional: true,
          },
        },
        { effect: { kind: 'scry', count: 1 } },
      ],
    });
  });

  test('without "you may" the choice is not optional (SYNTHETIC)', () => {
    const spell = readAll('Tap or untap target permanent.', 'instant').spell;
    expect(spell).toMatchObject({ effect: { kind: 'chooseOne' } });
    expect(JSON.stringify(spell)).not.toContain('optional');
  });

  test('the old taps are untouched', () => {
    expect(readAll('Tap target creature.', 'instant').spell).toMatchObject({ effect: { kind: 'tap' } });
    expect(readAll('Untap target creature.', 'instant').spell).toMatchObject({ effect: { kind: 'untap' } });
  });

  test.each([
    'Tap or untap each creature.',
    'Tap or untap target creature and target land.',
    'Untap or tap target creature.',
    'You may tap or untap two target creatures.',
    'You may tap or untap it.',
    'Tap or untap up to one target creature.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'instant');
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('effect:chooseOne', LINE, 'instant');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:chooseOne');
    expect(DECLARED_NEEDS).toContain('effect:chooseOne');
  });
});

describe('You See a Guard Approach: modes with a name before the dash (CR 207.2d, 700.2)', () => {
  const TEXT =
    'Choose one —\n• Distract the Guard — Tap target creature.\n• Hide — Target creature you control gains hexproof until end of turn.';

  test('the real text: the names are flavor, the modes read as they do without them', () => {
    const named = readAll(TEXT, 'instant').spell;
    const plain = readAll(
      'Choose one —\n• Tap target creature.\n• Target creature you control gains hexproof until end of turn.',
      'instant',
    ).spell;
    expect(named?.chooseModes).toEqual({ min: 1, max: 1 });
    expect(named?.modes?.map((m) => ({ ...m, text: '' }))).toEqual(plain?.modes?.map((m) => ({ ...m, text: '' })));
  });

  test('the text of a mode keeps its name', () => {
    expect(readAll(TEXT, 'instant').spell?.modes?.map((m) => m.text)).toEqual([
      'Distract the Guard — Tap target creature.',
      'Hide — Target creature you control gains hexproof until end of turn.',
    ]);
  });

  test('a mode that reads as written is never stripped', () => {
    const spell = readAll('Choose one —\n• Tap target creature.\n• Untap target creature.', 'instant').spell;
    expect(spell?.modes?.map((m) => m.text)).toEqual(['Tap target creature.', 'Untap target creature.']);
  });

  test.each([
    'Choose one —\n• Distract the Guard — Fly to the moon.\n• Hide — Target creature you control gains hexproof until end of turn.',
    'Choose one —\n• distract the guard — Tap target creature.\n• Untap target creature.',
    'Choose one —\n• Distract the Guard — \n• Untap target creature.',
  ])('a mode that does not read with its name off either stops the text: %s', (text) => {
    NOT_READ(text, 'instant');
  });
});

describe('Surge of Salvation: a player and their permanents gain hexproof (CR 702.11b, 611.2c)', () => {
  const LINE = 'You and permanents you control gain hexproof until end of turn.';

  test('the real line: the player, then each permanent', () => {
    expect(readAll(LINE, 'instant').spell).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'grantPlayerHexproof', player: { kind: 'you' }, duration: 'untilEndOfTurn' },
          {
            kind: 'grantKeyword',
            objects: { kind: 'each', filter: { zone: 'battlefield', controller: 'you' } },
            keyword: { kind: 'hexproof' },
            duration: 'untilEndOfTurn',
          },
        ],
      },
    });
  });

  test('another group (SYNTHETIC)', () => {
    expect(readAll('You and creatures you control gain hexproof until end of turn.', 'instant').spell).toMatchObject({
      effect: {
        effects: [
          { kind: 'grantPlayerHexproof' },
          { kind: 'grantKeyword', objects: { filter: { types: ['creature'], controller: 'you' } } },
        ],
      },
    });
  });

  test.each([
    'You and permanents you control gain hexproof.',
    'You and permanents you control gain shroud until end of turn.',
    'You and permanents you control gain hexproof and indestructible until end of turn.',
    'You and permanents your opponents control gain hexproof until end of turn.',
    'You and target creature gain hexproof until end of turn.',
    'You gain hexproof until end of turn.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'instant');
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('effect:grantPlayerHexproof', LINE, 'instant');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:grantPlayerHexproof');
    expect(DECLARED_NEEDS).toContain('effect:grantPlayerHexproof');
  });

  const PREVENT =
    'Prevent all damage that black and/or red sources would deal to creatures you control this turn.';

  test('the real second sentence: a shield for the damage of black or red sources to your creatures', () => {
    expect(readAll(PREVENT, 'instant').spell).toEqual({
      effect: {
        kind: 'preventDamage',
        scope: 'all',
        amount: 'all',
        duration: 'untilEndOfTurn',
        to: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
        byFilter: { anyOf: [{ colors: ['B'] }, { colors: ['R'] }] },
      },
    });
  });

  test('one color, a target and a scope (SYNTHETIC)', () => {
    expect(
      readAll('Prevent all combat damage that red sources would deal to target creature this turn.', 'instant').spell,
    ).toMatchObject({
      targets: [{ id: 't1' }],
      effect: {
        scope: 'combat',
        to: { kind: 'target', id: 't1' },
        byFilter: { colors: ['R'] },
      },
    });
  });

  test('the old source filter of creatures is untouched', () => {
    expect(
      readAll("Prevent all combat damage that would be dealt by creatures you don't control this turn.", 'instant')
        .spell,
    ).toMatchObject({ effect: { kind: 'preventDamage', to: { kind: 'any' } } });
  });

  test.each([
    'Prevent all damage that black and red sources would deal to creatures you control this turn.',
    'Prevent all damage that black and/or black sources would deal to creatures you control this turn.',
    'Prevent all damage that black and/or red sources would deal to creatures you control.',
    'Prevent all damage that black and/or red creatures would deal to creatures you control this turn.',
    'Prevent the next 3 damage that black and/or red sources would deal to creatures you control this turn.',
    'Prevent all damage that black and/or red sources would deal to two target creatures this turn.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'instant');
  });
});
