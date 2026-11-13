/**
 * Trigger rules of stage P18 (D-108, D-111): the events the engine's trigger slice runs besides the
 * ones of `index.ts`. The beginning of the steps and phases that have no kind of their own (the draw
 * step, the beginning of combat, the main phases, the end of combat), a card drawn, combat damage
 * dealt, leaving the battlefield. `upkeep` and `endStep` stay in `index.ts` (they also read "each
 * opponent's" now). Each rule says what the text says; what the engine can run is the lowering's
 * business (`lower/triggers.ts`).
 */
import { choice, literal, map, type Parser, pattern, sequence } from '../../combinators';
import type { IrNoun, IrTrigger, Span } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { makeNoun, permanentOrAttachedSubject, stepOwner, youNoun } from './subjects';

type Step = NonNullable<IrTrigger['step']>;

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

function stepTrigger(
  rule: string,
  span: { start: number; end: number },
  step: Step,
  actor: IrNoun,
): IrTrigger {
  return { kind: 'trigger', event: 'step', step, actor, args: {}, span, rule };
}

/** The phases that follow whose turn it is: "draw step", "precombat main phase", ... */
const PHASE_WORDS: readonly { readonly words: string; readonly step: Step }[] = [
  { words: 'draw step', step: 'draw' },
  { words: 'precombat main phase', step: 'main1' },
  { words: 'first main phase', step: 'main1' },
  { words: 'postcombat main phase', step: 'main2' },
  { words: 'second main phase', step: 'main2' },
];

/**
 * `trigger.step`: "the beginning of your draw step", "the beginning of each opponent's draw step",
 * "the beginning of your precombat main phase", "... postcombat main phase", "the beginning of
 * combat on your turn", "the beginning of each combat", "the beginning of the end of combat step" and
 * "end of combat" (CR 603.2b: it triggers as that step or phase begins; CR 500.2 the order of the
 * phases and steps; CR 505.1 the first main phase is the precombat main phase, the second the postcombat
 * one; CR 511.2 "at end of combat" triggers as the end of combat step begins). The turn it is about is
 * the actor ("your" is the controller of the ability, "each opponent's" a turn of another player). The
 * upkeep and the end step are `trigger.upkeep` and `trigger.end-step`.
 */
