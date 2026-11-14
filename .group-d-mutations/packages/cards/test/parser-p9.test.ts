// Stage P9 (class T gaps of `reports/template-replay.md`): wordings the grammar did not read although
// the engine already runs everything they mean. Each line is read through the whole pipeline and
// compared with the engine AST written out here, and each near miss says where it stops. The lines
// are the real example lines of the replay report (reports/template-replay.md, built from the
// owner's templates.json) unless a note says SYNTHETIC; no Oracle text of a real card is copied
// beyond those shapes, and no real card is marked supported here. That the engine runs what is
// lowered is in convert-grammar-engine-p9.test.ts.
import type { Ability, ObjectFilter } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { compileLine, DECLARED_NEEDS, segment } from '../src/convert/parser/index';
import { dropped, readAll, SET, spellEffect, T1, THIS } from './parser-p5-helpers';

const target = (filter: ObjectFilter) => ({ id: 't1', what: { kind: 'object', filter } }) as const;

describe('target spell: the filter of the spells on the stack (CR 115.1, 205.2a, 701.6)', () => {
  const counters = (text: string) => {
    const spell = readAll(text).spell;
    expect(spell?.effect).toEqual({ kind: 'counter', objects: T1 });
    return spell?.targets;
  };

  test.each([
    ['Counter target spell.', { zone: 'stack', stackKind: 'spell' }],
    [
      'Counter target noncreature spell.',
      { zone: 'stack', notTypes: ['creature'], stackKind: 'spell' },
    ],
    ['Counter target creature spell.', { zone: 'stack', types: ['creature'], stackKind: 'spell' }],
    ['Counter target artifact spell.', { zone: 'stack', types: ['artifact'], stackKind: 'spell' }],
    ['Counter target blue spell.', { zone: 'stack', colors: ['U'], stackKind: 'spell' }],
    [
      'Counter target legendary spell.',
      { zone: 'stack', supertypes: ['legendary'], stackKind: 'spell' },
    ],
    ['Counter target Aura spell.', { zone: 'stack', subtypes: ['Aura'], stackKind: 'spell' }],
    [
      'Counter target instant or sorcery spell.',
      {
        zone: 'stack',
        stackKind: 'spell',
        anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
      },
    ],
    [
      'Counter target enchantment, instant, or sorcery spell.',
      {
        zone: 'stack',
        stackKind: 'spell',
        anyOf: [{ types: ['enchantment'] }, { types: ['instant'] }, { types: ['sorcery'] }],
      },
    ],
  ] as const)('%s', (text, filter) => {
    expect(counters(text)).toEqual([target(filter as ObjectFilter)]);
  });

  test.each([
    ['Counter target spell with mana value X or less.', 'with mana value X or less.'],
    ['Counter target spells.', 'spells.'],
    ['Counter target spell or ability.', 'or ability.'],
    ['Counter target tapped spell.', 'spell.'],
    ['Counter target creature or spell.', 'spell.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('"its controller" and "equal to its power" (CR 109.4, 208.1, 608.2h)', () => {
  test('the controller of the target is a player selector', () => {
    const spell = readAll(
      'Destroy target artifact or enchantment. Its controller gains 4 life.',
    ).spell;
    expect(spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: T1 },
        { kind: 'gainLife', player: { kind: 'controllerOf', of: T1 }, amount: 4 },
      ],
    });
  });

  test('"that creature\'s controller" is the same selector, and the verbs of the other players follow it', () => {
    expect(
      spellEffect("Destroy target creature. That creature's controller loses 2 life."),
    ).toMatchObject({
      effects: [
        { kind: 'destroy' },
        { kind: 'loseLife', player: { kind: 'controllerOf', of: T1 } },
      ],
    });
    expect(
      spellEffect('Destroy target creature. Its controller draws a card and loses 1 life.'),
    ).toMatchObject({
      effects: [
        { kind: 'destroy' },
        { kind: 'draw', player: { kind: 'controllerOf', of: T1 } },
        { kind: 'loseLife', player: { kind: 'controllerOf', of: T1 } },
      ],
    });
  });

  test('a pronoun with nothing to refer to is an unbound reference, not a guess', () => {
    expect(dropped('Its controller gains 4 life.')).toMatchObject({ reason: 'unboundReference' });
  });

  test('"equal to its power" is read for any object, and lowered for ~ and for a target (D-092)', () => {
    expect(
      readAll('Whenever ~ attacks, you gain life equal to its power.', 'creature').abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS },
        effect: {
          kind: 'gainLife',
          player: { kind: 'you' },
          amount: { kind: 'powerOf', of: THIS },
        },
      },
    ]);
    expect(
      readAll("Whenever ~ attacks, you gain life equal to ~'s power.", 'creature').abilities,
    ).toHaveLength(1);
    // The same words about a target lower since the engine reads a target's power with last-known
    // information (D-092, stage P11: the lowered shapes are in parser-p11.test.ts).
    expect(
      spellEffect('Exile target creature. Its controller gains life equal to its power.'),
    ).toMatchObject({ kind: 'sequence' });
    expect(
      spellEffect("Destroy target creature. You gain life equal to that creature's power."),
    ).toMatchObject({ kind: 'sequence' });
  });

  test.each([
    ['You gain life equal to its loyalty.', 'equal to its loyalty.'],
    [
      'You gain life equal to the power of target creature.',
      'equal to the power of target creature.',
    ],
    ['Its owner gains 4 life.', 'Its owner gains 4 life.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('effect.life: "gain N life" and "lose N life" with no subject of their own', () => {
  test('after "you may" and after "and"', () => {
    expect(
      readAll('Whenever another creature enters, you may gain 1 life.', 'creature').abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { types: ['creature'], other: true } },
        optional: true,
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ]);
    expect(spellEffect('Draw two cards and lose 2 life.')).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: 2 },
        { kind: 'loseLife', player: { kind: 'you' }, amount: 2 },
      ],
    });
  });

  test('"you may lose 1 life" is optional like any other', () => {
    expect(readAll('When ~ enters, you may lose 1 life.', 'creature').abilities).toMatchObject([
      { optional: true, effect: { kind: 'loseLife', amount: 1 } },
    ]);
  });

  test.each([
    ['Gain life.', 'life.'],
    ['Gain a life.', 'a life.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ stoppedAt });
  });
});

