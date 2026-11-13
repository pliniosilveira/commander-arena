/**
 * The static abilities that change what a player may do in a turn (stage P24, D-125; ENGINE_VERSION 24):
 * "You may play an additional land on each of your turns." (CR 305.2), "You may look at the top card of your
 * library any time." (CR 401.5), "Creatures can't attack you unless their controller pays {2} for each creature
 * they control that's attacking you." (CR 508.1d, 508.1h) and "You may choose not to untap ~ during your untap
 * step." (CR 502.3). Each is one whole line and one engine `static` ability; the wordings are the real ones of
 * `reports/templates.json`, and a near miss (another subject, another cost, a count in the cost) is not read.
 */
import { fail, type Parser, pattern, satisfy } from '../../combinators';
import type { IrCost, IrNoun, IrStatic, IrStaticEffect, Span } from '../../ir/types';
import { defineRule } from '../registry';

type Det = IrNoun['det'];

/** The subject of the statement: who or what the line is about, as the lowering and the diagnostics see it. */
function subject(
  det: Det,
  raw: string,
  span: Span,
  rule: string,
  types?: readonly string[],
): IrNoun {
  return {
    kind: 'noun',
    det,
    filter: { raw, ...(types === undefined ? {} : { types }) },
    upTo: false,
    plural: det === 'each',
    other: false,
    span,
    rule,
  };
}

/** One statement with one effect, over the span the rule read. */
function statement(rule: string, who: IrNoun, effect: IrStaticEffect, span: Span): IrStatic {
  return { kind: 'static', subject: who, effects: [effect], span, rule };
}

/** The words for two to ten ("two additional lands"); the singular "an additional land" is one. */
const COUNT_WORDS = [
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
] as const;

/**
 * `static.additional-land`: "You may play an additional land on each of your turns.", "You may play two
 * additional lands on each of your turns." and "Each player may play an additional land on each of their turns."
 * (CR 305.2: a player can play one land in their turn unless an effect increases the number; 305.2a, 604.1). The
 * engine adds the extra plays of every such permanent its controller has, or every player's with "Each player"
 * (`eachPlayer`). Not read: "You may play an additional land this turn." (an effect of a spell, 5 cards, a
 * different thing), "Each player may play two additional lands" (the repository holds no real line of it),
 * "play lands from your graveyard", and a condition.
 */
export const STATIC_ADDITIONAL_LAND = defineRule<IrStatic>({
  id: 'static.additional-land',
  family: 'static',
  leading: ['you', 'each'],
  cites: [
    'CR 305.2 (Lands)',
    'CR 305.2a (Lands)',
    'CR 305.3 (Lands)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'You may play an additional land on each of your turns.',
    'You may play two additional lands on each of your turns.',
    'You may play three additional lands on each of your turns.',
    'Each player may play an additional land on each of their turns.',
  ],
  rejects: [
    'You may play an additional land on each of your turns',
    'You may play an additional land this turn.',
    'You may play an additional land on each of their turns.',
    'You may play one additional land on each of your turns.',
    'You may play two additional lands this turn.',
    'You may play an additional lands on each of your turns.',
    'You may play two additional land on each of your turns.',
    'You may play 2 additional lands on each of your turns.',
    'You may play eleven additional lands on each of your turns.',
    'You may play an additional land on each of your turns if you control a Forest.',
    'Each player may play an additional land on each of your turns.',
    'Each player may play two additional lands on each of their turns.',
    'Each opponent may play an additional land on each of their turns.',
    'You may play an additional land from your graveyard on each of your turns.',
    'You may play an additional land on each of your turns and draw a card.',
    'You may cast an additional spell on each of your turns.',
    'Players may play an additional land on each of their turns.',
  ],
  parse: (ctx, pos) => {
    const mine = pattern(
      new RegExp(
        `you may play (?:an additional land|(${COUNT_WORDS.join('|')}) additional lands) on each of your turns\\.`,
        'i',
      ),
    )(ctx, pos);
    if (mine.ok) {
      const word = (mine.value[1] ?? '').toLowerCase();
      const count = word === '' ? 1 : COUNT_WORDS.indexOf(word as (typeof COUNT_WORDS)[number]) + 2;
      const who = subject('you', 'you', { start: pos, end: pos + 3 }, 'static.additional-land');
      const span = { start: pos, end: mine.pos };
      return {
        ok: true,
        value: statement(
          'static.additional-land',
          who,
          { kind: 'additionalLandDrops', count },
          span,
        ),
        pos: mine.pos,
      };
    }
    const each = pattern(/each player may play an additional land on each of their turns\./i)(
      ctx,
      pos,
    );
    if (!each.ok) return each;
    const who = subject(
      'eachPlayer',
      'each player',
      { start: pos, end: pos + 11 },
      'static.additional-land',
    );
    const span = { start: pos, end: each.pos };
    return {
      ok: true,
      value: statement(
        'static.additional-land',
        who,
        { kind: 'additionalLandDrops', count: 1, eachPlayer: true },
        span,
      ),
      pos: each.pos,
    };
  },
});

