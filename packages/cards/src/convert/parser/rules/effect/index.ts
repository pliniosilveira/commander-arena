/**
 * Effect rules: one instruction of a spell or ability, as IR clauses (CR 608.2 resolving
 * spells and abilities). Each rule reads one verb phrase; sentences and joins are structure and
 * live in ../../sentence.ts. A rule may yield several clauses when one phrase is several
 * instructions ("Target player draws two cards and loses 2 life" is two clauses, one subject).
 *
 * Ids lose the S1 `spell.` prefix (D-062) because the same verbs serve spells and the bodies of
 * abilities (proposal 3.2).
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
  satisfy,
  sequence,
} from '../../combinators';
import type { IrArg, IrCost, IrNoun, IrNounList, IrZoneSpec, Span } from '../../ir/types';
import { FOR_EACH_TAIL, scaled } from '../amount/scaled';
import { defineRule, family, spanned } from '../registry';
import { ANGEL_EFFECT_RULES, UNTIL_SOURCE_LEAVES } from './angels';
import { ARDEN_EFFECT_RULES } from './arden';
import { ARTIFACT_EFFECT_RULES } from './artifacts';
import { ATTACH_RULES } from './attach';
import { BECOMES_RULES } from './becomes';
import { BITE_RULES, DAMAGE_AMOUNT } from './bite';
import { BRUNA_EFFECT_RULES } from './bruna';
import { EFFECT_CHANGE_TARGET } from './change-target';
import { CONTROL_EFFECT_RULES } from './control';
import { EFFECT_COPY_SPELL } from './copy-spell';
import { COUNTER_RULES } from './counters';
import { CROSS_ZONE_EFFECT_RULES } from './cross-zone';
import { DANITHA_G1B_EFFECT_RULES } from './danitha-g1b';
import { DANITHA_G2_EFFECT_RULES } from './danitha-g2';
import { DANITHA_G4_EFFECT_RULES } from './danitha-g4';
import { DAWNBREAK_EFFECT_RULES } from './dawnbreak';
import { DELAYED_RULES } from './delayed';
import { DINOSAUR_EFFECT_RULES } from './dinosaurs';
import { DRAGON_EFFECT_RULES } from './dragons';
import { DRAGON_LIBRARY_EFFECT_RULES } from './dragons-more';
import { FEATHER_G1_EFFECT_RULES } from './feather-g1';
import { FEATHER_G2_EFFECT_RULES } from './feather-g2';
import { FEATHER_G3_EFFECT_RULES } from './feather-g3';
import { FLICKER_RULES } from './flicker';
import { GAIN_RULES } from './gain';
import { GISA_G4_EFFECT_RULES } from './gisa-g4';
import { GISA_G5_EFFECT_RULES } from './gisa-g5';
import { GRANTED_STATIC_EFFECT_RULES } from './granted-static';
import { HASHATON_G5_EFFECT_RULES } from './hashaton-g5';
import { HASHATON_G7_EFFECT_RULES } from './hashaton-g7';
import { HASHATON_G8_EFFECT_RULES } from './hashaton-g8';
import { HASHATON_G9_EFFECT_RULES } from './hashaton-g9';
import { HASHATON_GROUP_4_EFFECT_RULES } from './hashaton-group-4';
import { HOFRI_EFFECT_RULES } from './hofri';
import { KORVOLD_EFFECT_RULES } from './korvold';
import { LIBRARY_RULES } from './library';
import { EFFECT_ADD_ADDITIONAL_MANA, EFFECT_ADD_MANA, EFFECT_CHOOSE_COLOR } from './mana';
import { MELD_EFFECT_RULES } from './meld';
import { NIV_EFFECT_RULES } from './niv';
import { NIV_GROUP_2B_B_EFFECT_RULES } from './niv-group-2b-b';
import { NIV_GROUP_3_A_EFFECT_RULES } from './niv-group-3-a';
import { NIV_GROUP_3_C_EFFECT_RULES } from './niv-group-3-c';
import {
  type Clauses,
  DAMAGE_RECIPIENTS,
  GRAVEYARD_OPERANDS,
  operands,
  type Restriction,
  SELF_OR_PERMANENT_OPERANDS,
  single,
  UNDER_CONTROL,
} from './operands';
import { EFFECT_PAY } from './pay';
import { PILES_EFFECT_RULES } from './piles';
import { PLANESWALKER_EFFECT_RULES } from './planeswalker';
import {
  EFFECT_DISCARD,
  EFFECT_DISCARD_HAND,
  EFFECT_DRAW,
  EFFECT_LIFE,
  EFFECT_MANIFEST,
  EFFECT_MILL,
  EFFECT_PLAYER,
  EFFECT_SHUFFLE,
} from './player';
import { PREVENT_RULES } from './prevent';
import { PUMP_RULES } from './pump';
import { PUT_RULES } from './put';
import { RECURSION_EFFECT_RULES } from './recursion';
import { REGENERATE_RULES } from './regenerate';
import { RESTRICT_RULES } from './restrict';
import { REVEAL_TAKE_EFFECT_RULES } from './reveal-take';
import { RING_EFFECT_RULES } from './ring';
import { SACRIFICE_RULES } from './sacrifice';
import { SEARCH_RULES } from './search';
import { TOKEN_EFFECT_RULES } from './token';
import { TRANSFORM_RULES } from './transform';
import { VOTE_EFFECT_RULES } from './vote';
import { VRASKA_EFFECT_RULES } from './vraska';

/** What "tap" and "untap" act on: a permanent, `~`, or "it" (stage P15). */
const TAP_OPERANDS = [
  ...SELF_OR_PERMANENT_OPERANDS,
  'noun.it',
  // Stage P31 (D-140): "tap enchanted creature" (the permanent the Aura is attached to).
  'noun.attached-permanent',
  // Stage P36 (D-178): "Then if you control four or more lands, untap that land." (the permanent an earlier instruction named).
  'noun.that-object',
] as const;