describe('trigger.cast: "Whenever you cast ... spell" (CR 601.2i)', () => {
  const cast = (text: string): Ability => {
    const [ability, ...more] = readAll(text, 'creature').abilities;
    expect(more).toEqual([]);
    if (ability === undefined) throw new Error(`"${text}" has no ability`);
    return ability;
  };
  const gain = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } as const;

  test.each([
    [
      'Whenever you cast a spell, you gain 1 life.',
      { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
    ],
    [
      'Whenever you cast a creature spell, you gain 1 life.',
      { kind: 'castSpell', filter: { types: ['creature'], stackKind: 'spell' }, by: 'you' },
    ],
    [
      'Whenever you cast a noncreature spell, you gain 1 life.',
      { kind: 'castSpell', filter: { notTypes: ['creature'], stackKind: 'spell' }, by: 'you' },
    ],
    [
      'Whenever you cast an instant or sorcery spell, you gain 1 life.',
      {
        kind: 'castSpell',
        filter: { stackKind: 'spell', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
        by: 'you',
      },
    ],
    [
      'Whenever you cast an Aura or Equipment spell, you gain 1 life.',
      {
        kind: 'castSpell',
        filter: {
          stackKind: 'spell',
          anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
        },
        by: 'you',
      },
    ],
    [
      'Whenever a player casts a spell, you gain 1 life.',
      { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'any' },
    ],
    [
      'Whenever a player casts an enchantment spell, you gain 1 life.',
      { kind: 'castSpell', filter: { types: ['enchantment'], stackKind: 'spell' }, by: 'any' },
    ],
  ] as const)('%s', (text, trigger) => {
    expect(cast(text)).toEqual({ kind: 'triggered', trigger, effect: gain });
  });

  test('the effects of the body are read as for any trigger ("~ deals", "you may")', () => {
    expect(
      cast('Whenever you cast a noncreature spell, ~ deals 1 damage to each opponent.'),
    ).toMatchObject({
      effect: { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } },
    });
    expect(cast('Whenever you cast an enchantment spell, you may draw a card.')).toMatchObject({
      optional: true,
      effect: { kind: 'draw' },
    });
  });

  test.each([
    [
      'Whenever an opponent casts their first spell each turn, you gain 1 life.',
      'their first spell each turn, you gain 1 life.',
    ],
    [
      'Whenever you cast a creature spell of the chosen player, you gain 1 life.',
      'of the chosen player, you gain 1 life.',
    ],
    [
      'Whenever you cast your first spell each turn, you gain 1 life.',
      'your first spell each turn, you gain 1 life.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });

  test('a list of three types stops at its first comma: the segmenter ends a trigger there', () => {
    const text = 'Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.';
    expect(segment(text, 'permanent').trigger).toBeDefined();
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test('"it" in the body is the spell that was cast, which the engine cannot name as a permanent', () => {
    expect(
      dropped('Whenever you cast a creature spell, put a +1/+1 counter on it.', 'creature'),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('trigger.or-subjects: "~ or another creature dies" (CR 603.2c, 700.4)', () => {
  const body = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } as const;

  test('one engine ability per subject, with the same effect', () => {
    expect(
      readAll('Whenever ~ or another creature you control dies, you gain 1 life.', 'creature')
        .abilities,
    ).toEqual([
      { kind: 'triggered', trigger: { kind: 'dies', what: THIS }, effect: body },
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { types: ['creature'], controller: 'you', other: true } },
        effect: body,
      },
    ]);
  });

  test('entering and attacking work the same way; a target in the body is declared on both', () => {
    expect(
      readAll('Whenever ~ or another creature enters, you gain 1 life.', 'creature').abilities,
    ).toMatchObject([
      { trigger: { kind: 'entersBattlefield', what: THIS } },
      { trigger: { kind: 'entersBattlefield', what: { types: ['creature'], other: true } } },
    ]);
    const both = readAll(
      'Whenever ~ or another creature dies, target player loses 1 life and you gain 1 life.',
      'creature',
    ).abilities;
    expect(both).toHaveLength(2);
    for (const ability of both) {
      expect(ability).toMatchObject({
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      });
    }
  });

  test.each([
    ['Whenever ~ or a creature dies, you gain 1 life.', 'dies, you gain 1 life.'],
    ['Whenever another creature or ~ dies, you gain 1 life.', 'or ~ dies, you gain 1 life.'],
    ['Whenever ~ or another creature, you gain 1 life.', ', you gain 1 life.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('trigger.end-step: "the beginning of the end step" is every end step (CR 513.1a)', () => {
  test('the bare "the end step" has no owner: each', () => {
    expect(readAll('At the beginning of the end step, sacrifice ~.', 'creature').abilities).toEqual(
      [
        {
          kind: 'triggered',
          trigger: { kind: 'endStep', whose: 'each' },
          effect: { kind: 'sacrifice', objects: THIS },
        },
      ],
    );
  });

  test("the upkeep, the next end step and an opponent's end step are still not read", () => {
    for (const [text, stoppedAt] of [
      ['At the beginning of the upkeep, you gain 1 life.', 'upkeep, you gain 1 life.'],
      ['At the beginning of the next end step, sacrifice ~.', 'next end step, sacrifice ~.'],
    ]) {
      expect(dropped(text ?? '', 'creature'), text).toMatchObject({ stoppedAt });
    }
  });
});

describe('conditions: "you control a legendary creature", "three or more other Islands" (CR 614.12, 603.4)', () => {
  const unless = (text: string) => {
    const [ability] = readAll(text, 'creature').abilities;
    return ability?.kind === 'replacement' && ability.replacement.kind === 'entersTapped'
      ? ability.replacement.unless
      : undefined;
  };

  test.each([
    [
      '~ enters tapped unless you control a legendary creature.',
      { types: ['creature'], supertypes: ['legendary'] },
      1,
    ],
    [
      '~ enters tapped unless you control a basic land.',
      { types: ['land'], supertypes: ['basic'] },
      1,
    ],
    ['~ enters tapped unless you control an artifact.', { types: ['artifact'] }, 1],
    [
      '~ enters tapped unless you control an artifact or creature.',
      { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] },
      1,
    ],
    [
      '~ enters tapped unless you control three or more other Islands.',
      { subtypes: ['Island'], other: true },
      3,
    ],
    ['~ enters tapped unless you control two or more Plains.', { subtypes: ['Plains'] }, 2],
  ] as const)('%s', (text, filter, count) => {
    expect(unless(text)).toEqual({
      kind: 'controlsAtLeast',
      filter: filter as ObjectFilter,
      count,
    });
  });

  test('the intervening "if" of a trigger takes the same condition (CR 603.4)', () => {
    expect(
      readAll('When ~ enters, if you control a legendary creature, you gain 1 life.', 'creature')
        .abilities,
    ).toMatchObject([
      {
        interveningIf: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], supertypes: ['legendary'] },
          count: 1,
        },
      },
    ]);
  });

  test.each([
    ['~ enters tapped unless you control a creature with flying or reach.', 'or reach.'],
    [
      '~ enters tapped unless you control a creature with power greater than 3.',
      'with power greater than 3.',
    ],
    ["~ enters tapped unless you control a creature you don't control.", "you don't control."],
    [
      // Read since stage P73 (D-236) with "or more"; "or fewer" is not read.
      '~ enters tapped unless your opponents control eight or fewer lands.',
      'or fewer lands.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('"it deals N damage to ..." (CR 120.2, 113.7a): "it" must be ~ itself', () => {
  const to = (recipient: object) => ({ kind: 'dealDamage', amount: 1, to: recipient });

  test.each([
    ['Whenever ~ becomes tapped, it deals 1 damage to you.', 'becomesTapped', to({ kind: 'you' })],
    [
      'Whenever ~ attacks, it deals 1 damage to each opponent.',
      'attacks',
      to({ kind: 'eachOpponent' }),
    ],
  ] as const)('%s', (text, kind, effect) => {
    expect(readAll(text, 'creature').abilities).toEqual([
      { kind: 'triggered', trigger: { kind, what: THIS }, effect },
    ]);
  });

  test('with a target: it is declared as for any trigger', () => {
    expect(
      readAll('When ~ enters, it deals 1 damage to target opponent.', 'creature').abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
        effect: to({ kind: 'target', id: 't1' }),
      },
    ]);
  });

  test('after "Remove a counter from ~:" the permanent is still there, and "it" is it', () => {
    expect(
      readAll('Remove a +1/+1 counter from ~: It deals 1 damage to any target.', 'creature')
        .abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'removeCounters', counter: '+1/+1', count: 1 }],
        targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
        effect: to({ kind: 'target', id: 't1' }),
      },
    ]);
  });

  test('after "Sacrifice ~:" "it" has nothing to mean: refused, not guessed', () => {
    expect(dropped('Sacrifice ~: It deals 1 damage to any target.', 'creature')).toMatchObject({
      reason: 'unboundReference',
    });
  });

  // Stage P28 (D-131): the engine's `dealDamage.from` names the creature that deals the damage, so "it" in a "dies"
  // trigger (the creature that died, as it last existed, CR 603.10a, 113.7a) and "it" as a target of the spell are
  // read (they were refused before the engine could say them).
  test('in a "dies" trigger "it" is the creature that died: the damage is dealt from it', () => {
    expect(readAll('When ~ dies, it deals 1 damage to you.', 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: THIS },
        effect: { ...to({ kind: 'you' }), from: { kind: 'triggerSubject' } },
      },
    ]);
  });

  test('a target\'s "it" is the damage source: the damage is dealt from the target', () => {
    expect(
      readAll(
        'Target creature you control gets +1/+1 until end of turn. It deals 1 damage to you.',
        'instant',
      ).spell?.effect,
    ).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'modifyPt' },
        { kind: 'dealDamage', to: { kind: 'you' }, from: { kind: 'target', id: 't1' } },
      ],
    });
  });

  test('"it deals 4 damage" with no recipient is still only the "instead" of a damage sentence', () => {
    expect(dropped('It deals 4 damage.').reason).not.toBe('read');
  });
});

