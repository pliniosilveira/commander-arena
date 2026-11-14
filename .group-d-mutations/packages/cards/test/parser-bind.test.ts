// The binding pass (D-063, proposal 3.7): targets numbered in text order, pronouns bound to the
// most recent compatible antecedent, nothing guessed.
import { describe, expect, test } from 'vitest';
import { type BindResult, bind, type IrAbility, type IrNoun } from '../src/convert/parser/index';
import { anaphor, clause, clausesOf, list, noun, spell, target } from './parser-ir-helpers';

function bound(ability: IrAbility, options?: Parameters<typeof bind>[1]) {
  const r = bind(ability, options);
  if (!r.ok) throw new Error(`unexpected failure: ${r.reference}`);
  return r;
}

function failed(r: BindResult) {
  if (r.ok) throw new Error('expected an unbound reference');
  return r;
}

const refsOf = (ability: IrAbility, name: string): (string | undefined)[] =>
  clausesOf(ability).flatMap((c) => {
    const a = c.args[name];
    if (a?.kind === 'noun') return [a.ref];
    if (a?.kind === 'nounList') return a.items.map((n) => n.ref);
    return [];
  });

describe('targets', () => {
  test('are numbered in order of appearance, across sentences', () => {
    const a = target(['creature']);
    const b = target(['land']);
    const r = bound(spell([clause('destroy', { objects: a })], [clause('tap', { objects: b })]));
    expect(refsOf(r.ability, 'objects')).toEqual(['t1', 't2']);
    expect(r.targets.map((t) => t.ref)).toEqual(['t1', 't2']);
  });

  test('a list of operands is numbered in text order', () => {
    const items = [target(['artifact']), target(['creature']), target(['land'])];
    const r = bound(spell([clause('destroy', { objects: list(...items) })]));
    expect(refsOf(r.ability, 'objects')).toEqual(['t1', 't2', 't3']);
  });

  test('arguments are visited in text order, whatever order the rule listed them', () => {
    const first = target(['creature']);
    const second = target(['land']);
    // `to` is written first in the object but sits later in the text.
    const r = bound(spell([clause('move', { to: second, objects: first })]));
    expect(refsOf(r.ability, 'objects')).toEqual(['t1']);
    expect(refsOf(r.ability, 'to')).toEqual(['t2']);
  });

  test('one phrase used by two clauses is one target', () => {
    const player = noun('target', 'target player', { player: 'any' });
    const r = bound(spell([clause('draw', { player }), clause('loseLife', { player })]));
    expect(refsOf(r.ability, 'player')).toEqual(['t1', 't1']);
    expect(r.targets).toHaveLength(1);
  });

  test('the spell lines of a face share one numbering through the scope', () => {
    const scope = { targetCount: 0 };
    const one = bound(spell([clause('destroy', { objects: target(['creature']) })]), { scope });
    const two = bound(spell([clause('destroy', { objects: target(['land']) })]), { scope });
    expect(refsOf(one.ability, 'objects')).toEqual(['t1']);
    expect(refsOf(two.ability, 'objects')).toEqual(['t2']);
    expect(scope.targetCount).toBe(2);
  });

  test('~ is self, a mass noun is not a target', () => {
    const r = bound(
      spell([
        clause('destroy', { objects: noun('self', '~') }),
        clause('tap', { objects: noun('each', 'all creatures', { types: ['creature'] }) }),
      ]),
    );
    expect(refsOf(r.ability, 'objects')).toEqual(['self', 'm1']);
    expect(r.targets).toEqual([]);
  });
});

describe('pronouns', () => {
  test('"it" and "that creature" bind to the most recent singular object', () => {
    const r = bound(
      spell([
        clause('destroy', { objects: target(['land']) }),
        clause('exile', { objects: target(['creature']) }),
        clause('tap', { objects: anaphor('it') }),
        clause('untap', { objects: anaphor('that creature') }),
      ]),
    );
    expect(refsOf(r.ability, 'objects')).toEqual(['t1', 't2', 't2', 't2']);
  });

  test('"that creature" skips an antecedent that is not a creature', () => {
    const r = bound(
      spell([
        clause('destroy', { objects: target(['creature']) }),
        clause('exile', { objects: target(['land']) }),
        clause('tap', { objects: anaphor('that creature') }),
      ]),
    );
    expect(refsOf(r.ability, 'objects')).toEqual(['t1', 't2', 't1']);
  });

  test('"that permanent" and "that card" accept any singular object', () => {
    const r = bound(
      spell([
        clause('destroy', { objects: target(['land']) }),
        clause('tap', { objects: anaphor('that permanent') }),
        clause('untap', { objects: anaphor('that card') }),
      ]),
    );
    expect(refsOf(r.ability, 'objects')).toEqual(['t1', 't1', 't1']);
  });

  test('"that player" and "they" bind to the most recent player, not an object', () => {
    const player = noun('target', 'target player', { player: 'any' });
    const r = bound(
      spell([
        clause('draw', { player }),
        clause('destroy', { objects: target(['creature']) }),
        clause('loseLife', { player: anaphor('that player') }),
      ]),
    );
    expect(refsOf(r.ability, 'player')).toEqual(['t1', 't1']);
  });

  test('"those cards" and "them" bind to the most recent plural noun', () => {
    const many = noun('each', 'all creatures', { types: ['creature'] }, { plural: true });
    const r = bound(
      spell([clause('exile', { objects: many }), clause('tap', { objects: anaphor('them') })]),
    );
    // A mass noun is not a target but is still something a pronoun can follow: m1.
    expect(refsOf(r.ability, 'objects')).toEqual(['m1', 'm1']);
  });

  test('"the other" binds to the second of a count-two noun', () => {
    const two = noun(
      'target',
      'two target creatures',
      { types: ['creature'] },
      { plural: true, count: { kind: 'number', value: 2, span: { start: 0, end: 3 } } },
    );
    const r = bound(
      spell([
        clause('destroy', { objects: two }),
        clause('tap', { objects: anaphor('the other') }),
      ]),
    );
    expect(refsOf(r.ability, 'objects')).toEqual(['t1', 't1.2']);
  });

  test('a pronoun with nothing to refer to is a failure that names the words', () => {
    const r = failed(bind(spell([clause('tap', { objects: anaphor('it') })])));
    expect(r).toMatchObject({ reason: 'unboundReference', reference: 'it', rule: 'noun.test' });
  });

  test('a pronoun that no antecedent is compatible with is a failure, not a guess', () => {
    const r = failed(
      bind(
        spell([
          clause('destroy', { objects: target(['land']) }),
          clause('tap', { objects: anaphor('that creature') }),
        ]),
      ),
    );
    expect(r.reference).toBe('that creature');
  });

  test('"they" with only objects before it fails', () => {
    const r = failed(
      bind(
        spell([
          clause('destroy', { objects: target(['creature']) }),
          clause('loseLife', { player: anaphor('they') }),
        ]),
      ),
    );
    expect(r.reference).toBe('they');
  });

  test('a pronoun the pass does not know is not guessed', () => {
    const r = failed(bind(spell([clause('tap', { objects: anaphor('thereof') })])));
    expect(r.reference).toBe('thereof');
  });
});