/**
 * `static.look-at-top`: "You may look at the top card of your library any time." (CR 401.5: a player may look
 * at the top card of their library when an effect says so; nothing is revealed, CR 401.2). The engine shows the
 * card in the controller's own view and in no other. Not read: "Play with the top card of your library revealed."
 * (a different ability: everyone sees it), "the top card of each player's library", "of target player's library",
 * and a line that also lets the player play or cast the card (more text, so the card stays unsupported).
 */
export const STATIC_LOOK_AT_TOP = defineRule<IrStatic>({
  id: 'static.look-at-top',
  family: 'static',
  leading: ['you'],
  cites: ['CR 401.5 (Library)', 'CR 401.2 (Library)', 'CR 604.1 (Handling Static Abilities)'],
  examples: ['You may look at the top card of your library any time.'],
  rejects: [
    'You may look at the top card of your library any time',
    'You may look at the top card of your library.',
    'You may look at the top card of your library any time. You may cast spells from the top of your library.',
    "You may look at the top card of each player's library any time.",
    "You may look at the top card of target player's library any time.",
    "You may look at the top card of an opponent's library any time.",
    'You may look at the top two cards of your library any time.',
    'You may look at the top card of your graveyard any time.',
    'You may look at the bottom card of your library any time.',
    'You may look at the top card of your library at any time.',
    'You may look at the top card of your library any time you could cast a spell.',
    'Play with the top card of your library revealed.',
    'Look at the top card of your library any time.',
    'Each player may look at the top card of their library any time.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you may look at the top card of your library any time\./i)(ctx, pos);
    if (!r.ok) return r;
    const who = subject('you', 'you', { start: pos, end: pos + 3 }, 'static.look-at-top');
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: statement('static.look-at-top', who, { kind: 'lookAtTopOfLibrary' }, span),
      pos: r.pos,
    };
  },
});

/**
 * The mana cost an attacker pays: plain symbols ({2}, {W}, {C}), hybrid ones ({R/W}, {2/W}, {C/W}) and Phyrexian
 * ones ({W/P}, CR 107.4f), which the engine's planner pays as it pays any cost (D-125). Never {X} (nobody announces
 * an X when attacking, CR 107.3), snow or a cost of nothing ({0}).
 */