export const TRIGGER_STEP = defineRule<IrTrigger>({
  id: 'trigger.step',
  family: 'trigger',
  leading: ['the', 'end'],
  cites: [
    'CR 603.2b (Handling Triggered Abilities)',
    'CR 500.2 (Phases and Steps)',
    'CR 504.1 (Draw Step)',
    'CR 505.1 (Main Phase)',
    'CR 507.1 (Beginning of Combat Step)',
    'CR 511.2 (End of Combat Step)',
  ],
  examples: [
    'the beginning of your draw step',
    "the beginning of each opponent's draw step",
    "the beginning of each player's draw step",
    'the beginning of each draw step',
    'the beginning of your precombat main phase',
    'the beginning of your postcombat main phase',
    'the beginning of each of your postcombat main phases',
    'the beginning of each of your draw steps',
    'the beginning of your first main phase',
    'the beginning of your second main phase',
    'the beginning of combat on your turn',
    'the beginning of each combat',
    'the beginning of the end of combat step',
    'end of combat',
    'end of combat on your turn',
  ],
  rejects: [
    'the beginning of the draw step',
    'the beginning of your upkeep',
    'the beginning of your end step',
    'the beginning of combat',
    'the beginning of combat on each opponent’s turn',
    'the beginning of your next draw step',
    'the beginning of your main phase',
    'the beginning of each of your main phases',
    'the beginning of each of your postcombat main phase',
    'the beginning of each of their postcombat main phases',
    'the beginning of each of your postcombat main phases and',
    "the beginning of each opponent's precombat main phase and",
    'the beginning of the next end of combat step',
    'end of combat on target opponent’s turn',
    'end of turn',
    'the end of combat',
  ],
  parse: (ctx, pos) => {
    const at = (end: number) => ({ start: pos, end });
    const phase = sequence(
      literal('the beginning of '),
      stepOwner(false),
      choice(
        ...PHASE_WORDS.map(({ words, step }) =>
          map(pattern(new RegExp(`${words}${NOT_IN_WORD}`, 'iu')), () => step),
        ),
      ),
    );
    // "each of your postcombat main phases" (CR 500.1, 505.1; D-356): the plural of "your postcombat main phase", for the turns of the controller.
    const plural = sequence(
      literal('the beginning of each of your '),
      choice(
        ...PHASE_WORDS.map(({ words, step }) =>
          map(pattern(new RegExp(`${words}s${NOT_IN_WORD}`, 'iu')), () => step),
        ),
      ),
    )(ctx, pos);
    const owned = plural.ok
      ? ({ ok: true, value: [null, 'you' as const, plural.value[1]], pos: plural.pos } as const)
      : phase(ctx, pos);
    if (owned.ok) {
      const [, det, step] = owned.value;
      // A main phase is "your" or "each" player's, a turn of "each opponent" too (CR 505.1).
      const actor = makeNoun('trigger.step', at(owned.pos), det, { raw: det });
      return {
        ok: true,
        value: stepTrigger('trigger.step', at(owned.pos), step, actor),
        pos: owned.pos,
      };
    }
    const combat = sequence(
      literal('the beginning of '),
      choice(
        map(pattern(new RegExp(`combat on your turn${NOT_IN_WORD}`, 'iu')), () => 'you' as const),
        map(pattern(new RegExp(`each combat${NOT_IN_WORD}`, 'iu')), () => 'eachPlayer' as const),
      ),
    )(ctx, pos);
    if (combat.ok) {
      const actor = makeNoun('trigger.step', at(combat.pos), combat.value[1], {
        raw: combat.value[1],
      });
      return {
        ok: true,
        value: stepTrigger('trigger.step', at(combat.pos), 'beginCombat', actor),
        pos: combat.pos,
      };
    }
    // "end of combat": nobody's in particular; "on your turn" says whose.
    const ending = choice(
      map(
        pattern(new RegExp(`the beginning of the end of combat step${NOT_IN_WORD}`, 'iu')),
        () => 'eachPlayer' as const,
      ),
      map(
        pattern(new RegExp(`end of combat on your turn${NOT_IN_WORD}`, 'iu')),
        () => 'you' as const,
      ),
      map(pattern(new RegExp(`end of combat${NOT_IN_WORD}`, 'iu')), () => 'eachPlayer' as const),
    )(ctx, pos);
    if (!ending.ok) return ending;
    const actor = makeNoun('trigger.step', at(ending.pos), ending.value, { raw: ending.value });
    return {
      ok: true,
      value: stepTrigger('trigger.step', at(ending.pos), 'combatEnd', actor),
      pos: ending.pos,
    };
  },
});

const ORDINALS: Readonly<Record<string, number>> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
};

/**
 * `trigger.drawn`: "you draw a card", "an opponent draws a card", "a player draws a card", "you draw
 * your second card each turn", "an opponent draws their second card each turn" (CR 121.1: drawing a
 * card; CR 603.2c: it triggers once for each card drawn). The card is not read ("except the first one
 * they draw in each of their draw steps" is another event and is not read).
 */
