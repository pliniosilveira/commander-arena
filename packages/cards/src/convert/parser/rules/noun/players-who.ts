/**
 * Noun rule: the players of a group who lost life, or were dealt combat damage, this turn ("each opponent who lost life this turn", Papalymo Totolymo). The parser of the phrase is
 * shared with the amount rules of the same words ("for each player who lost life this turn", "the number of your opponents who were dealt combat damage by ~ or a Dragon this turn").
 */
import { fail, type Parser, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY, permanentPhrase, withoutZone } from './phrases';

/** The fields of a phrase of permanents that the turn log of combat damage keeps of the source (CR 120.2a). */
const KEPT_FIELDS: readonly string[] = ['types', 'subtypes', 'controller', 'raw', 'zone'];

type Group = 'eachPlayer' | 'eachOpponent';

/** The ways of naming a group, the singular ones ("each opponent who was ...") and the plural ones ("your opponents who were ..."). */
export interface PlayersWhoHead {
  /** The words before "who", as the text writes them. */
  readonly words: string;
  readonly group: Group;
  readonly plural: boolean;
}

/** "who lost life this turn". */
const LOST_LIFE = new RegExp(` who lost life this turn${BOUNDARY}`, 'iu');

/**
 * What a source of combat damage is: `~`, `~ or a Dragon`, or `a Dragon` (CR 120.2a, 510.2). The kind is a phrase of permanents, read as the source was when it dealt the damage; a
 * quality the turn log does not keep (tapped, a color, a power) is not read.
 */
const DAMAGE_SOURCE: Parser<{ byThis: boolean; source: IrNoun | null }> = (ctx, pos) => {
  const kind: Parser<IrNoun> = (c, p) => {
    const r = sequence(pattern(/an? /iu), permanentPhrase(false, 'all'))(c, p);
    if (!r.ok) return r;
    const phrase = withoutZone(r.value[1]);
    if (Object.keys(phrase).some((k) => !KEPT_FIELDS.includes(k))) return fail(c, p);
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'a',
        filter: phrase,
        upTo: false,
        plural: false,
        other: false,
        span: { start: p, end: r.pos },
        rule: 'noun.each-player-who-dealt-combat-damage',
      },
      pos: r.pos,
    };
  };
  const both = sequence(pattern(/~ or /iu), kind)(ctx, pos);
  if (both.ok) return { ok: true, value: { byThis: true, source: both.value[1] }, pos: both.pos };
  const self = pattern(new RegExp(`~${BOUNDARY}`, 'iu'))(ctx, pos);
  if (self.ok) return { ok: true, value: { byThis: true, source: null }, pos: self.pos };
  const other = kind(ctx, pos);
  return other.ok
    ? { ok: true, value: { byThis: false, source: other.value }, pos: other.pos }
    : other;
};

/**
 * The players of a group who lost life this turn, or were dealt combat damage by a source this turn: the head words (`PlayersWhoHead`), then "who lost life this turn" or
 * "who was / were dealt combat damage by ... this turn" (the verb agrees with the head).
 */
export function playersWho(heads: readonly PlayersWhoHead[]): Parser<IrNoun> {
  return (ctx, pos) => {
    for (const head of heads) {
      const lead = pattern(new RegExp(head.words, 'iu'))(ctx, pos);
      if (!lead.ok) continue;
      const base = { upTo: false, plural: true, other: false, whoGroup: head.group } as const;
      const lost = pattern(LOST_LIFE)(ctx, lead.pos);
      if (lost.ok) {
        return {
          ok: true,
          value: {
            kind: 'noun',
            det: 'lostLifeThisTurn',
            filter: { raw: ctx.text.slice(pos, lost.pos) },
            ...base,
            span: { start: pos, end: lost.pos },
            rule: 'noun.each-player-who-lost-life',
          },
          pos: lost.pos,
        };
      }
      const verb = head.plural ? 'were' : 'was';
      const damaged = sequence(
        pattern(new RegExp(` who ${verb} dealt combat damage by `, 'iu')),
        DAMAGE_SOURCE,
        pattern(new RegExp(` this turn${BOUNDARY}`, 'iu')),
      )(ctx, lead.pos);
      if (!damaged.ok) continue;
      const { byThis, source } = damaged.value[1];
      return {
        ok: true,
        value: {
          kind: 'noun',
          det: 'combatDamagedThisTurn',
          filter: { raw: ctx.text.slice(pos, damaged.pos) },
          ...base,
          ...(byThis ? { damagedByThis: true as const } : {}),
          ...(source === null ? {} : { damageSource: source }),
          span: { start: pos, end: damaged.pos },
          rule: 'noun.each-player-who-dealt-combat-damage',
        },
        pos: damaged.pos,
      };
    }
    return fail(ctx, pos);
  };
}

