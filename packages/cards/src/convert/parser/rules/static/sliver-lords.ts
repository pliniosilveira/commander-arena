/**
 * Static rules of the Sliver Swarm deck (issue 133), group B: "The "legend rule" doesn't apply to Slivers you control.", "Slivers you control and nontoken creatures you control are the
 * chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield." and "Each Sliver
 * creature card in your graveyard has encore {X}, where X is its mana value."
 */
import { fail, literal, pattern, quiet, sequence } from '../../combinators';
import type { IrFilter, IrNoun, IrStatic } from '../../ir/types';
import { BOUNDARY, SUBTYPE_WORD } from '../noun/phrases';
import { defineRule, family } from '../registry';

const PLAIN: { only: string[] } = { only: ['noun.plain-permanents'] };

/** The filter keys the rules below keep: what the permanents are, whose they are and whether they are tokens. A quality the engine's filter does not read here is never dropped. */
const OWN_KEYS: ReadonlySet<string> = new Set([
  'raw',
  'types',
  'subtypes',
  'controller',
  'token',
  'zone',
]);

const isOwnGroup = (noun: IrNoun): boolean =>
  !noun.other &&
  noun.filter.controller === 'you' &&
  (noun.filter.zone === undefined || noun.filter.zone === 'battlefield') &&
  Object.keys(noun.filter).every((k) => OWN_KEYS.has(k));

/** The group as the engine names it: the permanents of the battlefield by what they are, with no zone of their own. */
const unzoned = (noun: IrNoun): IrNoun => {
  const { zone, ...filter } = noun.filter;
  void zone;
  return { ...noun, filter };
};

const staticOf = (
  rule: string,
  subject: IrNoun,
  effect: IrStatic['effects'][number],
  start: number,
  end: number,
): IrStatic => ({
  kind: 'static',
  subject,
  effects: [effect],
  span: { start, end },
  rule,
});

const LEGEND_RULE = 'static.legend-rule-doesnt-apply';

/**
 * `static.legend-rule-doesnt-apply`: "The "legend rule" doesn't apply to Slivers you control." (CR 704.5j: the legend rule; CR 604.1: a static ability of a permanent). The permanents the
 * group names, which the controller of the permanent controls, are not subject to the legend rule while it is on the battlefield. The group is the plural permanents of the controller's
 * own (`noun.plain-permanents`). The engine's `legendRuleDoesntApply`. Not read: a group that is not the controller's own ("Slivers", "Slivers your opponents control"), "other", a
 * second sentence, no period, another rule ("The "commander tax" doesn't apply ...").
 */