describe('triggers and results', () => {
  const trigger = (subject: IrNoun, actor?: IrNoun): IrAbility => ({
    kind: 'triggered',
    trigger: {
      kind: 'trigger',
      event: 'dies',
      subject,
      ...(actor === undefined ? {} : { actor }),
      args: {},
      span: { start: 0, end: 4 },
      rule: 'trigger.test',
    },
    body: spell([clause('exile', { objects: anaphor('it') })]).body,
    span: { start: 0, end: 90 },
    rule: 'ability.triggered',
  });

  test('"it" in a trigger body is the trigger subject (CR 603.10a: it left the battlefield)', () => {
    const r = bound(trigger(noun('a', 'another creature you control', { types: ['creature'] })));
    const objects = clausesOf(r.ability)[0]?.args.objects;
    expect(objects).toMatchObject({ det: 'triggerSubject', ref: 'trig' });
  });

  test('"that player" in a trigger body is the trigger actor', () => {
    const ability = trigger(noun('a', 'a creature'), noun('eachOpponent', 'an opponent'));
    const withActor: IrAbility =
      ability.kind === 'triggered'
        ? {
            ...ability,
            body: spell([clause('loseLife', { player: anaphor('that player') })]).body,
          }
        : ability;
    const r = bound(withActor);
    expect(clausesOf(r.ability)[0]?.args.player).toMatchObject({
      det: 'triggerActor',
      ref: 'trigActor',
    });
  });

  test('a verb that declares a result can be referred to by a later pronoun', () => {
    const r = bound(
      spell([
        clause('search', { what: noun('a', 'a basic land card', { card: true }) }),
        clause('put', { objects: anaphor('it') }),
      ]),
      { bindingVerbs: new Set(['search']) },
    );
    expect(refsOf(r.ability, 'objects')).toEqual(['b1']);
  });

  test('without the declaration the pronoun follows the phrase, not a result', () => {
    const r = bind(
      spell([
        clause('search', { what: noun('a', 'a basic land card', { card: true }) }),
        clause('put', { objects: anaphor('it') }),
      ]),
    );
    // Without the declaration "it" follows the phrase "a basic land card" itself (m1), not a result.
    expect(r.ok).toBe(true);
    if (r.ok) expect(refsOf(r.ability, 'objects')).toEqual(['m1']);
  });
});

describe('modal modes', () => {
  const modalOf = (...modes: IrAbility[]): IrAbility => {
    const bodies = modes.map((m) => {
      if (m.kind !== 'spell') throw new Error('not a spell');
      return m.body;
    });
    return {
      kind: 'modal',
      choose: { min: 1, max: 1 },
      modes: bodies,
      texts: bodies.map(() => 'text'),
      span: { start: 0, end: 50 },
      rule: 'modal.choose',
    };
  };

  test('each mode is its own scope for pronouns, but the targets are numbered on (D-114)', () => {
    const modal = modalOf(
      spell([clause('destroy', { objects: target(['creature']) })]),
      spell([
        clause('destroy', { objects: target(['land']) }),
        clause('tap', { objects: anaphor('it') }),
      ]),
    );
    const r = bound(modal);
    if (r.ability.kind !== 'modal') throw new Error('not modal');
    const refs = r.ability.modes.map((m) =>
      m.sentences.flatMap((s) => s.clauses.map((c) => (c.args.objects as IrNoun).ref)),
    );
    // The ids are unique across the modes: the engine asks every chosen mode's targets together.
    expect(refs).toEqual([['t1'], ['t2', 't2']]);
  });

  test('the numbering goes on from the targets of the lines before it in the face', () => {
    const scope = { targetCount: 2 };
    const modal = modalOf(
      spell([clause('destroy', { objects: target(['creature']) })]),
      spell([clause('destroy', { objects: target(['land']) })]),
    );
    const r = bind(modal, { scope });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets.map((t) => t.ref)).toEqual(['t3', 't4']);
    expect(scope.targetCount).toBe(4);
  });

  test('a pronoun in a mode cannot refer to an earlier mode', () => {
    const modal = modalOf(
      spell([clause('destroy', { objects: target(['creature']) })]),
      spell([clause('tap', { objects: anaphor('it') })]),
    );
    expect(bind(modal).ok).toBe(false);
  });
});