const TAX_SYMBOL = '\\{(?:0|[1-9][0-9]*|[WUBRGC]|[WUBRG]/[WUBRG]|C/[WUBRG]|2/[WUBRG]|[WUBRG]/P)\\}';
export const TAX_COST: Parser<readonly string[]> = satisfy(
  (ctx, pos) => {
    const r = pattern(new RegExp(`(?:${TAX_SYMBOL})+`, 'i'))(ctx, pos);
    if (!r.ok) return r;
    const symbols = [...r.value[0].matchAll(/\{([^}]+)\}/g)].map((m) => (m[1] ?? '').toUpperCase());
    return { ok: true, value: symbols, pos: r.pos };
  },
  (symbols) =>
    symbols.some((s) => s !== '0') &&
    // `{R/R}` says nothing a plain symbol does not, and no Oracle text writes it.
    symbols.every((s) => !/^[WUBRG]\/[WUBRG]$/.test(s) || s.charAt(0) !== s.charAt(2)),
);

/**
 * `static.attack-tax`: "Creatures can't attack you unless their controller pays {2} for each creature they
 * control that's attacking you." (Propaganda, Ghostly Prison, Windborn Muse, Koskun Falls) and "Creatures can't
 * attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures." (Norn's
 * Annex, Baird, Steward of Argive, Archon of Absolution) (CR 508.1d: a creature that can't attack unless a cost is
 * paid; 508.1h: the total cost of the attackers is paid as they are declared). The cost is mana (plain, hybrid or
 * Phyrexian symbols) and the same for each attacker; the second form, with the planeswalkers, ends "each of those
 * creatures", the first "each creature they control that's attacking you", and the two do not mix. Not read: a cost
 * that is not mana, {X} or any count ("pays {X} for each of those creatures, where X is the number of enchantments
 * you control", Sphere of Safety), "can't attack you" with no cost, another subject ("Creatures your opponents
 * control", "Attacking creatures"), "each opponent", and a cost to block.
 */
