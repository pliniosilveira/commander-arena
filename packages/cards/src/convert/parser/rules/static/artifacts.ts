/**
 * Static abilities of stage P31 (D-139, D-140): a permission to cast spells at instant speed ("You may cast artifact spells as though
 * they had flash.", CR 601.3b) and the characteristics a permanent takes from the card its linked ability exiled (CR 607.2a: "As long
 * as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with
 * it."). Each is one whole line.
 */
import {
  choice,
  fail,
  literal,
  many,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrCondition, IrFilter, IrNoun, IrStatic, Span } from '../../ir/types';
import {
  BOUNDARY,
  CARD_TYPES,
  NO_PARTS,
  SUBTYPE_WORD,
  spellPhrase,
  toFilter,
  typeWords,
} from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family } from '../registry';
import { unit } from './grants';

function subjectNoun(det: IrNoun['det'], raw: string, span: Span, rule: string): IrNoun {
  return {
    kind: 'noun',
    det,
    filter: { raw },
    upTo: false,
    plural: false,
    other: false,
    span,
    rule,
  };
}

/**
 * "sorcery spells and Dragon spells" (CR 601.3b: the spells a permission is about): two or more "<card type or subtype> spells" joined by "and", each
 * naming a different set of spells; a spell is described by either, so the filter is the choice `anyOf` of one member per item (a card type word is
 * lowercase in Oracle text, a subtype capitalised, CR 205.3).
 */
function spellEachPhrase(): Parser<IrFilter> {
  const item: Parser<IrFilter> = choice(
    map(
      pattern(new RegExp(`(${CARD_TYPES}) spells${BOUNDARY}`, 'u')),
      (m): IrFilter => ({ types: [m[1] ?? ''], raw: m[1] ?? '' }),
    ),
    map(
      pattern(new RegExp(`(${SUBTYPE_WORD}) spells${BOUNDARY}`, 'u')),
      (m): IrFilter => ({ subtypes: [m[1] ?? ''], raw: m[1] ?? '' }),
    ),
  );
  return (ctx, pos) => {
    const first = item(ctx, pos);
    if (!first.ok) return first;
    const rest = many(map(sequence(literal(' and '), item), ([, member]) => member))(
      ctx,
      first.pos,
    );
    if (!rest.ok || rest.value.length === 0) return fail(ctx, pos);
    const base = toFilter('stack', NO_PARTS, ctx.text.slice(pos, rest.pos));
    return {
      ok: true,
      value: { ...base, stackKind: 'spell', anyOf: [first.value, ...rest.value] },
      pos: rest.pos,
    };
  };
}

/**
 * `static.cast-as-though-flash`: "You may cast artifact spells as though they had flash.", "You may cast creature spells as though they
 * had flash.", "You may cast spells as though they had flash." (stage P31, D-140, CR 601.3b: an effect may let a player cast a spell at a
 * time they could not; CR 702.8a: flash lets a spell be cast any time its controller could cast an instant). The permission is the
 * controller's and names the spells as they are cast; it gives them no keyword.
 */
