/**
 * Effect rules of the Counter Intelligence deck, group 3 (copies, permanents that become creatures for good, a card of the graveyard that may be cast this turn, and the permanents a
 * proliferate gave counters to): "~ becomes a copy of target artifact you control" (The Mycosynth Gardens, CR 707.2, 707.3), "any number of target noncreature artifacts you control
 * become 3/3 artifact creatures" (Depthshaker Titan, CR 205.1b, 613.1d, 613.4b) and "choose any number of permanents you control that had a counter put on them this way. Those
 * permanents phase out." (Ripples of Potential, CR 701.34a, 702.26a). ("You may cast that card this turn" of Emry, Lurker of the Loch is `effect.may-play`, which `lower.may-play`
 * lowers as a `mayCast` after a target card of the graveyard.)
 */
import { literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrBasePt, IrNoun, IrTypeList } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';

const COPY_ID = 'effect.becomes-copy-of-target';

/**
 * `effect.becomes-copy-of-target`: "~ becomes a copy of target nontoken artifact you control with mana value X" (CR 707.2: the permanent gets the copiable values of the target as they
 * are when the effect resolves; CR 707.3: counters, damage and effects stay; CR 611.2a, 613.2a: a layer 1 effect with no duration lasts until the permanent leaves the battlefield or
 * another effect changes it). The engine's `becomeCopy` of the permanent itself, for good. Not read: another subject, a duration, "except ...", "up to one", several targets,
 * "any" or "each" for the copied, a second instruction joined to it.
 */
export const EFFECT_BECOMES_COPY_OF_TARGET = defineRule<Clauses>({
  id: COPY_ID,
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 707.3 (Copying Objects)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.2a (Interaction of Continuous Effects)',
  ],
  examples: [
    '~ becomes a copy of target nontoken artifact you control with mana value X',
    '~ becomes a copy of target artifact you control',
    '~ becomes a copy of target creature',
  ],
  rejects: [
    '~ becomes a copy of target artifact you control until end of turn',
    '~ becomes a copy of target artifact you control, except it has haste',
    '~ becomes a copy of target artifact you control, except its name is ~',
    '~ becomes a copy of up to one target artifact you control',
    '~ becomes a copy of any artifact you control',
    '~ becomes a copy of each artifact you control',
    '~ becomes a copy of target artifact you control and gains haste',
    '~ becomes a copy of target artifact you control. Draw a card',
    '~ becomes a copy of that artifact',
    'target artifact becomes a copy of target artifact you control',
    '~ become a copy of target artifact you control',
    '~ becomes a copy of two target artifacts you control',
  ],
  parse: single(
    COPY_ID,
    map(
      sequence(
        family<IrNoun>('noun', { only: ['noun.self'] }),
        literal(' becomes a copy of '),
        satisfy(
          family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
          (noun) => noun.det === 'target' && !noun.plural && !noun.upTo && noun.anyNumber !== true,
        ),
        // Nothing joined to the clause: a duration, an exception or a second instruction is another statement.
        pattern(/(?=\.|$)/u),
      ),
      ([objects, , of]) => ({ objects, of }),
    ),
    ({ objects, of }) => ({ verb: 'becomeCopyOfTarget', args: { objects, of } }),
  ),
});

const BECOME_ID = 'effect.any-number-become-creatures';

/**
 * `effect.any-number-become-creatures`: "any number of target noncreature artifacts you control become 3/3 artifact creatures" (CR 205.1b: they keep their other types and are also
 * artifact creatures; CR 613.1d, 613.4b: the types in layer 4 and the base power and toughness in layer 7b; CR 611.2a: with no duration it lasts for good; CR 611.2c: the permanents
 * are those the targets named as the effect began). The engine's `setTypes` of the targets, additive, with the base power and toughness, for good. Not read: a duration, another
 * number of targets, "each", the singular, a creature type, a color, a second instruction joined to it.
 */