export const STATIC_ATTACK_TAX = defineRule<IrStatic>({
  id: 'static.attack-tax',
  family: 'static',
  leading: ['creatures'],
  cites: [
    'CR 508.1d (Declare Attackers Step)',
    'CR 508.1h (Declare Attackers Step)',
    'CR 107.4f (Numbers and Symbols)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.",
    "Creatures can't attack you unless their controller pays {1} for each creature they control that's attacking you.",
    "Creatures can't attack you unless their controller pays {W}{W} for each creature they control that's attacking you.",
    'Creatures can’t attack you unless their controller pays {2} for each creature they control that’s attacking you.',
    "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures.",
    "Creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.",
    "Creatures can't attack you or planeswalkers you control unless their controller pays {R/W}{1} for each of those creatures.",
  ],
  rejects: [
    "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you",
    "Creatures can't attack you unless their controller pays {X} for each creature they control that's attacking you.",
    "Creatures can't attack you unless their controller pays {2} for each creature.",
    "Creatures can't attack you unless their controller pays {2}.",
    "Creatures can't attack you unless their controller pays 2 life for each creature they control that's attacking you.",
    "Creatures can't attack you unless their controller pays {0} for each creature they control that's attacking you.",
    "Creatures can't attack you unless their controller pays {S} for each creature they control that's attacking you.",
    "Creatures can't attack you unless their controller pays {R/R} for each creature they control that's attacking you.",
    "Creatures can't attack you unless their controller pays {2} for each of those creatures.",
    "Creatures can't attack you or planeswalkers you control unless their controller pays {2} for each creature they control that's attacking you.",
    "Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those creatures, where X is the number of enchantments you control.",
    "Creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures",
    "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you. Draw a card.",
    "Creatures can't attack you unless their controller pays {2}{X} for each creature they control that's attacking you.",
    "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking an opponent.",
    "Creatures can't attack me unless their controller pays {2} for each creature they control that's attacking you.",
    "Creatures can't attack your opponents unless their controller pays {2} for each creature they control that's attacking you.",
    "Creatures can't attack planeswalkers you control unless their controller pays {2} for each of those creatures.",
    "Creatures can't attack you unless you pay {2} for each creature they control that's attacking you.",
    "Creatures can't attack you unless their controller pays {2} for each creature that's attacking you.",
    "Creatures can't block you unless their controller pays {2} for each creature they control that's blocking you.",
    "Creatures can't attack you or battles you protect unless their controller pays {2} for each of those creatures.",
    "Creatures you control can't attack you unless their controller pays {2} for each creature they control that's attacking you.",
    "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you if it's your turn.",
    "Creatures can't attack each opponent unless their controller pays {2} for each creature they control that's attacking you.",
  ],
  parse: (ctx, pos) => {
    const head = pattern(
      /creatures can['’]t attack you( or planeswalkers you control)? unless their controller pays /i,
    )(ctx, pos);
    if (!head.ok) return head;
    const planeswalkers = head.value[1] !== undefined;
    const cost = TAX_COST(ctx, head.pos);
    if (!cost.ok) return cost;
    const tail = pattern(
      /\s+for each (creature they control that['’]s attacking you|of those creatures)\./iy,
    )(ctx, cost.pos);
    if (!tail.ok) return tail;
    const ofThose = (tail.value[1] ?? '').toLowerCase() === 'of those creatures';
    // The wording says what it covers: "of those creatures" are the creatures that attack you or a planeswalker.
    if (ofThose !== planeswalkers) return fail(ctx, cost.pos);
    const costStart = head.pos;
    const costNode: IrCost = {
      kind: 'mana',
      symbols: cost.value,
      span: { start: costStart, end: cost.pos },
      rule: 'static.attack-tax',
    };
    const who = subject(
      'each',
      'creatures',
      { start: pos, end: pos + 'creatures'.length },
      'static.attack-tax',
      ['creature'],
    );
    const span = { start: pos, end: tail.pos };
    const effect: IrStaticEffect = {
      kind: 'attackTax',
      cost: costNode,
      ...(planeswalkers ? { planeswalkers: true as const } : {}),
    };
    return { ok: true, value: statement('static.attack-tax', who, effect, span), pos: tail.pos };
  },
});

/**
 * `static.optional-untap`: "You may choose not to untap ~ during your untap step." (CR 502.3: the active player
 * determines which permanents untap; the permanent's own ability lets its controller keep it tapped). It is the
 * ability of the permanent itself: another permanent ("You may choose not to untap target creature", "enchanted
 * creature", "each creature you control"), another player's untap step and a cost-like condition are not read.
 * "Untap ~ during each other player's untap step." (4 cards) and "~ doesn't untap during your untap step." (a
 * restriction, `static.self`) are different abilities.
 */
export const STATIC_OPTIONAL_UNTAP = defineRule<IrStatic>({
  id: 'static.optional-untap',
  family: 'static',
  leading: ['you'],
  cites: ['CR 502.3 (Untap Step)', 'CR 604.1 (Handling Static Abilities)'],
  examples: ['You may choose not to untap ~ during your untap step.'],
  rejects: [
    'You may choose not to untap ~ during your untap step',
    'You may choose not to untap ~ during each of your untap steps.',
    "You may choose not to untap ~ during its controller's untap step.",
    "You may choose not to untap ~ during each other player's untap step.",
    'You may choose not to untap ~.',
    'You may choose not to untap target creature during your untap step.',
    'You may choose not to untap enchanted creature during your untap step.',
    'You may choose not to untap equipped creature during your untap step.',
    'You may choose not to untap each creature you control during your untap step.',
    'You may choose not to untap creatures you control during your untap step.',
    'You may choose not to untap it during your untap step.',
    'You may choose not to untap ~ during your untap step if you control a Swamp.',
    'You may choose not to untap ~ during your untap step and draw a card.',
    "~ doesn't untap during your untap step.",
    'You may untap ~ during your untap step.',
    'You may choose to untap ~ during your untap step.',
    'You may choose not to untap ~ during your upkeep.',
    'You may choose not to untap ~ during your untap step. You may choose not to untap target land during your untap step.',
    'Each player may choose not to untap ~ during their untap step.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you may choose not to untap ~ during your untap step\./i)(ctx, pos);
    if (!r.ok) return r;
    const at = 'you may choose not to untap '.length;
    const who = subject(
      'self',
      '~',
      { start: pos + at, end: pos + at + 1 },
      'static.optional-untap',
    );
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: statement('static.optional-untap', who, { kind: 'optionalUntap' }, span),
      pos: r.pos,
    };
  },
});

/**
 * `static.untap-in-others-step`: "Untap all creatures you control during each other player's untap step." (CR 502.3: a permanent untaps in the untap step of
 * its controller; this ability makes the creatures of its controller untap in the untap step of every other player too; stage P68, D-229) and, D-320,
 * "Untap ~ during each other player's untap step." (the permanent itself, the engine's `self`). The creatures are "all creatures you control": another group,
 * another permanent ("Untap target land", "Untap enchanted creature"), another step and a condition are not read.
 */
export const STATIC_UNTAP_IN_OTHERS_STEP = defineRule<IrStatic>({
  id: 'static.untap-in-others-step',
  family: 'static',
  leading: ['untap'],
  cites: ['CR 502.3 (Untap Step)', 'CR 604.1 (Handling Static Abilities)'],
  examples: [
    "Untap all creatures you control during each other player's untap step.",
    "Untap ~ during each other player's untap step.",
    'Untap ~ during each other player’s untap step.',
  ],
  rejects: [
    "Untap all creatures you control during each other player's untap step",
    "Untap ~ during each other player's untap step",
    "Untap ~ during each other player's untap step if you control a Swamp.",
    "Untap ~ during each player's untap step.",
    "Untap ~ during each opponent's untap step.",
    'Untap ~ during your untap step.',
    "Untap it during each other player's untap step.",
    "Untap enchanted creature during each other player's untap step.",
    "Untap target land during each other player's untap step.",
    "Untap ~ during each other player's untap step and draw a card.",
    "Untap ~ during each other player's upkeep.",
    "Untap ~ during another player's untap step.",
    "Untap all lands you control during each other player's untap step.",
    "Untap all creatures you control during each other player's untap step if you control a Swamp.",
    "Untap all creatures during each other player's untap step.",
    'Untap all creatures you control during your untap step.',
    "Untap all creatures you control during each player's untap step.",
    "Untap all creatures you control during each opponent's untap step.",
    "Untap all creatures you control during each other player's upkeep.",
  ],
  parse: (ctx, pos) => {
    const rule = 'static.untap-in-others-step';
    const tail = /during each other player['’]s untap step\./iu.source;
    // D-320: "Untap ~ during each other player's untap step." (the permanent itself).
    const self = pattern(new RegExp(`untap ~ ${tail}`, 'iu'))(ctx, pos);
    if (self.ok) {
      const at = 'untap '.length;
      const who = subject('self', '~', { start: pos + at, end: pos + at + 1 }, rule);
      return {
        ok: true,
        value: statement(
          rule,
          who,
          { kind: 'untapInOthersStep', self: true },
          { start: pos, end: self.pos },
        ),
        pos: self.pos,
      };
    }
    const r = pattern(new RegExp(`untap all creatures you control ${tail}`, 'iu'))(ctx, pos);
    if (!r.ok) return r;
    const at = 'untap all creatures '.length;
    const who = subject(
      'you',
      'you',
      { start: pos + at, end: pos + at + 'you control'.length },
      rule,
    );
    return {
      ok: true,
      value: statement(rule, who, { kind: 'untapInOthersStep' }, { start: pos, end: r.pos }),
      pos: r.pos,
    };
  },
});

export const PLAY_RULE_STATIC_RULES = [
  STATIC_ADDITIONAL_LAND,
  STATIC_LOOK_AT_TOP,
  STATIC_ATTACK_TAX,
  STATIC_OPTIONAL_UNTAP,
  STATIC_UNTAP_IN_OTHERS_STEP,
];