export const TRIGGER_DRAWN = defineRule<IrTrigger>({
  id: 'trigger.drawn',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: [
    'CR 121.1 (Drawing a Card)',
    'CR 121.2 (Drawing a Card)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'you draw a card',
    'an opponent draws a card',
    'a player draws a card',
    'you draw your second card each turn',
    'you draw your first card each turn',
    'an opponent draws their second card each turn',
    'a player draws their third card each turn',
  ],
  rejects: [
    'you draw a card except the first one you draw in each of your draw steps',
    'you draw two cards',
    'you draw your second card',
    'you draw their second card each turn',
    'an opponent draws your second card each turn',
    'an opponent draw a card',
    'you drew a card',
    'you draw your sixth card each turn',
    'you draw a card or discard a card',
    'one or more players draw a card',
    'each opponent draws a card',
  ],
  parse: (ctx, pos) => {
    const who = choice(
      map(sequence(youNoun('trigger.drawn'), literal(' draw ')), ([you]) => ({
        actor: you,
        possessive: 'your',
      })),
      map(spanned(literal('an opponent draws ')), ({ span }) => ({
        actor: makeNoun(
          'trigger.drawn',
          { start: span.start, end: span.start + 'an opponent'.length },
          'eachOpponent',
          { raw: 'an opponent' },
        ),
        possessive: 'their',
      })),
      map(spanned(literal('a player draws ')), ({ span }) => ({
        actor: makeNoun(
          'trigger.drawn',
          { start: span.start, end: span.start + 'a player'.length },
          'eachPlayer',
          { raw: 'a player' },
        ),
        possessive: 'their',
      })),
    );
    const subject = who(ctx, pos);
    if (!subject.ok) return subject;
    const { actor, possessive } = subject.value;
    const count: Parser<number | undefined> = choice(
      map(pattern(new RegExp(`a card${NOT_IN_WORD}`, 'iu')), () => undefined),
      map(
        pattern(
          new RegExp(
            `${possessive} (first|second|third|fourth|fifth) card each turn${NOT_IN_WORD}`,
            'iu',
          ),
        ),
        (m) => ORDINALS[(m[1] ?? '').toLowerCase()],
      ),
    );
    const r = count(ctx, subject.pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const trigger: IrTrigger = {
      kind: 'trigger',
      event: 'drawn',
      actor,
      ...(r.value === undefined ? {} : { nth: r.value }),
      args: {},
      span,
      rule: 'trigger.drawn',
    };
    return { ok: true, value: trigger, pos: r.pos };
  },
});

type Damaged = { readonly damaged: IrTrigger['damaged']; readonly span: Span };

/** " deals combat damage to a player" and the like: what the damage went to, and the words read. */
function damagedWords(damaged: IrTrigger['damaged'], to: string): Parser<Damaged> {
  return map(
    spanned(pattern(new RegExp(` deals combat damage${to}${NOT_IN_WORD}`, 'iu'))),
    ({ span }) => ({ damaged, span }),
  );
}

/**
 * `trigger.combat-damage`: "~ deals combat damage to a player", "a creature you control deals
 * combat damage to a player", "equipped creature deals combat damage to an opponent", "~ deals
 * combat damage to a creature", "~ deals combat damage" (CR 120.2a combat damage, CR 510.2 it is
 * dealt simultaneously; CR 603.2 it triggers for each source and recipient). "One or more creatures
 * deal combat damage" is one trigger for a group and is not read, nor is damage that is not combat
 * damage or damage to a planeswalker only.
 */
export const TRIGGER_COMBAT_DAMAGE = defineRule<IrTrigger>({
  id: 'trigger.combat-damage',
  family: 'trigger',
  leading: ['~', 'another', 'a', 'an', 'equipped', 'enchanted'],
  cites: [
    'CR 120.2a (Damage)',
    'CR 510.2 (Combat Damage Step)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    '~ deals combat damage to a player',
    '~ deals combat damage to an opponent',
    '~ deals combat damage to a creature',
    '~ deals combat damage',
    'a creature you control deals combat damage to a player',
    'another creature you control deals combat damage to an opponent',
    'equipped creature deals combat damage to a player',
    'enchanted creature deals combat damage to a player',
    'a creature deals combat damage to a creature',
  ],
  rejects: [
    '~ deals damage to a player',
    '~ deals combat damage to a player or planeswalker',
    '~ deals combat damage to you',
    '~ deals combat damage to a planeswalker',
    '~ deal combat damage to a player',
    'one or more creatures you control deal combat damage to a player',
    '~ deals combat damage to a player and',
    '~ deals noncombat damage to a player',
    '~ or another creature deals combat damage to a player',
  ],
  parse: (ctx, pos) => {
    const dealt = sequence(
      permanentOrAttachedSubject('trigger.combat-damage'),
      choice(
        damagedWords('player', ' to a player'),
        damagedWords('opponent', ' to an opponent'),
        damagedWords('creature', ' to a creature'),
        damagedWords(undefined, ''),
      ),
    )(ctx, pos);
    if (!dealt.ok) return dealt;
    const [what, { damaged, span: words }] = dealt.value;
    const span = { start: pos, end: dealt.pos };
    // The player hit is the antecedent of "that player" in the body.
    const recipient =
      damaged === 'player' || damaged === 'opponent'
        ? makeNoun(
            'trigger.combat-damage',
            {
              start: words.end - (damaged === 'player' ? 'a player'.length : 'an opponent'.length),
              end: words.end,
            },
            damaged === 'player' ? 'eachPlayer' : 'eachOpponent',
            { raw: damaged === 'player' ? 'a player' : 'an opponent' },
          )
        : undefined;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'dealsCombatDamage',
        subject: what,
        ...(damaged === undefined ? {} : { damaged }),
        ...(recipient === undefined ? {} : { recipient }),
        args: {},
        span,
        rule: 'trigger.combat-damage',
      },
      pos: dealt.pos,
    };
  },
});