/** `effect.damage`: "~ deals 3 damage to any target" (CR 120.2: damage to an object or a player). */
export const EFFECT_DAMAGE = defineRule<Clauses>({
  id: 'effect.damage',
  family: 'effect',
  leading: ['~'],
  cites: ['CR 120.2 (Damage)', 'CR 115.4 (Targets)'],
  examples: [
    '~ deals 3 damage to any target',
    '~ deals three damage to target creature',
    '~ deals 2 damage to each opponent',
    '~ deals X damage to each creature you don’t control',
    '~ deals 2 damage to each creature and each player',
    '~ deals 2 damage to target creature or planeswalker',
    '~ deals 1 damage to any target for each time ~ was kicked',
    '~ deals 1 damage to each opponent for each time it was kicked',
    '~ deals 1 damage to each opponent for each creature you control',
    '~ deals 2 damage to any target for each time ~ was kicked',
    '~ deals damage equal to the greatest power among creatures you control to any target',
    '~ deals damage equal to the number of creatures you control to each opponent',
    // Stage P35 (D-176, CR 109.4): the controller of an object an earlier instruction named.
    '~ deals 2 damage to that permanent’s controller',
    '~ deals 2 damage to its controller',
  ],
  rejects: [
    '~ deals 2 damage to target creature and planeswalker',
    '~ deals 2 damage to that permanent’s controllers',
    '~ deals 2 damage to that player’s controller',
    '~ deals 2 damage to target creature’s controller',
    '~ deals X damage to any target for each time ~ was kicked',
    '~ deals 1 damage to any target for each time',
    '~ deals damage to target creature equal to its power',
    '~ deals a damage to any target',
  ],
  parse: single(
    'effect.damage',
    // "for each time it was kicked" (stage P17, CR 702.33c) and, since stage P28, every count of "for each" replaces
    // the "1", and a number above one multiplies it (an X, which would multiply two unknowns, is not read).
    satisfy(
      sequence(
        literal('~ deals '),
        DAMAGE_AMOUNT,
        literal(' to '),
        operands(DAMAGE_RECIPIENTS, 'effect.damage'),
        optional(FOR_EACH_TAIL, null),
      ),
      ([, amount, , , each]) => each === null || scaled(amount, each) !== null,
    ),
    ([, amount, , to, each]) => ({
      verb: 'dealDamage',
      args: { amount: each === null ? amount : (scaled(amount, each) ?? amount), to },
    }),
  ),
});

/**
 * `effect.damage-count`: "~ deals damage to target player equal to the number of creatures on the
 * battlefield" (CR 120.2: damage to an object or a player; CR 608.2c: the instruction counts as it
 * runs, D-095). One recipient that is a target or "you": a mass recipient ("each creature") or
 * several targets would count again for each, and the engine's amount is counted once per damage
 * instruction. The amount is a count of objects; "equal to its power" and the other references are
 * `effect.damage`'s neighbours and stay unread here.
 */
export const EFFECT_DAMAGE_COUNT = defineRule<Clauses>({
  id: 'effect.damage-count',
  family: 'effect',
  leading: ['~'],
  cites: ['CR 120.2 (Damage)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    '~ deals damage to target player equal to the number of creatures on the battlefield',
    '~ deals damage to any target equal to the number of cards in your hand',
    '~ deals damage to target creature equal to the number of lands you control',
    '~ deals damage to you equal to the number of creatures you control',
    // Stage P52 (D-210): the total mana value of the cards a mill before it milled.
    '~ deals damage to target opponent equal to the total mana value of those cards',
    '~ deals damage to that player equal to the total mana value of those cards',
  ],
  rejects: [
    '~ deals damage to that creature equal to the total mana value of those cards',
    '~ deals damage to target player equal to the total mana value of the cards',
    '~ deals damage to target player equal to the number of creatures',
    '~ deals damage to each creature equal to the number of lands you control',
    '~ deals damage to each opponent equal to the number of lands you control',
    '~ deals damage to two target creatures equal to the number of lands you control',
    '~ deals damage to target creature equal to its power',
    '~ deals damage to target player',
    '~ deals 2 damage to target player equal to the number of creatures you control',
    '~ deals X damage to target player equal to the number of creatures you control',
    'it deals damage to target player equal to the number of creatures you control',
  ],
  parse: single(
    'effect.damage-count',
    sequence(
      literal('~ deals damage to '),
      satisfy(
        family<IrNoun>('noun', { only: DAMAGE_RECIPIENTS }),
        (noun) =>
          // Stage P52 (D-210): "that player", the one a sentence before it asked (the binding pass makes it that target).
          (noun.det === 'target' ||
            noun.det === 'you' ||
            (noun.det === 'anaphor' && noun.rule === 'noun.that-player')) &&
          noun.count === undefined,
      ),
      literal(' '),
      family<IrArg>('amount', { only: ['amount.number-of', 'amount.milled-value-this-way'] }),
    ),
    ([, to, , amount]) => ({ verb: 'dealDamage', args: { amount, to } }),
  ),
});

