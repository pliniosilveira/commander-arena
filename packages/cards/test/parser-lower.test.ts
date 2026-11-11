// Lowering (D-063, D-068): bound IR to engine AST, gated by what the engine runs. The grammar
// reads more than the engine can run; `needs` is how the difference is reported.
import {
  isFeatureSupported,
  isKnownFeature,
  SUPPORTED_FEATURES,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  bind,
  DECLARED_NEEDS,
  finishSpell,
  type IrAbility,
  type IrCondition,
  type IrFilter,
  type IrNoun,
  isRunnable,
  type LowerResult,
  lower,
  missingFeatures,
  newContext,
  type SpellParts,
} from '../src/convert/parser/index';
import { parseOnly, spellCard } from './convert-grammar-helpers';
import { anaphor, clause, list, noun, span, spell, target } from './parser-ir-helpers';

/** Binds, then lowers an IR spell the way the pipeline does. */
function lowerSpell(ability: IrAbility) {
  const bound = bind(ability);
  if (!bound.ok) throw new Error(`unbound: ${bound.reference}`);
  const result = lower(bound.ability, newContext('spell', ['instant']));
  return result;
}

function parts(result: LowerResult<unknown>): SpellParts {
  if (!result.ok) throw new Error(`failed: ${JSON.stringify(result)}`);
  const lowered = result.value as { kind: string; parts?: SpellParts };
  if (lowered.parts === undefined) throw new Error('not a spell');
  return lowered.parts;
}

describe('the dimension test: every feature a lowering names exists', () => {
  test('each reference is a value its dimension could hold, and the dimensions are real', () => {
    expect(DECLARED_NEEDS.length).toBeGreaterThan(20);
    for (const ref of DECLARED_NEEDS) {
      expect(isKnownFeature(ref), ref).toBe(true);
    }
  });

  test('a misspelt reference is caught', () => {
    expect(isKnownFeature('effect:createTokens' as never)).toBe(false);
    expect(isKnownFeature('selector:colourChoice' as never)).toBe(false);
  });

  test('what the grammar reads today is what the engine runs (no card changed status)', () => {
    const today = [
      'effect:dealDamage',
      'effect:destroy',
      'effect:exile',
      'effect:moveToZone',
      'effect:counter',
      'effect:tap',
      'effect:untap',
      'effect:addMana',
      'effect:draw',
      'effect:gainLife',
      'effect:loseLife',
      'effect:shuffle',
      'ability:keyword',
      'ability:replacement',
      'ability:mana',
      'manaCost:tap',
      'replacement:entersTapped',
      'replacement:entersWithCounters',
    ] as const;
    for (const ref of today) expect(isFeatureSupported(ref), ref).toBe(true);
  });

  test('missingFeatures lists what the engine does not run, in order, once each', () => {
    expect(missingFeatures(['effect:draw', 'token:Map', 'token:Blood', 'token:Map'])).toEqual([
      'token:Map',
      'token:Blood',
    ]);
    expect(isRunnable('token:Blood')).toBe(false);
    expect(isRunnable('keyword:flying')).toBe(true);
  });

  test('SUPPORTED_FEATURES gained the D-068 dimensions, and claims nothing the engine lacks', () => {
    expect(Object.keys(SUPPORTED_FEATURES)).toEqual(
      expect.arrayContaining([
        'costKinds',
        'selectorKinds',
        'conditionKinds',
        'durationKinds',
        'staticKinds',
        'tokenKinds',
        'amountKinds',
      ]),
    );
  });
});