/**
 * `trigger.leaves`: "~ leaves the battlefield", "a creature you control leaves the battlefield",
 * "equipped creature leaves the battlefield" (CR 603.6c: leaves-the-battlefield abilities trigger when a
 * permanent goes to another zone; CR 603.10a they look back in time). Where the permanent went ("and is
 * put into a graveyard") is not read; "dies" is `trigger.dies`.
 */
export const TRIGGER_LEAVES = defineRule<IrTrigger>({
  id: 'trigger.leaves',
  family: 'trigger',
  leading: ['~', 'another', 'a', 'an', 'equipped', 'enchanted'],
  cites: [
    'CR 603.6c (Handling Triggered Abilities)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 700.4 (General)',
  ],
  examples: [
    '~ leaves the battlefield',
    'a creature you control leaves the battlefield',
    'another creature you control leaves the battlefield',
    'a creature leaves the battlefield',
    'equipped creature leaves the battlefield',
    'a permanent you control leaves the battlefield',
  ],
  rejects: [
    '~ leaves',
    '~ leaves the battlefield and',
    '~ leaves your graveyard',
    '~ leave the battlefield',
    '~ left the battlefield',
    '~ leaves the battlefield or dies',
    '~ or another creature leaves the battlefield',
    'one or more creatures you control leave the battlefield',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      permanentOrAttachedSubject('trigger.leaves'),
      pattern(new RegExp(` leaves the battlefield${NOT_IN_WORD}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'leavesBattlefield',
        subject: r.value[0],
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.leaves',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.dealt-damage`: "~ is dealt damage", "a creature you control is dealt damage", "~ is dealt combat damage"
 * (stage P29, D-133, CR 120.3, 603.2, 603.2g: it triggers once for each source that damages the permanent, in the moment
 * the damage is dealt, so it triggers for the damage that kills it, and not for damage that is entirely prevented).
 * "Is dealt damage by a creature" and "is dealt noncombat damage" say more, and are not read.
 */
export const TRIGGER_DEALT_DAMAGE = defineRule<IrTrigger>({
  id: 'trigger.dealt-damage',
  family: 'trigger',
  leading: ['~', 'another', 'a', 'an', 'equipped', 'enchanted'],
  cites: [
    'CR 120.3 (Damage)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2g (Handling Triggered Abilities)',
  ],
  examples: [
    '~ is dealt damage',
    '~ is dealt combat damage',
    'a creature you control is dealt damage',
    'another creature you control is dealt damage',
    'equipped creature is dealt damage',
    'a Zombie you control is dealt combat damage',
  ],
  rejects: [
    '~ is dealt damage by a creature',
    '~ is dealt noncombat damage',
    '~ are dealt damage',
    '~ is dealt damage or dies',
    '~ is dealt',
    '~ deals damage',
    '~ was dealt damage',
    'you are dealt damage',
    '~ is dealt combat damage by a creature',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      permanentOrAttachedSubject('trigger.dealt-damage'),
      pattern(/ is dealt (combat )?damage(?![\p{L}\p{N}]| by )/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const combat = r.value[1][1] !== undefined;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'dealtDamage',
        subject: r.value[0],
        ...(combat ? { combat: true as const } : {}),
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.dealt-damage',
      },
      pos: r.pos,
    };
  },
});

export const EVENT_TRIGGER_RULES = [
  TRIGGER_STEP,
  TRIGGER_DRAWN,
  TRIGGER_COMBAT_DAMAGE,
  TRIGGER_DEALT_DAMAGE,
  TRIGGER_LEAVES,
];