/**
 * `effect.damage-it`: "it deals 4 damage", the ellipsis of "If ~ was kicked, it deals 4 damage
 * instead.": the spell deals a different amount to what the sentence before it dealt damage to.
 * It names no recipient, so it means something only as the "instead" of a damage sentence, and
 * the lowering of such a sentence is the only one that reads it (CR 614.1a: "instead" replaces an
 * event). Anywhere else "it" has nothing to mean and the clause is reported as not runnable.
 */
export const EFFECT_DAMAGE_IT = defineRule<Clauses>({
  id: 'effect.damage-it',
  family: 'effect',
  leading: ['it'],
  cites: ['CR 120.2 (Damage)', 'CR 614.1a (Replacement Effects)'],
  examples: ['it deals 4 damage', 'it deals three damage', 'It deals 2 damage'],
  rejects: [
    'it deals damage',
    'it deals X damage',
    'it deals 4 damage to target creature',
    '~ deals 4 damage',
    'it deals 4',
  ],
  parse: single(
    'effect.damage-it',
    sequence(
      literal('it deals '),
      family<IrArg>('amount', { only: ['amount.number'] }),
      literal(' damage'),
    ),
    ([, amount]) => ({ verb: 'dealDamage', args: { amount } }),
  ),
});

/**
 * `effect.damage-by-it`: "it deals 1 damage to you", "it deals 2 damage to any target": the
 * permanent the ability is on deals the damage (CR 120.2, 113.7a: "it" is the source, and the
 * source is what deals it). Only where the binding pass reads "it" as `~` itself (a trigger about
 * `~` that happens while it is on the battlefield) does it lower: damage from a target or from a
 * permanent that is gone needs a source the engine's damage does not name. Tried before
 * `effect.damage-it`, which reads the bare "it deals 4 damage" of an "instead" sentence.
 */
export const EFFECT_DAMAGE_BY_IT = defineRule<Clauses>({
  id: 'effect.damage-by-it',
  family: 'effect',
  leading: ['it'],
  cites: ['CR 120.2 (Damage)', 'CR 113.7a (Abilities)', 'CR 115.4 (Targets)'],
  examples: [
    'it deals 1 damage to you',
    'it deals 2 damage to any target',
    'It deals 1 damage to target opponent',
    'it deals 3 damage to each opponent',
    'it deals 2 damage to target creature or planeswalker',
    'it deals damage equal to its power to any target',
    'it deals X damage to any target',
    'it deals damage equal to the number of Dragons you control to any target',
  ],
  rejects: [
    'it deals damage equal to its power',
    'it deals 1 damage',
    'it deals damage to you',
    'it deals a damage to you',
    'it deals 1 damage to',
    'its deals 1 damage to you',
    '~ deals 1 damage to you',
  ],
  parse: single(
    'effect.damage-by-it',
    sequence(
      family<IrNoun>('noun', { only: ['noun.it'] }),
      literal(' deals '),
      DAMAGE_AMOUNT,
      literal(' to '),
      operands(DAMAGE_RECIPIENTS, 'effect.damage-by-it'),
    ),
    ([source, , amount, , to]) => ({ verb: 'dealDamage', args: { source, amount, to } }),
  ),
});

/** `effect.destroy`: "Destroy target creature" (CR 701.8). */
export const EFFECT_DESTROY = defineRule<Clauses>({
  id: 'effect.destroy',
  family: 'effect',
  leading: ['destroy'],
  cites: ['CR 701.8 (Destroy)'],
  examples: [
    'destroy target creature',
    'destroy all nonland permanents',
    'destroy each creature',
    'destroy target artifact, target creature, target enchantment, and target land',
    'destroy two target creatures',
    'destroy ~',
    'destroy up to two target creatures',
    'destroy up to one target artifact or enchantment',
  ],
  rejects: [
    'destroy it',
    'destroy up to two target creature',
    'destroy target card from a graveyard',
  ],
  parse: single(
    'effect.destroy',
    sequence(literal('destroy '), operands(SELF_OR_PERMANENT_OPERANDS, 'effect.destroy')),
    ([, objects]) => ({ verb: 'destroy', args: { objects } }),
  ),
});

/**
 * `effect.exile`: "Exile target creature", "Exile target card from a graveyard", "Exile target
 * player's graveyard" (CR 406, 701.13).
 */
