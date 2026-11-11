// Diagnostics v2 (D-064): every ability that is dropped says why, in one of three ways, and
// carries the slot, the rules that matched, the missing engine features and the template. The
// schema 1 fields (face, ability, text, stoppedAt, closestRule) are always there and mean what
// they did. No phrase rule reads a pronoun, and none yields a trigger event the lowering does not
// know, so those paths are exercised with rules defined here, which is also what a new rule looks
// like.
import { describe, expect, test } from 'vitest';
import {
  ALL_RULES,
  buildRuleSet,
  compileLine,
  defineRule,
  family,
  type IrAbility,
  type IrTrigger,
  literal,
  map,
  type PhraseRule,
  parseFaceText,
  readLine,
} from '../src/convert/parser/index';
import { node } from '../src/convert/parser/rules/registry';
import { parseOnly, spellCard } from './convert-grammar-helpers';
import { anaphor } from './parser-ir-helpers';

const OPTS = { name: 'SYNTHETIC Card', legendary: false };

/**
 * "~ test-event": a SYNTHETIC trigger rule written for these tests. Its event is one no lowering
 * knows, which is what a trigger the grammar reads before the engine can run it looks like.
 */
const TRIGGER_TEST_EVENT = defineRule<IrTrigger>({
  id: 'trigger.test-event',
  family: 'trigger',
  leading: ['~'],
  cites: ['CR 603.6a (Handling Triggered Abilities)'],
  examples: ['~ test-event'],
  rejects: ['~ attacks'],
  parse: node<string, IrTrigger>(
    'trigger.test-event',
    map(literal('~ test-event'), (raw) => raw),
    (raw) => ({
      kind: 'trigger',
      event: 'test-event',
      subject: {
        kind: 'noun',
        det: 'self',
        filter: { raw: '~' },
        upTo: false,
        plural: false,
        other: false,
        span: { start: 0, end: 0 },
        rule: 'trigger.test-event',
      },
      args: {},
      ...{ raw },
    }),
  ),
});

/** "tap it": an effect with a pronoun, for the binding diagnostics. */
const TAP_IT = defineRule<readonly import('../src/convert/parser/index').IrClause[]>({
  id: 'effect.test-tap-it',
  family: 'effect',
  leading: ['tap'],
  cites: ['CR 701.26 (Tap and Untap)'],
  examples: ['tap it'],
  rejects: ['tap that'],
  parse: (ctx, pos) => {
    const r = literal('tap it')(ctx, pos);
    if (!r.ok) return r;
    const it = {
      ...anaphor('it'),
      span: { start: pos + 4, end: r.pos },
      rule: 'effect.test-tap-it',
    };
    const c = {
      kind: 'clause' as const,
      verb: 'tap',
      args: { objects: it },
      optional: false,
      span: { start: pos, end: r.pos },
      rule: 'effect.test-tap-it',
    };
    return { ok: true, value: [c], pos: r.pos };
  },
});

// The test rules come first: the grammar itself reads "Tap it." since stage P15, and these tests are
// about what the binding pass says of a pronoun nothing else claims.
const WITH_TEST_RULES: readonly PhraseRule<unknown>[] = [
  TRIGGER_TEST_EVENT as PhraseRule<unknown>,
  TAP_IT as PhraseRule<unknown>,
  ...ALL_RULES,
];

function spellFace(text: string, rules: readonly PhraseRule<unknown>[] = ALL_RULES) {
  return parseFaceText(text, OPTS, 0, rules, [{ id: 'spell.effect' }]);
}

