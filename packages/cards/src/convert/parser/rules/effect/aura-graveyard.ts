/**
 * Effect rules of the Aura that returns the card it enchants (issue 89, Animate Dead; CR 702.5a, 613.1f, 400.7, 303.4, 701.21). The text is one linked pair of triggered abilities: the
 * enters ability changes the enchant ability of the Aura, returns the card and attaches the Aura to it, and the leaves ability makes the creature's controller sacrifice that creature.
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

/** `enchant <noun>`, as the quoted ability of an Aura says it: "enchant creature card in a graveyard", "enchant creature put onto the battlefield with ~". */
const enchantWords = (only: readonly string[]) =>
  map(sequence(literal('enchant '), family<IrNoun>('noun', { only })), ([, noun]) => noun);

/**
 * `effect.aura-swaps-enchant`: `it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ~."` (CR 702.5a Enchant, 613.1f, 611.2a):
 * the Aura the ability belongs to has one enchant ability and then another. The engine's `replaceEnchant` of `this`, which lasts for as long as the Aura stays on the battlefield. The
 * lost ability is an enchant ability of a permanent or of a card in a graveyard; the gained one is "enchant [type] put onto the battlefield with ~", whose period is the quote's own. Not
 * read: another subject ("enchanted creature loses ..."), a lost or gained ability that is not an enchant ability, a quote with no period, more words after the quote, "gains" first.
 */
export const EFFECT_AURA_SWAPS_ENCHANT = defineRule<Clauses>({
  id: 'effect.aura-swaps-enchant',
  family: 'effect',
  leading: ['it'],
  cites: [
    'CR 702.5a (Enchant)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ~."',
    'it loses "enchant land card in a graveyard" and gains "enchant permanent put onto the battlefield with ~."',
    'it loses "enchant creature" and gains "enchant creature put onto the battlefield with ~."',
  ],
  rejects: [
    'it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ~"',
    'it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ~.".',
    'it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with it."',
    'it loses "flying" and gains "enchant creature put onto the battlefield with ~."',
    'it loses "enchant creature card in a graveyard" and gains "flying."',
    'it gains "enchant creature put onto the battlefield with ~." and loses "enchant creature card in a graveyard"',
    'enchanted creature loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ~."',
    'it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ~." and draw a card',
    'it loses "enchant player" and gains "enchant creature put onto the battlefield with ~."',
  ],
  parse: single(
    'effect.aura-swaps-enchant',
    sequence(
      literal('it loses "'),
      enchantWords(['noun.card-in-a-graveyard', 'noun.bare-permanent']),
      literal('" and gains "'),
      enchantWords(['noun.put-onto-with-self']),
      literal('."'),
      (ctx, pos) =>
        /^(?![\p{L}\p{N}])(?!\s*(?:\.|,|and\b|then\b))/u.test(ctx.text.slice(pos))
          ? { ok: true, value: '', pos }
          : fail(ctx, pos),
    ),
    ([, loses, , gains]) => ({ verb: 'replaceEnchant', args: { loses, gains } }),
  ),
});

/**
 * `effect.return-enchanted-card-attach`: "return enchanted creature card to the battlefield under your control and attach ~ to it" (CR 400.7, 110.2a, 303.4, 701.3): the Aura puts the
 * card it is attached to onto the battlefield under its controller's control, remembers that it did, and attaches itself to the permanent the card became. The engine's `moveToZone` of
 * `attached` with `putWithSource`, then `attach` of `this` to `moved`. Not read: another object ("target creature card"), "under its owner's control", a card that is not a creature, another
 * place to attach, more words after it.
 */
export const EFFECT_RETURN_ENCHANTED_CARD_ATTACH = defineRule<Clauses>({
  id: 'effect.return-enchanted-card-attach',
  family: 'effect',
  leading: ['return'],
  cites: ['CR 400.7 (General)', 'CR 110.2a (Permanents)', 'CR 303.4 (Auras)', 'CR 701.3 (Attach)'],
  examples: [
    'return enchanted creature card to the battlefield under your control and attach ~ to it',
  ],
  rejects: [
    'return enchanted creature card to the battlefield under your control',
    "return enchanted creature card to the battlefield under its owner's control and attach ~ to it",
    'return enchanted creature card to the battlefield and attach ~ to it',
    'return target creature card to the battlefield under your control and attach ~ to it',
    'return enchanted card to the battlefield under your control and attach ~ to it',
    'return enchanted creature card to the battlefield under your control and attach ~ to that creature',
    'return enchanted creature card to the battlefield under your control and attach it to ~',
    'return enchanted creature card to the battlefield under your control and attach ~ to it and draw a card',
    'return enchanted creature card to your hand and attach ~ to it',
  ],
  parse: single(
    'effect.return-enchanted-card-attach',
    sequence(
      literal('return enchanted creature card to the battlefield under your control'),
      pattern(/ and attach ~ to it(?![\p{L}\p{N}])(?!\s*(?:,|and\b|then\b))/iu),
    ),
    () => ({ verb: 'returnEnchantedCardAttach', args: {} }),
  ),
});

/**
 * `effect.controller-sacrifices-linked`: "that creature's controller sacrifices it" (CR 701.21a, 109.4, 603.10a): the controller of the creature that an effect of this permanent put onto the
 * battlefield (`effect.return-enchanted-card-attach`) sacrifices it, whoever controls it by then. The engine's `sacrifice` of `putWithThis` by its controller, which the engine checks only
 * on a face whose other ability puts a permanent onto the battlefield with `putWithSource`. Not read: another subject ("its controller sacrifices it", "you sacrifice it"), another object,
 * another verb, more words after it.
 */
export const EFFECT_CONTROLLER_SACRIFICES_LINKED = defineRule<Clauses>({
  id: 'effect.controller-sacrifices-linked',
  family: 'effect',
  leading: ['that'],
  cites: [
    'CR 701.21a (Sacrifice)',
    'CR 109.4 (Objects and Players)',
    'CR 603.10a (Handling Triggered Abilities)',
  ],
  examples: [
    "that creature's controller sacrifices it",
    'that creature’s controller sacrifices it',
  ],
  rejects: [
    "that creature's controller sacrifices",
    "that creature's controller sacrifices them",
    "that creature's controller sacrifices it and draws a card",
    "that permanent's controller sacrifices it",
    "that creature's owner sacrifices it",
    'its controller sacrifices it',
    "that creature's controller destroys it",
    "that creature's controller sacrifices another creature",
  ],
  parse: single(
    'effect.controller-sacrifices-linked',
    pattern(
      /that creature['’]s controller sacrifices it(?![\p{L}\p{N}])(?!\s*(?:,|and\b|then\b))/iu,
    ),
    () => ({ verb: 'sacrificeLinkedCreature', args: {} }),
  ),
});

export const AURA_GRAVEYARD_EFFECT_RULES = [
  EFFECT_AURA_SWAPS_ENCHANT,
  EFFECT_RETURN_ENCHANTED_CARD_ATTACH,
  EFFECT_CONTROLLER_SACRIFICES_LINKED,
].map(quietly);
