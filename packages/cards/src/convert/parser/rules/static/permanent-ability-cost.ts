/**
 * Static statement of the Food and Fellowship deck, group B (Sam, Loyal Attendant): "Activated abilities of Foods you control cost {1} less to activate." (CR 601.2f, 602.2b,
 * 118.7). The cost of an ability is reduced like the cost of a spell: only the generic mana, never below zero.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';

/** The artifact types (CR 205.3g) and enchantment types (CR 205.3h) a group of permanents may be named by: none of them is a creature type or has a mana ability of its own to be reduced. */
const ARTIFACT_ENCHANTMENT_TYPES: ReadonlySet<string> = new Set([
  'Blood',
  'Clue',
  'Equipment',
  'Food',
  'Fortification',
  'Gold',
  'Junk',
  'Map',
  'Powerstone',
  'Aura',
  'Curse',
  'Saga',
  'Shrine',
]);

/**
 * `static.permanent-ability-cost-reduction`: "Activated abilities of Foods you control cost {1} less to activate." A static ability of a permanent: the engine's
 * `abilityCostReduction` of the abilities of the permanents on the battlefield that a plural noun with no determiner names ("Foods you control", "creatures you control"), whoever
 * activates them. Only a group named by a subtype of artifact or enchantment ("Foods", "Clues", "Equipment"): the engine reduces the activated abilities that are not mana abilities, and a
 * card type or a creature type may have a mana ability with generic mana in its cost, which this does not reduce, so those are not read. Whole numbers of generic mana only.
 * Not read: "cost {X} less", colored mana, "more", a missing "to activate", a count after it, a singular or a determiner ("a", "all"), a group that is not the controller's own
 * ("Foods"), "of cards in your graveyard" (the other rule).
 */
export const STATIC_PERMANENT_ABILITY_COST_REDUCTION = defineRule<IrStatic>({
  id: 'static.permanent-ability-cost-reduction',
  family: 'static',
  leading: ['activated'],
  cites: [
    'CR 601.2f (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
    'CR 118.7 (Costs)',
  ],
  examples: [
    'Activated abilities of Foods you control cost {1} less to activate.',
    'Activated abilities of Clues you control cost {1} less to activate.',
    'Activated abilities of Equipment you control cost {2} less to activate.',
  ],
  rejects: [
    'Activated abilities of Foods you control cost {1} less to activate',
    'Activated abilities of Foods you control cost {X} less to activate.',
    'Activated abilities of Foods you control cost {G} less to activate.',
    'Activated abilities of Foods you control cost {0} less to activate.',
    'Activated abilities of Foods you control cost {1} more to activate.',
    'Activated abilities of Foods you control cost {1} less to cast.',
    'Activated abilities of Foods you control cost {1}{G} less to activate.',
    'Activated abilities of Foods you control cost {1} less to activate for each Food you control.',
    'Activated abilities of a Food you control cost {1} less to activate.',
    'Activated abilities of all Foods cost {1} less to activate.',
    'Activated abilities of Foods cost {1} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {1} less to activate.',
    'Activated abilities of creatures you control cost {1} less to activate.',
    'Activated abilities of artifacts you control cost {1} less to activate.',
    'Activated abilities of Elves you control cost {1} less to activate.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.permanent-ability-cost-reduction';
    const r = sequence(
      literal('activated abilities of '),
      family<IrNoun>('noun', { only: ['noun.plain-permanents'] }),
      literal(' cost '),
      pattern(/\{([1-9]\d*)\}/),
      literal(' less to activate'),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, objects, , amount] = r.value;
    // Only a group of permanents the player controls: the engine reads "you" as the controller of the permanent with this ability.
    if (objects.filter.controller !== 'you') return fail(ctx, pos);
    const { subtypes, types, anyOf } = objects.filter;
    if (
      anyOf !== undefined ||
      subtypes === undefined ||
      subtypes.length === 0 ||
      !subtypes.every((t) => ARTIFACT_ENCHANTMENT_TYPES.has(t)) ||
      (types ?? []).some((t) => t === 'creature')
    ) {
      return fail(ctx, pos);
    }
    const subject: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos },
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'permanentAbilityCostReduction', amount: Number(amount[1]), objects }],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.first-artifact-ability-cost-reduction`: "The first activated ability of an artifact you activate each turn costs {2} less to activate." (Tezzeret, Betrayer of Flesh, issue 128; CR
 * 601.2f, 602.2b, 605.1a, 118.7). A static ability of a permanent: the engine's `abilityCostReduction` of the abilities of the artifacts its controller has, only the first one the controller
 * activates in the turn (a mana ability counts), generic mana only, never below zero. Not read: another number, "{X}", colored mana, "more", "second", a missing "each turn", another kind of
 * permanent, "you" left out, a missing "to activate".
 */
export const STATIC_FIRST_ARTIFACT_ABILITY_COST_REDUCTION = defineRule<IrStatic>({
  id: 'static.first-artifact-ability-cost-reduction',
  family: 'static',
  leading: ['the'],
  cites: [
    'CR 601.2f (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
    'CR 605.1a (Mana Abilities)',
    'CR 118.7 (Costs)',
  ],
  examples: [
    'The first activated ability of an artifact you activate each turn costs {2} less to activate.',
    'The first activated ability of an artifact you activate each turn costs {1} less to activate.',
  ],
  rejects: [
    'The first activated ability of an artifact you activate each turn costs {2} less to activate',
    'The first activated ability of an artifact you activate each turn costs {X} less to activate.',
    'The first activated ability of an artifact you activate each turn costs {G} less to activate.',
    'The first activated ability of an artifact you activate each turn costs {0} less to activate.',
    'The first activated ability of an artifact you activate each turn costs {2} more to activate.',
    'The first activated ability of an artifact you activate costs {2} less to activate.',
    'The second activated ability of an artifact you activate each turn costs {2} less to activate.',
    'The first activated ability of a creature you activate each turn costs {2} less to activate.',
    'The first activated ability of an artifact you activate each turn costs {2} less to cast.',
    'The first activated ability of an artifact an opponent controls activate each turn costs {2} less to activate.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.first-artifact-ability-cost-reduction';
    const r = sequence(
      literal('the first activated ability of an artifact you activate each turn costs '),
      pattern(/\{([1-9]\d*)\}/),
      literal(' less to activate'),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, amount] = r.value;
    const span = { start: pos, end: r.pos };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: { types: ['artifact'], controller: 'you', raw: 'artifacts you control' },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: id,
    };
    const subject: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos },
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [
          {
            kind: 'permanentAbilityCostReduction',
            amount: Number(amount[1]),
            objects,
            firstEachTurn: true,
          },
        ],
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const PERMANENT_ABILITY_COST_STATIC_RULES = [
  STATIC_PERMANENT_ABILITY_COST_REDUCTION,
  STATIC_FIRST_ARTIFACT_ABILITY_COST_REDUCTION,
];