describe('reason: unrecognised', () => {
  test('names the slot, the rules that matched before the stop, and the template', () => {
    const [u] = spellFace('Destroy target creature with flying or reach.').unparsed;
    expect(u).toEqual({
      face: 0,
      ability: 0,
      text: 'Destroy target creature with flying or reach.',
      stoppedAt: 'or reach.',
      closestRule: 'noun.target-permanent',
      reason: 'unrecognised',
      slot: 'noun',
      recognised: ['effect.destroy', 'noun.target-permanent'],
      template: 'Destroy target creature with flying or reach.',
    });
  });

  test('a verb no rule starts with is an effect that was not recognised', () => {
    const [u] = spellFace('Draw a card, then populate.').unparsed;
    expect(u).toMatchObject({
      reason: 'unrecognised',
      slot: 'effect',
      stoppedAt: 'populate.',
      recognised: ['effect.draw', 'amount.article'],
    });
  });

  test('a trigger no rule reads is a trigger slot, and nothing was read', () => {
    const text = 'Whenever your opponents cast a spell, draw a card.';
    const [u] = parseFaceText(text, OPTS, 0).unparsed;
    expect(u).toMatchObject({
      reason: 'unrecognised',
      slot: 'trigger',
      closestRule: 'none',
      stoppedAt: text,
    });
    expect(u?.recognised).toBeUndefined();
  });

  test('a trigger read only as far as its subject stops where the event should be', () => {
    // Damage that is not combat damage is not an event the engine's trigger reads (stage P18).
    const [u] = parseFaceText(
      'Whenever ~ deals damage to a player, draw a card.',
      OPTS,
      0,
    ).unparsed;
    expect(u).toMatchObject({
      reason: 'unrecognised',
      slot: 'trigger',
      stoppedAt: 'deals damage to a player, draw a card.',
    });
  });

  test('"At" goes with the beginning of a step, and only with it (CR 603.2b)', () => {
    const [at] = parseFaceText('At ~ enters, draw a card.', OPTS, 0).unparsed;
    expect(at).toMatchObject({
      reason: 'unrecognised',
      slot: 'trigger',
      closestRule: 'trigger.enters',
    });
    const [whenever] = parseFaceText(
      'Whenever the beginning of your upkeep, draw a card.',
      OPTS,
      0,
    ).unparsed;
    expect(whenever).toMatchObject({ reason: 'unrecognised', closestRule: 'trigger.upkeep' });
  });

  test('"you may" is read in a trigger body, and anything after it that is not read stays unread', () => {
    const [u] = parseFaceText('When ~ enters, you may draw a card. Amass 1.', OPTS, 0).unparsed;
    expect(u).toMatchObject({
      reason: 'unrecognised',
      slot: 'effect',
      stoppedAt: 'Amass 1.',
      recognised: ['trigger.enters', 'effect.draw', 'amount.article'],
    });
  });

  test('a cost no rule reads is a cost slot', () => {
    const [u] = parseFaceText('{S}, {T}: Add {G}.', OPTS, 0).unparsed;
    expect(u).toMatchObject({ reason: 'unrecognised', slot: 'cost', closestRule: 'none' });
    // A cost no rule reads: exile a card is not a cost of the grammar (stage P13 reads a discard).
    const [second] = parseFaceText('{T}, Exile a card from your hand: Add {G}.', OPTS, 0).unparsed;
    expect(second).toMatchObject({
      reason: 'unrecognised',
      slot: 'cost',
      stoppedAt: 'Exile a card from your hand: Add {G}.',
      recognised: ['cost.tap'],
    });
  });

  test('a restriction no rule reads is a restriction slot, after the cost and the body', () => {
    const [u] = parseFaceText('{T}: Add {G}. Activate only during your turn.', OPTS, 0).unparsed;
    expect(u).toMatchObject({
      reason: 'unrecognised',
      slot: 'restriction',
      stoppedAt: 'Activate only during your turn.',
      recognised: ['cost.tap', 'effect.add-mana'],
    });
  });

  test('a keyword with a parameter is a keyword slot once the first keyword was read', () => {
    const [u] = parseFaceText('Flying, ward—Discard a card.', OPTS, 0).unparsed;
    expect(u).toMatchObject({
      slot: 'keyword',
      stoppedAt: 'ward—Discard a card.',
      closestRule: 'keyword.line',
      recognised: ['keyword.line'],
    });
  });

  test('a mode that does not read stops the whole modal text, and the diagnostic names that mode', () => {
    const [u] = spellFace('Choose one —\n• Draw a card.\n• Fly away.\n• You gain 2 life.').unparsed;
    expect(u).toMatchObject({
      reason: 'unrecognised',
      closestRule: 'modal.choose',
      slot: 'effect',
      // Where reading stopped: the words of the second bullet, never the bullets that did read.
      stoppedAt: 'Fly away.\n• You gain 2 life.',
      recognised: ['modal.choose', 'effect.draw', 'amount.article'],
    });
  });

  test('a lead line no modal rule reads leaves the whole text, in the modal slot', () => {
    const [u] = spellFace('Choose three —\n• Draw a card.\n• You gain 2 life.\n• Scry 1.').unparsed;
    expect(u).toMatchObject({ reason: 'unrecognised', closestRule: 'none', slot: 'modal' });
    expect(u?.stoppedAt).toBe('Choose three —\n• Draw a card.\n• You gain 2 life.\n• Scry 1.');
  });

  test('the schema 1 fields are always present and unchanged in meaning', () => {
    for (const text of [
      'Banding',
      'Destroy target Banana.',
      'Whenever your opponents cast a spell, draw a card.',
    ]) {
      const [u] = spellFace(text).unparsed;
      expect(Object.keys(u ?? {})).toEqual(
        expect.arrayContaining(['face', 'ability', 'text', 'stoppedAt', 'closestRule']),
      );
    }
  });
});

