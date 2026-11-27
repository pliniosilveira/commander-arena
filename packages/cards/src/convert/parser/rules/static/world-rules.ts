/**
 * Static ability rules of three world-rule lines (Everlasting Torment): "Players can't gain life." (CR 119.7, 604.1), "Damage can't be prevented." (CR 615.12)
 * and "All damage is dealt as though its source had wither." (CR 702.80a, 120.3d). Each is a line of its own: the permanent changes a rule of the game, whoever
 * controls it. The subject is a noun the lowering ignores for the two damage lines (there is no player or permanent it is said of).
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, quietly, spanned } from '../registry';
import { staticOf, subjectNoun } from './angels-words';

/** The subject of the damage lines: "damage", said of no player (the noun is read only for its span). */
function damageNoun(span: { readonly start: number; readonly end: number }, rule: string): IrNoun {
  return {
    kind: 'noun',
    det: 'each',
    filter: { raw: 'damage' },
    upTo: false,
    plural: false,
    other: false,
    span,
    rule,
  };
}

/**
 * `static.players-cant-gain-life`: "Players can't gain life." (CR 119.7: while the permanent has the ability, no player can gain life, by any means: an effect,
 * lifelink, an exchange that would raise the life total; CR 604.1). Not read: "You", "Each opponent" and "Your opponents" (another rule), "lose life", a duration or
 * a condition, and more words after it.
 */
