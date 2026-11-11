/**
 * Player nouns beyond "you", "target player" and "each opponent" (stage P28, D-131): the players an effect names
 * together or by their relation to the game. They are the subjects of the player verbs ("you and target opponent each
 * draw two cards", "each other player sacrifices a creature of their choice", "defending player sacrifices ...")
 * and share one selector family in the engine (`PlayerSelector`): every effect that takes a player takes them.
 */
import { fail, map, type Parser, pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, node, spanned } from '../registry';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

const END = '(?![\\p{L}\\p{N}])';

function bare(det: IrNoun['det'], raw: string, extra: Partial<Bare> = {}): Bare {
  return { kind: 'noun', det, filter: { raw }, upTo: false, plural: false, other: false, ...extra };
}

/**
 * `noun.you-and-player`: "you and target opponent each", "you and target player each" (CR 102.1, 115.1): you and one
 * chosen player, each doing what the verb says, in the order of CR 101.4 (the active player first). The "each" is part
 * of the phrase: it is how the sentence says that both act ("each draw", with no "s"). Only a target player or
 * opponent is the second player; "you and each opponent" is "each player" in other words, and is not read. Since
 * D-921 the second player may also be "that player" ("you and that player each gain that much life"), the player a trigger or an earlier
 * target names; the binding pass points it at that player (and refuses a text that names none), and the lowering at what the engine can
 * name (`triggerPlayer` or the target).
 */
export const NOUN_YOU_AND_PLAYER = defineRule<IrNoun>({
  id: 'noun.you-and-player',
  family: 'noun',
  leading: ['you'],
  cites: ['CR 102.1 (Players)', 'CR 115.1 (Targets)', 'CR 101.4 (Handling Simultaneous Decisions)'],
  examples: [
    'you and target opponent each',
    'you and target player each',
    'you and that player each',
  ],
  rejects: [
    'you and that player',
    'you and that players each',
    'you and those players each',
    'you and that creature each',
    'you and it each',
    'you and they each',
    'that player and you each',
    'you and that player each other',
    'you and target opponent',
    'you and target creature each',
    'you and each opponent each',
    'you each',
    'target player and you each',
    'you and target opponents each',
    'you and target opponent each other',
    'you and up to one target opponent each',
  ],
  parse: (ctx, pos) => {
    const you = spanned(pattern(/you and /i))(ctx, pos);
    if (!you.ok) return you;
    const other = family<IrNoun>('noun', { only: ['noun.player', 'noun.that-player'] })(
      ctx,
      you.pos,
    );
    if (!other.ok) return other;
    // The second player is chosen as a target or is the player the text already names ("that player"); "each opponent" and "you" are other readings.
    const named = other.value.det === 'anaphor' && /^that player$/iu.test(other.value.filter.raw);
    if (other.value.det !== 'target' && !named) return fail(ctx, you.pos);
    const each = pattern(new RegExp(` each${END}`, 'iu'))(ctx, other.pos);
    if (!each.ok) return each;
    const youNoun: IrNoun = {
      ...bare('you', 'you'),
      span: { start: pos, end: pos + 3 },
      rule: 'noun.you-and-player',
    };
    const noun: IrNoun = {
      ...bare('players', ctx.text.slice(pos, each.pos), { members: [youNoun, other.value] }),
      span: { start: pos, end: each.pos },
      rule: 'noun.you-and-player',
    };
    return { ok: true, value: noun, pos: each.pos };
  },
});

function phrase(id: string, re: RegExp, make: (raw: string) => Bare): Parser<IrNoun> {
  return node<string, IrNoun>(
    id,
    map(pattern(re), (m) => m[0]),
    make,
  );
}

/**
 * `noun.each-other-player`: "each other player" (CR 102.2: in a game of free-for-all players, every player but you is
 * an opponent): the engine's `eachOpponent`, which every effect that names players reads.
 */
export const NOUN_EACH_OTHER_PLAYER = defineRule<IrNoun>({
  id: 'noun.each-other-player',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 102.2 (Players)', 'CR 101.4 (Handling Simultaneous Decisions)'],
  examples: ['each other player', 'Each other player'],
  rejects: [
    'each player',
    'each other',
    'each other players',
    'another player',
    'each other creature',
  ],
  parse: phrase('noun.each-other-player', new RegExp(`each other player${END}`, 'iu'), (raw) =>
    bare('eachOpponent', raw),
  ),
});

/**
 * `noun.defending-player`: "defending player" (CR 508.5: the player a creature is attacking, or who controls the
 * planeswalker or protects the battle it is attacking). Only meaningful in an ability of an attacking creature, which
 * the engine checks.
 */
export const NOUN_DEFENDING_PLAYER = defineRule<IrNoun>({
  id: 'noun.defending-player',
  family: 'noun',
  leading: ['defending'],
  cites: ['CR 508.5 (Declare Attackers Step)', 'CR 702.86a (Annihilator)'],
  examples: ['defending player', 'Defending player'],
  rejects: ['defending players', 'the defending player', 'defending', 'defending creature'],
  parse: phrase('noun.defending-player', new RegExp(`defending player${END}`, 'iu'), (raw) =>
    bare('defendingPlayer', raw),
  ),
});

/**
 * `noun.that-player`: "that player" (stage P29, D-133): the player an earlier word of the text names or the event of the
 * trigger is about (the player who drew the card, who was dealt the damage, whose spell targeted). Like every pronoun it is left
 * to the binding pass, which makes it the last player the text names, and a text with none is an unbound reference; what
 * the engine can point at is the lowering's business (`PlayerSelector` `triggerPlayer`).
 */
export const NOUN_THAT_PLAYER = defineRule<IrNoun>({
  id: 'noun.that-player',
  family: 'noun',
  leading: ['that'],
  cites: ['CR 102.1 (Players)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['that player', 'That player'],
  rejects: [
    'that players',
    'that creature',
    'that',
    'those players',
    "that player's",
    'the player',
  ],
  parse: phrase('noun.that-player', new RegExp(`that player${END}(?!['’])`, 'iu'), (raw) =>
    bare('anaphor', raw),
  ),
});

/**
 * `noun.they`: "they" as the subject of a player verb (stage P33, D-150, CR 102.1: the singular "they" of the Oracle text, for the player the
 * text has just named): "Whenever another player attacks with two or more creatures, they draw a card ...". Like "that player" it is left to the
 * binding pass, which makes it the last player the text names; a text with none is an unbound reference.
 */
export const NOUN_THEY = defineRule<IrNoun>({
  id: 'noun.they',
  family: 'noun',
  leading: ['they'],
  cites: ['CR 102.1 (Players)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['they', 'They'],
  rejects: ['them', 'their', 'theyre', 'they’re', 'that player', 'the'],
  parse: phrase('noun.they', new RegExp(`they${END}(?!['’])`, 'iu'), (raw) => bare('anaphor', raw)),
});

export const PLAYER_NOUN_RULES = [
  NOUN_YOU_AND_PLAYER,
  NOUN_EACH_OTHER_PLAYER,
  NOUN_DEFENDING_PLAYER,
  NOUN_THAT_PLAYER,
  NOUN_THEY,
];
