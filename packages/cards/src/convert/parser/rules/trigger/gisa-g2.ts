/**
 * Trigger rules of the Gisa deck, group 2 (issue 41, D-464, D-465): "whenever you commit a crime" (CR 700.13) and "whenever you create a token" / "you create or sacrifice a token"
 * (CR 111.2, 701.21). Each says what the text says; what the engine can run is the lowering's business (`lower/triggers.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrNoun, IrTrigger, Span } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/** The player of a trigger as the noun the lowering reads: `you`, any player (`eachPlayer`) or an opponent (`eachOpponent`), with the span of the words. */
function actorNoun(rule: string, words: string, start: number): IrNoun {
  const span: Span = { start, end: start + words.length };
  const lower = words.toLowerCase();
  const det = lower === 'you' ? 'you' : lower === 'a player' ? 'eachPlayer' : 'eachOpponent';
  return makeNoun(rule, span, det, { raw: words });
}

/**
 * `trigger.commit-crime`: "you commit a crime", "an opponent commits a crime", "a player commits a crime" (CR 700.13: a player commits a crime as they cast a spell, activate an
 * ability or put a triggered ability on the stack and it targets an opponent, something an opponent controls or a card in an opponent's graveyard). The engine's `crimeCommitted`,
 * once for each spell or ability that is a crime. Not read: the past tense, "one or more crimes", a crime of a named player.
 */
export const TRIGGER_COMMIT_CRIME = defineRule<IrTrigger>({
  id: 'trigger.commit-crime',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 700.13 (General)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['you commit a crime', 'an opponent commits a crime', 'a player commits a crime'],
  rejects: [
    'you commits a crime',
    'an opponent commit a crime',
    'a player commit a crime',
    'you committed a crime',
    'you commit crimes',
    'you commit two crimes',
    'you commit a crime or',
    'you commit a crime and',
    'you commit',
    'you commit a',
    'each opponent commits a crime',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(`(you commit|an opponent commits|a player commits) a crime${NOT_IN_WORD}`, 'iu'),
    )(ctx, pos);
    if (!r.ok) return r;
    const words = (r.value[1] ?? '').replace(/ commits?$/iu, '');
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'crimeCommitted',
        actor: actorNoun('trigger.commit-crime', words, pos),
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.commit-crime',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.create-token`: "you create a token", "an opponent creates a token", "a player creates a token", and the two events of "you create or sacrifice a token", "a player creates
 * or sacrifices a token" (CR 111.2: the player who creates a token is its owner; CR 701.21: a permanent is sacrificed by its controller; CR 603.2c: the ability triggers for each
 * event, so for each token). The engine's `tokenCreated` and, for the second event, `permanentSacrificed` of a token; "an opponent sacrifices" is not an event the engine has, so
 * it is not read. Not read: a kind of token ("a creature token"), several tokens ("one or more tokens" is `trigger.you-create-tokens`), the past tense, the other order.
 */
export const TRIGGER_CREATE_TOKEN = defineRule<IrTrigger>({
  id: 'trigger.create-token',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 111.2 (Tokens)', 'CR 701.21 (Sacrifice)', 'CR 603.2c (Handling Triggered Abilities)'],
  examples: [
    'you create a token',
    'an opponent creates a token',
    'a player creates a token',
    'you create or sacrifice a token',
    'a player creates or sacrifices a token',
  ],
  rejects: [
    'you creates a token',
    'an opponent create a token',
    'you create or sacrifices a token',
    'a player creates or sacrifice a token',
    'an opponent creates or sacrifices a token',
    'you create a creature token',
    'you create a Treasure token',
    'you create tokens',
    'you create one or more tokens',
    'you create or sacrifice tokens',
    'you sacrifice or create a token',
    'you created a token',
    'you create a token or',
    'you create a token and',
    'you create or sacrifice a token or',
    'you create',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.create-token';
    const r = pattern(
      new RegExp(
        `(you create|a player creates|an opponent creates)( or sacrifices?)? a token${NOT_IN_WORD}(?!\\s+(?:or|and)${NOT_IN_WORD})`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, head = '', sacrifice] = r.value;
    const you = /^you /iu.test(head);
    const opponent = /^an opponent /iu.test(head);
    // The verb agrees with the player: "you create or sacrifice", "a player creates or sacrifices".
    if (
      sacrifice !== undefined &&
      (opponent || (you ? sacrifice.endsWith('s') : !sacrifice.endsWith('s')))
    ) {
      return fail(ctx, pos);
    }
    const words = head.replace(/ creates?$/iu, '');
    const actor = actorNoun(id, words, pos);
    const span = { start: pos, end: r.pos };
    const alternatives: IrTrigger[] =
      sacrifice === undefined
        ? []
        : [
            {
              kind: 'trigger',
              event: 'sacrifice',
              subject: makeNoun(id, { start: r.pos - 'token'.length, end: r.pos }, 'a', {
                token: true,
                raw: 'token',
              }),
              actor,
              args: {},
              span,
              rule: id,
            },
          ];
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'tokenCreated',
        actor,
        args: {},
        ...(alternatives.length === 0 ? {} : { alternatives }),
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const GISA_G2_TRIGGER_RULES = [TRIGGER_COMMIT_CRIME, TRIGGER_CREATE_TOKEN].map(quietly);