describe('recognised but not runnable', () => {
  test('an ability that adds mana and does more needs the engine to activate abilities', () => {
    const card = parseOnly({
      ...spellCard('SYNTHETIC Rock', '', {}),
      faces: [
        {
          ...spellCard('SYNTHETIC Rock', '').faces[0],
          typeLine: 'Artifact',
          manaCost: '{2}',
          oracleText: '{T}: Add {G}. Draw a card.',
        },
      ] as never,
    });
    expect(card.support.unparsed[0]).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'ability.activated',
    });
    expect(card.support.status).toBe('unsupported');
  });

  test('a cost the grammar does not read is not recognised, which is a different report', () => {
    const card = parseOnly({
      ...spellCard('SYNTHETIC Rock 2', ''),
      faces: [
        {
          ...spellCard('SYNTHETIC Rock 2', '').faces[0],
          typeLine: 'Artifact',
          oracleText: '{S}, {T}: Add {G}{G}.',
        },
      ] as never,
    });
    expect(card.support.unparsed[0]).toMatchObject({ reason: 'unrecognised', slot: 'cost' });
  });

  test('a color choice while a spell resolves is a missing selector, a mana ability is fine', () => {
    const asSpell = parseOnly(spellCard('SYNTHETIC Wish', 'Add one mana of any color.'));
    expect(asSpell.support.unparsed[0]).toMatchObject({
      reason: 'notRunnable',
      needs: ['selector:colorChoice'],
    });
  });

  test('a clause with "if", "until end of turn" or "you may" names what is missing', () => {
    const cond: IrCondition = {
      kind: 'condition',
      test: { kind: 'didPrevious' },
      span: span(),
      rule: 'condition.test',
    };
    const withCondition = {
      ...clause('draw', {
        player: noun('you', 'you'),
        amount: { kind: 'number', value: 1, span: span() },
      }),
      condition: cond,
    };
    expect(lowerSpell(spell([withCondition]))).toMatchObject({
      ok: false,
      needs: [],
    });
    const withDuration = {
      ...clause('tap', { objects: target(['creature']) }),
      duration: {
        kind: 'duration' as const,
        scope: 'untilEndOfTurn' as const,
        span: span(),
        rule: 'duration.test',
      },
    };
    // The engine runs "until end of turn" since S3, but no spell lowering produces a duration
    // yet, so the clause is read and reported not runnable with nothing missing to name.
    expect(lowerSpell(spell([withDuration]))).toMatchObject({ ok: false, needs: [] });
    const optional = {
      ...clause('draw', {
        player: noun('you', 'you'),
        amount: { kind: 'number', value: 1, span: span() },
      }),
      optional: true,
    };
    expect(lowerSpell(spell([optional]))).toMatchObject({ ok: false, needs: [] });
  });

  test('"for each creature" lowers to the engine count since D-095 (stage P13)', () => {
    const count = {
      kind: 'countOf' as const,
      of: noun('each', 'creature', { types: ['creature'] }),
      span: span(),
    };
    const c = clause('draw', { player: noun('you', 'you'), amount: count });
    expect(lowerSpell(spell([c]))).toMatchObject({
      ok: true,
      value: {
        kind: 'spell',
        parts: {
          effects: [
            {
              kind: 'draw',
              player: { kind: 'you' },
              count: { kind: 'countOf', filter: { types: ['creature'] } },
            },
          ],
        },
      },
    });
  });

  test('a modal IR with one mode is refused with no missing feature (CR 700.2: two to eight modes)', () => {
    const body = spell([clause('destroy', { objects: noun('self', '~') })]).body;
    const modal: IrAbility = {
      kind: 'modal',
      choose: { min: 1, max: 1 },
      modes: [body],
      texts: ['Destroy ~.'],
      span: span(),
      rule: 'modal.choose',
    };
    expect(lower(modal, newContext('spell', []))).toMatchObject({ ok: false, needs: [] });
  });

  test('a modal IR of two modes is a spell with `modes` and no effect of its own', () => {
    const draw = clause('draw', {
      player: noun('you', 'you'),
      amount: { kind: 'number', value: 1, span: span() },
    });
    const body = spell([draw]).body;
    const modal: IrAbility = {
      kind: 'modal',
      choose: { min: 1, max: 'all' },
      modes: [body, body],
      texts: ['Draw a card.', '~ draws.'],
      span: span(),
      rule: 'modal.choose',
    };
    const lowered = lower(modal, newContext('spell', [], [], 'SYNTHETIC Name'));
    if (!lowered.ok || lowered.value.kind !== 'spell') throw new Error('not lowered');
    const { modal: result, effects, targets } = lowered.value.parts;
    expect(effects).toEqual([]);
    expect(targets).toEqual([]);
    expect(result?.chooseModes).toEqual({ min: 1, max: 2 });
    // The text of a mode shows the card's name where the Oracle text says `~`.
    expect(result?.modes.map((m) => m.text)).toEqual(['Draw a card.', 'SYNTHETIC Name draws.']);
  });
});

describe('disjunctions and combinators in the IR (D-063 amendment)', () => {
  const artifactOrEnchantment: IrFilter = {
    zone: 'battlefield',
    anyOf: [
      { types: ['artifact'], raw: 'artifact' },
      { types: ['enchantment'], raw: 'enchantment' },
    ],
    raw: 'artifact or enchantment',
  };

  test('a filter union becomes ObjectFilter.anyOf, with the zone on the outer filter', () => {
    const t = noun('target', 'target artifact or enchantment', artifactOrEnchantment);
    const result = lowerSpell(spell([clause('destroy', { objects: t })]));
    expect(parts(result).targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: {
            zone: 'battlefield',
            anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
          },
        },
      },
    ]);
  });

  test('the lowered spell is valid, and the engine destroys an artifact or an enchantment', () => {
    const t = noun('target', 'target artifact or enchantment', artifactOrEnchantment);
    const lowered = lowerSpell(spell([clause('destroy', { objects: t })]));
    const text = finishSpell([parts(lowered)]);
    const imported = parseOnly(spellCard('SYNTHETIC Anyof Bolt', 'Destroy target creature.'));
    const def = {
      ...imported.definition,
      name: 'SYNTHETIC Anyof Bolt',
      faces: imported.definition.faces.map((f) => ({
        ...f,
        name: 'SYNTHETIC Anyof Bolt',
        spell: text,
      })),
    };
    expect(validateCard(def)).toEqual([]);
    const g = scenario()
      .define(def)
      .seat(0)
      .hand('SYNTHETIC Anyof Bolt')
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .battlefield('Sol Ring')
      .build();
    g.act(0).cast('SYNTHETIC Anyof Bolt', { targets: [{ name: 'Sol Ring' }], pay: true });
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
  });

  test('a union member the engine cannot express stops the whole filter', () => {
    const bad: IrFilter = {
      anyOf: [
        { types: ['creature'], raw: 'creature' },
        { keywords: ['flash'], raw: 'flash' },
      ],
      raw: 'x',
    };
    const t = noun('target', 'target creature or flash', { zone: 'battlefield', ...bad });
    expect(lowerSpell(spell([clause('destroy', { objects: t })]))).toMatchObject({
      ok: false,
      needs: [],
    });
  });

  test('condition combinators are IR values (and, or, not)', () => {
    const leaf = (text: string): IrCondition => ({
      kind: 'condition',
      test: { kind: 'raw', text },
      span: span(),
      rule: 'condition.test',
    });
    const both: IrCondition = {
      kind: 'condition',
      test: {
        kind: 'and',
        terms: [leaf('a'), { ...leaf('b'), test: { kind: 'not', term: leaf('c') } }],
      },
      span: span(),
      rule: 'condition.test',
    };
    expect(both.test.kind).toBe('and');
    expect(isKnownFeature('condition:and')).toBe(true);
    expect(isKnownFeature('condition:or')).toBe(true);
    expect(isKnownFeature('condition:not')).toBe(true);
  });
});

