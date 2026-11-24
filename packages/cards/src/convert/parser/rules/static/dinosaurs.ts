/**
 * Static ability rules of stage P32 (D-145, D-147): what the engine's Dinosaurs slice reads. "~ can't attack or block unless you control
 * another creature with power 4 or greater" (a restriction of the permanent itself, lifted while a condition holds, CR 508.1a, 509.1a),
 * "Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3" (layers 4, 5, 6 and 7b, CR
 * 613.1d to 613.1f, 613.4b) and "Equipped creature gets +X/+X, where X is the greatest mana value among your commanders" (CR 613.4c).
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  sequence,
} from '../../combinators';
import type {
  IrAmount,
  IrBasePt,
  IrCondition,
  IrNoun,
  IrStatic,
  IrStaticEffect,
} from '../../ir/types';
import { UNLESS_CONDITIONS } from '../condition/dinosaurs';
import { BASE_PT, COLOR, CREATURE_TYPE_LIST } from '../effect/becomes';
import { KEYWORD_WORDS } from '../keyword/list';
import { CARD_TYPES, typeWords } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { restrictionEffects } from './restriction-words';

const PERIOD = literal('.');

function staticOf(
  rule: string,
  subject: IrNoun,
  effects: readonly IrStaticEffect[],
  start: number,
  end: number,
): IrStatic {
  return { kind: 'static', subject, effects, span: { start, end }, rule };
}

/**
 * `static.cant-attack-block-unless`: "~ can't attack or block unless you control another creature with power 4 or greater.", "~ can't
 * attack unless you control a Dragon.", "~ can't block unless you have 30 or more life." (CR 508.1a, 509.1a, 101.2: the permanent
 * can't, except while the condition holds). The subject is `~`; the condition is a test of the game read for its controller as the attack
 * or the block is declared. Not read: another subject, "can't attack you", "can't be blocked unless".
 */