export const STATIC_CAST_AS_THOUGH_FLASH = defineRule<IrStatic>({
  id: 'static.cast-as-though-flash',
  family: 'static',
  leading: ['you', 'any'],
  cites: ['CR 601.3b (Casting Spells)', 'CR 702.8a (Flash)'],
  examples: [
    'You may cast artifact spells as though they had flash.',
    'You may cast creature spells as though they had flash.',
    'You may cast spells as though they had flash.',
    'You may cast green creature spells as though they had flash.',
    'You may cast sorcery spells and Dragon spells as though they had flash.',
    'Any player may cast Sliver spells as though they had flash.',
    'Any player may cast spells as though they had flash.',
  ],
  rejects: [
    'You may cast artifact spells as though they had flash',
    'Any player may cast Sliver spells as though they had flash',
    'Any player may cast Sliver spells as though they had haste.',
    'Any opponent may cast Sliver spells as though they had flash.',
    'You may cast artifact spells as though they had haste.',
    'You may cast artifact spells this turn as though they had flash.',
    'You may cast artifact spells from your graveyard as though they had flash.',
    'Each player may cast artifact spells as though they had flash.',
    'You may cast artifact spell as though it had flash.',
    'You may cast sorcery spells and as though they had flash.',
  ],
  parse: (ctx, pos) => {
    // Quiet: "You may cast this card from your hand ..." stops where it always did.
    const r = quiet(
      sequence(
        choice(literal('you may cast '), literal('any player may cast ')),
        choice(spellEachPhrase(), spellPhrase(true)),
        literal(' as though they had flash.'),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    // CR 601.3b: "Any player may cast ..." gives the permission to every player, not to the controller of the permanent alone.
    const anyPlayer = ctx.text.slice(pos, pos + 3).toLowerCase() === 'any';
    const id = 'static.cast-as-though-flash';
    const spells: IrFilter = r.value[1];
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('you', 'you', { start: pos, end: pos + 3 }, id),
        effects: [
          anyPlayer
            ? { kind: 'castAsThoughFlash', spells, anyPlayer }
            : { kind: 'castAsThoughFlash', spells },
        ],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.linked-exile`: "As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last
 * creature card exiled with it. It's still a Shapeshifter." (stage P31, D-140, CR 607.2a: "exiled with ~" names the cards its linked
 * ability exiled; CR 613.4b, 613.1d: the power and toughness and the creature types are taken in their layers; CR 205.1a). The card type
 * is said twice and must be the same; "It's still a <type>." keeps a creature type of the table.
 */
export const STATIC_LINKED_EXILE = defineRule<IrStatic>({
  id: 'static.linked-exile',
  family: 'static',
  leading: ['as'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 205.1a (Type Line)',
  ],
  examples: [
    "As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it. It's still a Shapeshifter.",
    'As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it.',
  ],
  rejects: [
    "As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it. It's still a Banana.",
    'As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last artifact card exiled with it.',
    'As long as a card exiled with ~ is a creature card, ~ has the power and toughness of the last creature card exiled with it.',
    'As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the first creature card exiled with it.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('as long as a card exiled with ~ is a'),
      pattern(/n? /iu),
      typeWords(CARD_TYPES, false),
      literal(' card, ~ has the power, toughness, and creature types of the last '),
      typeWords(CARD_TYPES, false),
      literal(' card exiled with it.'),
      optional(
        sequence(
          literal(" it's still "),
          pattern(/an? /iu),
          satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
          literal('.'),
        ),
        null,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , first, , second, , still] = r.value;
    if (first.join(' ') !== second.join(' ')) return fail(ctx, pos);
    const id = 'static.linked-exile';
    const at = ctx.text.indexOf('~', pos);
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('self', '~', { start: at, end: at + 1 }, id),
        effects: [
          {
            kind: 'takeFromLinkedExile',
            from: { types: first, raw: first.join(' ') },
            alsoSubtypes: still === null ? [] : [still[2].subtype],
          },
        ],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.attached-unless-monarch`: "Enchanted creature doesn't untap during its controller's untap step unless that player is the
 * monarch." (stage P31, D-140, CR 502.3: the untap step of the creature's controller; CR 725.1: the monarch is a designation of a
 * player). "That player" is the controller of the enchanted creature; the restriction applies while that player is not the monarch.
 */
export const STATIC_ATTACHED_UNLESS_MONARCH = defineRule<IrStatic>({
  id: 'static.attached-unless-monarch',
  family: 'static',
  leading: ['enchanted', 'equipped'],
  cites: ['CR 502.3 (Untap Step)', 'CR 725.1 (The Monarch)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    "Enchanted creature doesn't untap during its controller's untap step unless that player is the monarch.",
  ],
  rejects: [
    "Enchanted creature doesn't untap during its controller's untap step unless that player is the monarch",
    "Enchanted creature doesn't untap during its controller's untap step unless you're the monarch.",
    "Enchanted creature can't block unless that player is the monarch.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      unit(['noun.attached-permanent'], 'attached'),
      pattern(/ unless that player is the monarch\./iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [{ noun, effects }, words] = r.value;
    // "That player" is the controller of the untap step the restriction names: the restriction must be that one, alone.
    const [only, ...more] = effects;
    if (more.length > 0 || only?.kind !== 'restriction' || only.restriction !== 'doesntUntap') {
      return fail(ctx, pos);
    }
    const id = 'static.attached-unless-monarch';
    const span = { start: r.pos - words[0].length + 1, end: r.pos - 1 };
    const controller: IrNoun = {
      kind: 'noun',
      det: 'controllerOf',
      filter: { raw: 'that player' },
      upTo: false,
      plural: false,
      other: false,
      of: noun,
      span,
      rule: id,
    };
    const monarch: IrCondition = {
      kind: 'condition',
      test: { kind: 'designation', who: controller, designation: 'monarch' },
      span,
      rule: id,
    };
    const condition: IrCondition = {
      kind: 'condition',
      test: { kind: 'not', term: monarch },
      span,
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: noun,
        effects,
        condition,
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.cast-self-as-though-flash`: "You may cast this spell as though it had flash if it targets a commander." (Danitha deck, D-408; CR 601.3b, 601.3d,
 * 113.6d). The spell's own permission, with a condition that is about its targets: the engine's `castAsThoughFlash` on `this` with a `spellTargets` condition. The
 * subject is `~` ("this spell" after normalization). Not read: another condition ("if you control a Dragon" has no rule yet), the permission of another card, a
 * line that does not end in a period.
 */
export const STATIC_CAST_SELF_AS_THOUGH_FLASH = defineRule<IrStatic>({
  id: 'static.cast-self-as-though-flash',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 601.3b (Casting Spells)',
    'CR 601.3d (Casting Spells)',
    'CR 113.6d (Abilities That Function in Zones Other Than the Battlefield)',
    'CR 702.8a (Flash)',
  ],
  examples: [
    'You may cast ~ as though it had flash if it targets a commander.',
    'You may cast ~ as though it had flash if it targets a creature.',
    'You may cast ~ as though it had flash if it targets a creature commander.',
  ],
  rejects: [
    'You may cast ~ as though it had flash if it targets a commander',
    'You may cast ~ as though it had flash.',
    'You may cast ~ as though it had flash if it targets commanders.',
    'You may cast ~ as though it had flash if it targets a player.',
    'You may cast ~ as though it had flash if you control a Dragon.',
    'You may cast ~ as though it had haste if it targets a commander.',
    'You may cast ~ from your graveyard as though it had flash if it targets a commander.',
    'You may cast artifact spells as though they had flash if they target a commander.',
  ],
  parse: (ctx, pos) => {
    const head = quiet(literal('you may cast ~ as though it had flash'))(ctx, pos);
    if (!head.ok) return head;
    const cond = sequence(
      literal(' if '),
      family<IrCondition>('condition', { only: ['condition.it-targets'] }),
      literal('.'),
    )(ctx, head.pos);
    if (!cond.ok) return cond;
    const id = 'static.cast-self-as-though-flash';
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('self', '~', { start: pos + 13, end: pos + 14 }, id),
        effects: [{ kind: 'castAsThoughFlash', spells: { raw: '~' } }],
        condition: cond.value[1],
        span: { start: pos, end: cond.pos },
        rule: id,
      },
      pos: cond.pos,
    };
  },
});

/**
 * `static.cast-self-flash-sacrifice-at-cleanup`: "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes
 * sacrifices it at the beginning of the next cleanup step." (Necromancy; CR 601.3b, 307.1, 603.7, 514.3a, 701.21a). The spell's own permission and its rider, one whole line: the engine's
 * `castAsThoughFlash` on `this` with `sacrificeIfCastAtInstantSpeed`. The subject is `~` ("this spell" after normalization). Not read: the permission alone (no rider), another timing in the
 * rider, another sacrificer ("you sacrifice it"), another moment ("the beginning of the next end step"), another object, a line that does not end in a period.
 */
export const STATIC_CAST_SELF_FLASH_SACRIFICE_AT_CLEANUP = defineRule<IrStatic>({
  id: 'static.cast-self-flash-sacrifice-at-cleanup',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 601.3b (Casting Spells)',
    'CR 307.1 (Sorceries)',
    'CR 603.7 (Handling Triggered Abilities)',
    'CR 514.3a (Cleanup Step)',
    'CR 701.21a (Sacrifice)',
  ],
  examples: [
    "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.",
    'You may cast ~ as though it had flash. If you cast it any time a sorcery couldn’t have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.',
  ],
  rejects: [
    "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step",
    "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next end step.",
    "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, you sacrifice it at the beginning of the next cleanup step.",
    "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes exiles it at the beginning of the next cleanup step.",
    "You may cast ~ as though it had flash. If you cast it any time an instant couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.",
    'You may cast ~ as though it had flash.',
    "You may cast ~ as though it had haste. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.",
  ],
  parse: (ctx, pos) => {
    const head = quiet(
      pattern(
        /you may cast ~ as though it had flash\. if you cast it any time a sorcery couldn['’]t have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step\./iu,
      ),
    )(ctx, pos);
    if (!head.ok) return head;
    const id = 'static.cast-self-flash-sacrifice-at-cleanup';
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('self', '~', { start: pos + 13, end: pos + 14 }, id),
        effects: [{ kind: 'selfFlashSacrificeAtCleanup' }],
        span: { start: pos, end: head.pos },
        rule: id,
      },
      pos: head.pos,
    };
  },
});

export const ARTIFACT_STATIC_RULES = [
  STATIC_CAST_AS_THOUGH_FLASH,
  STATIC_CAST_SELF_AS_THOUGH_FLASH,
  STATIC_CAST_SELF_FLASH_SACRIFICE_AT_CLEANUP,
  STATIC_LINKED_EXILE,
  STATIC_ATTACHED_UNLESS_MONARCH,
];
