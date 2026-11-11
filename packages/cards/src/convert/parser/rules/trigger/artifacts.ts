/**
 * Trigger rules of stage P31 (D-139, D-140): a group of creatures dealing combat damage at once ("one or more artifact creatures you
 * control deal combat damage to a player", CR 603.2c), tapping a permanent for mana (CR 106.12, 605.1b), a state trigger ("there are
 * four or more page counters on ~", CR 603.8) and entering in a step of combat ("~ enters during the declare attackers step"). Each
 * says what the text says; what the engine can run is the lowering's business (`lower/triggers.ts`).
 */
import {
  choice,
  literal,
  map,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrCondition, IrNoun, IrTrigger } from '../../ir/types';
import { quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { makeNoun, youNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.combat-damage-batch`: "one or more artifact creatures you control deal combat damage to a player", "one or more Zombies you
 * control deal combat damage to an opponent", "two or more creatures you control deal combat damage to a player" (CR 603.2c: one
 * trigger for the whole event; CR 510.2: combat damage is dealt at once in a step). The creatures are a plural group the controller of
 * the ability controls; the player damaged is the antecedent of "that player".
 */
export const TRIGGER_COMBAT_DAMAGE_BATCH = defineRule<IrTrigger>({
  id: 'trigger.combat-damage-batch',
  family: 'trigger',
  leading: [],
  cites: [
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 510.2 (Combat Damage Step)',
    'CR 120.2a (Damage)',
  ],
  examples: [
    'one or more artifact creatures you control deal combat damage to a player',
    'one or more creatures you control deal combat damage to a player',
    'one or more Zombies you control deal combat damage to an opponent',
    'two or more creatures you control deal combat damage to a player',
  ],
  rejects: [
    'one or more creatures deal combat damage to a player',
    'one or more creatures you control deal damage to a player',
    'one or more creatures you control deal combat damage to a creature',
    'one or more creatures you control deals combat damage to a player',
    'one or more creature you control deal combat damage to a player',
    'one or more creatures an opponent controls deal combat damage to a player',
    'a creature you control deals combat damage to a player',
  ],
  parse: (ctx, pos) => {
    // Quiet: "one or more creatures you control leave the battlefield" stops where it always did.
    const r = quiet(
      sequence(
        spanned(
          sequence(
            choice(
              map(literal('one or more '), () => 1),
              map(
                sequence(
                  satisfy(quantity, (n) => n >= 2),
                  literal(' or more '),
                ),
                ([n]) => n,
              ),
            ),
            satisfy(
              map(permanentPhrase(true, 'all'), withoutZone),
              (filter) => filter.controller === 'you',
            ),
          ),
        ),
        spanned(
          pattern(new RegExp(` deal combat damage to (a player|an opponent)${NOT_IN_WORD}`, 'iu')),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [group, words] = r.value;
    const [atLeast, filter] = group.value;
    const opponent = (words.value[1] ?? '').toLowerCase() === 'an opponent';
    const said = opponent ? 'an opponent' : 'a player';
    const subject: IrNoun = {
      ...makeNoun('trigger.combat-damage-batch', group.span, 'a', filter),
      plural: true,
    };
    const recipient = makeNoun(
      'trigger.combat-damage-batch',
      { start: words.span.end - said.length, end: words.span.end },
      opponent ? 'eachOpponent' : 'eachPlayer',
      { raw: said },
    );
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'combatDamageBatch',
        subject,
        damaged: opponent ? 'opponent' : 'player',
        recipient,
        ...(atLeast > 1 ? { atLeast } : {}),
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.combat-damage-batch',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.tapped-for-mana`: "you tap a permanent for {C}", "you tap a land for mana", "you tap a Forest for mana", "you tap a creature
 * for mana" (CR 106.12: to "tap a permanent for mana" is to activate a mana ability of it with {T} in its cost; CR 605.1b: an ability
 * that triggers from it is a mana ability). "For {C}" names the type of mana the tapped ability made; "for mana" any.
 */
export const TRIGGER_TAPPED_FOR_MANA = defineRule<IrTrigger>({
  id: 'trigger.tapped-for-mana',
  family: 'trigger',
  leading: ['you'],
  cites: ['CR 106.12 (Mana)', 'CR 605.1b (Mana Abilities)'],
  examples: [
    'you tap a permanent for {C}',
    'you tap a land for mana',
    'you tap a Forest for mana',
    'you tap a creature for mana',
    'you tap an artifact for {C}',
  ],
  rejects: [
    'you tap a permanent',
    'you tap a permanent for {C}{C}',
    'you tap a permanent for {2}',
    'a player taps a land for mana',
    'you tap two lands for mana',
    'you tap target land for mana',
    'you tap a land an opponent controls for mana',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      youNoun('trigger.tapped-for-mana'),
      literal(' tap '),
      spanned(
        sequence(
          pattern(/an? /i),
          satisfy(
            map(permanentPhrase(false, 'all'), withoutZone),
            (filter) => filter.controller === undefined && filter.anyOf === undefined,
          ),
        ),
      ),
      choice(
        map(pattern(new RegExp(` for mana${NOT_IN_WORD}`, 'iu')), () => undefined),
        map(pattern(/ for \{([WUBRGC])\}/i), (m) => (m[1] ?? '').toUpperCase()),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, , tapped, mana] = r.value;
    const subject = makeNoun('trigger.tapped-for-mana', tapped.span, 'a', tapped.value[1]);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'tappedForMana',
        actor,
        subject,
        ...(mana === undefined ? {} : { mana }),
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.tapped-for-mana',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.state`: "there are four or more page counters on ~", "there are three or more +1/+1 counters on ~" (CR 603.8: a state
 * trigger triggers when a game state is true, once, and not again until it has left the stack). The state read is the number of
 * counters of one kind on the permanent itself, compared with a number.
 */
export const TRIGGER_STATE = defineRule<IrTrigger>({
  id: 'trigger.state',
  family: 'trigger',
  leading: ['there'],
  cites: ['CR 603.8 (Handling Triggered Abilities)', 'CR 122.1 (Counters)'],
  examples: [
    'there are four or more page counters on ~',
    'there are three or more +1/+1 counters on ~',
    'there are two or more charge counters on ~',
  ],
  rejects: [
    'there are four page counters on ~',
    'there are four or more page counters on target artifact',
    'there are no page counters on ~',
    'there is a page counter on ~',
    'there are four or more page counters',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('there are '),
      spanned(
        sequence(
          satisfy(quantity, (n) => n >= 1),
          literal(' or more '),
          pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i),
          literal(' counters on '),
          spanned(literal('~')),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, amountWords] = r.value;
    const [value, , counter, , self] = amountWords.value;
    const span = { start: pos, end: r.pos };
    const of = makeNoun('trigger.state', self.span, 'self', { raw: '~' });
    const condition: IrCondition = {
      kind: 'condition',
      test: {
        kind: 'amountIs',
        amount: {
          kind: 'countersOn',
          of,
          counter: counter[0].toLowerCase(),
          span: amountWords.span,
        },
        compare: { cmp: 'atLeast', value },
      },
      span,
      rule: 'trigger.state',
    };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'state',
        subject: of,
        condition,
        args: {},
        span,
        rule: 'trigger.state',
      },
      pos: r.pos,
    };
  },
});

type CombatStep = NonNullable<IrTrigger['during']>;

/** The steps of combat by their names (CR 506.1). */
const COMBAT_STEP_WORDS: Parser<CombatStep> = choice(
  map(literal('the beginning of combat step'), () => 'beginningOfCombat' as const),
  map(literal('the declare attackers step'), () => 'declareAttackers' as const),
  map(literal('the declare blockers step'), () => 'declareBlockers' as const),
  map(literal('the combat damage step'), () => 'combatDamage' as const),
  map(literal('the end of combat step'), () => 'endOfCombat' as const),
);

/**
 * `trigger.enters-during`: "~ enters during the declare attackers step", "~ enters during the declare blockers step" (CR 603.4: the
 * words say when the event must happen, which the ability checks as it triggers and as it resolves; CR 506.1 the steps of combat).
 * Only the permanent itself.
 */
export const TRIGGER_ENTERS_DURING = defineRule<IrTrigger>({
  id: 'trigger.enters-during',
  family: 'trigger',
  leading: ['~'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 506.1 (Combat Phase)'],
  examples: [
    '~ enters during the declare attackers step',
    '~ enters the battlefield during the declare blockers step',
    '~ enters during the beginning of combat step',
  ],
  rejects: [
    '~ enters',
    '~ enters during your turn',
    '~ enters during the draw step',
    'a creature enters during the declare attackers step',
    '~ enters during the declare attackers step or attacks',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      spanned(literal('~')),
      pattern(/ enters(?: the battlefield)? during /iu),
      COMBAT_STEP_WORDS,
    )(ctx, pos);
    if (!r.ok) return r;
    const [self, , during] = r.value;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'enters',
        subject: makeNoun('trigger.enters-during', self.span, 'self', { raw: '~' }),
        during,
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.enters-during',
      },
      pos: r.pos,
    };
  },
});

/** The rules of this file; `trigger.enters-during` comes before `trigger.enters`, whose phrase is a prefix of it. */
export const ARTIFACT_TRIGGER_RULES = [
  TRIGGER_COMBAT_DAMAGE_BATCH,
  TRIGGER_TAPPED_FOR_MANA,
  TRIGGER_STATE,
  TRIGGER_ENTERS_DURING,
];
