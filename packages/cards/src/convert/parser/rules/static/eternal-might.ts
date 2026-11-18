/**
 * Static rules of the Eternal Might deck (issue 104): "Creatures you control are every creature type. The same is true for creature spells you control and creature
 * cards you own that aren't on the battlefield." (Maskwood Nexus, CR 205.3m, 613.1d, 604.3).
 */
import { fail, literal, pattern, quiet, sequence } from '../../combinators';
import type { IrCost, IrNoun, IrStatic } from '../../ir/types';
import { CARD_TYPES, typeWords } from '../noun/phrases';
import { defineRule, family } from '../registry';

/**
 * `static.every-creature-type`: "Creatures you control are every creature type. The same is true for creature spells you control and creature cards you own that aren't
 * on the battlefield." The creatures you control, the creature spells you control and the creature cards you own outside the battlefield are every creature type, in layer 4
 * (CR 613.1d), which an effect of a permanent gives to objects in other zones (CR 205.3m, the creature types; CR 702.73a, Changeling, which the effect is the same as, for
 * these objects, "This object is every creature type"). It is the engine's `allCreatureTypes` of two scopes, `youControl` (the creatures on the battlefield and the creature
 * spells of the controller) and `youOwn` (the creature cards the controller owns outside the battlefield, in the zones the player and others can see or not alike, as
 * Changeling works everywhere). The two sentences are one statement: the second is read only after the first, in the words the card prints. Not read: the first sentence alone
 * (the engine has no effect for the battlefield only), another group of creatures, another scope in the second sentence, an "in addition to" or "other" ending.
 */
export const STATIC_EVERY_CREATURE_TYPE = defineRule<IrStatic>({
  id: 'static.every-creature-type',
  family: 'static',
  leading: ['creatures'],
  cites: [
    'CR 205.3m (Subtypes)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 604.3 (Handling Static Abilities)',
    'CR 702.73a (Changeling)',
  ],
  examples: [
    "Creatures you control are every creature type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
  ],
  rejects: [
    'Creatures you control are every creature type.',
    "Creatures you control are every creature type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield",
    'Creatures you control are every creature type. The same is true for creature spells you control.',
    "Creatures you control are every creature type. The same is true for creature spells you cast and creature cards you own that aren't on the battlefield.",
    "Creatures are every creature type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    "Creatures you control are every creature type in addition to their other types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    'Creatures you control are every creature type. The same is true for creature spells you control and creature cards you own that are on the battlefield.',
    "Creatures you control are every creature type. The same is true for creature spells your opponents control and creature cards you own that aren't on the battlefield.",
    "Creatures you control are every land type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    "Zombies you control are every creature type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
  ],
  parse: (ctx, pos) => {
    const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, pos);
    if (!subject.ok) return subject;
    // Only the creatures you control, with no other quality: the scopes of the engine's effect are these groups.
    const { filter } = subject.value;
    if (
      subject.value.other ||
      filter.types?.length !== 1 ||
      filter.types[0] !== 'creature' ||
      filter.controller !== 'you' ||
      Object.keys(filter).some(
        (k) => k !== 'types' && k !== 'controller' && k !== 'zone' && k !== 'raw',
      )
    ) {
      return fail(ctx, pos);
    }
    const tail = pattern(
      / are every creature type\. the same is true for creature spells you control and creature cards you own that aren['’]t on the battlefield\./iu,
    )(ctx, subject.pos);
    if (!tail.ok) return tail;
    const span = { start: pos, end: tail.pos };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subject.value,
        effects: [
          { kind: 'allCreatureTypes', scope: 'youControl' },
          { kind: 'allCreatureTypes', scope: 'youOwn' },
        ],
        span,
        rule: 'static.every-creature-type',
      },
      pos: tail.pos,
    };
  },
});

/**
 * `static.hand-cards-have-cycling`: "Each creature card in your hand has cycling {1}{U}." (Rhet-Tomb Mystic, CR 702.29a, 613.1f, 611.3a): the cards of one kind in the hand of the
 * controller of the permanent have a cycling ability with the cost, as long as the permanent is on the battlefield. The engine's `grantKeywordToHandCards`. Only a mana cost
 * (the cost of a Cycling keyword the engine pays for a granted ability is the same as for a printed one, but the card with this text names a mana cost). Not read: another
 * hand ("each creature card in a hand", "in your opponents' hands"), another zone, a keyword other than cycling, a cost of life, a cost with X or hybrid mana, "all", "target", no
 * period, a card with no type word.
 */
export const STATIC_HAND_CARDS_HAVE_CYCLING = defineRule<IrStatic>({
  id: 'static.hand-cards-have-cycling',
  family: 'static',
  leading: ['each'],
  cites: [
    'CR 702.29a (Cycling)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 611.3a (Continuous Effects)',
  ],
  examples: [
    'Each creature card in your hand has cycling {1}{U}.',
    'Each creature card in your hand has cycling {2}.',
    'Each artifact creature card in your hand has cycling {1}.',
    'Each land card in your hand has cycling {W}.',
  ],
  rejects: [
    'Each creature card in your hand has cycling {1}{U}',
    'Each creature card in a hand has cycling {1}{U}.',
    "Each creature card in your opponents' hands has cycling {1}{U}.",
    'Each creature card in your graveyard has cycling {1}{U}.',
    'Each creature card in your hand has flying.',
    'Each creature card in your hand has cycling {X}.',
    'Each creature card in your hand has cycling {W/U}.',
    'Each creature card in your hand has cycling.',
    'Each creature card in your hand has cycling—Pay 2 life.',
    'Each creature in your hand has cycling {1}{U}.',
    'Each creature card in your hand has cycling {1}{U} and flying.',
    'Each creature card in your hand have cycling {1}{U}.',
    'Each card in your hand has cycling {1}{U}.',
    'All creature cards in your hand have cycling {1}{U}.',
  ],
  parse: (ctx, pos) => {
    // The words up to the keyword decide whether this is the statement at all ("Each opponent can't draw ..." never was): their failure is no trace in the diagnostics.
    const lead = sequence(
      quiet(
        sequence(
          literal('each '),
          typeWords(CARD_TYPES, false),
          literal(' card in your hand has cycling '),
        ),
      ),
      family<IrCost>('cost', { only: ['cost.mana'] }),
      literal('.'),
    )(ctx, pos);
    if (!lead.ok) return lead;
    const [[, types], cost] = lead.value;
    // Mana cost with a number or colored symbols only: an X or a hybrid symbol is another cost.
    if (cost.kind !== 'mana' || cost.symbols.some((symbol) => !/^(\d+|[WUBRGC])$/u.test(symbol))) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: lead.pos };
    const rule = 'static.hand-cards-have-cycling';
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: {
          kind: 'noun',
          det: 'you',
          filter: { raw: 'You' },
          upTo: false,
          plural: false,
          other: false,
          span: { start: pos, end: pos + 4 },
          rule,
        },
        effects: [{ kind: 'handCycling', cardTypes: types, cost }],
        span,
        rule,
      },
      pos: lead.pos,
    };
  },
});

export const ETERNAL_MIGHT_STATIC_RULES = [
  STATIC_EVERY_CREATURE_TYPE,
  STATIC_HAND_CARDS_HAVE_CYCLING,
];
