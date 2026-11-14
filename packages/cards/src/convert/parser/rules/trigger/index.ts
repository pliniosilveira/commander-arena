/**
 * Trigger rules (CR 603): the condition of a triggered ability, read from the words between
 * "When", "Whenever" or "At" and the first comma. One rule per event (enters, dies, attacks,
 * becomes tapped, landfall, sacrifice, the beginning of a step; the events of stage P18, D-111, are
 * in `events.ts`: the other steps and phases, a card drawn, combat damage dealt, leaving the
 * battlefield) and `trigger.or` for one subject
 * with several events ("~ enters or attacks"), which lowers to one engine ability per event
 * (CR 603.2c: it triggers once each time one of the events occurs).
 *
 * The segmenter hands over only the condition: the trigger word is read by the segmenter, and
 * `parseAbility` checks that "At" goes with a step trigger and nothing else does.
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
  satisfy,
  sequence,
} from '../../combinators';
import type { IrFilter, IrNoun, IrTrigger } from '../../ir/types';
import { romanValue } from '../../roman';
import { spellPhrase, withoutZone } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { ANGEL_TRIGGER_RULES } from './angels';
import { ARTIFACT_TRIGGER_RULES } from './artifacts';
import { CONTROL_TRIGGER_RULES } from './control';
import { DINOSAUR_TRIGGER_RULES } from './dinosaurs';
import { DRAGON_TRIGGER_RULES } from './dragons';
import { EDHREC_TRIGGER_RULES } from './edhrec';
import { EVENT_TRIGGER_RULES } from './events';
import { HASHATON_G1_TRIGGER_RULES } from './hashaton';
import { HASHATON_G9_TRIGGER_RULES } from './hashaton-g9';
import { HOFRI_TRIGGER_RULES } from './hofri';
import { KORVOLD_TRIGGER_RULES } from './korvold';
import { NONCOMBAT_DAMAGE_TRIGGER_RULES } from './noncombat-damage';
import { RECURSION_TRIGGER_RULES } from './recursion';
import {
  isPlainLandYouControl,
  makeNoun,
  objectSubject,
  permanentOrAttachedSubject,
  stepOwner,
  triggerSubject,
  youNoun,
} from './subjects';
import { VRASKA_TRIGGER_RULES } from './vraska';

type EventName =
  | 'enters'
  | 'dies'
  | 'attacks'
  | 'becomesTapped'
  | 'becomesUntapped'
  | 'blocks'
  | 'becomesBlocked'
  // Stage P36 (D-178): "becomes the target of a spell", for the alternatives of `trigger.or` only.
  | 'becomesTargetSpell';

/** The words of each event after its subject (the 2024 wording drops "the battlefield"). */
const EVENT_WORDS: Readonly<Record<EventName, Parser<EventName>>> = {
  enters: map(
    choice(literal(' enters the battlefield'), literal(' enters')),
    (): EventName => 'enters',
  ),
  // CR 700.4: "dies" means "is put into a graveyard from the battlefield", in either wording.
  dies: map(
    pattern(/ (?:dies|is put into a graveyard from the battlefield)(?![\p{L}\p{N}])/iu),
    (): EventName => 'dies',
  ),
  attacks: map(pattern(/ attacks(?![\p{L}\p{N}])/iu), (): EventName => 'attacks'),
  becomesTapped: map(
    pattern(/ becomes tapped(?![\p{L}\p{N}])/iu),
    (): EventName => 'becomesTapped',
  ),
  // Stage P49 (D-206, CR 701.26a): "becomes untapped".
  becomesUntapped: map(
    pattern(/ becomes untapped(?![\p{L}\p{N}])/iu),
    (): EventName => 'becomesUntapped',
  ),
  // Stage P21 (CR 509.3a, 509.3c): "blocks" once for each creature declared as a blocker, "becomes
  // blocked" once for each attacking creature a blocker is declared for. "Blocks a creature" and "becomes
  // blocked by a creature" (CR 509.3b, 509.3d) trigger once for each creature blocked or blocking, which
  // is another event: the words after "blocks" or "becomes blocked" are left unread, so they do not match.
  blocks: map(pattern(/ blocks(?![\p{L}\p{N}])/iu), (): EventName => 'blocks'),
  becomesBlocked: map(
    pattern(/ becomes blocked(?![\p{L}\p{N}])/iu),
    (): EventName => 'becomesBlocked',
  ),
  // CR 603.2, 601.2c: "becomes the target of a spell" (a spell, not an ability: the engine's `becomesTarget` with `spellOnly`).
  becomesTargetSpell: map(
    pattern(/ becomes the target of a spell(?![\p{L}\p{N}])(?! or ability)/iu),
    (): EventName => 'becomesTargetSpell',
  ),
};

const ANY_EVENT = choice(
  EVENT_WORDS.enters,
  EVENT_WORDS.dies,
  EVENT_WORDS.attacks,
  EVENT_WORDS.becomesTapped,
  EVENT_WORDS.becomesUntapped,
  EVENT_WORDS.blocks,
  EVENT_WORDS.becomesBlocked,
);

/** The events of `trigger.or`: those of any trigger of one subject, and (stage P36, D-178) "becomes the target of a spell". */
const OR_EVENT = choice(ANY_EVENT, EVENT_WORDS.becomesTargetSpell);

