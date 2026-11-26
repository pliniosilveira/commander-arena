/**
 * Effect rules of the cards where each opponent makes a named choice and the controller is rewarded for each player who chose a word (Seize the Spotlight; CR 101.4, 608.2d): "each opponent
 * chooses fame or fortune", "for each player who chose fame, gain control of a creature that player controls until end of turn", "untap those creatures and they gain haste until end of
 * turn", "for each player who chose fortune, you draw a card and create a Treasure token". Each phrase is one template of that card, written whole: the engine's `eachPlayerChooses`,
 * `chooseObjects` with `perChoice`, `eachPlayerWhoChose` (`lower/player-choices.ts`). A choice is not a vote (CR 701.38c); the votes are `effect.vote`.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrChoiceArg, IrNameArg, Span } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { NOT_AN_OPTION, VOTE_OPTION } from '../vote-words';
import { type Clauses, single } from './operands';

const WORD_END = '(?![\\p{L}\\p{N}-])';

/** "fame or fortune", "gold, iron or ash": two or more options (the list ends with " or <option>"). */
const OPTION_LIST = new RegExp(
  `(${VOTE_OPTION}(?:, ${VOTE_OPTION})*),? or (${VOTE_OPTION})${WORD_END}`,
  'u',
);

function nameArg(name: string, span: Span, rule: string): IrNameArg {
  return { kind: 'name', name, span, rule };
}

/**
 * `effect.each-player-chooses-words`: "each opponent chooses fame or fortune" (CR 101.4, 608.2d: each player named chooses one of the words, the active player first, each seeing the earlier
 * choices; the words have no rules meaning of their own, each is connected to an instruction the rest of the text gives). The engine's `eachPlayerChooses` of every opponent or every
 * player. Not read: "target opponent", one option, "may", "secretly", words after the list, a creature type or a color (those are other effects).
 */
export const EFFECT_EACH_PLAYER_CHOOSES_WORDS = defineRule<Clauses>({
  id: 'effect.each-player-chooses-words',
  family: 'effect',
  leading: ['each'],
  cites: ['CR 101.4 (The Magic Golden Rules)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: [
    'each opponent chooses fame or fortune',
    'Each player chooses gold, iron or ash',
    'each opponent chooses left-handed or right-handed',
  ],
  rejects: [
    'each opponent chooses fame',
    'each opponent chooses fame or',
    'each opponent chooses fame or fortune and',
    'each opponent chooses fame or fortune, then draws a card',
    'each opponent may choose fame or fortune',
    'each opponent secretly chooses fame or fortune',
    'target opponent chooses fame or fortune',
    'each opponent chooses a creature type',
    'each opponent chooses a color or a card type',
    'each opponent chooses an or a',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/each (opponent|player)(?= chooses )/iu),
      literal(' chooses '),
      spanned(pattern(OPTION_LIST)),
    )(ctx, pos);
    if (!r.ok) return r;
    const text = r.value[2].value[0];
    const options = text.split(/,? or |, /u);
    // "an or a": the article words are not options.
    if (options.some((o) => NOT_AN_OPTION.has(o.toLowerCase()))) return fail(ctx, pos);
    const rule = 'effect.each-player-chooses-words';
    const span = { start: pos, end: r.pos };
    const optionsArg: IrChoiceArg = {
      kind: 'choiceKind',
      what: 'option',
      options,
      span: r.value[2].span,
      rule,
    };
    const who = r.value[0][1]?.toLowerCase() === 'opponent' ? 'opponent' : 'player';
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'eachPlayerChooses',
          args: { options: optionsArg, who: nameArg(who, span, rule) },
          optional: false,
          span,
          rule,
        },
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.gain-control-per-chooser`: "for each player who chose fame, gain control of a creature that player controls until end of turn" (CR 101.4, 608.2d, 613.1b, 611.2: you choose one
 * creature of each player who chose the word, and gain control of each for the duration). The engine's `chooseObjects` with `perChoice` and a `gainControl` of what was chosen; the group is
 * what "those creatures" of the sentences after it names. Not read: another duration, another permanent, "up to one", "target".
 */
export const EFFECT_GAIN_CONTROL_PER_CHOOSER = defineRule<Clauses>({
  id: 'effect.gain-control-per-chooser',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 101.4 (The Magic Golden Rules)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'for each player who chose fame, gain control of a creature that player controls until end of turn',
  ],
  rejects: [
    'for each player who chose fame, gain control of a creature that player controls',
    'for each player who chose fame, gain control of a creature that player controls until your next turn',
    'for each player who chose fame, gain control of target creature that player controls until end of turn',
    'for each player who chose fame, gain control of up to one creature that player controls until end of turn',
    'for each player who chose fame, gain control of a permanent that player controls until end of turn',
    'for each player who chose fame, gain control of a creature you control until end of turn',
    'for each player who chose, gain control of a creature that player controls until end of turn',
    'for each player who chose fame, gain control of a creature that player controls until end of turn and draw a card',
    'for each player who chose fame, gain control of two creatures that player controls until end of turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `[Ff]or each player who chose (${VOTE_OPTION}), gain control of a creature that player controls until end of turn${WORD_END}`,
        'u',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const option = r.value[1] ?? '';
    if (NOT_AN_OPTION.has(option.toLowerCase())) return fail(ctx, pos);
    const rule = 'effect.gain-control-per-chooser';
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'gainControlPerChooser',
          args: { option: nameArg(option, span, rule) },
          optional: false,
          span,
          rule,
        },
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.untap-chosen-gain-haste`: "untap those creatures and they gain haste until end of turn" (CR 701.26a, 702.10, 611.2: the creatures an earlier "for each player who chose ..." took are
 * untapped and gain haste for the turn). The engine's `untap` and a `grantKeyword` of haste on the creatures that choice gave. Not read: another keyword, another duration, "those
 * creatures" with nothing to name (the lowering refuses it).
 */
