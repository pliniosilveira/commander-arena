/**
 * Static rules of the Eternal Might deck (issue 104): "Creatures you control are every creature type. The same is true for creature spells you control and creature
 * cards you own that aren't on the battlefield." (Maskwood Nexus, CR 205.3m, 613.1d, 604.3).
 */
import { fail, pattern } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
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

export const ETERNAL_MIGHT_STATIC_RULES = [STATIC_EVERY_CREATURE_TYPE];