function trigger(
  rule: string,
  span: { start: number; end: number },
  event: string,
  parts: { subject?: IrNoun; actor?: IrNoun; alternatives?: readonly IrTrigger[] } = {},
): IrTrigger {
  // "becomes the target of a spell" is the event `becomesTarget` for spells only.
  if (event === 'becomesTargetSpell') {
    return {
      kind: 'trigger',
      event: 'becomesTarget',
      spellOnly: true,
      args: {},
      ...parts,
      span,
      rule,
    };
  }
  return { kind: 'trigger', event, args: {}, ...parts, span, rule };
}

/** The first words of a subject that may also be the permanent an Aura or Equipment is attached to. */
const ATTACHABLE_LEADING = ['~', 'another', 'a', 'an', 'your', 'equipped', 'enchanted'];

/** A rule for one event of one subject: "<subject> enters", "<subject> dies", ... */
function singleEvent(
  id: string,
  event: EventName,
  more: {
    readonly examples: readonly string[];
    readonly rejects: readonly string[];
    readonly cites: readonly string[];
  },
) {
  return defineRule<IrTrigger>({
    id,
    family: 'trigger',
    leading: event === 'enters' ? ['~', 'another', 'a', 'an', 'your'] : ATTACHABLE_LEADING,
    ...more,
    parse: (ctx, pos) => {
      const r = sequence(
        // Landfall is its own event: "a land you control enters" is read by `trigger.landfall`.
        event === 'enters'
          ? satisfy(triggerSubject(id), (s) => !isPlainLandYouControl(s))
          : // "equipped creature dies", "enchanted creature attacks" (stage P18, D-111).
            permanentOrAttachedSubject(id),
        EVENT_WORDS[event],
      )(ctx, pos);
      if (!r.ok) return r;
      return {
        ok: true,
        value: trigger(id, { start: pos, end: r.pos }, event, { subject: r.value[0] }),
        pos: r.pos,
      };
    },
  });
}

/** `trigger.enters`: "~ enters", "another creature you control enters" (CR 603.6a). */
export const TRIGGER_ENTERS = singleEvent('trigger.enters', 'enters', {
  cites: ['CR 603.6a (Handling Triggered Abilities)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: [
    '~ enters',
    '~ enters the battlefield',
    'another creature you control enters',
    'a creature enters',
  ],
  rejects: [
    'a land you control enters',
    '~ enters tapped',
    '~ enters or attacks',
    '~ dies',
    'you enter',
    'the beginning of your upkeep',
  ],
});

/** `trigger.dies`: "~ dies", "a creature you control dies" (CR 700.4, 603.6c, 603.10a). */
export const TRIGGER_DIES = singleEvent('trigger.dies', 'dies', {
  cites: [
    'CR 700.4 (General)',
    'CR 603.6c (Handling Triggered Abilities)',
    'CR 603.10a (Handling Triggered Abilities)',
  ],
  examples: [
    '~ dies',
    'another creature you control dies',
    'a creature dies',
    '~ is put into a graveyard from the battlefield',
    'another creature or artifact you control is put into a graveyard from the battlefield',
    'equipped creature dies',
    'enchanted creature dies',
  ],
  rejects: [
    '~ dies or attacks',
    '~ die',
    'you dies',
    '~ is put into a graveyard from anywhere',
    '~ is put into a graveyard',
    '~ is put into your graveyard from the battlefield',
    '~ is put into a graveyard from the battlefield or attacks',
    'equipped creature die',
    'equipped creatures die',
    'equipped creature dies or attacks',
  ],
});

/** `trigger.attacks`: "~ attacks", "a creature you control attacks" (CR 508.1, 508.2a). */
export const TRIGGER_ATTACKS = singleEvent('trigger.attacks', 'attacks', {
  cites: ['CR 508.1 (Declare Attackers Step)', 'CR 508.2a (Declare Attackers Step)'],
  examples: [
    '~ attacks',
    'another creature you control attacks',
    'a creature you control attacks',
    'equipped creature attacks',
    'enchanted creature attacks',
  ],
  rejects: [
    '~ attacks or dies',
    '~ attack',
    '~ attacks you',
    'you attack',
    'equipped creature attack',
  ],
});

/**
 * `trigger.attacks-you`: "a creature attacks you or a planeswalker you control", "a creature attacks you", "another
 * creature attacks you" (stage P29, D-133, CR 508.1b: a creature is declared as attacking a player or a planeswalker
 * or a battle; "you" is the player who controls the ability, and a planeswalker they control is not "you"). The
 * subject is the attacker, an object of a kind: "that creature's controller" in the body is the attacking player.
 */
