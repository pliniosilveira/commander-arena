/**
 * Player nouns beyond "you", "target player" and "each opponent" (stage P28, D-131): the players an effect names
 * together or by their relation to the game. They are the subjects of the player verbs ("you and target opponent each
 * draw two cards", "each other player sacrifices a creature of their choice", "defending player sacrifices ...")
 * and share one selector family in the engine (`PlayerSelector`): every effect that takes a player takes them.
 */
import { fail, map, type Parser, pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, node, spanned } from '../registry';
import { possessedNoun } from './controller';

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
 * D-269 the second player may also be "that player" ("you and that player each gain that much life"), the player a trigger or an earlier
 * target names; the binding pass points it at that player (and refuses a text that names none), and the lowering at what the engine can
 * name (`triggerPlayer` or the target). Or "defending player" (CR 508.5, Eumidian Wastewaker: "you and defending player each discard a card or sacrifice a permanent").
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
    'you and defending player each',
  ],
  rejects: [
    'you and the defending player each',
    'you and defending players each',
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
    const other = family<IrNoun>('noun', {
      only: ['noun.player', 'noun.that-player', 'noun.defending-player'],
    })(ctx, you.pos);
    if (!other.ok) return other;
    // The second player is chosen as a target or is the player the text already names ("that player"); "each opponent" and "you" are other readings.
    const named = other.value.det === 'anaphor' && /^that player$/iu.test(other.value.filter.raw);
    if (other.value.det !== 'target' && other.value.det !== 'defendingPlayer' && !named) {
      return fail(ctx, you.pos);
    }
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
 * `noun.entered-chosen-player`: "the chosen player" (CR 614.12a, 607.2d; Stuffy Doll): the player the permanent chose as it entered, by the linked "As ~ enters, choose a
 * player". The engine's `PlayerSelector` `enteredChosenPlayer`; a face without that choice refuses it (`validateCard`). Not read: "the chosen creature type" or any other
 * chosen thing, "chosen player" without "the", the plural.
 */
export const NOUN_ENTERED_CHOSEN_PLAYER = defineRule<IrNoun>({
  id: 'noun.entered-chosen-player',
  family: 'noun',
  leading: ['the'],
  cites: ['CR 614.12a (Replacement Effects)', 'CR 607.2d (Linked Abilities)'],
  examples: ['the chosen player', 'The chosen player'],
  rejects: ['the chosen players', 'chosen player', 'the chosen player’s', 'the chosen color'],
  parse: phrase(
    'noun.entered-chosen-player',
    new RegExp(`the chosen player(?!['’]|s)${END}`, 'iu'),
    (raw) => bare('enteredChosenPlayer', raw),
  ),
});

/**
 * `noun.player-to-your-right`: "the player to your right" (Hithlain Rope): the player before you in turn order among the players still in the game, the
 * opponent in a two-player game. The engine's `PlayerSelector` `playerToYourRight`. Not read: "the player to your left", "players to your right", a
 * player "on your right".
 */
export const NOUN_PLAYER_TO_YOUR_RIGHT = defineRule<IrNoun>({
  id: 'noun.player-to-your-right',
  family: 'noun',
  leading: ['the'],
  cites: ['CR 102.1 (Players)', 'CR 101.4 (Handling Simultaneous Decisions)'],
  examples: ['the player to your right', 'The player to your right'],
  rejects: [
    'the player to your left',
    'players to your right',
    'player to your right',
    'the player to your right of',
  ],
  parse: phrase(
    'noun.player-to-your-right',
    new RegExp(`the player to your right${END}`, 'iu'),
    (raw) => bare('playerToRight', raw),
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
  // D-643 (Tomik, Wielder of Law): "that opponent" is the same pronoun for a player the text has named an opponent.
  examples: ['that player', 'That player', 'that opponent'],
  rejects: [
    'that opponents',
    'that players',
    'that creature',
    'that',
    'those players',
    "that player's",
    'the player',
  ],
  // The words are kept as written: the binding pass and the lowering know the pronoun by them ("that opponent" of an attack trigger is the player attacked, D-648).
  parse: phrase(
    'noun.that-player',
    new RegExp(`that (?:player|opponent)${END}(?!['’])`, 'iu'),
    (raw) => bare('anaphor', raw.toLowerCase()),
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

/**
 * `noun.that-attacking-player`: "that attacking player" (CR 508.1, 603.2c, D-648): the player who declared the attackers of a trigger about a player attacking one of your opponents. It names
 * the player the event is about, as "that player" does, so it is bound to the player of the trigger and lowered to it; a text with no such trigger has no player to point at.
 */
export const NOUN_THAT_ATTACKING_PLAYER = defineRule<IrNoun>({
  id: 'noun.that-attacking-player',
  family: 'noun',
  leading: ['that'],
  cites: ['CR 508.1 (Declare Attackers Step)', 'CR 603.2c (Handling Triggered Abilities)'],
  examples: ['that attacking player', 'That attacking player'],
  rejects: ['that attacking players', 'that attacking', 'the attacking player', 'that player'],
  parse: phrase(
    'noun.that-attacking-player',
    new RegExp(`that attacking player${END}(?!['’])`, 'iu'),
    (raw) => bare('triggerActor', raw.toLowerCase(), { ref: 'trigActor' }),
  ),
});

/**
 * `noun.each-player-other-than-its-controller`: "each player other than its controller" (Fractured Identity: "Exile target nonland permanent. Each player other than its controller creates a
 * token that's a copy of it."; CR 102.1, 109.4, 101.4): every player in the game but the controller of an object an earlier part of the text named, read from its last-known information
 * when it has left (CR 608.2h). The object is a pronoun like any other, left to the binding pass; the lowering names the players the engine's `eachPlayerExcept` of that controller. Not read:
 * "each other player" (another rule), "each player other than you", "each player other than its owner", "each player other than target player", "each players", a missing "its".
 */
export const NOUN_EACH_PLAYER_OTHER_THAN_ITS_CONTROLLER = defineRule<IrNoun>({
  id: 'noun.each-player-other-than-its-controller',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 102.1 (Players)',
    'CR 109.4 (Objects)',
    'CR 101.4 (Handling Simultaneous Decisions)',
    'CR 608.2h (Resolving Spells and Abilities)',
  ],
  examples: ['each player other than its controller', 'Each player other than its controller'],
  rejects: [
    'each player',
    'each other player',
    'each player other than you',
    'each player other than its owner',
    'each player other than target player',
    'each player other than its controllers',
    'each players other than its controller',
    'each player other than it',
    'each player other than that creature’s controller',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/each player other than its controller(?![\p{L}\p{N}'’])/iu)(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const text = ctx.text.slice(pos, r.pos);
    const itsStart = pos + 'each player other than '.length;
    const controller: IrNoun = {
      ...bare('controllerOf', 'its controller', {
        of: possessedNoun('noun.each-player-other-than-its-controller', 'its', itsStart),
      }),
      span: { start: itsStart, end: r.pos },
      rule: 'noun.each-player-other-than-its-controller',
    };
    const noun: IrNoun = {
      ...bare('eachPlayer', text, { of: controller }),
      span: { start: pos, end: r.pos },
      rule: 'noun.each-player-other-than-its-controller',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

/**
 * `noun.each-of-its-controllers-opponents`: "each of its controller's opponents" (Bounty Board: "Whenever a creature with a bounty counter on it dies, each of its controller's opponents draws a
 * card and gains 2 life."; CR 102.2, 109.4, 608.2h): the opponents of the controller of an object an earlier part of the text named, read from its last-known information when it has left. In a
 * game of free-for-all Commander every player but that controller is their opponent, so the lowering names the engine's `eachPlayerExcept` of that controller, as it does for "each player
 * other than its controller". Not read: "each of your opponents" (`you`), "each of its owner's opponents", "each of its controllers' opponents", "each of its controller's opponent", "each of
 * that creature's controller's opponents", a missing "of".
 */
export const NOUN_EACH_OF_ITS_CONTROLLERS_OPPONENTS = defineRule<IrNoun>({
  id: 'noun.each-of-its-controllers-opponents',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 102.2 (Players)', 'CR 109.4 (Objects)', 'CR 608.2h (Resolving Spells and Abilities)'],
  examples: ["each of its controller's opponents", 'Each of its controller’s opponents'],
  rejects: [
    'each of your opponents',
    "each of its owner's opponents",
    "each of its controllers' opponents",
    "each of its controller's opponent",
    "each of that creature's controller's opponents",
    "its controller's opponents",
    "each of its controller's",
  ],
  parse: (ctx, pos) => {
    const r = pattern(/each of its controller['’]s opponents(?![\p{L}\p{N}'’])/iu)(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const text = ctx.text.slice(pos, r.pos);
    const itsStart = pos + 'each of '.length;
    const controller: IrNoun = {
      ...bare('controllerOf', "its controller's", {
        of: possessedNoun('noun.each-of-its-controllers-opponents', 'its', itsStart),
      }),
      span: { start: itsStart, end: r.pos },
      rule: 'noun.each-of-its-controllers-opponents',
    };
    const noun: IrNoun = {
      ...bare('eachPlayer', text, { of: controller }),
      span: { start: pos, end: r.pos },
      rule: 'noun.each-of-its-controllers-opponents',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const PLAYER_NOUN_RULES = [
  NOUN_YOU_AND_PLAYER,
  NOUN_EACH_OTHER_PLAYER,
  NOUN_EACH_PLAYER_OTHER_THAN_ITS_CONTROLLER,
  NOUN_EACH_OF_ITS_CONTROLLERS_OPPONENTS,
  NOUN_DEFENDING_PLAYER,
  NOUN_PLAYER_TO_YOUR_RIGHT,
  NOUN_ENTERED_CHOSEN_PLAYER,
  NOUN_THAT_PLAYER,
  NOUN_THAT_ATTACKING_PLAYER,
  NOUN_THEY,
];
