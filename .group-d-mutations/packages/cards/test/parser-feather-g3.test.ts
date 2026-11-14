// The Feather deck (issue 27), group 3 (D-437 to D-439): the cast triggers of Phalanx Leader and Tenth District Legionnaire ("Whenever you cast a spell that targets this
// creature, ..."), Danitha, Sword of Hope ("Whenever you cast an Equipment spell or a spell that targets a creature you control, draw a card. This ability triggers only once each turn."),
// Feather, the Redeemed ("exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step."), Zada, Hedron
// Grinder and Mirrorwing Dragon ("... that targets only this creature, copy that spell for each other creature you control that the spell could target. Each copy targets a different one of
// those creatures."). The real texts are the lines of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near
// misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-feather-g3.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

const SPELL = { kind: 'triggerSubject' } as const;
const THIS = { kind: 'this' } as const;

const trigger = (text: string, type: 'creature' | 'enchantment' = 'creature') =>
  readAll(text, type).abilities;

describe('"that targets ~" and "that targets only ~" (CR 115.1, 115.9c, 601.2i)', () => {
  const ADD = {
    kind: 'addCounters',
    objects: THIS,
    counter: '+1/+1',
    count: 1,
  } as const;

  test('the real line of Phalanx Leader: every creature you control gets a counter', () => {
    expect(
      trigger(
        'Whenever you cast a spell that targets this creature, put a +1/+1 counter on each creature you control.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', targetsObject: { isSource: true } },
          by: 'you',
        },
        effect: {
          kind: 'addCounters',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
          counter: '+1/+1',
          count: 1,
        },
      },
    ]);
  });

  test('the real line of Tenth District Legionnaire: a counter on it, then scry 1', () => {
    expect(
      trigger(
        'Whenever you cast a spell that targets this creature, put a +1/+1 counter on this creature, then scry 1.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', targetsObject: { isSource: true } },
          by: 'you',
        },
        effect: { kind: 'sequence', effects: [ADD, { kind: 'scry', count: 1 }] },
      },
    ]);
  });

  test('only it, for you and for a player (SYNTHETIC)', () => {
    const only = (who: string) =>
      trigger(
        `Whenever ${who} an instant or sorcery spell that targets only this creature, draw a card.`,
      );
    expect(only('you cast')[0]).toMatchObject({
      trigger: {
        kind: 'castSpell',
        filter: {
          stackKind: 'spell',
          targetsOnly: { isSource: true },
          anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
        },
        by: 'you',
      },
    });
    expect(only('a player casts')[0]).toMatchObject({ trigger: { by: 'any' } });
    expect(only('an opponent casts')[0]).toMatchObject({ trigger: { by: 'opponent' } });
  });

  test.each([
    'Whenever you cast a spell that targets this creature and a creature, draw a card.',
    'Whenever you cast a spell that targets only a creature, draw a card.',
    'Whenever you cast a spell that targets it, draw a card.',
    'Whenever you cast a spell that targets only, draw a card.',
    'Whenever you cast a spell that targets this creature or a creature you control, draw a card.',
    'Whenever you cast a spell that target this creature, draw a card.',
    'Whenever you cast spells that target this creature, draw a card.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the lowering names the engine feature it needs', () => {
    for (const ref of ['selector:isSource', 'selector:targetsOnly']) {
      const text = ref.endsWith('targetsOnly')
        ? 'Whenever you cast a spell that targets only this creature, draw a card.'
        : 'Whenever you cast a spell that targets this creature, draw a card.';
      const missing = withoutFeature(ref, text, 'creature');
      expect(missing, ref).toMatchObject({ reason: 'notRunnable' });
      expect(missing.needs, ref).toContain(ref);
    }
  });
});

describe('Danitha: "Whenever you cast an Equipment spell or a spell that targets a creature you control, draw a card." (CR 601.2i, 603.2, 115.1, 109.4)', () => {
  const LINE =
    'Whenever you cast an Equipment spell or a spell that targets a creature you control, draw a card. This ability triggers only once each turn.';

  test('the real line: a disjunction of the two kinds of spell, drawing once each turn', () => {
    expect(trigger(LINE)).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            stackKind: 'spell',
            anyOf: [
              { subtypes: ['Equipment'] },
              { targetsObject: { types: ['creature'], controller: 'you' } },
            ],
          },
          by: 'you',
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        oncePerTurn: true,
      },
    ]);
  });

  test('another type of spell and another kind of object (SYNTHETIC)', () => {
    expect(
      trigger(
        'Whenever you cast an artifact spell or a spell that targets a permanent, draw a card.',
      )[0],
    ).toMatchObject({
      trigger: {
        filter: { anyOf: [{ types: ['artifact'] }, { targetsObject: {} }] },
      },
    });
  });

  test.each([
    'Whenever you cast an Equipment spell or a spell that targets a creature you control or, draw a card.',
    'Whenever you cast an Equipment spell or a spell, draw a card.',
    'Whenever you cast an Equipment spell or a creature spell that targets a creature you control, draw a card.',
    'Whenever you cast an Aura or Equipment spell or a spell that targets a creature you control, draw a card.',
    'Whenever you cast an Equipment spell that targets a creature or a spell that targets a land, draw a card.',
    'Whenever you cast an Equipment spell or a spell that targets a creature you don’t control, draw a card.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the lowering names the engine feature it needs', () => {
    const missing = withoutFeature('selector:targetsObject', LINE, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:targetsObject');
  });
});