export const TRIGGER_ATTACKS_YOU = defineRule<IrTrigger>({
  id: 'trigger.attacks-you',
  family: 'trigger',
  leading: ['~', 'another', 'a', 'an'],
  cites: [
    'CR 508.1b (Declare Attackers Step)',
    'CR 506.3 (Combat Phase)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    'a creature attacks you or a planeswalker you control',
    'a creature attacks you',
    'another creature attacks you',
    'a creature with flying attacks you or a planeswalker you control',
    'a nontoken creature attacks you',
  ],
  rejects: [
    'a creature attacks',
    'a creature attacks you or',
    'a creature attacks you or a planeswalker',
    'a creature attacks you or a planeswalker you control or dies',
    'a creature attack you',
    'a creature attacks you alone',
    'a creature attacks you and',
    'a creature attacks target player',
    'you attack you',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      triggerSubject('trigger.attacks-you'),
      choice(
        map(
          pattern(/ attacks you or a planeswalker you control(?![\p{L}\p{N}])/iu),
          () => 'youOrPlaneswalkers' as const,
        ),
        map(pattern(/ attacks you(?![\p{L}\p{N}]| or )/iu), () => 'you' as const),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        ...trigger('trigger.attacks-you', { start: pos, end: r.pos }, 'attacks', {
          subject: r.value[0],
        }),
        at: r.value[1],
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.attacks-alone`: "~ attacks alone", "a creature you control attacks alone", "equipped creature
 * attacks alone" (CR 506.5: a creature attacks alone if it is the only creature declared as an attacker;
 * stage P21, the engine's `attacks` with `alone`, D-110). It is the event of Exalted, so it is the same
 * event as `trigger.attacks` with the condition said.
 */
export const TRIGGER_ATTACKS_ALONE = defineRule<IrTrigger>({
  id: 'trigger.attacks-alone',
  family: 'trigger',
  leading: ATTACHABLE_LEADING,
  cites: ['CR 506.5 (Combat Phase)', 'CR 508.1 (Declare Attackers Step)'],
  examples: [
    '~ attacks alone',
    'a creature you control attacks alone',
    'another creature you control attacks alone',
    'equipped creature attacks alone',
    'enchanted creature attacks alone',
  ],
  rejects: [
    '~ attacks',
    '~ attack alone',
    '~ attacks alone or dies',
    '~ attacks alone,',
    '~ attacks with another creature',
    '~ is attacking alone',
    '~ and another creature attack alone',
    'you attack alone',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      permanentOrAttachedSubject('trigger.attacks-alone'),
      pattern(/ attacks alone(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        ...trigger('trigger.attacks-alone', { start: pos, end: r.pos }, 'attacks', {
          subject: r.value[0],
        }),
        alone: true,
      },
      pos: r.pos,
    };
  },
});

/** `trigger.becomes-tapped`: "~ becomes tapped" (CR 603.2e: not when it enters tapped). */
export const TRIGGER_BECOMES_TAPPED = singleEvent('trigger.becomes-tapped', 'becomesTapped', {
  cites: ['CR 603.2e (Handling Triggered Abilities)', 'CR 701.26a (Tap and Untap)'],
  examples: [
    '~ becomes tapped',
    'another creature you control becomes tapped',
    'equipped creature becomes tapped',
  ],
  rejects: ['~ becomes untapped', '~ becomes tapped or attacks', '~ becomes the target of a spell'],
});

/** `trigger.becomes-untapped`: "~ becomes untapped" (CR 701.26a, 603.2e: a permanent that untaps; one that enters untapped does not "become" untapped; stage P49, D-206). */
export const TRIGGER_BECOMES_UNTAPPED = singleEvent('trigger.becomes-untapped', 'becomesUntapped', {
  cites: ['CR 701.26a (Tap and Untap)', 'CR 603.2e (Handling Triggered Abilities)'],
  examples: [
    '~ becomes untapped',
    'another creature you control becomes untapped',
    'equipped creature becomes untapped',
  ],
  rejects: ['~ becomes tapped', '~ untaps', '~ becomes untapped or attacks', '~ becomes untap'],
});

/**
 * `trigger.blocks`: "~ blocks", "a creature you control blocks", "equipped creature blocks" (CR 509.3a: it
 * triggers once for each creature declared as a blocker, however many creatures it blocks; stage P21, the
 * engine's `blocks`, D-120). "Blocks a creature" and the like are CR 509.3b, a different event, and are not
 * read.
 */
export const TRIGGER_BLOCKS = singleEvent('trigger.blocks', 'blocks', {
  cites: ['CR 509.3a (Declare Blockers Step)', 'CR 509.1g (Declare Blockers Step)'],
  examples: [
    '~ blocks',
    'another creature you control blocks',
    'a creature you control blocks',
    'a creature blocks',
    'equipped creature blocks',
    'enchanted creature blocks',
  ],
  rejects: [
    '~ block',
    '~ blocks a creature',
    '~ blocks target creature',
    '~ blocks or attacks',
    '~ blocks or becomes blocked',
    '~ blocked',
    '~ is blocked',
    'equipped creatures block',
    '~ becomes blocked',
    'you block',
  ],
});

/**
 * `trigger.becomes-blocked`: "~ becomes blocked", "a creature you control becomes blocked" (CR 509.3c: it
 * triggers once for each attacking creature that has at least one creature declared as a blocker, however
 * many there are; stage P21, the engine's `becomesBlocked`, D-120). "Becomes blocked by a creature" is CR
 * 509.3d, a different event, and is not read.
 */
export const TRIGGER_BECOMES_BLOCKED = singleEvent('trigger.becomes-blocked', 'becomesBlocked', {
  cites: ['CR 509.3c (Declare Blockers Step)', 'CR 509.1h (Declare Blockers Step)'],
  examples: [
    '~ becomes blocked',
    'another creature you control becomes blocked',
    'a creature you control becomes blocked',
    'equipped creature becomes blocked',
    'enchanted creature becomes blocked',
  ],
  rejects: [
    '~ becomes blocked by a creature',
    '~ becomes blocked by a creature with flying',
    '~ become blocked',
    '~ becomes unblocked',
    '~ becomes blocked or attacks',
    '~ blocks or becomes blocked',
    '~ becomes tapped',
    '~ is blocked',
  ],
});

/**
 * `trigger.or`: one subject with two or more events joined by "or": "~ enters or attacks",
 * "~ attacks or dies". Each event is an ability of its own once lowered (CR 603.2c); a repeated
 * event is not read. A comma list ("enters, attacks, or dies", D-1315) is read too: the segmenter keeps the commas between two events in the trigger (`insideEventList`), and the
 * list is "A, B, or C" with the Oxford comma.
 */
export const TRIGGER_OR = defineRule<IrTrigger>({
  id: 'trigger.or',
  family: 'trigger',
  leading: ['~', 'another', 'a', 'an', 'your'],
  cites: ['CR 603.2 (Handling Triggered Abilities)', 'CR 603.2c (Handling Triggered Abilities)'],
  examples: [
    '~ enters or attacks',
    '~ enters the battlefield or attacks',
    '~ attacks or dies',
    'another creature you control enters or dies',
    '~ blocks or becomes blocked',
    '~ becomes blocked or blocks',
    '~ attacks or blocks',
    'a creature you control blocks or becomes blocked',
    // Stage P33 (D-150, CR 903.3): a commander is the subject like any object of a kind.
    'a commander you control enters or attacks',
    'your commander enters or attacks',
    // Stage P36 (D-178, CR 603.2): an event that is for spells only.
    '~ attacks or becomes the target of a spell',
    '~ becomes the target of a spell or attacks',
    // D-1315 (CR 603.2c): a list of events with commas.
    '~ attacks, blocks, or becomes the target of a spell',
    '~ enters, attacks, or dies',
    'another creature you control attacks, blocks, or dies',
  ],
  rejects: [
    '~ attacks or becomes the target of a spell or ability',
    '~ becomes the target of a spell or becomes the target of a spell',
    '~ enters',
    '~ enters or enters',
    '~ enters and attacks',
    '~ enters or attacks or',
    '~ enters, attacks',
    '~ enters, attacks or dies',
    '~ enters, or attacks',
    '~ enters, attacks, or',
    '~ enters, attacks, or attacks',
    '~ enters or attacks, or dies',
    '~ attacks, blocks, or becomes the target of a spell or ability',
    '~ blocks or blocks',
    '~ blocks or becomes blocked by a creature',
  ],
  parse: (ctx, pos) => {
    // "A or B [or C]", and (D-1315, CR 603.2c) the list of a comma: "A, B, or C", the last joined by ", or".
    const events = satisfy(
      sequence(
        OR_EVENT,
        many(sequence(choice(literal(', or'), literal(' or'), literal(',')), OR_EVENT)),
      ),
      ([first, more]) => {
        const rest = more.map(([, e]) => e);
        if (rest.length === 0 || new Set([first, ...rest]).size !== rest.length + 1) return false;
        const joins = more.map(([join]) => join);
        const allOr = joins.every((j) => j === ' or');
        const commaList =
          rest.length >= 2 &&
          joins.slice(0, -1).every((j) => j === ',') &&
          joins[joins.length - 1] === ', or';
        return allOr || commaList;
      },
    );
    const r = sequence(triggerSubject('trigger.or'), events)(ctx, pos);
    if (!r.ok) return r;
    const [subject, [first, more]] = r.value;
    const rest = more.map(([, e]) => e);
    const span = { start: pos, end: r.pos };
    const alternatives = rest.map((event) => trigger('trigger.or', span, event, { subject }));
    return {
      ok: true,
      value: trigger('trigger.or', span, first, { subject, alternatives }),
      pos: r.pos,
    };
  },
});

/**
 * `trigger.or-subjects`: "~ or another creature dies", "~ or another creature you control
 * enters": two subjects with one event. It is one ability that triggers for either (CR 603.2c),
 * so each subject is an engine ability of its own with the same body, as for `trigger.or`: the
 * event cannot happen to both at once, because "another" excludes this permanent. The second
 * subject must say "another" (without it, "~ or a creature" would be the same creature twice).
 */
export const TRIGGER_OR_SUBJECTS = defineRule<IrTrigger>({
  id: 'trigger.or-subjects',
  family: 'trigger',
  leading: ['~'],
  cites: ['CR 603.2 (Handling Triggered Abilities)', 'CR 603.2c (Handling Triggered Abilities)'],
  examples: [
    '~ or another creature dies',
    '~ or another creature you control dies',
    '~ or another creature enters',
    '~ or another artifact you control enters',
    '~ or another creature you control attacks',
  ],
  rejects: [
    '~ or a creature dies',
    '~ or another creature',
    '~ or another creature dies or attacks',
    '~ dies',
    'another creature or ~ dies',
    '~ or another creature you control die',
    '~ or another creature becomes the target of a spell',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      spanned(literal('~')),
      literal(' or '),
      satisfy(objectSubject('trigger.or-subjects'), (n) => n.other),
      ANY_EVENT,
    )(ctx, pos);
    if (!r.ok) return r;
    const [self, , other, event] = r.value;
    const span = { start: pos, end: r.pos };
    const subject = makeNoun('trigger.or-subjects', self.span, 'self', { raw: '~' });
    const alternative = trigger('trigger.or-subjects', span, event, { subject: other });
    return {
      ok: true,
      value: trigger('trigger.or-subjects', span, event, { subject, alternatives: [alternative] }),
      pos: r.pos,
    };
  },
});

/**
 * `trigger.cast`: "you cast a creature spell", "you cast a noncreature spell", "a player casts a
 * spell", "you cast an Aura, Equipment, or Vehicle spell" (CR 601.2i: abilities that trigger when
 * a spell is cast trigger as it becomes cast). The spell is the subject of the trigger, described
 * by a filter of the spells on the stack. "An opponent casts" is `by: 'opponent'` (D-111, stage P18);
 * "cast or copy" and "your first spell each turn" are other events.
 */
export const TRIGGER_CAST = defineRule<IrTrigger>({
  id: 'trigger.cast',
  family: 'trigger',
  leading: ['you', 'a', 'an'],
  cites: [
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 112.1 (Spells)',
  ],
  examples: [
    'you cast a spell',
    'you cast a creature spell',
    'you cast a noncreature spell',
    'you cast an instant or sorcery spell',
    'you cast an artifact spell',
    'you cast an Aura or Equipment spell',
    'you cast a creature spell of the chosen type',
    'a player casts a spell',
    'a player casts a creature spell',
    'an opponent casts a spell',
    'an opponent casts a noncreature spell',
    'an opponent casts an instant or sorcery spell',
    'an opponent casts a spell with mana value 3 or less',
    // Stage P49 (D-206): what the spell targets.
    'you cast an instant or sorcery spell that targets a creature',
    'you cast a spell that targets a permanent',
    'an opponent casts a creature spell that targets an artifact',
    // D-400 (Danitha, group 1b): "you control" of the object the spell targets.
    'you cast a spell that targets a creature you control',
    'an opponent casts a spell that targets a permanent you control',
  ],
  rejects: [
    'you cast ~',
    'you cast spells',
    'you cast a spell or',
    'you cast or copy an instant or sorcery spell',
    'you cast your first spell each turn',
    'an opponent casts their first spell each turn',
    'an opponent cast a spell',
    'a player cast a spell',
    'you cast a creature spell of the chosen player',
    'you cast a spell from your hand',
    'you cast it',
    'you cast a spell that targets',
    'you cast a spell that targets a Dragon',
    'you cast a spell that targets you',
    'you cast a spell that targets creatures',
    'you cast a spell that targets a creature you do not control',
    "you cast a spell that targets a creature you don't control",
    'you cast a spell that targets a creature an opponent controls',
    'you cast a spell that targets a creature you controlled',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      choice(
        map(spanned(sequence(youNoun('trigger.cast'), literal(' cast '))), ({ value }) => value[0]),
        map(spanned(literal('a player casts ')), ({ span }) =>
          makeNoun(
            'trigger.cast',
            { start: span.start, end: span.start + 'a player'.length },
            'eachPlayer',
            {
              raw: 'a player',
            },
          ),
        ),
        // D-111: the engine's `by: 'opponent'`, a player the controller of the ability does not control.
        map(spanned(literal('an opponent casts ')), ({ span }) =>
          makeNoun(
            'trigger.cast',
            { start: span.start, end: span.start + 'an opponent'.length },
            'eachOpponent',
            { raw: 'an opponent' },
          ),
        ),
      ),
      spanned(sequence(pattern(/an? /i), map(spellPhrase(), withoutZone))),
      // Stage P49 (D-206, CR 115.1, 601.2c): "an instant or sorcery spell that targets a creature".
      optional(
        pattern(
          /\s?that targets an? (creature|artifact|enchantment|land|planeswalker|permanent)( you control)?(?![\p{L}\p{N}])/iu,
        ),
        null,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, spell, aimed] = r.value;
    const what = (aimed?.[1] ?? '').toLowerCase();
    // D-400 (CR 109.4, 115.1): "that targets a creature you control" says whose the object the spell targets is.
    const yours = aimed?.[2] === undefined ? {} : { controller: 'you' as const };
    const filter: IrFilter =
      aimed === null
        ? spell.value[1]
        : {
            ...spell.value[1],
            targets:
              what === 'permanent'
                ? { ...yours, raw: what }
                : { types: [what], ...yours, raw: what },
          };
    const subject = makeNoun('trigger.cast', spell.span, 'a', filter);
    return {
      ok: true,
      value: trigger('trigger.cast', { start: pos, end: r.pos }, 'cast', { subject, actor }),
      pos: r.pos,
    };
  },
});

/**
 * `trigger.becomes-target`: "~ becomes the target of a spell or ability", "a creature you control
 * becomes the target of a spell or ability an opponent controls" (CR 603.2: it triggers once for each
 * spell or ability that targets it, as the targets are chosen, CR 601.2c, 603.3d; the Ward trigger of
 * CR 702.21a is the same event). The engine's trigger covers spells and abilities together, so the
 * words say "a spell or ability" and the controller is the one the engine knows: "an opponent
 * controls", "you control", or nobody in particular. "Becomes the target of a spell" alone (stage P36,
 * D-178) is the engine's `spellOnly`: only a spell triggers it; "of an ability" alone is not read. The
 * spell or ability that targeted is "it" in the engine (`triggerSubject`), which the lowering leaves unread.
 */
export const TRIGGER_BECOMES_TARGET = defineRule<IrTrigger>({
  id: 'trigger.becomes-target',
  family: 'trigger',
  leading: ATTACHABLE_LEADING,
  cites: [
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 601.2c (Casting Spells)',
    'CR 702.21a (Ward)',
  ],
  examples: [
    '~ becomes the target of a spell or ability',
    '~ becomes the target of a spell or ability an opponent controls',
    '~ becomes the target of a spell or ability you control',
    // Stage P36 (D-178): a spell only.
    '~ becomes the target of a spell',
    '~ becomes the target of a spell an opponent controls',
    'a creature you control becomes the target of a spell',
    'another creature you control becomes the target of a spell or ability',
    'a creature you control becomes the target of a spell or ability an opponent controls',
    'equipped creature becomes the target of a spell or ability',
  ],
  rejects: [
    '~ becomes the target of an ability',
    '~ becomes the target of a spell or',
    '~ becomes the target of a spell or ability an opponent controls or attacks',
    '~ becomes the target of a spell or ability your opponents control',
    '~ becomes the target',
    '~ become the target of a spell or ability',
    '~ becomes the target of spells or abilities',
    '~ or another creature becomes the target of a spell or ability',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      permanentOrAttachedSubject('trigger.becomes-target'),
      choice(
        map(pattern(/ becomes the target of a spell or ability(?![\p{L}\p{N}])/iu), () => 'both'),
        // Stage P36 (D-178, CR 603.2): "of a spell" alone is a spell, not an ability.
        map(
          pattern(/ becomes the target of a spell(?![\p{L}\p{N}])(?! or ability)/iu),
          () => 'spell',
        ),
      ),
      optional(
        choice(
          map(spanned(pattern(/ an opponent controls(?![\p{L}\p{N}])/iu)), ({ span }) =>
            makeNoun('trigger.becomes-target', span, 'eachOpponent', { raw: 'an opponent' }),
          ),
          map(spanned(pattern(/ you control(?![\p{L}\p{N}])/iu)), ({ span }) =>
            makeNoun('trigger.becomes-target', span, 'you', { raw: 'you' }),
          ),
        ),
        undefined,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, kind, actor] = r.value;
    return {
      ok: true,
      value: trigger(
        'trigger.becomes-target',
        { start: pos, end: r.pos },
        kind === 'spell' ? 'becomesTargetSpell' : 'becomesTarget',
        {
          subject,
          ...(actor === undefined ? {} : { actor }),
        },
      ),
      pos: r.pos,
    };
  },
});

/**
 * `trigger.landfall`: "a land you control enters" and the older "a land enters under your
 * control" (landfall: a land entering under your control, CR 603.6a).
 */
export const TRIGGER_LANDFALL = defineRule<IrTrigger>({
  id: 'trigger.landfall',
  family: 'trigger',
  leading: ['a'],
  cites: ['CR 603.6a (Handling Triggered Abilities)', 'CR 207.2c (Text Box)'],
  examples: [
    'a land you control enters',
    'a land enters under your control',
    'a land enters the battlefield under your control',
  ],
  rejects: [
    'a land enters',
    'a land an opponent controls enters',
    'another land you control enters',
    'a creature you control enters',
    'a land you control enters or attacks',
  ],
  parse: (ctx, pos) => {
    const r = choice(
      map(literal('a land you control enters'), () => 'you control'),
      map(
        choice(
          literal('a land enters the battlefield under your control'),
          literal('a land enters under your control'),
        ),
        () => 'under your control',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const subject = makeNoun('trigger.landfall', span, 'a', {
      types: ['land'],
      controller: 'you',
      raw: ctx.text.slice(pos, r.pos),
    });
    return {
      ok: true,
      value: trigger('trigger.landfall', span, 'landfall', { subject }),
      pos: r.pos,
    };
  },
});

/**
 * `trigger.sacrifice`: "you sacrifice a permanent", "you sacrifice a creature", "a player
 * sacrifices a permanent" (CR 701.21: the event is a permanent being sacrificed, by you or by any
 * player; it is judged as it was on the battlefield, CR 603.10a). "An opponent sacrifices" is not
 * read: the engine's trigger knows only you and any player.
 */
export const TRIGGER_SACRIFICE = defineRule<IrTrigger>({
  id: 'trigger.sacrifice',
  family: 'trigger',
  leading: ['you', 'a'],
  cites: ['CR 701.21 (Sacrifice)', 'CR 603.10a (Handling Triggered Abilities)'],
  examples: [
    'you sacrifice a permanent',
    'you sacrifice a creature',
    'you sacrifice an artifact',
    'a player sacrifices a permanent',
    'a player sacrifices a creature',
  ],
  rejects: [
    'you sacrifice ~',
    'you sacrificed a permanent',
    'a player sacrificed a permanent',
    'you sacrifice',
    'you sacrifice a creature an opponent controls',
    'a player sacrifices',
    'a player sacrifices ~',
    'a player sacrifices a creature you control',
    'an opponent sacrifices a permanent',
    'a player sacrifice a permanent',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      choice(
        map(sequence(youNoun('trigger.sacrifice'), literal(' sacrifice ')), ([you]) => you),
        map(spanned(literal('a player sacrifices ')), ({ span }) =>
          makeNoun(
            'trigger.sacrifice',
            { start: span.start, end: span.start + 'a player'.length },
            'eachPlayer',
            { raw: 'a player' },
          ),
        ),
      ),
      satisfy(objectSubject('trigger.sacrifice'), (n) => n.filter.controller !== 'opponent'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, subject] = r.value;
    // Whoever sacrifices, the permanent is theirs, so "a player sacrifices a creature you control"
    // says something else.
    if (actor.det === 'eachPlayer' && subject.filter.controller !== undefined)
      return fail(ctx, pos);
    return {
      ok: true,
      value: trigger('trigger.sacrifice', { start: pos, end: r.pos }, 'sacrifice', {
        subject,
        actor,
      }),
      pos: r.pos,
    };
  },
});

/** "the beginning of your upkeep" / "... each upkeep": whose turn, as an actor noun. */
function stepRule(
  id: string,
  event: 'upkeep' | 'endStep',
  word: string,
  more: { readonly examples: readonly string[]; readonly rejects: readonly string[] },
  bare = false,
) {
  return defineRule<IrTrigger>({
    id,
    family: 'trigger',
    leading: ['the'],
    cites: [
      'CR 603.2b (Handling Triggered Abilities)',
      event === 'upkeep' ? 'CR 503.1a (Upkeep Step)' : 'CR 513.1a (End Step)',
    ],
    ...more,
    parse: (ctx, pos) => {
      const r = sequence(
        literal('the beginning of '),
        stepOwner(bare),
        pattern(new RegExp(`${word}(?![\\p{L}\\p{N}])`, 'iu')),
      )(ctx, pos);
      if (!r.ok) return r;
      const span = { start: pos, end: r.pos };
      const actor = makeNoun(id, span, r.value[1], { raw: r.value[1] });
      return { ok: true, value: trigger(id, span, event, { actor }), pos: r.pos };
    },
  });
}

/** `trigger.upkeep`: "the beginning of your upkeep", "the beginning of each upkeep" (CR 503.1a). */
export const TRIGGER_UPKEEP = stepRule('trigger.upkeep', 'upkeep', 'upkeep', {
  examples: [
    'the beginning of your upkeep',
    'the beginning of each upkeep',
    "the beginning of each opponent's upkeep",
    "the beginning of each player's upkeep",
  ],
  rejects: [
    'the beginning of the upkeep',
    "the beginning of your opponent's upkeep",
    "the beginning of each opponent's",
    'the beginning of combat',
    'your upkeep',
    'the beginning of your end step',
  ],
});

/** `trigger.end-step`: "the beginning of your end step", "... each end step" (CR 513.1a). */
export const TRIGGER_END_STEP = stepRule(
  'trigger.end-step',
  'endStep',
  'end step',
  {
    examples: [
      'the beginning of your end step',
      'the beginning of each end step',
      'the beginning of the end step',
      "the beginning of each opponent's end step",
    ],
    rejects: [
      'the beginning of the next end step',
      "the beginning of your opponent's end step",
      'the beginning of your upkeep',
      'the beginning of your end step and',
      'the beginning of the upkeep',
    ],
  },
  true,
);

/** The numerals of a chapter symbol with their separators: "I", "I, II", "I and II". */
const NUMERAL_LIST = pattern(/[IVX]+(?:(?:, | and )[IVX]+)*(?![\p{L}\p{N}])/u);

/**
 * `trigger.chapter`: a Saga's chapter symbol, "I", "II", "I, II", "I and II" (CR 714.2). A chapter
 * symbol is a keyword ability that represents a triggered ability (CR 714.2); "{rN1}, {rN2}" means
 * the same as one ability for each numeral (CR 714.2c). The numerals are read as they are written
 * and the node keeps them in order; lowering decides what the engine can run (a range, not a list
 * that skips a number). The segmenter hands over only the numerals, before the em dash.
 */
export const TRIGGER_CHAPTER = defineRule<IrTrigger>({
  id: 'trigger.chapter',
  family: 'trigger',
  leading: ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'],
  cites: [
    'CR 714.2 (Saga Cards)',
    'CR 714.2a (Saga Cards)',
    'CR 714.2b (Saga Cards)',
    'CR 714.2c (Saga Cards)',
  ],
  examples: ['I', 'II', 'III', 'IV', 'I, II', 'I and II', 'II, III'],
  rejects: ['i', 'IIII', 'VV', 'IC', 'I,', 'I, ', 'I II', 'I or II', 'when ~ enters', 'II,III'],
  parse: (ctx, pos) => {
    const r = NUMERAL_LIST(ctx, pos);
    if (!r.ok) return r;
    const chapters: number[] = [];
    for (const numeral of r.value[0].split(/, | and /)) {
      const n = romanValue(numeral);
      if (n === null) return fail(ctx, pos);
      chapters.push(n);
    }
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: { ...trigger('trigger.chapter', span, 'chapter'), chapters },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.enters-and-cast`: "~ enters and whenever you cast a spell with mana value 4 or greater" (stage P48, D-205, CR 603.2c, 603.6a, 601.2i): one
 * ability that two events cause, each by its own words ("When ~ enters and whenever you cast ..."). Like `trigger.or` it lowers to one engine ability
 * for each event, sharing the effect. The second event is `trigger.cast` as the card writes it; two entering events or any other pair are not read.
 */
export const TRIGGER_ENTERS_AND_CAST = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.enters-and-cast',
    family: 'trigger',
    leading: ['~'],
    cites: [
      'CR 603.2c (Handling Triggered Abilities)',
      'CR 603.6a (Handling Triggered Abilities)',
      'CR 601.2i (Casting Spells)',
    ],
    examples: [
      '~ enters and whenever you cast a spell with mana value 4 or greater',
      '~ enters and whenever you cast a creature spell',
      '~ enters and whenever you cast a noncreature spell',
    ],
    rejects: [
      '~ enters and whenever you cast',
      '~ enters and whenever ~ attacks',
      '~ enters and you cast a creature spell',
      '~ enters, and whenever you cast a creature spell',
      '~ enters or whenever you cast a creature spell',
      '~ enters and when you cast a creature spell',
      '~ dies and whenever you cast a creature spell',
      '~ enters tapped and whenever you cast a creature spell',
      '~ enters and whenever you cast a creature spell and whenever you cast an instant spell',
      'another creature enters and whenever you cast a creature spell',
    ],
    parse: (ctx, pos) => {
      const r = sequence(
        satisfy(
          family<IrTrigger>('trigger', { only: ['trigger.enters'] }),
          (t) => t.subject?.det === 'self',
        ),
        literal(' and whenever '),
        family<IrTrigger>('trigger', { only: ['trigger.cast'] }),
      )(ctx, pos);
      if (!r.ok) return r;
      const [enters, , cast] = r.value;
      const span = { start: pos, end: r.pos };
      return {
        ok: true,
        value: { ...enters, span, rule: 'trigger.enters-and-cast', alternatives: [cast] },
        pos: r.pos,
      };
    },
  }),
);

/**
 * Registration order is the order tried, and the first rule that reads a prefix wins: the longer
 * phrases come first ("~ enters or attacks" before "~ enters", "a land enters under your control"
 * before "a land enters").
 */
export const TRIGGER_RULES = [
  TRIGGER_ENTERS_AND_CAST,
  TRIGGER_OR,
  TRIGGER_OR_SUBJECTS,
  TRIGGER_BECOMES_TARGET,
  TRIGGER_CAST,
  TRIGGER_LANDFALL,
  // Stage P37 (D-180): "you cycle this card".
  ...KORVOLD_TRIGGER_RULES,
  ...CONTROL_TRIGGER_RULES,
  // Stage P33 (D-150): gaining life, counters put on a permanent, attacking with several creatures.
  ...ANGEL_TRIGGER_RULES,
  // Stage P65 (D-218): "one or more creatures attack", "one or more tokens you control enter", "you cast or copy an instant or sorcery spell".
  ...EDHREC_TRIGGER_RULES,
  // Stage P68 (D-229): cards leaving a graveyard, exiled from a library or graveyard, "casts their second spell each turn", creatures with a mana value
  // entering together, "you create one or more creature tokens".
  ...HOFRI_TRIGGER_RULES,
  // Stage P30 (D-135): "enters untapped" and "dies or is put into exile from the battlefield" read the words after the event
  // that `trigger.enters` and `trigger.dies` stop at, so they come before those.
  ...RECURSION_TRIGGER_RULES,
  // Stage P31 (D-140): a group dealing combat damage, tapping for mana, a state, and "enters during the declare attackers step", which
  // `trigger.enters` would stop at.
  ...ARTIFACT_TRIGGER_RULES,
  TRIGGER_ENTERS,
  TRIGGER_DIES,
  // Before the plain event: "attacks" is a prefix of "attacks alone" and of "attacks you or a planeswalker you control"
  // (stage P29), and the first rule that reads a prefix wins.
  TRIGGER_ATTACKS_YOU,
  TRIGGER_ATTACKS_ALONE,
  // Stage P32 (D-147): "attacks while you don't control another Dinosaur", of which "attacks" is a prefix.
  ...DINOSAUR_TRIGGER_RULES,
  // Stage P34 (D-152): "attacks for the first time each turn", of which "attacks" is a prefix.
  ...DRAGON_TRIGGER_RULES,
  TRIGGER_ATTACKS,
  TRIGGER_BECOMES_TAPPED,
  TRIGGER_BECOMES_UNTAPPED,
  TRIGGER_BLOCKS,
  TRIGGER_BECOMES_BLOCKED,
  TRIGGER_SACRIFICE,
  TRIGGER_UPKEEP,
  TRIGGER_END_STEP,
  ...EVENT_TRIGGER_RULES,
  // Issue 25 (D-333): "a source you control deals noncombat damage to an opponent".
  ...NONCOMBAT_DAMAGE_TRIGGER_RULES,
  // D-391 (Hashaton, group 9): "a source deals damage to ~".
  ...HASHATON_G9_TRIGGER_RULES,
  // Stage P49 (D-206): "one or more other creatures and/or artifacts you control die", "you discard a card".
  ...VRASKA_TRIGGER_RULES,
  // Hashaton deck, group 1 (D-374): "you cycle or discard another card".
  ...HASHATON_G1_TRIGGER_RULES,
  TRIGGER_CHAPTER,
];
