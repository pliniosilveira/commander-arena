/**
 * Trigger rules about the player an Aura enchants. Issue 160 (D-629): "Whenever enchanted player is attacked" (Curse of Bounty, CR 303.4m, 508.1, 508.1b, 603.2): once for the declaration of attackers in
 * which at least one creature was declared as attacking the player the Aura enchants (as a player: an attack on their planeswalker is not one on them). The engine's
 * `attackBatch` with `attackedEnchantedPlayer`; whoever declares the attackers. Tenuous Truce: the attacks between the Aura's controller and the player it enchants.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.enchanted-player-attacked';

export const TRIGGER_ENCHANTED_PLAYER_ATTACKED = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['enchanted'],
  cites: [
    'CR 303.4m (Enchantments)',
    'CR 508.1 (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: ['enchanted player is attacked'],
  rejects: [
    'enchanted player attacks',
    'enchanted creature is attacked',
    'enchanted player is attacked by a creature',
    'enchanted players are attacked',
    'you are attacked',
    'enchanted player is attacked.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/enchanted player is attacked(?![\p{L}\p{N}])(?!\s+by\b)/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: makeNoun(ID, { start: pos, end: pos }, 'eachPlayer', { raw: '' }),
        atLeast: 1,
        attackedEnchantedPlayer: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

const TRUCE_ID = 'trigger.enchanted-opponent-attacks';

/**
 * Tenuous Truce: "When you attack enchanted opponent or a planeswalker they control or when they attack you or a planeswalker you control" (CR 303.4m, 508.1, 508.1b, 508.6,
 * 603.2c). Two events of one ability: you declare attackers and at least one attacks the player the Aura enchants or a planeswalker they control (the engine's `attackBatch` of
 * `you` with `attackedEnchantedPlayerOrPlaneswalkers`), or that player declares attackers and at least one attacks you or a planeswalker you control (`attackBatch` of `any` with
 * `byEnchantedPlayer` and `attackedYouOrPlaneswalkers`). Each triggers once for its declaration, however many creatures attack; an attack on another opponent is neither.
 * Only these words: another order, "enchanted player", a battle or a third event are not read.
 */
export const TRIGGER_ENCHANTED_OPPONENT_ATTACKS = defineRule<IrTrigger>({
  id: TRUCE_ID,
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 303.4m (Enchantments)',
    'CR 508.1b (Declare Attackers Step)',
    'CR 508.6 (Declare Attackers Step)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'you attack enchanted opponent or a planeswalker they control or when they attack you or a planeswalker you control',
  ],
  rejects: [
    'you attack enchanted opponent',
    'you attack enchanted opponent or a planeswalker they control',
    'you attack enchanted player or a planeswalker they control or when they attack you or a planeswalker you control',
    'you attack enchanted opponent or a planeswalker they control or when they attack you',
    'you attack enchanted opponent or a planeswalker they control or whenever they attack you or a planeswalker you control',
    'you attack enchanted opponent or a planeswalker they control or when they attack you or a planeswalker you control.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /you attack enchanted opponent or a planeswalker they control or when they attack you or a planeswalker you control(?![\p{L}\p{N}.])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const theyAttack: IrTrigger = {
      kind: 'trigger',
      event: 'attackBatch',
      actor: makeNoun(TRUCE_ID, span, 'eachPlayer', { raw: '' }),
      atLeast: 1,
      byEnchantedPlayer: true,
      attackedYouOrPlaneswalkers: true,
      args: {},
      span,
      rule: TRUCE_ID,
    };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: makeNoun(TRUCE_ID, span, 'you', { raw: 'you' }),
        atLeast: 1,
        attackedEnchantedPlayerOrPlaneswalkers: true,
        alternatives: [theyAttack],
        args: {},
        span,
        rule: TRUCE_ID,
      },
      pos: r.pos,
    };
  },
});

export const ENCHANTED_PLAYER_TRIGGER_RULES = [
  TRIGGER_ENCHANTED_PLAYER_ATTACKED,
  TRIGGER_ENCHANTED_OPPONENT_ATTACKS,
].map(quietly);