describe('reason: notRunnable', () => {
  test('the engine feature that is missing is named, and the whole ability is the stop', () => {
    const result = compileLine('{T}: Add {G}. Draw a card.', {
      rules: buildRuleSet(ALL_RULES),
      face: 'permanent',
    });
    expect(result).toMatchObject({
      ok: false,
      failure: {
        reason: 'notRunnable',
        stoppedAt: '{T}: Add {G}. Draw a card.',
        closestRule: 'ability.activated',
        recognised: ['cost.tap', 'effect.add-mana', 'effect.draw', 'amount.article'],
      },
    });
  });

  test('a color choice in a spell: the node it stopped at is the mana phrase', () => {
    const card = parseOnly(spellCard('SYNTHETIC Wish', 'Add one mana of any color.'));
    expect(card.support.unparsed[0]).toEqual({
      face: 0,
      ability: 0,
      text: 'Add one mana of any color.',
      stoppedAt: 'one mana of any color.',
      closestRule: 'effect.add-mana',
      reason: 'notRunnable',
      recognised: ['effect.add-mana'],
      needs: ['selector:colorChoice'],
      template: 'Add N mana of any color.',
    });
  });

  test('a recognised trigger with no lowering written yet has a reason but no missing feature', () => {
    const [u] = parseFaceText('When ~ test-event, draw a card.', OPTS, 0, WITH_TEST_RULES).unparsed;
    expect(u).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'trigger.test-event',
      recognised: ['trigger.test-event', 'effect.draw', 'amount.article'],
    });
    expect(u?.needs).toBeUndefined();
  });
});

