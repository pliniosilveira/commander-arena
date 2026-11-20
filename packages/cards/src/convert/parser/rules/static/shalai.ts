/**
 * Static ability rule of the Hatsune Miku deck (issue 145, Shalai, Voice of Plenty): "You, planeswalkers you control, and other creatures you control have hexproof."
 * (CR 702.11b, 702.11d, 604.1): the controller of the permanent has hexproof (the engine's `playerHexproof`) and two groups of permanents have the keyword.
 */
import { fail, literal, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { subjectNoun } from './angels-words';

const ID = 'static.you-planeswalkers-creatures-hexproof';

/**
 * `static.you-planeswalkers-creatures-hexproof`: "You, planeswalkers you control, and other creatures you control have hexproof." (CR 702.11b: the controller's
 * opponents can't target the controller or the permanents; CR 604.1: a static ability of the permanent). One statement of three subjects: the controller of the
 * permanent, the planeswalkers they control and their other creatures. Not read: another keyword, another group, "creatures you control" without "other", a
 * duration or a condition, and fewer or more subjects.
 */
export const STATIC_YOU_PLANESWALKERS_CREATURES_HEXPROOF = defineRule<IrStatic>({
  id: ID,
  family: 'static',
  leading: ['you'],
  cites: ['CR 702.11b (Hexproof)', 'CR 702.11d (Hexproof)', 'CR 604.1 (Handling Static Abilities)'],
  examples: ['You, planeswalkers you control, and other creatures you control have hexproof.'],
  rejects: [
    'You, planeswalkers you control, and other creatures you control have hexproof',
    'You, planeswalkers you control, and creatures you control have hexproof.',
    'You, planeswalkers you control, and other creatures you control have shroud.',
    'You, planeswalkers you control, and other creatures you control have hexproof from red.',
    'You, planeswalkers you control, and other creatures your opponents control have hexproof.',
    'You, planeswalkers you control, and other creatures you control have hexproof until end of turn.',
    'You, planeswalkers you control, and other creatures you control have hexproof and flying.',
    'You, planeswalkers you control, and other creatures you control has hexproof.',
    'You, artifacts you control, and other creatures you control have hexproof.',
    'You and other creatures you control have hexproof.',
  ],
  parse: (ctx, pos) => {
    const head = sequence(spanned(pattern(/you(?![\p{L}\p{N}])/iu)), literal(', '))(ctx, pos);
    if (!head.ok) return head;
    const [you] = head.value;
    const walkers = quiet(family<IrNoun>('noun', { only: ['noun.plain-permanents'] }))(
      ctx,
      head.pos,
    );
    if (!walkers.ok) return walkers;
    const walkersFilter = walkers.value.filter;
    if (
      walkersFilter.controller !== 'you' ||
      walkers.value.other ||
      walkersFilter.types?.length !== 1 ||
      walkersFilter.types[0] !== 'planeswalker'
    ) {
      return fail(ctx, pos);
    }
    const joined = literal(', and ')(ctx, walkers.pos);
    if (!joined.ok) return joined;
    const creatures = quiet(family<IrNoun>('noun', { only: ['noun.other-permanents'] }))(
      ctx,
      joined.pos,
    );
    if (!creatures.ok) return creatures;
    const creaturesFilter = creatures.value.filter;
    if (
      creaturesFilter.controller !== 'you' ||
      !creatures.value.other ||
      creaturesFilter.types?.length !== 1 ||
      creaturesFilter.types[0] !== 'creature'
    ) {
      return fail(ctx, pos);
    }
    const tail = sequence(literal(' have hexproof'), literal('.'))(ctx, creatures.pos);
    if (!tail.ok) return tail;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('you', 'you', you.span, ID),
        effects: [{ kind: 'playerHexproof' }],
        also: [
          { subject: walkers.value, effects: [{ kind: 'grantKeyword', keyword: 'hexproof' }] },
          { subject: creatures.value, effects: [{ kind: 'grantKeyword', keyword: 'hexproof' }] },
        ],
        span: { start: pos, end: tail.pos },
        rule: ID,
      },
      pos: tail.pos,
    };
  },
});

export const SHALAI_STATIC_RULES = [STATIC_YOU_PLANESWALKERS_CREATURES_HEXPROOF].map(quietly);