export const STATIC_CANT_ATTACK_BLOCK_UNLESS = defineRule<IrStatic>({
  id: 'static.cant-attack-block-unless',
  family: 'static',
  leading: ['~'],
  cites: [
    'CR 508.1a (Declare Attackers Step)',
    'CR 509.1a (Declare Blockers Step)',
    'CR 101.2 (Golden Rules)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "~ can't attack or block unless you control another creature with power 4 or greater.",
    '~ can’t attack or block unless you control another creature with power 4 or greater.',
    "~ can't attack unless you control a Dragon.",
    "~ can't block unless you control a Dragon.",
    "~ can't attack or block unless you control a commander.",
    "~ can't attack unless you have 30 or more life.",
  ],
  rejects: [
    "~ can't attack or block unless you control another creature with power 4 or greater",
    "~ can't attack or block unless",
    "~ can't attack or block unless it is raining.",
    "~ can't attack or block.",
    "~ can't attack unless you control a Dragon and draw a card.",
    "~ can't be blocked unless you control a Dragon.",
    "~ can't attack or block unless an opponent controls a Dragon.",
    "~ can't block unless you control a Plains.",
    "Creatures you control can't attack unless you control a Dragon.",
    "~ can't attack, block, or crew unless you control a Dragon.",
    "~ can't block or attack unless you control a Dragon.",
  ],
  parse: (ctx, pos) => {
    // Read quietly up to the condition: a line the grammar still does not read ("~ can't block unless you control a Plains") stops
    // where the statements of `~` stopped before (at " unless").
    const r = sequence(
      quiet(
        sequence(
          spanned(literal('~')),
          pattern(/ can['’]t (attack or block|attack|block) unless /iu),
          family<IrCondition>('condition', { only: UNLESS_CONDITIONS }),
        ),
      ),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const [[self, words, unless]] = r.value;
    const which = (words[1] ?? '').toLowerCase();
    const restrictions: ('cantAttack' | 'cantBlock')[] =
      which === 'attack or block'
        ? ['cantAttack', 'cantBlock']
        : which === 'attack'
          ? ['cantAttack']
          : ['cantBlock'];
    const subject: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: self.span,
      rule: 'static.cant-attack-block-unless',
    };
    return {
      ok: true,
      value: staticOf(
        'static.cant-attack-block-unless',
        subject,
        [{ kind: 'restrictUnless', restrictions, unless }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

/**
 * What the permanent is: "a green Elk creature with base power and toughness 3/3". An article, a color word or "colorless" (optional), one
 * or more creature types, one or more card types, and base power and toughness (optional). At least one creature type: the types
 * listed replace the creature types the permanent has (CR 205.3d), and a text that names none would leave that to guesswork.
 */
interface IsA {
  readonly colors: readonly string[] | null;
  readonly subtypes: readonly string[];
  readonly cardTypes: readonly string[];
  readonly basePt: { readonly power: number; readonly toughness: number } | null;
  readonly end: number;
}

const IS_A: Parser<IsA> = (ctx, pos) => {
  const r = sequence(
    pattern(/an? /iu),
    optional(
      map(sequence(COLOR, literal(' ')), ([colors]) => colors),
      null,
    ),
    CREATURE_TYPE_LIST,
    // Eye of Nidhogg (CR 205.1a, 205.3d): "a black Dragon with base power and toughness 4/2" names no card type: the creature types are replaced and the
    // card types stay. Only with base power and toughness, so "is a green Elk." is still not read.
    choice(
      map(
        sequence(
          literal(' '),
          typeWords(CARD_TYPES, false),
          optional(
            map(sequence(literal(' with '), BASE_PT('static.attached-becomes')), ([, pt]) => pt),
            null,
          ),
        ),
        ([, cardTypes, basePt]) => ({ cardTypes, basePt }),
      ),
      map(sequence(literal(' with '), BASE_PT('static.attached-becomes')), ([, basePt]) => ({
        cardTypes: [] as string[],
        basePt: basePt as IrBasePt | null,
      })),
    ),
  )(ctx, pos);
  if (!r.ok) return r;
  const [, colors, subtypes, { cardTypes, basePt }] = r.value;
  return {
    ok: true,
    value: {
      colors,
      subtypes,
      cardTypes,
      basePt: basePt === null ? null : { power: basePt.power, toughness: basePt.toughness },
      end: r.pos,
    },
    pos: r.pos,
  };
};

/**
 * `static.attached-becomes`: "Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.",
 * "Enchanted creature is a blue Frog creature.", "Equipped creature loses all abilities." (CR 613.1d types, 613.1e colors, 613.1f
 * abilities, 613.4b base power and toughness, 303.4b, 301.5a: what the Aura or Equipment gives the permanent it is attached to). The
 * types and the creature types listed replace those the permanent has (CR 205.1a, 205.3d) and the color words replace its colors; "in
 * addition to its other types" is another statement and is not read. In the order of the layers: the abilities, the types, the colors,
 * the base power and toughness.
 */
export const STATIC_ATTACHED_BECOMES = defineRule<IrStatic>({
  id: 'static.attached-becomes',
  family: 'static',
  leading: ['enchanted', 'equipped'],
  cites: [
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1e (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1a (Card Types)',
    'CR 205.3d (Subtypes)',
  ],
  examples: [
    'Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
    'Enchanted creature loses all abilities.',
    'Equipped creature loses all abilities.',
    'Enchanted creature is a blue Frog creature.',
    'Enchanted creature is a Frog creature with base power and toughness 1/1.',
    'Enchanted creature loses all abilities and is a Frog creature.',
    // Stage P50 (D-207): and a restriction.
    "Enchanted creature loses all abilities and doesn't untap during its controller's untap step.",
    // Observed Stasis: two restrictions after the loss of abilities.
    "Enchanted creature loses all abilities and can't attack or block.",
    // Eye of Nidhogg: no card type named, the creature types replaced, keywords given and goaded.
    'Enchanted creature is a black Dragon with base power and toughness 4/2, has flying and deathtouch, and is goaded.',
    'Enchanted creature is a Dragon with base power and toughness 4/2 and is goaded.',
    // Issue 89 (D-642): what the effect gives is kept, everything else is lost.
    'Enchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types.',
    // Lignify: the loss of abilities written after what the creature is.
    'Enchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities.',
  ],
  rejects: [
    'Enchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities',
    'Enchanted creature is a Treefolk with base power and toughness 0/4 and loses flying.',
    'Enchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities and has flying.',
    'Enchanted creature is a black Dragon with base power and toughness 4/2, has flying and deathtouch, and is goaded',
    'Enchanted creature is a black Dragon with base power and toughness 4/2, has flying and flying.',
    'Enchanted creature is a black Dragon with base power and toughness 4/2 and has flying.',
    'Enchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types',
    'Enchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible and it loses all other abilities, card types, and creature types.',
    'Enchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities.',
    'Enchanted creature is an Insect artifact creature with base power and toughness 0/1 and has, and it loses all other abilities, card types, and creature types.',
    'Enchanted creature loses all abilities and is an Insect artifact creature and has indestructible, and it loses all other abilities, card types, and creature types.',
    'Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3',
    'Enchanted creature loses all abilities and is a green Elk.',
    'Enchanted creature loses all abilities and is a green creature.',
    'Enchanted creature loses all abilities and is green.',
    'Enchanted creature loses all abilities and is a green Elk creature in addition to its other types.',
    'Enchanted creature loses all abilities and gets +1/+1.',
    'Enchanted creature loses flying.',
    'Enchanted creature loses all abilities and is a green Elk creature with power and toughness 3/3.',
    'Enchanted creature is a green Elk creature and has flying.',
    'Enchanted creature is a green Banana creature.',
    '~ loses all abilities.',
    'Enchanted creatures lose all abilities.',
    "Enchanted creature loses all abilities and doesn't untap during its controller's untap step",
    "Enchanted creature loses all abilities and doesn't untap during your untap step.",
    "Enchanted creature loses all abilities and can't attack and doesn't untap during its controller's untap step.",
  ],
  parse: (ctx, pos) => {
    const subject = family<IrNoun>('noun', { only: ['noun.attached-permanent'] })(ctx, pos);
    if (!subject.ok) return subject;
    const lose = pattern(/ loses all abilities(?![\p{L}\p{N}])/iu)(ctx, subject.pos);
    // "... and doesn't untap during its controller's untap step" (stage P50, D-207, CR 502.3): Enchanted River's Grasp. The restriction is the Aura's
    // own static ability about the creature, which losing its abilities does not take away (CR 613.11).
    const noUntap = lose.ok
      ? sequence(literal(' and '), restrictionEffects('attached'))(ctx, lose.pos)
      : null;
    if (lose.ok && noUntap?.ok) {
      const finish = PERIOD(ctx, noUntap.pos);
      if (!finish.ok) return finish;
      return {
        ok: true,
        value: staticOf(
          'static.attached-becomes',
          subject.value,
          [{ kind: 'loseAllAbilities' }, ...noUntap.value[1]],
          pos,
          finish.pos,
        ),
        pos: finish.pos,
      };
    }
    const afterLose = lose.ok ? lose.pos : subject.pos;
    const is = pattern(lose.ok ? / and is / : / is /)(ctx, afterLose);
    // "loses all abilities" alone, or with "and is ...", or "is ..." alone.
    if (!lose.ok && !is.ok) return fail(ctx, subject.pos);
    let what: IsA | null = null;
    let end = afterLose;
    if (is.ok) {
      const parsed = IS_A(ctx, is.pos);
      if (!parsed.ok) return parsed;
      what = parsed.value;
      end = parsed.pos;
    }
    // D-642 (CR 613.1f, 613.1d): "... and has indestructible, and it loses all other abilities, card types, and creature types.": what the effect gives is kept and
    // everything else is lost, so the abilities are lost first and then the keywords given, in the order written (the layers keep that order for one permanent).
    let given: readonly string[] = [];
    let loseOthers = false;
    // Lignify (CR 613.1f, 613.4b): "is a Treefolk with base power and toughness 0/4 and loses all abilities." The loss of abilities is written after what
    // the permanent is; it is the same layer 6 effect as the one written first, and the types and the numbers stay in their own layers.
    let loseAfter = false;
    if (what !== null && !lose.ok) {
      const after = pattern(/ and loses all abilities(?![\p{L}\p{N}])/iu)(ctx, end);
      if (after.ok) {
        loseAfter = true;
        end = after.pos;
      }
    }
    if (what !== null && !lose.ok && !loseAfter) {
      const tail = sequence(
        literal(' and has '),
        KEYWORD_WORDS,
        literal(', and it loses all other abilities, card types, and creature types'),
      )(ctx, end);
      if (tail.ok) {
        given = tail.value[1];
        loseOthers = true;
        end = tail.pos;
      }
    }
    // Eye of Nidhogg (CR 613.1f, 701.15b): "..., has flying and deathtouch, and is goaded.": what the permanent has besides what it is, and that it is
    // goaded by the controller of the Aura (the `goaded` restriction of an attached permanent).
    let goaded = false;
    if (what !== null && !lose.ok && !loseOthers && !loseAfter) {
      const has = sequence(literal(', has '), KEYWORD_WORDS)(ctx, end);
      if (has.ok) {
        given = has.value[1];
        end = has.pos;
      }
      const goad = pattern(/(?:, and | and |, )is goaded(?![\p{L}\p{N}'’])/iu)(ctx, end);
      if (goad.ok) {
        goaded = true;
        end = goad.pos;
      }
    }
    const finish = PERIOD(ctx, end);
    if (!finish.ok) return finish;
    const effects: IrStaticEffect[] = [];
    if (lose.ok || loseOthers || loseAfter) effects.push({ kind: 'loseAllAbilities' });
    if (what !== null) {
      effects.push({ kind: 'replaceTypes', cardTypes: what.cardTypes, subtypes: what.subtypes });
      for (const keyword of given) effects.push({ kind: 'grantKeyword', keyword });
      if (what.colors !== null) effects.push({ kind: 'setColors', colors: what.colors });
      if (what.basePt !== null) {
        effects.push({
          kind: 'basePt',
          power: what.basePt.power,
          toughness: what.basePt.toughness,
        });
      }
    }
    if (goaded) effects.push({ kind: 'restriction', restriction: 'goaded' });
    return {
      ok: true,
      value: staticOf('static.attached-becomes', subject.value, effects, pos, finish.pos),
      pos: finish.pos,
    };
  },
});

/**
 * `static.pt-amount`: "Equipped creature gets +X/+X, where X is the greatest mana value among your commanders.", "~ gets +X/+0, where
 * X is the number of artifacts you control." (CR 613.4c, 611.3a, 107.3c: X is what the text defines it as, and the bonus follows the
 * board). The subject is `~` or the permanent an Aura or Equipment is attached to; the stats that say X get the amount, the others
 * nothing. The lowering reads the commanders' mana value and a count of permanents, and refuses the other amounts.
 */
export const STATIC_PT_AMOUNT = defineRule<IrStatic>({
  id: 'static.pt-amount',
  family: 'static',
  leading: [],
  cites: [
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 611.3a (Continuous Effects)',
    'CR 107.3c (Numbers and Symbols)',
    'CR 903.3 (Commander)',
  ],
  examples: [
    'Equipped creature gets +X/+X, where X is the greatest mana value among your commanders.',
    'Enchanted creature gets +X/+0, where X is the greatest mana value among your commanders.',
    '~ gets +0/+X, where X is the number of artifacts you control.',
    'Equipped creature gets +X/+X, where X is the number of creatures you control.',
  ],
  rejects: [
    'Equipped creature gets +X/+X, where X is the greatest mana value among your commanders',
    'Equipped creature gets +X/+X.',
    'Equipped creature gets +X/+X where X is the greatest mana value among your commanders.',
    'Equipped creature gets +0/+0, where X is the greatest mana value among your commanders.',
    'Equipped creature gets +X/-X, where X is the greatest mana value among your commanders.',
    'Equipped creature gets -X/-X, where X is the greatest mana value among your commanders.',
    'Equipped creature gets +X/+X until end of turn, where X is the greatest mana value among your commanders.',
    'Equipped creature get +X/+X, where X is the greatest mana value among your commanders.',
    'Creatures you control get +X/+X, where X is the greatest mana value among your commanders.',
    'Equipped creature gets +X/+Y, where X is the greatest mana value among your commanders.',
  ],
  parse: (ctx, pos) => {
    const subject = quiet(
      family<IrNoun>('noun', { only: ['noun.self', 'noun.attached-permanent'] }),
    )(ctx, pos);
    if (!subject.ok) return subject;
    const stats = pattern(/ gets \+(X|0)\/\+(X|0), (?=where X is )/u)(ctx, subject.pos);
    if (!stats.ok) return stats;
    const power = stats.value[1] === 'X';
    const toughness = stats.value[2] === 'X';
    if (!power && !toughness) return fail(ctx, subject.pos);
    const amount = family<IrAmount>('amount', { only: ['amount.where-x'] })(ctx, stats.pos);
    if (!amount.ok) return amount;
    const end = PERIOD(ctx, amount.pos);
    if (!end.ok) return end;
    return {
      ok: true,
      value: staticOf(
        'static.pt-amount',
        subject.value,
        [{ kind: 'ptAmount', power, toughness, amount: amount.value }],
        pos,
        end.pos,
      ),
      pos: end.pos,
    };
  },
});

export const DINOSAUR_STATIC_RULES = [
  STATIC_CANT_ATTACK_BLOCK_UNLESS,
  STATIC_ATTACHED_BECOMES,
  STATIC_PT_AMOUNT,
];