export const EFFECT_EXILE = defineRule<Clauses>({
  id: 'effect.exile',
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 406.1 (Exile)', 'CR 701.13 (Exile)'],
  examples: [
    'exile target creature',
    'exile target card from a graveyard',
    "exile target creature card from an opponent's graveyard",
    'exile all creatures you control',
    'exile two target creatures',
    'exile target artifact or enchantment',
    'exile ~',
    "exile target player's graveyard",
    'exile target opponent’s graveyard',
    'exile all graveyards',
    'exile all cards from all graveyards',
    'exile it',
    'exile that card',
    'exile that card from your graveyard',
    'exile that creature',
    // D-407: the permanent an Aura or Equipment is attached to.
    'exile enchanted creature',
    'exile equipped creature',
    "exile each opponent's graveyard",
    // Stage P33 (D-150, CR 610.3): until the permanent with the ability leaves the battlefield.
    'exile target nonland permanent an opponent controls until ~ leaves the battlefield',
    'exile up to two target artifacts and/or enchantments',
    // D-270 (CR 115.1, 404.1): one slot of targets in two zones.
    'exile up to three other target creatures from the battlefield and/or creature cards from graveyards',
    // Stage P70 (D-231, CR 610.3): until an opponent becomes the monarch (Palace Jailer).
    'exile target creature an opponent controls until an opponent becomes the monarch',
  ],
  rejects: [
    'exile target creature until an opponent becomes the monarch or ~ leaves the battlefield',
    'exile target creature until you become the monarch',
    'exile all creatures until an opponent becomes the monarch',
    'exile target creature until ~ leaves',
    'exile target creature until end of turn',
    'exile target creature card from a graveyard until ~ leaves the battlefield',
    'exile all creatures until ~ leaves the battlefield',
    'exile target tapped artifact or enchantment',
    "exile target player's hand",
    'exile them',
    'exile this card from your hand',
    'exile that card from your hand',
    'exile that card from a graveyard',
    // D-270: the second half is another kind of target, which the slot of two zones does not say.
    'exile up to three other target creatures from the battlefield and/or creature cards from a graveyard',
    'exile up to three other target creatures from the battlefield and/or creature cards from graveyards until ~ leaves the battlefield',
  ],
  parse: single(
    'effect.exile',
    // Graveyard cards first: "target creature card from a graveyard" starts like a permanent phrase.
    satisfy(
      sequence(
        literal('exile '),
        operands(
          [
            ...GRAVEYARD_OPERANDS,
            'noun.player-graveyard',
            'noun.all-graveyards',
            // D-270: "up to three other target creatures from the battlefield and/or creature cards from graveyards" (the one verb that moves a card out of any zone).
            'noun.target-creatures-battlefield-or-graveyard',
            ...SELF_OR_PERMANENT_OPERANDS,
            // Stage P30 (D-135): "you may exile it" (the card a permanent became when it died, or a target of the text).
            'noun.it',
            // Stage P49 (D-206): "you may exile that card from your graveyard" (the card a trigger is about, CR 701.9a).
            'noun.that-card',
            // Stage P63 (D-216): "If you control three or more artifacts, exile that creature." (the target of the sentence before, CR 608.2c).
            'noun.that-object',
            // D-407 (Danitha deck): "Exile enchanted creature." (the permanent the Aura is attached to, which the engine's `attached` names).
            'noun.attached-permanent',
          ],
          'effect.exile',
        ),
        // The graveyard the card is in is the one it went to: "from your graveyard" after "that card" (CR 400.7).
        optional(literal(' from your graveyard'), null),
        // Stage P33 (D-150, CR 610.3): "... until ~ leaves the battlefield", of permanents that are targets only.
        optional(spanned(UNTIL_SOURCE_LEAVES), null),
        // Stage P70 (D-231, CR 610.3): "... until an opponent becomes the monarch".
        optional(spanned(literal(' until an opponent becomes the monarch')), null),
      ),
      ([, objects, , until, monarch]) =>
        (until === null && monarch === null) ||
        (objects.kind === 'noun' &&
          objects.det === 'target' &&
          objects.filter.zone === 'battlefield' &&
          // D-270: cards of graveyards are not put back by "until": the slot of two zones is exiled for good.
          objects.orCard === undefined &&
          objects.filter.player === undefined),
    ),
    ([, objects, , until, monarch]) => ({
      verb: 'exile',
      args: {
        objects,
        ...(until === null
          ? {}
          : { until: { kind: 'flag', value: true, span: until.span, rule: 'effect.exile' } }),
        ...(monarch === null
          ? {}
          : {
              untilMonarch: { kind: 'flag', value: true, span: monarch.span, rule: 'effect.exile' },
            }),
      },
    }),
  ),
});