export const STATIC_LEGEND_RULE_DOESNT_APPLY = defineRule<IrStatic>({
  id: LEGEND_RULE,
  family: 'static',
  leading: ['the'],
  cites: ['CR 704.5j (State-Based Actions)', 'CR 604.1 (Handling Static Abilities)'],
  examples: [
    'The "legend rule" doesn\'t apply to Slivers you control.',
    'The “legend rule” doesn’t apply to Slivers you control.',
    'The "legend rule" doesn\'t apply to creatures you control.',
  ],
  rejects: [
    'The "legend rule" doesn\'t apply to Slivers you control',
    'The "legend rule" doesn\'t apply to Slivers.',
    'The "legend rule" doesn\'t apply to Slivers your opponents control.',
    'The "legend rule" doesn\'t apply to other Slivers you control.',
    'The "legend rule" doesn\'t apply to Slivers you control and gain 1 life.',
    'The "legend rule" applies to Slivers you control.',
    'The "commander tax" doesn\'t apply to Slivers you control.',
    'The "legend rule" doesn\'t apply to Sliver you control.',
    'The "legend rule" doesn\'t apply to Slivers you control unless you control a Forest.',
  ],
  parse: (ctx, pos) => {
    // The words up to the group decide whether this is the statement at all: their failure is no trace in the diagnostics.
    const head = quiet(pattern(/the ["“]legend rule["”] doesn['’]t apply to /iu))(ctx, pos);
    if (!head.ok) return head;
    const subject = quiet(family<IrNoun>('noun', PLAIN))(ctx, head.pos);
    if (!subject.ok) return subject;
    if (!isOwnGroup(subject.value)) return fail(ctx, pos);
    const end = literal('.')(ctx, subject.pos);
    if (!end.ok) return end;
    return {
      ok: true,
      value: staticOf(
        LEGEND_RULE,
        unzoned(subject.value),
        { kind: 'legendRuleDoesntApply' },
        pos,
        end.pos,
      ),
      pos: end.pos,
    };
  },
});

const CHOSEN_TYPE = 'static.groups-are-the-chosen-type';

/**
 * `static.groups-are-the-chosen-type`: "Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for
 * creature spells you control and creature cards you own that aren't on the battlefield." (CR 205.3m, 613.1d, 607.2d, 604.3). The two groups of the controller's own permanents have the
 * creature type the permanent chose as it entered, in layer 4, and so do the creature spells it controls and the creature cards it owns outside the battlefield (as Changeling works in
 * every zone, CR 702.73a). The two sentences are one statement: the second is read only after the first, in the words the card prints. The engine's `giveChosenCreatureType`. Not read: the
 * first sentence alone (the engine has no effect for the battlefield only), another second sentence, another group in the first sentence (one group, three groups), another ending of the
 * first sentence ("every creature type", no "in addition to"), a group of another controller.
 */
export const STATIC_GROUPS_ARE_THE_CHOSEN_TYPE = defineRule<IrStatic>({
  id: CHOSEN_TYPE,
  family: 'static',
  leading: [],
  cites: [
    'CR 205.3m (Subtypes)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 607.2d (Linked Abilities)',
    'CR 604.3 (Handling Static Abilities)',
    'CR 702.73a (Changeling)',
  ],
  examples: [
    "Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    "Elves you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
  ],
  rejects: [
    'Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types.',
    "Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield",
    'Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control.',
    "Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you cast and creature cards you own that aren't on the battlefield.",
    "Slivers you control and nontoken creatures you control are the chosen type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    "Slivers you control and nontoken creatures you control are every creature type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    "Slivers and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    "Slivers you control and nontoken creatures your opponents control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    "Slivers you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    "Slivers you control, nontoken creatures you control and Goblins you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    'Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that are on the battlefield.',
  ],
  parse: (ctx, pos) => {
    const first = quiet(family<IrNoun>('noun', PLAIN))(ctx, pos);
    if (!first.ok) return first;
    const and = literal(' and ')(ctx, first.pos);
    if (!and.ok) return and;
    const second = quiet(family<IrNoun>('noun', PLAIN))(ctx, and.pos);
    if (!second.ok) return second;
    // A creature type of the controller's own, and the nontoken creatures of the controller's own: no other group or quality.
    const tribe = unzoned(first.value).filter;
    const nontoken = unzoned(second.value).filter;
    if (
      !isOwnGroup(first.value) ||
      !isOwnGroup(second.value) ||
      tribe.subtypes?.length !== 1 ||
      tribe.types !== undefined ||
      tribe.token !== undefined ||
      nontoken.subtypes !== undefined ||
      nontoken.types?.length !== 1 ||
      nontoken.types[0] !== 'creature' ||
      nontoken.token !== false
    ) {
      return fail(ctx, pos);
    }
    const tail = pattern(
      / are the chosen type in addition to their other creature types\. the same is true for creature spells you control and creature cards you own that aren['’]t on the battlefield\./iu,
    )(ctx, second.pos);
    if (!tail.ok) return tail;
    const raw = ctx.text.slice(pos, second.pos);
    const group: IrFilter = { anyOf: [tribe, nontoken], raw };
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: group,
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: second.pos },
      rule: CHOSEN_TYPE,
    };
    return {
      ok: true,
      value: staticOf(CHOSEN_TYPE, subject, { kind: 'chosenTypeGroups' }, pos, tail.pos),
      pos: tail.pos,
    };
  },
});

const GRAVEYARD_ENCORE = 'static.graveyard-cards-have-encore';

/**
 * `static.graveyard-cards-have-encore`: "Each Sliver creature card in your graveyard has encore {X}, where X is its mana value." (CR 702.141a: Encore; CR 202.3: mana value; CR 613.1f,
 * 604.3). The creature cards of one creature type in the graveyard of the controller of the permanent have an Encore ability whose cost is the generic mana of the card's own mana
 * value, for as long as the permanent is on the battlefield. The engine's `grantEncoreToGraveyardCards`. Not read: another graveyard ("a graveyard", "your opponents' graveyards"), another
 * zone, another cost ("equal to its power"), another keyword, a card with no creature type, a quality of the cards ("with mana value 3 or less"), no period.
 */
export const STATIC_GRAVEYARD_CARDS_HAVE_ENCORE = defineRule<IrStatic>({
  id: GRAVEYARD_ENCORE,
  family: 'static',
  leading: ['each'],
  cites: [
    'CR 702.141a (Encore)',
    'CR 202.3 (Mana Value)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 604.3 (Handling Static Abilities)',
  ],
  examples: [
    'Each Sliver creature card in your graveyard has encore {X}, where X is its mana value.',
    'Each Goblin creature card in your graveyard has encore {X}, where X is its mana value.',
  ],
  rejects: [
    'Each Sliver creature card in your graveyard has encore {X}, where X is its mana value',
    'Each Sliver creature card in your graveyard has encore {X}.',
    'Each Sliver creature card in your graveyard has encore {X}, where X is its power.',
    'Each Sliver creature card in your graveyard has encore {2}, where X is its mana value.',
    'Each Sliver creature card in a graveyard has encore {X}, where X is its mana value.',
    "Each Sliver creature card in your opponents' graveyards has encore {X}, where X is its mana value.",
    'Each Sliver creature card in your hand has encore {X}, where X is its mana value.',
    'Each Sliver creature card in your graveyard has unearth {X}, where X is its mana value.',
    'Each creature card in your graveyard has encore {X}, where X is its mana value.',
    'Each Sliver card in your graveyard has encore {X}, where X is its mana value.',
    'Each Sliver creature card in your graveyard has encore {X}, where X is its converted mana cost.',
    'Each Sliver creature card in your graveyard has encore {X} and flying, where X is its mana value.',
  ],
  parse: (ctx, pos) => {
    const lead = sequence(
      quiet(literal('each ')),
      quiet(
        pattern(new RegExp(`(${SUBTYPE_WORD}) creature card in your graveyard${BOUNDARY}`, 'u')),
      ),
    )(ctx, pos);
    if (!lead.ok) return lead;
    const tail = pattern(/ has encore \{x\}, where x is its mana value\./iu)(ctx, lead.pos);
    if (!tail.ok) return tail;
    const subtype = lead.value[1][1] ?? '';
    const filter: IrFilter = {
      types: ['creature'],
      subtypes: [subtype],
      card: true,
      raw: ctx.text.slice(pos + 5, lead.pos),
    };
    const subject: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: 'You' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 4 },
      rule: GRAVEYARD_ENCORE,
    };
    return {
      ok: true,
      value: staticOf(
        GRAVEYARD_ENCORE,
        subject,
        {
          kind: 'graveyardEncore',
          cards: {
            kind: 'noun',
            det: 'each',
            filter,
            upTo: false,
            plural: true,
            other: false,
            span: { start: pos + 5, end: lead.pos },
            rule: GRAVEYARD_ENCORE,
          },
        },
        pos,
        tail.pos,
      ),
      pos: tail.pos,
    };
  },
});

export const SLIVER_LORDS_STATIC_RULES = [
  STATIC_LEGEND_RULE_DOESNT_APPLY,
  STATIC_GROUPS_ARE_THE_CHOSEN_TYPE,
  STATIC_GRAVEYARD_CARDS_HAVE_ENCORE,
];