const SUBJECT_HEADS: readonly PlayersWhoHead[] = [
  { words: 'each opponent', group: 'eachOpponent', plural: false },
  { words: 'each player', group: 'eachPlayer', plural: false },
];

/**
 * `noun.each-player-who-lost-life`: "each opponent who lost life this turn", "each player who lost life this turn" (CR 119.3, 102.1, 102.2, 101.4): the players of the group who
 * lost life this turn, from damage, life loss or life paid, still in the game, in the order of CR 101.4. The engine's `PlayerSelector` `lostLifeThisTurn`. Not read: another group
 * ("target opponent who lost life", "each opponent who gained life"), another span ("last turn", "this game", no span), "lost 4 or more life", a plural head.
 */
export const NOUN_EACH_PLAYER_WHO_LOST_LIFE = defineRule<IrNoun>({
  id: 'noun.each-player-who-lost-life',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 119.3 (Life)',
    'CR 102.1 (Players)',
    'CR 102.2 (Players)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: [
    'each opponent who lost life this turn',
    'Each opponent who lost life this turn',
    'each player who lost life this turn',
  ],
  rejects: [
    'each opponent who lost life',
    'each opponent who lost life last turn',
    'each opponent who lost life this game',
    'each opponent who gained life this turn',
    'each opponent who lost 4 or more life this turn',
    'target opponent who lost life this turn',
    'each opponents who lost life this turn',
    'each opponent who loses life this turn',
    'each creature who lost life this turn',
    'each opponent who lost life this turn and',
  ],
  parse: (ctx, pos) => {
    const r = playersWho(SUBJECT_HEADS)(ctx, pos);
    return r.ok && r.value.det === 'lostLifeThisTurn' ? r : fail(ctx, pos);
  },
});

/**
 * `noun.each-player-who-dealt-combat-damage`: "each opponent who was dealt combat damage by ~ or a Dragon this turn" (CR 120.2a, 510.2, 102.2, 101.4): the players of the group dealt
 * combat damage this turn by the permanent of the ability, by a source of a kind (card types, subtypes and who controls it, as the source was when it dealt the damage), or either.
 * The engine's `PlayerSelector` `combatDamagedThisTurn`. Not read: "damage" alone, another span, a quality of the source the turn log does not keep (tapped, a color, a power), a plural
 * source, a head that does not agree with the verb.
 */
export const NOUN_EACH_PLAYER_WHO_DEALT_COMBAT_DAMAGE = defineRule<IrNoun>({
  id: 'noun.each-player-who-dealt-combat-damage',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 120.2a (Damage)',
    'CR 510.2 (Combat Damage Step)',
    'CR 102.2 (Players)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: [
    'each opponent who was dealt combat damage by ~ or a Dragon this turn',
    'each opponent who was dealt combat damage by ~ this turn',
    'each player who was dealt combat damage by a Zombie this turn',
  ],
  rejects: [
    'each opponent who was dealt damage by ~ this turn',
    'each opponent who was dealt combat damage by ~ or a Dragon',
    'each opponent who was dealt combat damage by ~ or a Dragon this combat',
    'each opponent who were dealt combat damage by ~ this turn',
    'each opponent who was dealt combat damage by a tapped creature this turn',
    'each opponent who was dealt combat damage by Zombies this turn',
    'each opponent who was dealt combat damage by ~ or a Dragon this turn and',
    'target opponent who was dealt combat damage by ~ this turn',
  ],
  parse: (ctx, pos) => {
    const r = playersWho(SUBJECT_HEADS)(ctx, pos);
    return r.ok && r.value.det === 'combatDamagedThisTurn' ? r : fail(ctx, pos);
  },
});

export const PLAYERS_WHO_NOUN_RULES = [
  NOUN_EACH_PLAYER_WHO_LOST_LIFE,
  NOUN_EACH_PLAYER_WHO_DEALT_COMBAT_DAMAGE,
];