describe('Feather: "exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step." (CR 614.1a, 608.2n, 603.7)', () => {
  const LINE =
    'Whenever you cast an instant or sorcery spell that targets a creature you control, exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step.';

  test('the real line: the engine exileOnResolve of the spell that was cast', () => {
    expect(trigger(LINE)).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            stackKind: 'spell',
            anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
            targetsObject: { types: ['creature'], controller: 'you' },
          },
          by: 'you',
        },
        effect: { kind: 'exileOnResolve', spell: SPELL },
      },
    ]);
  });

  test.each([
    // without the sentence about the return, or with another return
    'Whenever you cast an instant or sorcery spell, exile that card instead of putting it into your graveyard as it resolves.',
    'Whenever you cast an instant or sorcery spell, exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of your next end step.',
    'Whenever you cast an instant or sorcery spell, exile that card instead of putting it into your graveyard as it resolves. If you do, return it to the battlefield at the beginning of the next end step.',
    'Whenever you cast an instant or sorcery spell, exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand.',
    // another object, another graveyard
    'Whenever you cast an instant or sorcery spell, exile that spell instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step.',
    "Whenever you cast an instant or sorcery spell, exile that card instead of putting it into its owner's graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the lowering names the engine feature it needs', () => {
    const missing = withoutFeature('effect:exileOnResolve', LINE, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:exileOnResolve');
  });
});

describe('Zada and Mirrorwing Dragon: copy that spell for each other creature that the spell could target (CR 707.10, 707.10e, 115.3)', () => {
  const COPIES =
    'copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures.';
  const THEIRS =
    'that player copies that spell for each other creature they control that the spell could target. Each copy targets a different one of those creatures.';

  test('the real line of Zada: a copy for each other creature you control', () => {
    expect(
      trigger(
        `Whenever you cast an instant or sorcery spell that targets only this creature, ${COPIES}`,
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            stackKind: 'spell',
            anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
            targetsOnly: { isSource: true },
          },
          by: 'you',
        },
        effect: {
          kind: 'copySpell',
          spell: SPELL,
          newTargets: 'no',
          forEach: { types: ['creature'], controller: 'you', other: true },
        },
      },
    ]);
  });

  test('the real line of Mirrorwing Dragon: that player copies it for each other creature they control', () => {
    expect(
      trigger(
        `Whenever a player casts an instant or sorcery spell that targets only this creature, ${THEIRS}`,
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            stackKind: 'spell',
            anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
            targetsOnly: { isSource: true },
          },
          by: 'any',
        },
        effect: {
          kind: 'copySpell',
          spell: SPELL,
          newTargets: 'no',
          forEach: { types: ['creature'], controller: 'triggerPlayer', other: true },
          copier: 'triggerPlayer',
        },
      },
    ]);
  });

  test.each([
    // one of the two sentences, or something joined to them
    'copy that spell for each other creature you control that the spell could target.',
    'copy that spell for each other creature you control that the spell could target. You may choose new targets for the copies.',
    'copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures and you draw a card.',
    // another set of creatures, another count
    'copy that spell for each other creature you control. Each copy targets a different one of those creatures.',
    'copy that spell for each creature you control that the spell could target. Each copy targets a different one of those creatures.',
    'copy that spell for each other creature your opponents control that the spell could target. Each copy targets a different one of those creatures.',
    'copy that spell for each other artifact you control that the spell could target. Each copy targets a different one of those creatures.',
    // the pronoun does not agree with who copies
    'copy that spell for each other creature they control that the spell could target. Each copy targets a different one of those creatures.',
    'that player copies that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures.',
    // another object
    'copy it for each other creature you control that the spell could target. Each copy targets a different one of those creatures.',
    'copy target spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(
      `Whenever you cast an instant or sorcery spell that targets only this creature, ${text}`,
      'creature',
    );
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the copies are not read in a trigger that is not about a spell cast, nor in a spell text', () => {
    expect(read(`When this creature dies, ${COPIES}`, 'creature').abilities).toEqual([]);
    expect(read(COPIES.replace(/^copy/, 'Copy'), 'instant').spell).toBeNull();
  });

  test('the lowering names the engine feature it needs', () => {
    const text = `Whenever you cast an instant or sorcery spell that targets only this creature, ${COPIES}`;
    const missing = withoutFeature('selector:copyForEach', text, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:copyForEach');
  });
});
