/**
 * Trigger rules of the Draconic Dissent deck (Loot Dispute): "you attack the player who has the initiative" (CR 726.1, 508.1b, 603.2, 603.2c) and "you complete a dungeon"
 * (CR 309.7, 701.49c).
 *
 * - The first triggers once for the declaration of attackers in which at least one creature was declared as attacking the player who has the initiative as a player
 *   (an attack on their planeswalker or battle is not one on them), however many creatures attack: the engine's `attackBatch` with `attackedInitiativeHolder`.
 * - The second triggers each time the dungeon of the controller of the ability is completed: the engine's `dungeonCompleted`.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { youNoun } from './subjects';

const ATTACK_ID = 'trigger.you-attack-initiative-holder';
const COMPLETE_ID = 'trigger.you-complete-dungeon';

export const TRIGGER_YOU_ATTACK_INITIATIVE_HOLDER = defineRule<IrTrigger>({
  id: ATTACK_ID,
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 726.1 (The Initiative)',
    'CR 508.1b (Declare Attackers Step)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: ['you attack the player who has the initiative'],
  rejects: [
    'you attack the player who has the initiatives',
    'you attack the player who has the initiative or',
    'you attack the player who has the initiative with two or more creatures',
    'you attack the player who has the monarch',
    'you attack a player who has the initiative',
    'you attacked the player who has the initiative',
    'an opponent attacks the player who has the initiative',
  ],
  parse: (ctx, pos) => {
    const actor = youNoun(ATTACK_ID)(ctx, pos);
    if (!actor.ok) return actor;
    const r = pattern(
      /\s+attack the player who has the initiative(?![\p{L}\p{N}])(?!\s+(?:with|and|or)(?![\p{L}\p{N}]))/iu,
    )(ctx, actor.pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: actor.value,
        atLeast: 1,
        attackedInitiativeHolder: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: ATTACK_ID,
      },
      pos: r.pos,
    };
  },
});

export const TRIGGER_YOU_COMPLETE_DUNGEON = defineRule<IrTrigger>({
  id: COMPLETE_ID,
  family: 'trigger',
  leading: ['you'],
  cites: ['CR 309.7 (Dungeon)', 'CR 701.49c (Venture)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['you complete a dungeon'],
  rejects: [
    'you complete a dungeons',
    'you complete a dungeon or',
    'you completed a dungeon',
    'you complete the dungeon',
    'an opponent completes a dungeon',
    'you complete a',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you complete a dungeon(?![\p{L}\p{N}])(?!\s+(?:or|and)(?![\p{L}\p{N}]))/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'dungeonCompleted',
        args: {},
        span: { start: pos, end: r.pos },
        rule: COMPLETE_ID,
      },
      pos: r.pos,
    };
  },
});

export const LOOT_DISPUTE_TRIGGER_RULES = [
  TRIGGER_YOU_ATTACK_INITIATIVE_HOLDER,
  TRIGGER_YOU_COMPLETE_DUNGEON,
].map(quietly);
