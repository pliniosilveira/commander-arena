/**
 * Noun rules of group 9 of the Hashaton deck (issue 31, D-392 provisional): "that source's controller" (Rona, Tolarian Obliterator: "Whenever a source deals damage to ~,
 * that source's controller exiles a card from their hand at random").
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node, quietly } from '../registry';
import { BOUNDARY } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

/**
 * `noun.that-sources-controller`: "that source's controller" (CR 109.4: an object has a controller, CR 113.7a: read from last-known information when the source is gone, CR 603.2: the
 * trigger is about the damage that source dealt). The player the event of a trigger about a source is about: for "a source deals damage to ~" the controller of the source. Like
 * "that player" it is left to the binding pass, which makes it the player the trigger names (the actor of `trigger.source-deals-damage`) and nothing else: a text with no such
 * trigger has an unbound reference. Not read: "that source's owner", "that source", "that sources's controller", "its controller" (`noun.its-controller`, the controller of an object
 * the text named).
 */
export const NOUN_THAT_SOURCES_CONTROLLER = defineRule<IrNoun>({
  id: 'noun.that-sources-controller',
  family: 'noun',
  leading: ['that'],
  cites: ['CR 109.4 (Objects)', 'CR 113.7a (Abilities)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ["that source's controller", 'that source’s controller', "That source's controller"],
  rejects: [
    "that source's owner",
    'that source',
    "that sources' controller",
    "that source's controllers",
    "that creature's controller",
    'that source controller',
    "that source's",
    'its controller',
    "that player's controller",
  ],
  parse: node<RegExpExecArray, IrNoun>(
    'noun.that-sources-controller',
    pattern(new RegExp(`that source['’]s controller${BOUNDARY}`, 'iu')),
    (m): Bare => ({
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: m[0] },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

/** Quiet, like the effect rules that read it: a line that starts "That ..." and is something else stops where it always did. */
export const HASHATON_G9_NOUN_RULES = [quietly(NOUN_THAT_SOURCES_CONTROLLER)];