describe('effect.attach: "attach it to target creature you control" (CR 701.3)', () => {
  test('the object is this Equipment, the destination one target', () => {
    for (const text of [
      'When ~ enters, attach it to target creature you control.',
      'When ~ enters, attach ~ to target creature you control.',
    ]) {
      expect(readAll(text, 'artifact', ['Equipment']).abilities, text).toEqual([
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: THIS },
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
              },
            },
          ],
          effect: { kind: 'attach', object: THIS, to: T1 },
        },
      ]);
    }
  });

  test('a legendary creature is a modifier of the target phrase', () => {
    expect(
      readAll('When ~ enters, attach it to target legendary creature you control.', 'artifact', [
        'Equipment',
      ]).abilities,
    ).toMatchObject([
      {
        targets: [
          {
            what: {
              filter: { types: ['creature'], supertypes: ['legendary'], controller: 'you' },
            },
          },
        ],
      },
    ]);
  });

  test.each([
    // The plural is read and refused: the diagnostic stops after what was read.
    ['When ~ enters, attach it to two target creatures.', '.'],
    ['When ~ enters, attach it to each creature you control.', 'each creature you control.'],
    [
      'When ~ enters, attach target Equipment to target creature.',
      'target Equipment to target creature.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'artifact', ['Equipment'])).toMatchObject({ stoppedAt });
  });

  test('a spell cannot attach itself, and a dies trigger has no permanent left to attach', () => {
    expect(dropped('Attach ~ to target creature.', 'instant').reason).toBe('notRunnable');
    expect(
      dropped('When ~ dies, attach ~ to target creature you control.', 'artifact', ['Equipment']),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('"~" as the object of tap, untap, destroy, exile and return (CR 701.26, 701.8, 406.1)', () => {
  const activated = (text: string) => {
    const [ability] = readAll(text, 'creature').abilities;
    return ability?.kind === 'activated' ? ability.effect : undefined;
  };

  test.each([
    ['{3}: Untap ~.', { kind: 'untap', objects: THIS }],
    ['{3}: Tap ~.', { kind: 'tap', objects: THIS }],
    ['{3}: Exile ~.', { kind: 'exile', objects: THIS }],
    ['{3}: Destroy ~.', { kind: 'destroy', objects: THIS }],
    ["{W}: Return ~ to its owner's hand.", { kind: 'moveToZone', objects: THIS, to: 'hand' }],
  ] as const)('%s', (text, effect) => {
    expect(activated(text)).toEqual(effect);
  });

  test('a spell may exile itself and nothing else of itself', () => {
    expect(spellEffect('Exile ~.', 'instant')).toEqual({
      kind: 'exile',
      objects: { kind: 'thisSpell' },
    });
    expect(spellEffect('Exile ~.', 'sorcery')).toEqual({
      kind: 'exile',
      objects: { kind: 'thisSpell' },
    });
    for (const text of ['Untap ~.', "Return ~ to its owner's hand.", 'Destroy ~.', 'Tap ~.']) {
      expect(dropped(text, 'instant'), text).toMatchObject({ reason: 'notRunnable' });
    }
  });

  test('it is not read where ~ is gone by the time the effect runs (CR 400.7)', () => {
    for (const text of [
      "Sacrifice ~: Return ~ to its owner's hand.",
      '{T}, Sacrifice ~: Untap ~.',
      "When ~ dies, return ~ to its owner's hand.",
      'When ~ dies, exile ~.',
    ]) {
      expect(dropped(text, 'creature'), text).toMatchObject({ reason: 'notRunnable' });
    }
  });

  test('a flicker of ~ ("Exile ~, then return it") is still not read', () => {
    expect(
      dropped(
        'III — Exile ~, then return it to the battlefield transformed under your control.',
        'enchantment',
      ).reason,
    ).toBe('unrecognised');
  });
});

describe('"up to N target": a choice of none (CR 115.2)', () => {
  test('the target slot has no minimum', () => {
    const [ability] = readAll(
      'When ~ enters, destroy up to one target artifact or enchantment.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      targets: [
        {
          id: 't1',
          min: 0,
          max: 1,
          what: {
            kind: 'object',
            filter: {
              zone: 'battlefield',
              anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
            },
          },
        },
      ],
      effect: { kind: 'destroy', objects: T1 },
    });
  });

  test('more than one takes the plural; graveyard cards too', () => {
    expect(readAll('Destroy up to two target creatures.').spell?.targets).toEqual([
      {
        id: 't1',
        min: 0,
        max: 2,
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
      },
    ]);
    expect(
      readAll('Return up to three target land cards from your graveyard to your hand.').spell
        ?.targets,
    ).toEqual([
      {
        id: 't1',
        min: 0,
        max: 3,
        what: {
          kind: 'object',
          filter: { zone: 'graveyard', types: ['land'], controller: 'you' },
        },
      },
    ]);
  });

  test.each([
    ['Destroy up to one target creatures.', 'creatures.'],
    ['Destroy up to two target creature.', 'creature.'],
    ['Destroy up to target creature.', 'target creature.'],
    ['Destroy up to zero target creatures.', 'zero target creatures.'],
    ['Put a +1/+1 counter on each of up to one target creatures.', 'creatures.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('effect.put-library: a card on top of a library (CR 401.1, 401.3)', () => {
  const moved = (text: string) => spellEffect(text);

  test("a card of your graveyard goes on top of your library; any graveyard, its owner's", () => {
    expect(
      moved('Put target enchantment card from your graveyard on top of your library.'),
    ).toEqual({
      kind: 'moveToZone',
      objects: T1,
      to: 'library',
      position: 'top',
    });
    expect(moved("Put target card from a graveyard on top of its owner's library.")).toEqual({
      kind: 'moveToZone',
      objects: T1,
      to: 'library',
      position: 'top',
    });
    expect(
      moved(
        "Put target creature card from an opponent's graveyard on the bottom of its owner's library.",
      ),
    ).toMatchObject({ position: 'bottom' });
  });

  test('a permanent goes to its owner\'s library; "~" is this permanent', () => {
    expect(moved("Put target nonland permanent on top of its owner's library.")).toMatchObject({
      to: 'library',
      position: 'top',
    });
    const [ability] = readAll(
      "{T}: Put ~ on the bottom of its owner's library.",
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      effect: { kind: 'moveToZone', objects: THIS, to: 'library', position: 'bottom' },
    });
  });

  test.each([
    ['Put target card from a graveyard on top of your library.'],
    ['Put target creature on top of your library.'],
    ["Put target creature card from an opponent's graveyard on top of your library."],
  ])('%s stops at "your library."', (text) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt: 'your library.' });
  });
});

describe('Enchant <basic land type> (CR 205.3i, 702.5a)', () => {
  test('a basic land type is the subtype of the enchant filter', () => {
    for (const type of ['Forest', 'Island', 'Plains', 'Swamp', 'Mountain']) {
      expect(readAll(`Enchant ${type}`, 'enchantment', ['Aura']).abilities).toEqual([
        { kind: 'keyword', keyword: { kind: 'enchant', filter: { subtypes: [type] } } },
      ]);
    }
  });

  test.each([
    ['Enchant Forest or Island', 'or Island'],
    ['Enchant forest', 'forest'],
    ['Enchant Dragon', 'Dragon'],
    ['Enchant Forests', 'Forests'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'enchantment', ['Aura'])).toMatchObject({ stoppedAt });
  });
});

describe('the lowerings of this stage declare the features they need', () => {
  test('the cast trigger, the attach effect and the moves are named for the dimension test', () => {
    for (const ref of [
      'trigger:castSpell',
      'effect:attach',
      'effect:moveToZone',
      'selector:controllerOf',
    ]) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });

  test('a recognised line lists the rules that read it', () => {
    const result = compileLine('Whenever you cast a creature spell, you gain 1 life.', {
      rules: SET,
      face: 'permanent',
      faceTypes: ['creature'],
    });
    expect(result.ok ? result.recognised : []).toEqual(
      expect.arrayContaining(['trigger.cast', 'effect.player']),
    );
  });
});