export const EFFECT_ANY_NUMBER_BECOME_CREATURES = defineRule<Clauses>({
  id: BECOME_ID,
  family: 'effect',
  leading: ['any'],
  cites: [
    'CR 205.1b (Type Line)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
  ],
  examples: [
    'any number of target noncreature artifacts you control become 3/3 artifact creatures',
    'any number of target artifacts you control become 4/4 artifact creatures',
  ],
  rejects: [
    'any number of target noncreature artifacts you control become 3/3 artifact creatures until end of turn',
    'any number of target noncreature artifacts you control become artifact creatures',
    'any number of target noncreature artifacts you control become 3/3 Golem artifact creatures',
    'any number of target noncreature artifacts you control becomes 3/3 artifact creatures',
    'any number of target noncreature artifacts you control become a 3/3 artifact creature',
    'any number of target noncreature artifacts you control become 3/3 artifact creatures and gain haste',
    'any number of target noncreature artifacts you control become 3/3 artifact creatures. Draw a card',
    'target noncreature artifact you control becomes a 3/3 artifact creature',
    'each noncreature artifact you control becomes a 3/3 artifact creature',
    'all noncreature artifacts you control become 3/3 artifact creatures',
  ],
  parse: single(
    BECOME_ID,
    map(
      sequence(
        family<IrNoun>('noun', { only: ['noun.any-number-targets'] }),
        literal(' become '),
        spanned(pattern(new RegExp(`(\\d+)\\/(\\d+) artifact creatures${BOUNDARY}`, 'iu'))),
        pattern(/(?=\.|$)/u),
      ),
      ([objects, , numbers]) => {
        const types: IrTypeList = {
          kind: 'typeList',
          subtypes: [],
          cardTypes: ['artifact', 'creature'],
          additive: true,
          span: numbers.span,
          rule: BECOME_ID,
        };
        const basePt: IrBasePt = {
          kind: 'basePt',
          power: Number(numbers.value[1]),
          toughness: Number(numbers.value[2]),
          span: numbers.span,
          rule: BECOME_ID,
        };
        return { objects, types, basePt };
      },
    ),
    ({ objects, types, basePt }) => ({
      verb: 'becomeCreaturesForGood',
      args: { objects, types, basePt },
    }),
  ),
});

const CHOOSE_ID = 'effect.choose-proliferated';

/**
 * `effect.choose-proliferated`: "choose any number of permanents you control that had a counter put on them this way" (CR 701.34a, 608.2c, 608.2d: the permanents the proliferate
 * before it gave a counter to, of which the controller chooses none, some or all among those they control). Read only after a proliferate (`lower.choose-proliferated` checks). The
 * engine's `chooseObjects` of the `moved` permanents, any number of them. Not read: another kind of permanent, another owner, "target", another number, a different reason for the
 * choice, a second instruction joined to it.
 */
export const EFFECT_CHOOSE_PROLIFERATED = defineRule<Clauses>({
  id: CHOOSE_ID,
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 701.34a (Proliferate)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ['choose any number of permanents you control that had a counter put on them this way'],
  rejects: [
    'choose any number of permanents you control that had a counter put on them this way and draw a card',
    'choose any number of creatures you control that had a counter put on them this way',
    'choose any number of permanents that had a counter put on them this way',
    'choose any number of permanents your opponents control that had a counter put on them this way',
    'choose any number of target permanents you control that had a counter put on them this way',
    'choose a permanent you control that had a counter put on it this way',
    'choose any number of permanents you control that had a counter put on them',
    'choose up to two permanents you control that had a counter put on them this way',
    'any number of permanents you control that had a counter put on them this way',
  ],
  parse: single(
    CHOOSE_ID,
    pattern(
      /choose any number of permanents you control that had a counter put on them this way(?=\.|$)/iu,
    ),
    () => ({ verb: 'chooseProliferated', args: {} }),
  ),
});

const THOSE_ID = 'effect.those-permanents-phase-out';

/**
 * `effect.those-permanents-phase-out`: "those permanents phase out" (CR 702.26a, 608.2c: the permanents the instruction before it chose). Read only after the choice of
 * `effect.choose-proliferated` (`lower.phase-out-chosen` checks). The engine's `phaseOut` of the chosen permanents. Not read: another noun, "phase in", the singular, a second
 * instruction joined to it.
 */
export const EFFECT_THOSE_PERMANENTS_PHASE_OUT = defineRule<Clauses>({
  id: THOSE_ID,
  family: 'effect',
  leading: ['those'],
  cites: ['CR 702.26a (Phasing)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['those permanents phase out'],
  rejects: [
    'those permanents phase in',
    'those permanent phase out',
    'that permanent phases out',
    'those creatures phase out',
    'those permanents phases out',
    'those permanents phase out and draw a card',
    'phase out',
  ],
  parse: single(THOSE_ID, pattern(/those permanents phase out(?![\p{L}\p{N}])(?=\.|$)/iu), () => ({
    verb: 'phaseOutChosen',
    args: {},
  })),
});

export const COUNTER_INTELLIGENCE_G3_EFFECT_RULES = [
  EFFECT_BECOMES_COPY_OF_TARGET,
  EFFECT_ANY_NUMBER_BECOME_CREATURES,
  EFFECT_CHOOSE_PROLIFERATED,
  EFFECT_THOSE_PERMANENTS_PHASE_OUT,
].map(quietly);