export const STATIC_PLAYERS_CANT_GAIN_LIFE = defineRule<IrStatic>({
  id: 'static.players-cant-gain-life',
  family: 'static',
  leading: ['players'],
  cites: ['CR 119.7 (Life)', 'CR 604.1 (Handling Static Abilities)', 'CR 101.2 (Golden Rules)'],
  examples: ["Players can't gain life.", 'Players can’t gain life.'],
  rejects: [
    "Players can't gain life",
    "Each player can't gain life.",
    "Players can't lose life.",
    "Players can't gain life until end of turn.",
    "Players can't gain life as long as you control a Dragon.",
    "Players can't gain life and you draw a card.",
    "Players can't gain or lose life.",
    "Target player can't gain life.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      spanned(literal('players')),
      pattern(/ can['’]t gain life/iu),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [who] = r.value;
    return {
      ok: true,
      value: staticOf(
        'static.players-cant-gain-life',
        {
          ...subjectNoun('you', 'players', who.span, 'static.players-cant-gain-life'),
          det: 'eachPlayer',
          plural: true,
        },
        [{ kind: 'cantGainLife', who: 'players' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

/** `static.damage-cant-be-prevented`: "Damage can't be prevented." (CR 615.12, 604.1). Not read: a source or a recipient, "this turn", a condition. */
export const STATIC_DAMAGE_CANT_BE_PREVENTED = defineRule<IrStatic>({
  id: 'static.damage-cant-be-prevented',
  family: 'static',
  leading: ['damage'],
  cites: ['CR 615.12 (Prevention Effects)', 'CR 604.1 (Handling Static Abilities)'],
  examples: ["Damage can't be prevented.", 'Damage can’t be prevented.'],
  rejects: [
    "Damage can't be prevented",
    "Combat damage can't be prevented.",
    "Damage can't be prevented this turn.",
    "Damage that would be dealt to you can't be prevented.",
    "Damage can't be prevented as long as you control a Dragon.",
    "Damage can't be prevented and you draw a card.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(spanned(pattern(/damage can['’]t be prevented/iu)), literal('.'))(ctx, pos);
    if (!r.ok) return r;
    const [read] = r.value;
    const id = 'static.damage-cant-be-prevented';
    return {
      ok: true,
      value: staticOf(
        id,
        damageNoun(read.span, id),
        [{ kind: 'damageCantBePrevented' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

/** `static.all-damage-as-though-wither`: "All damage is dealt as though its source had wither." (CR 702.80a, 120.3d, 604.1). */
export const STATIC_ALL_DAMAGE_AS_THOUGH_WITHER = defineRule<IrStatic>({
  id: 'static.all-damage-as-though-wither',
  family: 'static',
  leading: ['all'],
  cites: ['CR 702.80a (Wither)', 'CR 120.3 (Damage)', 'CR 604.1 (Handling Static Abilities)'],
  examples: ['All damage is dealt as though its source had wither.'],
  rejects: [
    'All damage is dealt as though its source had wither',
    'All damage is dealt as though its source had infect.',
    'All combat damage is dealt as though its source had wither.',
    'All damage is dealt as though its source had wither until end of turn.',
    'All damage is dealt as though its source had wither and you draw a card.',
    'Damage is dealt as though its source had wither.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      spanned(pattern(/all damage is dealt as though its source had wither/iu)),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [read] = r.value;
    const id = 'static.all-damage-as-though-wither';
    return {
      ok: true,
      value: staticOf(
        id,
        damageNoun(read.span, id),
        [{ kind: 'damageAsThoughWither' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

/**
 * `static.opponent-search-top-only`: "If an opponent would search a library, that player searches the top four cards of that library instead." (Aven Mindcensor, CR 701.23, 614.1a,
 * 604.1: the opponents of the controller look only at the top cards of a library they search). A line of its own. Not read: another player, "a player", another number word of
 * zero or one, the cards of your own library, a duration or a condition, and more words after it.
 */
export const STATIC_OPPONENT_SEARCH_TOP_ONLY = defineRule<IrStatic>({
  id: 'static.opponent-search-top-only',
  family: 'static',
  leading: ['if'],
  cites: [
    'CR 701.23 (Search)',
    'CR 614.1a (Replacement Effects)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'If an opponent would search a library, that player searches the top four cards of that library instead.',
    'if an opponent would search a library, that player searches the top three cards of that library instead.',
  ],
  rejects: [
    'If an opponent would search a library, that player searches the top four cards of that library instead',
    'If a player would search a library, that player searches the top four cards of that library instead.',
    'If an opponent would search a library, that player searches the top one cards of that library instead.',
    'If an opponent would search a library, that player searches the top four cards of their library instead.',
    'If an opponent would search a library, that player searches the top four cards of that library instead until end of turn.',
    'If an opponent would search a library, that player searches the top four cards of that library instead and you draw a card.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      spanned(pattern(/if an opponent would search a library, that player searches the top /iu)),
      satisfy(quantity, (n) => n >= 2),
      pattern(/ cards of that library instead\./iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [read, count] = r.value;
    const id = 'static.opponent-search-top-only';
    return {
      ok: true,
      value: staticOf(
        id,
        damageNoun(read.span, id),
        [{ kind: 'opponentSearchTopOnly', count }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

/**
 * `static.activated-abilities-of-chosen-name`: "Activated abilities of sources with the chosen name can't be activated." (Phyrexian Revoker; CR 602.5, 605.1a, 607.2d, 604.1): no
 * activated ability of an object with the name this permanent chose as it entered, mana abilities included. The engine's `cantActivateChosenName`; the card must also choose a name as it
 * enters (`asEntersChoose` of `cardName`, which `validateCard` checks). Not read: "unless they're mana abilities" (Pithing Needle, another rule), a name the text gives, a duration or a
 * condition, and more words after it.
 */
export const STATIC_ACTIVATED_ABILITIES_OF_CHOSEN_NAME = defineRule<IrStatic>({
  id: 'static.activated-abilities-of-chosen-name',
  family: 'static',
  leading: ['activated'],
  cites: [
    'CR 602.5 (Activating Activated Abilities)',
    'CR 605.1a (Mana Abilities)',
    'CR 607.2d (Linked Abilities)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "Activated abilities of sources with the chosen name can't be activated.",
    'Activated abilities of sources with the chosen name can’t be activated.',
  ],
  rejects: [
    "Activated abilities of sources with the chosen name can't be activated",
    "Activated abilities of sources with the chosen name can't be activated unless they're mana abilities.",
    "Activated abilities of sources with the chosen name can't be activated this turn.",
    "Activated abilities of sources with the chosen name can't be activated and you draw a card.",
    "Activated abilities of sources named Sol Ring can't be activated.",
    "Activated abilities of creatures with the chosen name can't be activated.",
    "Triggered abilities of sources with the chosen name can't be activated.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      spanned(pattern(/activated abilities of sources with the chosen name/iu)),
      pattern(/ can['’]t be activated/iu),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [read] = r.value;
    const id = 'static.activated-abilities-of-chosen-name';
    return {
      ok: true,
      value: staticOf(
        id,
        damageNoun(read.span, id),
        [{ kind: 'cantActivateChosenName' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const WORLD_RULES_STATIC_RULES = [
  STATIC_OPPONENT_SEARCH_TOP_ONLY,
  STATIC_PLAYERS_CANT_GAIN_LIFE,
  STATIC_DAMAGE_CANT_BE_PREVENTED,
  STATIC_ALL_DAMAGE_AS_THOUGH_WITHER,
  STATIC_ACTIVATED_ABILITIES_OF_CHOSEN_NAME,
].map(quietly);