const OWNERS_HAND = choice(
  pattern(/ to its owner['’]s hand/i),
  pattern(/ to their owner['’]s hand/i),
  pattern(/ to their owners['’] hands/i),
);

/** A card returned "to your hand" must come from your own graveyard; see `effect.return`. */
const YOUR_GRAVEYARD_ONLY: Restriction = {
  accept: (noun) => noun.filter.controller === 'you',
  // Where the refused words began: the " from ..." that names a graveyard that is not yours.
  locate: (noun, text) => text.indexOf(' from ', noun.span.start),
};

function zone(
  rule: string,
  span: Span,
  zoneName: IrZoneSpec['zone'],
  extra: Partial<IrZoneSpec> = {},
): IrZoneSpec {
  return { kind: 'zoneSpec', zone: zoneName, ...extra, span, rule };
}

/**
 * "return a land you control to its owner's hand": the controller chooses among the permanents that
 * match (CR 608.2d), so the noun is `noun.a-permanent`, as in "sacrifice a land". It must say "you
 * control": without it the choice would be among every player's permanents, and one object, not
 * "another" and not a count (the engine's `choose` selector of a return, CR 400.3).
 */
const RETURN_CHOSEN = map(
  sequence(
    literal('return '),
    satisfy(
      family<IrNoun>('noun', { only: ['noun.a-permanent'] }),
      (noun) => noun.filter.controller === 'you' && !noun.plural && !noun.other,
    ),
    spanned(pattern(/ to its owner['’]s hand/i)),
  ),
  ([, objects, to]): { objects: IrNoun | IrNounList; to: IrZoneSpec } => ({
    objects,
    to: zone('effect.return', to.span, 'hand', { whose: 'owner' }),
  }),
);

const RETURN_TO_HAND = map(
  sequence(
    literal('return '),
    operands(SELF_OR_PERMANENT_OPERANDS, 'effect.return'),
    spanned(OWNERS_HAND),
  ),
  ([, objects, to]): { objects: IrNoun | IrNounList; to: IrZoneSpec } => ({
    objects,
    to: zone('effect.return', to.span, 'hand', { whose: 'owner' }),
  }),
);

/**
 * "return it to its owner's hand" (stage P35, D-176, CR 700.4, 400.7): "it" is the card a permanent became when it went to its owner's
 * graveyard, "When ~ is put into a graveyard from the battlefield, return it to its owner's hand". The lowering reads it so in a trigger of ~
 * dying or leaving the battlefield, and refuses it anywhere else. Quiet: a line that returns "it" elsewhere ("return it to the battlefield")
 * stops where it always did.
 */
const RETURN_IT_TO_HAND: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = quiet(
  map(
    sequence(literal('return '), operands(['noun.it'], 'effect.return'), spanned(OWNERS_HAND)),
    ([, objects, to]): { objects: IrNoun | IrNounList; to: IrZoneSpec } => ({
      objects,
      to: zone('effect.return', to.span, 'hand', { whose: 'owner' }),
    }),
  ),
);

const TO_YOUR_HAND: Parser<IrZoneSpec> = map(spanned(literal(' to your hand')), ({ span }) =>
  zone('effect.return', span, 'hand', { whose: 'you' }),
);

/**
 * " with a +1/+1 counter on it", " with a finality counter on it" after the control (stage P68, D-230, CR 122.6, 122.1h): the card enters the battlefield with
 * the counter on it (a replacement effect, CR 614.1c), so it is there when anything triggers from the entering.
 */
const WITH_A_COUNTER = map(
  sequence(
    literal(' with a '),
    pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i),
    pattern(/ counter on it(?![\p{L}\p{N}])/iu),
  ),
  ([, name]) => ({ count: 1, counter: name[0].toLowerCase() }),
);

/** " to the battlefield", then "tapped" and the control when the text says them, in that order, then the counter it enters with. */
const TO_THE_BATTLEFIELD: Parser<IrZoneSpec> = map(
  spanned(
    sequence(
      literal(' to the battlefield'),
      optional(literal(' tapped'), null),
      optional(UNDER_CONTROL, null),
      optional(WITH_A_COUNTER, null),
    ),
  ),
  ({ value: [, tapped, whose, counters], span }) =>
    zone('effect.return', span, 'battlefield', {
      ...(tapped === null ? {} : { tapped: true }),
      ...(whose === null ? {} : { whose }),
      ...(counters === null ? {} : { counters }),
    }),
);

/**
 * "return that nonland permanent card to the battlefield", "return that card to your hand" (stage P33, D-150, CR 608.2c): the card an earlier
 * instruction of the text chose from a graveyard, which the lowering checks it is.
 */
const RETURN_THAT_CARD: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = quiet(
  map(
    sequence(
      literal('return '),
      operands(['noun.that-card'], 'effect.return'),
      choice(TO_THE_BATTLEFIELD, TO_YOUR_HAND),
    ),
    ([, objects, to]) => ({ objects, to }),
  ),
);

/**
 * "return the chosen cards to the battlefield tapped" (D-362, Victimize, CR 608.2c, 110.2a): the cards an earlier sentence chose as targets from a graveyard, which the
 * lowering checks they are. Only to the battlefield: "the chosen cards" to a hand is another sentence.
 */
const RETURN_THE_CHOSEN_CARDS: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = quiet(
  map(
    sequence(
      literal('return '),
      operands(['noun.the-chosen-cards'], 'effect.return'),
      TO_THE_BATTLEFIELD,
    ),
    ([, objects, to]) => ({ objects, to }),
  ),
);

/**
 * "return this card to its owner's hand" (stage P33, D-150, CR 400.7): the card of the source of the ability, wherever it is now (an Aura in
 * its owner's graveyard when "When enchanted creature dies" resolves).
 */
const RETURN_THIS_CARD: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = quiet(
  map(
    sequence(
      literal('return '),
      operands(['noun.this-card'], 'effect.return'),
      spanned(OWNERS_HAND),
    ),
    ([, objects, to]) => ({
      objects,
      to: zone('effect.return', to.span, 'hand', { whose: 'owner' }),
    }),
  ),
);

/**
 * Whether the clause ahead returns to the battlefield. The graveyard a card comes from matters only
 * for a return to a hand, so the operand is read with or without that restriction by what follows
 * it; either way a refusal fails where it always did.
 */
const TO_BATTLEFIELD_AHEAD = /^return [^.]*? to the battlefield/i;

const RETURN_FROM_GRAVEYARD: Parser<{ objects: IrNoun | IrNounList; to: IrZoneSpec }> = (
  ctx,
  pos,
) => {
  const toBattlefield = TO_BATTLEFIELD_AHEAD.test(ctx.text.slice(pos));
  const r = sequence(
    literal('return '),
    // D-386: "return X target creature cards from your graveyard to your hand" (as many targets as the X announced) is read here and by no other verb.
    operands(
      [...GRAVEYARD_OPERANDS, 'noun.x-target-graveyard-cards'],
      'effect.return',
      toBattlefield ? undefined : YOUR_GRAVEYARD_ONLY,
    ),
    toBattlefield ? TO_THE_BATTLEFIELD : TO_YOUR_HAND,
  )(ctx, pos);
  return r.ok ? { ok: true, value: { objects: r.value[1], to: r.value[2] }, pos: r.pos } : r;
};

/**
 * `effect.return`: "Return target creature to its owner's hand" and "Return target creature card
 * from a graveyard to the battlefield [tapped] [under your control | under its owner's control]".
 * A card put onto the battlefield enters under the control of the player performing the effect
 * unless the text says otherwise (CR 110.2a), so the bare form and "under your control" are the
 * same reading, and the owner's control is the stated exception. A card returned "to your hand"
 * must come from your own graveyard: from someone else's it would go to its owner's hand (CR 400.3),
 * which the AST cannot say, and the refusal points at "from ...".
 */
export const EFFECT_RETURN = defineRule<Clauses>({
  id: 'effect.return',
  family: 'effect',
  leading: ['return'],
  cites: ['CR 400.3 (General)', 'CR 406 (Exile)', 'CR 701.8 (Destroy)', 'CR 110.2a (Permanents)'],
  examples: [
    "return target creature to its owner's hand",
    'return target creature to its owner’s hand',
    "return all creatures to their owners' hands",
    'return target creature card from your graveyard to your hand',
    'return target creature card from your graveyard to the battlefield',
    // D-386 (Hashaton, group 10): as many targets as the X announced for the spell.
    'return X target creature cards from your graveyard to your hand',
    'return all land cards from your graveyard to the battlefield tapped',
    'return target creature card from a graveyard to the battlefield',
    'return target creature card from a graveyard to the battlefield under your control',
    "return target creature card from a graveyard to the battlefield under its owner's control",
    'return target creature card from your graveyard to the battlefield tapped under your control',
    "return target creature card from an opponent's graveyard to the battlefield tapped",
    "return ~ to its owner's hand",
    // Stage P35 (D-176): "it", the card a permanent became when it went to its owner's graveyard.
    "return it to its owner's hand",
    "return a land you control to its owner's hand",
    'return an artifact you control to its owner’s hand',
    "return a nonland permanent you control to its owner's hand",
    "return a Forest you control to its owner's hand",
    // Stage P33 (D-150): the card an earlier instruction chose, and the card of the source.
    'return that card to the battlefield',
    'return that nonland permanent card to the battlefield',
    'return that card to your hand',
    "return this card to its owner's hand",
    // D-362 (Victimize): the cards an earlier sentence chose as targets.
    'return the chosen cards to the battlefield',
    'return the chosen cards to the battlefield tapped',
  ],
  rejects: [
    "return that card to its owner's hand",
    'return that card to the battlefield tapped under your command',
    "return this card to its owner's library",
    "return this card from your graveyard to its owner's hand",
    'return this card to your hand',
    "return a land to its owner's hand",
    "return a creature an opponent controls to its owner's hand",
    "return another creature you control to its owner's hand",
    "return two lands you control to their owners' hands",
    'return a land you control to your hand',
    'return a land you control to the battlefield',
    "return ~ to its owner's hand tapped",
    'return ~ to the battlefield',
    "return it to its owner's hand tapped",
    "return them to their owners' hands",
    "return its to its owner's hand",
    "return target creature card from an opponent's graveyard to your hand",
    'return target creature card from a graveyard to your hand',
    'return target creature card from your graveyard to your hand under your control',
    'return X target creature cards from a graveyard to your hand',
    'return X target creature cards from your graveyard to your library',
    'return X target creature cards to your hand',
    'return target creature to the battlefield',
    'return target creature card from a graveyard to the battlefield under his control',
    'return target creature card from a graveyard to the battlefield under your control tapped',
    'return target creature card from a graveyard to the battlefield under your command',
    'return target creature card from a graveyard to the battlefield at the beginning of the next end step',
    'return the chosen cards to your hand',
    "return the chosen cards to their owners' hands",
    'return the chosen card to the battlefield',
    'return the chosen cards to the battlefield under their owners control',
  ],
  parse: single(
    'effect.return',
    choice<{ objects: IrNoun | IrNounList; to: IrZoneSpec }>(
      RETURN_TO_HAND,
      RETURN_IT_TO_HAND,
      RETURN_CHOSEN,
      RETURN_FROM_GRAVEYARD,
      RETURN_THAT_CARD,
      RETURN_THE_CHOSEN_CARDS,
      RETURN_THIS_CARD,
    ),
    ({ objects, to }) => ({ verb: 'return', args: { objects, to } }),
  ),
});

/**
 * `effect.counter`: "Counter target spell", "Counter target noncreature spell", "Counter target
 * instant or sorcery spell" (CR 701.6): the spell is a target of the kind its words describe (CR
 * 115.1). "unless its controller pays" and the clauses after it are other rules' business.
 */
export const EFFECT_COUNTER = defineRule<Clauses>({
  id: 'effect.counter',
  family: 'effect',
  leading: ['counter'],
  cites: ['CR 701.6 (Counter)'],
  examples: [
    'counter target spell',
    'counter target noncreature spell',
    'counter target creature spell',
    'counter target instant or sorcery spell',
    'counter target enchantment, instant, or sorcery spell',
    'counter target blue spell',
    'counter target spell with mana value 1',
    // Stage P50 (D-207): a triggered ability or a spell.
    'counter target triggered ability or colorless spell',
  ],
  rejects: [
    'counter target spell unless its controller pays {1}',
    'counter target spell with mana value X or less',
    'counter target creature',
    'counter all spells',
    'counter target spell or ability',
  ],
  parse: single(
    'effect.counter',
    sequence(
      literal('counter '),
      family<IrNoun>('noun', {
        only: ['noun.target-spell', 'noun.target-triggered-ability-or-spell'],
      }),
    ),
    ([, objects]) => ({ verb: 'counter', args: { objects } }),
  ),
});

/** Succeeds, reading nothing, when the text from here on matches `re`; fails here otherwise. */
function lookahead(re: RegExp): Parser<null> {
  return (ctx, pos) =>
    re.test(ctx.text.slice(pos)) ? { ok: true, value: null, pos } : fail(ctx, pos);
}

/**
 * `effect.counter-unless`: "Counter target spell unless its controller pays {3}", "Counter target
 * noncreature spell unless its controller pays {2}" (CR 701.6 counter; CR 118.12a: "unless" a player
 * pays a cost, that player may pay it as the effect resolves, and CR 608.2d: the choice is the
 * controller of the spell's, not of the counterspell). The cost is plain mana: the engine has no
 * {X} here, and "pays N life" has no line of the corpus yet. Tried before `effect.counter`, whose
 * phrase is a prefix of this one.
 */
export const EFFECT_COUNTER_UNLESS = defineRule<Clauses>({
  id: 'effect.counter-unless',
  family: 'effect',
  leading: ['counter'],
  cites: ['CR 701.6 (Counter)', 'CR 118.12a (Costs)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: [
    'counter target spell unless its controller pays {3}',
    'counter target spell unless its controller pays {1}',
    'counter target noncreature spell unless its controller pays {2}',
    'counter target instant or sorcery spell unless its controller pays {1}',
    'counter target creature spell unless its controller pays {2}{U}',
  ],
  rejects: [
    'counter target spell unless its controller pays {X}',
    'counter target spell unless its controller pays 2 life',
    'counter target spell unless its controller pays',
    'counter target spell unless that player pays {3}',
    'counter target spell unless you pay {3}',
    'counter target spell unless its controller pays {R/W}',
    'counter target spell',
    'counter target creature unless its controller pays {3}',
    'counter target spell unless its controller discards a card',
  ],
  parse: single(
    'effect.counter-unless',
    // A line with no "unless" is `effect.counter`'s: failing here at its first word keeps the
    // diagnostic of "Counter target spell with mana value X or less" where the noun rule stopped.
    sequence(
      lookahead(/^counter [^.]*? unless /i),
      literal('counter '),
      family<IrNoun>('noun', { only: ['noun.target-spell'] }),
      literal(' unless its controller pays '),
      spanned(family<IrCost>('cost', { only: ['cost.mana'] })),
    ),
    ([, , objects, , cost]) => ({
      verb: 'counterUnlessPays',
      args: {
        objects,
        cost: {
          kind: 'costList',
          costs: [cost.value],
          span: cost.span,
          rule: 'effect.counter-unless',
        },
      },
    }),
  ),
});

function tapRule(verb: 'tap' | 'untap'): ReturnType<typeof defineRule<Clauses>> {
  const id = `effect.${verb}`;
  return defineRule<Clauses>({
    id,
    family: 'effect',
    leading: [verb],
    cites: ['CR 701.26 (Tap and Untap)'],
    // "Untap it" (stage P15): the pronoun is a target an earlier sentence chose, or `~` in a trigger
    // about itself; the binding pass decides, and an "it" with nothing to mean is not lowered.
    examples:
      verb === 'tap'
        ? [
            'tap target creature',
            'tap all creatures your opponents control',
            'tap ~',
            'tap it',
            'tap another target creature',
            'tap enchanted creature',
            'tap that creature',
          ]
        : [
            'untap target land',
            'untap all lands you control',
            'untap ~',
            'untap it',
            'untap another target artifact',
            'untap target Forest',
            'untap that land',
          ],
    rejects:
      verb === 'tap'
        ? ['tap target spell', 'untap target land', 'tap them', 'tap that creatures']
        : ['untap target spell', 'untap them', 'untap that lands', 'untap itself'],
    parse: single(id, sequence(literal(`${verb} `), operands(TAP_OPERANDS, id)), ([, objects]) => ({
      verb,
      args: { objects },
    })),
  });
}

export const EFFECT_TAP = tapRule('tap');
export const EFFECT_UNTAP = tapRule('untap');

export const EFFECT_RULES = [
  // D-438, D-439 (Feather, group 3): the copies for each other creature and the exile as a spell resolves start like a plain copy, a plain exile and "that player ...", and are tried first.
  ...FEATHER_G3_EFFECT_RULES,
  // Gisa deck, group 4 (issue 41, D-459, D-460): "Exile it at the beginning of the next end step." and "Put each creature card exiled with ~ onto the battlefield ..." start like a plain
  // exile and a plain put, and "It gains haste." like a gain: tried first.
  ...GISA_G4_EFFECT_RULES,
  EFFECT_DAMAGE,
  EFFECT_DAMAGE_COUNT,
  ...BITE_RULES,
  // Stage P32 (D-147): fights, doubling, the excess damage of trample, revealing until, casting for free, a token for each, divided damage.
  ...DINOSAUR_EFFECT_RULES,
  // Stage P34 (D-152): the top cards exiled and played, an extra combat, Discover, revealing the top card, Behold and the rider of mana.
  ...DRAGON_EFFECT_RULES,
  ...DRAGON_LIBRARY_EFFECT_RULES,
  ...KORVOLD_EFFECT_RULES,
  // Issue 25 (the Niv-Mizzet deck): "shuffle ~ and your graveyard into their owner's library".
  ...NIV_EFFECT_RULES,
  ...NIV_GROUP_2B_B_EFFECT_RULES,
  // D-337: "copy it for each time you've cast your commander from the command zone this game".
  ...NIV_GROUP_3_A_EFFECT_RULES,
  ...NIV_GROUP_3_C_EFFECT_RULES,
  ...HASHATON_G7_EFFECT_RULES,
  // D-367: "amass Zombies 1".
  ...HASHATON_GROUP_4_EFFECT_RULES,
  ...CONTROL_EFFECT_RULES,
  // Stage P44 (D-195): "starting with you, each player votes for profit or security".
  ...VOTE_EFFECT_RULES,
  // Stage P45 (D-197): "The Ring tempts you."
  ...RING_EFFECT_RULES,
  ...PLANESWALKER_EFFECT_RULES,
  EFFECT_DAMAGE_BY_IT,
  EFFECT_DAMAGE_IT,
  EFFECT_DESTROY,
  // Stage P70 (D-278): "exile them, then meld them into X" starts like a plain exile and is tried before it.
  ...MELD_EFFECT_RULES,
  // The flicker sentence starts like a plain exile and must be tried first: the first rule that
  // reads a prefix of the text wins, and no rule backtracks into another.
  ...FLICKER_RULES,
  EFFECT_EXILE,
  EFFECT_RETURN,
  // Before the plain counter: its phrase is a prefix of this one.
  EFFECT_COUNTER_UNLESS,
  EFFECT_COUNTER,
  EFFECT_COPY_SPELL,
  // Stage P38 (D-182): changing the target of a spell or ability with a single target.
  EFFECT_CHANGE_TARGET,
  // Stage P33 (D-150): proliferate, an exile for each opponent, and the sentences about the ability before them.
  ...ANGEL_EFFECT_RULES,
  // D-362 (Hashaton, group 8): "Choose target creature card in your graveyard.", before `effect.choose-target` of the Vraska rules, which reads "choose target creature".
  ...HASHATON_G8_EFFECT_RULES,
  // D-385 (Hashaton, group 5): "for each token you control of the chosen type that entered this turn, create a token that's a copy of it", before the "for each" rules of the Vraska rules.
  ...HASHATON_G5_EFFECT_RULES,
  // Stage P50 (D-207): "remove all counters from it".
  ...VRASKA_EFFECT_RULES,
  // Stage P69 (D-256, D-257): the Bruna deck, "Do this only once each turn" and "pay {X}, where X is less than or equal to the amount of life you gained".
  ...BRUNA_EFFECT_RULES,
  // D-270: "return the exiled cards to their owners' hands" (Angel of Serenity).
  ...CROSS_ZONE_EFFECT_RULES,
  // Stage P69 (D-271): rolling a die, "roll a four-sided die".
  ...ARDEN_EFFECT_RULES,
  // Stage P69 (D-276): "It gains \"You can't lose the game and your opponents can't win the game.\"" with no duration.
  ...GRANTED_STATIC_EFFECT_RULES,
  // Stage P69 (D-272): Dawnbreak Reclaimer, "choose a creature card in an opponent's graveyard, then that player chooses ...".
  ...DAWNBREAK_EFFECT_RULES,
  // Stage P68 (D-229): the Hofri Ghostforge deck.
  ...HOFRI_EFFECT_RULES,
  // D-393, D-394 (Hashaton, group 9): the body of Rona, Tolarian Obliterator.
  ...HASHATON_G9_EFFECT_RULES,
  ...DANITHA_G1B_EFFECT_RULES,
  // Issue 26 (D-411): "you may put a land card from among them into your hand" after a mill.
  ...DANITHA_G2_EFFECT_RULES,
  ...DANITHA_G4_EFFECT_RULES,
  // Issue 27 (D-445, D-446): "Monstrosity 5" and the second damage of "~ deals 4 damage to X and 2 damage to Y".
  ...FEATHER_G2_EFFECT_RULES,
  // Issue 41 (D-481): "you may have target player lose life equal to the number of Zombies on the battlefield".
  ...GISA_G5_EFFECT_RULES,
  // Feather deck, group 1 (issue 27, D-451, D-457): protection for the turn (before `effect.gain-keyword`, which refuses it) and "Until end of turn, double target creature's power and it gains first strike.".
  ...FEATHER_G1_EFFECT_RULES,
  // D-303: "Reveal the top five cards of your library. An opponent separates those cards into two piles. ..." (three sentences kept together).
  ...PILES_EFFECT_RULES,
  // D-396 (CR 701.20a): "Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard."
  ...REVEAL_TAKE_EFFECT_RULES,
  // Stage P31 (D-140): before `effect.tap`, which reads "tap" and stops at the count.
  ...ARTIFACT_EFFECT_RULES,
  EFFECT_TAP,
  EFFECT_UNTAP,
  EFFECT_ADD_ADDITIONAL_MANA,
  EFFECT_ADD_MANA,
  // The sentence before "Add an amount of mana of that color equal to your devotion to that color" (Nykthos, Shrine to Nyx).
  EFFECT_CHOOSE_COLOR,
  // Before `effect.player` and `effect.draw`: "you draw a card" is a prefix of the delayed draw (stage P26).
  ...DELAYED_RULES,
  EFFECT_PLAYER,
  EFFECT_DRAW,
  // Before `effect.discard`: "discard their hand" has no number of cards.
  EFFECT_DISCARD_HAND,
  EFFECT_DISCARD,
  EFFECT_LIFE,
  EFFECT_MANIFEST,
  EFFECT_MILL,
  EFFECT_SHUFFLE,
  ...SACRIFICE_RULES,
  ...COUNTER_RULES,
  ...TOKEN_EFFECT_RULES,
  ...PUMP_RULES,
  ...GAIN_RULES,
  ...RESTRICT_RULES,
  ...BECOMES_RULES,
  ...SEARCH_RULES,
  ...PREVENT_RULES,
  ...TRANSFORM_RULES,
  ...ATTACH_RULES,
  ...LIBRARY_RULES,
  ...PUT_RULES,
  ...RECURSION_EFFECT_RULES,
  ...REGENERATE_RULES,
  EFFECT_PAY,
];