describe('reason: unboundReference', () => {
  test('a pronoun with nothing before it names the words', () => {
    const [u] = spellFace('Tap it.', WITH_TEST_RULES).unparsed;
    expect(u).toMatchObject({
      reason: 'unboundReference',
      reference: 'it',
      stoppedAt: 'it.',
      closestRule: 'effect.test-tap-it',
    });
  });

  test('the same pronoun after something it can mean is bound, and the line reads', () => {
    const parsed = spellFace('Untap target creature. Tap it.', WITH_TEST_RULES);
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'untap', objects: { kind: 'target', id: 't1' } },
          { kind: 'tap', objects: { kind: 'target', id: 't1' } },
        ],
      },
    });
  });

  test('in a trigger body "it" is the trigger subject, which the engine cannot name yet', () => {
    // After a subject that is not `~` ("it" is the other creature). With `~` as the only subject
    // "it" is `~` itself and lowers to `this` (stage P5: ir/bind.ts, `aboutSelf`).
    const [u] = parseFaceText(
      'Whenever another creature you control enters, tap it.',
      OPTS,
      0,
      WITH_TEST_RULES,
    ).unparsed;
    // Bound (no unboundReference), but no lowering names the object that triggered it for this
    // verb (the engine's `triggerSubject` is valid only where its validation says, so `needs` is
    // not asserted: it follows the engine's feature list).
    expect(u).toMatchObject({ reason: 'notRunnable', closestRule: 'effect.test-tap-it' });
  });

  test('a failed line does not use up target numbers: the next line starts where the last good one ended', () => {
    const parsed = spellFace(
      'Destroy target creature.\nTap it. Tap it.\nTap target land.',
      WITH_TEST_RULES,
    );
    // Line 1 binds t1; line 2 is "Tap it. Tap it." which binds to line 1 only inside one line, so
    // it is unbound; line 3 is t2 whatever happened in between.
    expect(parsed.unparsed.map((u) => u.ability)).toEqual([1]);
    expect(parsed.spell?.targets?.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});

describe('the IR a line is read into', () => {
  test('carries the rule id and the span on every node', () => {
    const out = readLine('Destroy target creature.', 'spell', buildRuleSet(ALL_RULES));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const [spell] = out.abilities;
    if (spell?.kind !== 'spell') throw new Error('not a spell');
    const [clause] = spell.body.sentences[0]?.clauses ?? [];
    expect(clause).toMatchObject({
      kind: 'clause',
      verb: 'destroy',
      rule: 'effect.destroy',
      span: { start: 0, end: 23 },
      optional: false,
    });
    const objects = clause?.args.objects;
    expect(objects).toMatchObject({
      kind: 'noun',
      det: 'target',
      rule: 'noun.target-permanent',
      span: { start: 8, end: 23 },
      filter: { zone: 'battlefield', types: ['creature'], raw: 'creature' },
    });
  });

  test('a keyword line is one IR keyword per keyword, with the words as written', () => {
    const out = readLine('Flying, first strike', 'permanent', buildRuleSet(ALL_RULES));
    expect(out.ok && out.abilities.map((a) => (a.kind === 'keyword' ? a.name : '?'))).toEqual([
      'flying',
      'first strike',
    ]);
  });

  test('"and" and "then" are recorded as the connector of the clause before them', () => {
    const out = readLine(
      'Destroy target creature, then draw a card and shuffle your library.',
      'spell',
      buildRuleSet(ALL_RULES),
    );
    if (!out.ok) throw new Error('not read');
    const ability: IrAbility | undefined = out.abilities[0];
    if (ability?.kind !== 'spell') throw new Error('not a spell');
    expect(ability.body.sentences[0]?.clauses.map((c) => [c.verb, c.connector])).toEqual([
      ['destroy', 'then'],
      ['draw', 'and'],
      ['shuffle', undefined],
    ]);
  });
});

describe('a custom rule set', () => {
  test('an empty rule set reads nothing, and every line is "none"', () => {
    const [u] = parseFaceText('Flying', OPTS, 0, []).unparsed;
    expect(u).toMatchObject({ closestRule: 'none', stoppedAt: 'Flying' });
  });

  test('the family helper reads what the set holds and nothing else', () => {
    const set = buildRuleSet([
      ALL_RULES.find((r) => r.id === 'amount.number') as PhraseRule<unknown>,
    ]);
    expect(set.candidates('amount', '3', 0).map((r) => r.id)).toEqual(['amount.number']);
    expect(set.candidates('noun', 'target creature', 0)).toEqual([]);
    expect(typeof family('amount')).toBe('function');
  });
});