export const EFFECT_UNTAP_CHOSEN_GAIN_HASTE = defineRule<Clauses>({
  id: 'effect.untap-chosen-gain-haste',
  family: 'effect',
  leading: ['untap'],
  cites: ['CR 701.26a (Tap and Untap)', 'CR 702.10a (Haste)', 'CR 611.2a (Continuous Effects)'],
  examples: ['untap those creatures and they gain haste until end of turn'],
  rejects: [
    'untap those creatures and they gain haste',
    'untap those creatures and they gain flying until end of turn',
    'untap those creatures and they gain haste until your next turn',
    'untap those creatures',
    'untap those creatures and they gain haste until end of turn and',
    'untap target creature and it gains haste until end of turn',
  ],
  parse: single(
    'effect.untap-chosen-gain-haste',
    pattern(
      new RegExp(`untap those creatures and they gain haste until end of turn${WORD_END}`, 'iu'),
    ),
    () => ({ verb: 'untapChosenGainHaste', args: {} }),
  ),
});

/**
 * `effect.per-chooser-draw-treasure`: "for each player who chose fortune, you draw a card and create a Treasure token" (CR 101.4, 608.2c, 121.1, 111.10: once for each player who chose the
 * word, you draw a card and create a Treasure token). The engine's `repeat` of the number of players who chose it, of a `draw` and a `createToken`. Not read: another number of cards, another
 * token, "each player draws", "may".
 */
export const EFFECT_PER_CHOOSER_DRAW_TREASURE = defineRule<Clauses>({
  id: 'effect.per-chooser-draw-treasure',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 101.4 (The Magic Golden Rules)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 121.1 (Drawing a Card)',
    'CR 111.10a (Predefined Tokens)',
  ],
  examples: ['for each player who chose fortune, you draw a card and create a Treasure token'],
  rejects: [
    'for each player who chose fortune, you draw two cards and create a Treasure token',
    'for each player who chose fortune, you draw a card and create a Food token',
    'for each player who chose fortune, you draw a card',
    'for each player who chose fortune, you may draw a card and create a Treasure token',
    'for each player who chose fortune, each player draws a card and creates a Treasure token',
    'for each player who chose, you draw a card and create a Treasure token',
    'for each player who chose fortune, you draw a card and create a Treasure token and',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `[Ff]or each player who chose (${VOTE_OPTION}), you draw a card and create a Treasure token${WORD_END}`,
        'u',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const option = r.value[1] ?? '';
    if (NOT_AN_OPTION.has(option.toLowerCase())) return fail(ctx, pos);
    const rule = 'effect.per-chooser-draw-treasure';
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'perChooserDrawTreasure',
          args: { option: nameArg(option, span, rule) },
          optional: false,
          span,
          rule,
        },
      ],
      pos: r.pos,
    };
  },
});

export const PLAYER_CHOICES_EFFECT_RULES = [
  EFFECT_EACH_PLAYER_CHOOSES_WORDS,
  EFFECT_GAIN_CONTROL_PER_CHOOSER,
  EFFECT_UNTAP_CHOSEN_GAIN_HASTE,
  EFFECT_PER_CHOOSER_DRAW_TREASURE,
];