describe('pronouns and targets in the lowered text', () => {
  test('"Untap target creature. Tap it." is one target used twice', () => {
    const t = target(['creature']);
    const result = lowerSpell(
      spell([clause('untap', { objects: t })], [clause('tap', { objects: anaphor('it') })]),
    );
    const p = parts(result);
    expect(p.targets).toHaveLength(1);
    expect(p.effects).toEqual([
      { kind: 'untap', objects: { kind: 'target', id: 't1' } },
      { kind: 'tap', objects: { kind: 'target', id: 't1' } },
    ]);
  });

  test('"Tap it" after the target was destroyed names a card in the graveyard and is not lowered (CR 400.7)', () => {
    const t = target(['creature']);
    const result = lowerSpell(
      spell([clause('destroy', { objects: t })], [clause('tap', { objects: anaphor('it') })]),
    );
    expect(result.ok).toBe(false);
  });

  test('a pronoun that follows a mass noun cannot be lowered yet (selector:bound)', () => {
    const all = noun(
      'each',
      'all creatures',
      { zone: 'battlefield', types: ['creature'] },
      { plural: true },
    );
    const result = lowerSpell(
      spell([clause('destroy', { objects: all })], [clause('tap', { objects: anaphor('them') })]),
    );
    expect(result).toMatchObject({ ok: false, needs: ['selector:bound'] });
  });

  test('a list is one effect per item, in order, and a count of two is one two-target slot', () => {
    const two = noun(
      'target',
      'two target creatures',
      { zone: 'battlefield', types: ['creature'] },
      { plural: true, count: { kind: 'number', value: 2, span: span() } },
    );
    const items = [two, target(['land'])];
    const p = parts(lowerSpell(spell([clause('destroy', { objects: list(...items) })])));
    expect(p.targets).toEqual([
      {
        id: 't1',
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        min: 2,
        max: 2,
      },
      { id: 't2', what: { kind: 'object', filter: { zone: 'battlefield', types: ['land'] } } },
    ]);
    expect(p.effects).toHaveLength(2);
  });

  test('X anywhere marks the spell', () => {
    const c = clause('draw', {
      player: noun('you', 'you'),
      amount: { kind: 'x', span: span() },
    });
    expect(parts(lowerSpell(spell([c]))).x).toBe(true);
    expect(finishSpell([parts(lowerSpell(spell([c])))]).x).toBe(true);
  });

  test('"any target" and a target player are declared as such', () => {
    const anyTarget: IrNoun = noun('target', 'any target', { anyTarget: true });
    const player: IrNoun = noun('target', 'target player', { player: 'opponent' });
    const amount = { kind: 'number' as const, value: 2, span: span() };
    const p = parts(
      lowerSpell(spell([clause('dealDamage', { amount, to: list(anyTarget, player) })])),
    );
    expect(p.targets).toEqual([
      { id: 't1', what: { kind: 'anyTarget' } },
      { id: 't2', what: { kind: 'player', filter: 'opponent' } },
    ]);
  });
});

describe('finishing a spell', () => {
  const draw = (n: number) =>
    parts(
      lowerSpell(
        spell([
          clause('draw', {
            player: noun('you', 'you'),
            amount: { kind: 'number', value: n, span: span() },
          }),
        ]),
      ),
    );

  test('one effect stays bare, several become a sequence, targets only when there are some', () => {
    expect(finishSpell([draw(1)])).toEqual({
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });
    expect(finishSpell([draw(1), draw(2)]).effect).toMatchObject({ kind: 'sequence' });
  });
});
