/**
 * Effect rules of the Hofri Ghostforge deck (stage P68, D-229). Each rule is one phrase; the lowerings are in `lower/hofri.ts`.
 */
import { fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrArg, IrFlag, IrNoun, IrToken } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { type Clauses, makeClause, operands, single } from './operands';

/**
 * `effect.player-adds-mana`: "target player adds one mana of any color" (CR 106.1b, 106.4: mana a player adds goes into their mana pool; the player who adds
 * it chooses the color, CR 605.3b). An ability with a target is not a mana ability (CR 605.1a), so it uses the stack. The engine's `chooseOne` with the target
 * player as the chooser, offering `addMana` of each color to that player's pool. Not read: "you add" (a mana ability's own phrase), another quantity of mana,
 * a color list, "one mana of the chosen color", a player other than a target.
 */
export const EFFECT_PLAYER_ADDS_MANA = defineRule<Clauses>({
  id: 'effect.player-adds-mana',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 106.1b (Mana)',
    'CR 106.4 (Mana)',
    'CR 605.1a (Mana Abilities)',
    'CR 605.3b (Activating Mana Abilities)',
  ],
  examples: [
    'target player adds one mana of any color',
    'target opponent adds one mana of any color',
  ],
  rejects: [
    'target player adds two mana of any color',
    'target player adds one mana of any one color',
    'target player adds {G}',
    'target player adds one mana of the chosen color',
    'target player adds one mana of any color and draws a card',
    'you add one mana of any color',
    'target player adds one mana',
    'target creature adds one mana of any color',
  ],
  parse: single(
    'effect.player-adds-mana',
    sequence(
      family<IrNoun>('noun', { only: ['noun.player'] }),
      literal(' adds one mana of any color'),
      pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/u),
    ),
    ([player]) => ({ verb: 'addManaToPlayer', args: { player } }),
  ),
});

/**
 * `effect.copy-this-spell`: "copy ~ and may choose a new target for the copy" (CR 707.10, 707.10c: a copy of the spell that is resolving, put onto the stack
 * under the control of the player who copies it, which may choose a new target for it; the "you may" before it is the clause's). The engine's `copySpell` of
 * `thisSpell` with `newTargets: 'may'`. Not read: another spell, "new targets", a copy that is not a choice of the target, "copy it".
 */
export const EFFECT_COPY_THIS_SPELL = defineRule<Clauses>({
  id: 'effect.copy-this-spell',
  family: 'effect',
  leading: ['you', 'copy'],
  cites: [
    'CR 707.10 (Copying Objects)',
    'CR 707.10c (Copying Objects)',
    'CR 707.10f (Copying Objects)',
  ],
  examples: ['you may copy ~ and may choose a new target for the copy'],
  rejects: [
    'you may copy ~',
    'you may copy ~ and may choose new targets for the copy',
    'you may copy target spell and may choose a new target for the copy',
    'you may copy ~ and may choose a new target for the copy and draw a card',
    'you may copy it and may choose a new target for the copy',
    'you may copy ~ and choose a new target for the copy',
    'copy ~ and may choose a new target for the copy',
    'you may copy',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you may copy ~ and may choose a new target for the copy(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const clause = makeClause(
      'effect.copy-this-spell',
      'copyThisSpell',
      {},
      {
        start: pos,
        end: r.pos,
      },
    );
    // The offer is part of the instruction (the lowering wraps it in the engine's `may`), so a condition before it reads it as one instruction.
    return { ok: true, value: [clause], pos: r.pos };
  },
});

const SUBTYPES = '([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*?)';
const KEYWORD_LIST = '([a-z]+(?: [a-z]+)?(?:, [a-z]+(?: [a-z]+)?)*(?:,? and [a-z]+(?: [a-z]+)?)?)';
/** "It's a 1/1 Spirit creature with flying in addition to its other types" (A), "It has flying and is an Angel in addition to its other types" (B). */
const BECOMES_A = new RegExp(
  `^(?:[Ii]t['’]s|[Ii]t is|[Ee]ach of them is) an? (\\d+)\\/(\\d+) ${SUBTYPES}( creature)?(?: with ${KEYWORD_LIST})? in addition to its other types(?![\\p{L}\\p{N}])`,
  'u',
);
const BECOMES_B = new RegExp(
  `^[Ii]t has ${KEYWORD_LIST} and is an? ${SUBTYPES} in addition to its other types(?![\\p{L}\\p{N}])`,
  'u',
);

/**
 * `effect.becomes-in-addition`: what the permanents an earlier instruction put onto the battlefield are, "in addition to their other types": "It's a 1/1 Spirit
 * creature with flying in addition to its other types", "Each of them is a 1/1 Spirit with flying in addition to its other types", "It has flying and is an Angel in
 * addition to its other types" (CR 205.1b, 613.1d: the types are added; 613.4b: the base power and toughness are set; 613.1f: the keywords are granted; the effects have no
 * end, CR 611.2a). The sentence after the instruction that returned them ("it" and "each of them" are those permanents, as `moved` is). The engine's `setTypes` and
 * `grantKeyword` of what was moved, with no duration. Not read: "until end of turn", another subject, a creature type that is not capitalized, a count other than one set.
 */
export const EFFECT_BECOMES_IN_ADDITION = defineRule<Clauses>({
  id: 'effect.becomes-in-addition',
  family: 'effect',
  leading: ['it', 'it’s', "it's", 'each'],
  cites: [
    'CR 205.1b (Type Line)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    "It's a 1/1 Spirit creature with flying in addition to its other types",
    'Each of them is a 1/1 Spirit with flying in addition to its other types',
    'It has flying and is an Angel in addition to its other types',
    "It's a 2/2 Zombie creature in addition to its other types",
  ],
  rejects: [
    "It's a 1/1 Spirit creature with flying until end of turn",
    "It's a 1/1 spirit creature with flying in addition to its other types",
    'It has flying and is an Angel',
    'Each of them has flying and is an Angel in addition to its other types',
    "It's a 1/1 Spirit creature with flying in addition to its other types and draw a card",
    "They're 1/1 Spirit creatures in addition to their other types",
    "It's a Spirit creature in addition to its other types",
    'It has flying in addition to its other types',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.becomes-in-addition';
    const rest = ctx.text.slice(pos);
    let power: number | null = null;
    let toughness: number | null = null;
    let subtype: string;
    let creature = false;
    let words: string | undefined;
    const a = BECOMES_A.exec(rest);
    const b = a === null ? BECOMES_B.exec(rest) : null;
    let length: number;
    if (a !== null) {
      power = Number(a[1]);
      toughness = Number(a[2]);
      subtype = a[3] ?? '';
      creature = a[4] !== undefined;
      words = a[5];
      length = a[0].length;
    } else if (b !== null) {
      subtype = b[2] ?? '';
      words = b[1];
      length = b[0].length;
    } else {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: pos + length };
    const keywords = words === undefined ? [] : words.split(/, and |, | and /).map((w) => w.trim());
    const args: Record<string, IrArg> = {
      types: {
        kind: 'typeList',
        subtypes: [subtype],
        ...(creature ? { cardTypes: ['creature'] } : {}),
        additive: true,
        span,
        rule: id,
      },
      ...(power === null || toughness === null
        ? {}
        : { basePt: { kind: 'basePt', power, toughness, span, rule: id } }),
      ...(keywords.length === 0
        ? {}
        : { keywords: { kind: 'keywordList', names: keywords, span, rule: id } }),
    };
    return {
      ok: true,
      value: [makeClause(id, 'becomesInAddition', args, span)],
      pos: span.end,
    };
  },
});

/**
 * `effect.return-exiled-card`: "return the exiled card to its owner's graveyard" and "return the exiled card to the battlefield under its owner's control" (CR 607.2a,
 * 400.3, 110.2a: the linked ability of the permanent returns the card it exiled, which goes to its owner's graveyard or enters under its owner's control). The engine's
 * `moveToZone` of `linkedExile`, read from the last-known information of a permanent that left (CR 603.10a). Not read: "the exiled cards", another zone, "your" control, a
 * card exiled by another permanent.
 */
export const EFFECT_RETURN_EXILED_CARD = defineRule<Clauses>({
  id: 'effect.return-exiled-card',
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 400.3 (General)',
    'CR 110.2a (Permanents)',
    'CR 603.10a (Handling Triggered Abilities)',
  ],
  examples: [
    "return the exiled card to its owner's graveyard",
    "return the exiled card to the battlefield under its owner's control",
  ],
  rejects: [
    "return the exiled cards to their owners' graveyards",
    "return the exiled card to its owner's hand",
    'return the exiled card to the battlefield under your control',
    'return the exiled card to the battlefield',
    "return the exiled card to its owner's graveyard and draw a card",
    "return a card exiled with ~ to its owner's graveyard",
    "return the exiled card to its owner's library",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /return the exiled card to (its owner['’]s graveyard|the battlefield under its owner['’]s control)(?![\p{L}\p{N}])(?!\s+and)/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.return-exiled-card';
    const span = r.value.span;
    const toBattlefield = /battlefield/i.test(r.value.value[1] ?? '');
    const objects: IrNoun = {
      kind: 'noun',
      det: 'linkedExile',
      filter: { raw: 'the exiled card' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: id,
    };
    const to: IrArg = {
      kind: 'zoneSpec',
      zone: toBattlefield ? 'battlefield' : 'graveyard',
      whose: 'owner',
      span,
      rule: id,
    };
    return { ok: true, value: [makeClause(id, 'return', { objects, to }, span)], pos: r.pos };
  },
});

/**
 * `effect.create-copy-spirit`: "create a token that's a copy of that creature, except it's a Spirit in addition to its other types and it has "When ~ leaves the
 * battlefield, return the exiled card to its owner's graveyard."" (Hofri Ghostforge; CR 707.2, 707.9b, 205.1b, 111.4: the token has the copiable values of the creature as it
 * last existed, with the exceptions, which are part of the copiable values; 607.2a: the ability it has returns the card the instruction before it exiled). The engine's
 * `createToken` of a `copyOf` the trigger's subject with `addSubtypes`, the ability and `linkExiled`. Not read: another creature type, another exception, another source
 * than "that creature".
 */
export const EFFECT_CREATE_COPY_SPIRIT = defineRule<Clauses>({
  id: 'effect.create-copy-spirit',
  family: 'effect',
  leading: ['create'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 205.1b (Type Line)',
    'CR 111.4 (Tokens)',
    'CR 607.2a (Linked Abilities)',
  ],
  examples: [
    'create a token that’s a copy of that creature, except it’s a Spirit in addition to its other types and it has "When ~ leaves the battlefield, return the exiled card to its owner’s graveyard."',
  ],
  rejects: [
    'create a token that’s a copy of that creature, except it’s a Spirit in addition to its other types',
    'create a token that’s a copy of that creature, except it’s a Spirit in addition to its other types and it has haste',
    'create a token that’s a copy of target creature, except it’s a Spirit in addition to its other types and it has "When ~ leaves the battlefield, return the exiled card to its owner’s graveyard."',
    'create a token that’s a copy of that creature, except it’s a spirit in addition to its other types and it has "When ~ leaves the battlefield, return the exiled card to its owner’s graveyard."',
    'create two tokens that are copies of that creature, except it’s a Spirit in addition to its other types and it has "When ~ leaves the battlefield, return the exiled card to its owner’s graveyard."',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.create-copy-spirit';
    const head = pattern(
      /create a token that['’]s a copy of that creature, except it['’]s an? ([A-Z][A-Za-z]+) in addition to its other types and it has /u,
    )(ctx, pos);
    if (!head.ok) return head;
    const quoted = readQuotedAbility(ctx, head.pos, { mana: false });
    if (!quoted.ok) return quoted;
    const span = { start: pos, end: quoted.pos };
    const source: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'that creature' },
      upTo: false,
      plural: false,
      other: false,
      span: {
        start: pos + 'create a token that’s a copy of '.length,
        end: pos + 'create a token that’s a copy of that creature'.length,
      },
      rule: id,
    };
    const types: IrArg = {
      kind: 'typeList',
      subtypes: [head.value[1] ?? ''],
      additive: true,
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'createCopyToken', { source, types, quoted: quoted.value }, span)],
      pos: quoted.pos,
    };
  },
});

/**
 * `effect.look-put-total`: "look at the top seven cards of your library. put any number of nonland permanent cards with total mana value 4 or less from among them onto the
 * battlefield. put the rest on the bottom of your library in a random order" (Ao, the Dawn Sky; CR 401.2, 202.3, 701.24: the controller looks, chooses cards whose mana values
 * add up to no more than the limit, and they enter under the controller's control; the rest go to the bottom in a random order). Three sentences that `splitSentences` keeps
 * together. The engine's `lookAtTop` with `take.totalManaValue`. Not read: another kind of card, "up to", the graveyard, a limit on each card, another player's library.
 */
export const EFFECT_LOOK_PUT_TOTAL = defineRule<Clauses>({
  id: 'effect.look-put-total',
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 202.3 (Mana Value)', 'CR 401.4 (Library)'],
  examples: [
    'look at the top seven cards of your library. Put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order',
  ],
  rejects: [
    'look at the top seven cards of your library. Put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield',
    'look at the top seven cards of your library. Put any number of nonland permanent cards with total mana value 4 or less from among them into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top seven cards of your library. Put up to two nonland permanent cards with total mana value 4 or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order',
    'look at the top seven cards of your library. Put any number of creature cards with total mana value 4 or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order',
    'look at the top seven cards of your library. Put any number of nonland permanent cards with mana value 4 or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order',
    'look at the top seven cards of your library. Put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield. Put the rest into your graveyard',
    'look at the top card of your library. Put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.look-put-total';
    const r = pattern(
      /look at the top (\w+|\d+) cards of your library\. put any number of nonland permanent cards with total mana value (\d+) or less from among them onto the battlefield\. put the rest on the bottom of your library in a random order(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const words = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const head = (r.value[1] ?? '').toLowerCase();
    const count = /^\d+$/.test(head) ? Number(head) : words.indexOf(head) + 2;
    if (!Number.isSafeInteger(count) || count < 2) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'lookPutTotal',
          {
            count: { kind: 'number', value: count, span },
            total: { kind: 'number', value: Number(r.value[2]), span },
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.exiled-owner-creates-token`: "the exiled card's owner creates an X/X blue Illusion creature token, where X is the mana value of the exiled card" (Skyclave
 * Apparition; CR 607.2a, 111.2, 111.4, 202.3: the player who owns the card the permanent exiled with its linked ability creates the token and controls it; its power and
 * toughness are the mana value of that card, read as the token is created). The engine's `createToken` of the owner of `linkedExile`, a custom token with `ptAmount`. Not read:
 * another player, another size, another value, a token with abilities, a number of tokens.
 */
export const EFFECT_EXILED_OWNER_CREATES_TOKEN = defineRule<Clauses>({
  id: 'effect.exiled-owner-creates-token',
  family: 'effect',
  leading: ['the'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 111.2 (Tokens)',
    'CR 111.4 (Tokens)',
    'CR 202.3 (Mana Value)',
  ],
  examples: [
    "the exiled card's owner creates an X/X blue Illusion creature token, where X is the mana value of the exiled card",
  ],
  rejects: [
    "the exiled card's owner creates an X/X blue Illusion creature token, where X is the power of the exiled card",
    "the exiled card's owner creates a 2/2 blue Illusion creature token",
    "the exiled card's owner creates an X/X blue Illusion creature token",
    "the exiled card's controller creates an X/X blue Illusion creature token, where X is the mana value of the exiled card",
    "the exiled cards' owner creates an X/X blue Illusion creature token, where X is the mana value of the exiled card",
    "the exiled card's owner creates an X/X blue Illusion creature token with flying, where X is the mana value of the exiled card",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /[Tt]he exiled card['’]s owner creates an X\/X ((?:white|blue|black|red|green)(?: and (?:white|blue|black|red|green))*) ([A-Z][A-Za-z]+) creature token, where X is the mana value of the exiled card(?![\p{L}\p{N}])/u,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.exiled-owner-creates-token';
    const span = r.value.span;
    const token: IrToken = {
      kind: 'token',
      colors: (r.value.value[1] ?? '').split(' and '),
      types: ['creature'],
      subtypes: [r.value.value[2] ?? ''],
      count: { kind: 'number', value: 1, span },
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'createLinkedExileToken', { token }, span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.each-exiles-then-counters`: "each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put that many +1/+1 counters on
 * target attacking creature" (Augusta, Order Returned; CR 701.13, 101.4, 603.12: every player chooses a card of their own graveyard and exiles it; when at least one of the
 * cards exiled is not a land, a reflexive ability puts that many counters on a target chosen as it goes on the stack). Two sentences that `splitSentences` keeps together. The
 * engine's `exileOwnGraveyardCard` of each player and a `reflexive` with `ifThisWay` `exiledNonland`. Not read: another player set, another counter, another number, a
 * reflexive that says another event.
 */
export const EFFECT_EACH_EXILES_THEN_COUNTERS = defineRule<Clauses>({
  id: 'effect.each-exiles-then-counters',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 101.4 (Handling Simultaneous Decisions)',
    'CR 603.12 (Reflexive Triggered Abilities)',
    'CR 122.1b (Counters)',
  ],
  examples: [
    'each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put that many +1/+1 counters on target attacking creature',
  ],
  rejects: [
    'each player exiles a card from their graveyard',
    'each opponent exiles a card from their graveyard. When one or more nonland cards are exiled this way, put that many +1/+1 counters on target attacking creature',
    'each player exiles a card from their graveyard. When one or more cards are exiled this way, put that many +1/+1 counters on target attacking creature',
    'each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put that many -1/-1 counters on target attacking creature',
    'each player exiles a card from their graveyard. When you do, put that many +1/+1 counters on target attacking creature',
    'each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put two +1/+1 counters on target attacking creature',
  ],
  parse: (ctx, pos) => {
    const head = spanned(
      pattern(
        /[Ee]ach player exiles a card from their graveyard\. When one or more nonland cards are exiled this way, put that many \+1\/\+1 counters on /u,
      ),
    )(ctx, pos);
    if (!head.ok) return head;
    const target = family<IrNoun>('noun', { only: ['noun.target-permanent'] })(ctx, head.pos);
    if (!target.ok) return target;
    const id = 'effect.each-exiles-then-counters';
    const span = { start: pos, end: target.pos };
    return {
      ok: true,
      value: [makeClause(id, 'eachExilesThenCounters', { objects: target.value }, span)],
      pos: target.pos,
    };
  },
});

/** Whether the operand names several objects: the verb of "phase out" agrees with it. */
function isPlural(objects: IrNoun | { readonly kind: 'nounList' }): boolean {
  return objects.kind === 'nounList' || objects.plural || objects.anyNumber === true;
}

const KEEP_TYPES = [
  'artifact',
  'creature',
  'enchantment',
  'planeswalker',
  'battle',
  'land',
] as const;

/**
 * `effect.for-each-player-choose-keep`: "for each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a
 * planeswalker. Then each player sacrifices all other nonland permanents they control" (Tragic Arrogance; CR 608.2d, 701.21a, 101.4: the controller of the spell makes
 * every choice, then each player sacrifices what was not chosen, except lands). Two sentences that `splitSentences` keeps together. The engine's `sparePermanents` with the
 * card types in the order the text lists them. Not read: another set of types, a choice by each player, another sacrifice, lands sacrificed too, a different number.
 */
export const EFFECT_FOR_EACH_PLAYER_CHOOSE_KEEP = defineRule<Clauses>({
  id: 'effect.for-each-player-choose-keep',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.21 (Sacrifice)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: [
    'for each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player sacrifices all other nonland permanents they control',
  ],
  rejects: [
    'for each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker',
    'for each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player sacrifices all other permanents they control',
    'for each player, they choose from among the permanents they control an artifact, a creature, an enchantment, and a planeswalker. Then each player sacrifices all other nonland permanents they control',
    'for each player, you choose from among the permanents that player controls an artifact, a creature, an artifact, and a planeswalker. Then each player sacrifices all other nonland permanents they control',
    'for each player, you choose from among the permanents that player controls an elephant, a creature, an enchantment, and a planeswalker. Then each player sacrifices all other nonland permanents they control',
    'for each opponent, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player sacrifices all other nonland permanents they control',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /[Ff]or each player, you choose from among the permanents that player controls ((?:an? [a-z]+, )+and an? [a-z]+)\. Then each player sacrifices all other nonland permanents they control(?![\p{L}\p{N}])/u,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const words = (r.value.value[1] ?? '')
      .split(/, (?:and )?|, and /)
      .map((w) => w.replace(/^and /, '').replace(/^an? /, ''));
    const types = words.filter((w): w is (typeof KEEP_TYPES)[number] =>
      (KEEP_TYPES as readonly string[]).includes(w),
    );
    if (types.length !== words.length || new Set(types).size !== types.length) {
      return fail(ctx, pos);
    }
    const id = 'effect.for-each-player-choose-keep';
    const span = r.value.span;
    const list: IrArg = { kind: 'typeList', subtypes: [], cardTypes: types, span, rule: id };
    return {
      ok: true,
      value: [makeClause(id, 'sparePermanents', { types: list }, span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.opponent-splits-exiled`: "an opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other to the battlefield
 * tapped" (Coin of Fate; CR 608.2d, 400.7, 110.2a: an opponent chooses one of the cards the cost of the ability exiled; that card goes to the bottom of the controller's library
 * and the other returns to the battlefield tapped under the controller's control). Two sentences that `splitSentences` keeps together. The engine's `splitCostExiled`. Not
 * read: another chooser, another place for either card, "the exiled cards" without a choice, an untapped return.
 */
export const EFFECT_OPPONENT_SPLITS_EXILED = defineRule<Clauses>({
  id: 'effect.opponent-splits-exiled',
  family: 'effect',
  leading: ['an'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 400.7 (General)',
    'CR 110.2a (Permanents)',
    'CR 406.1 (Exile)',
  ],
  examples: [
    'An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other to the battlefield tapped',
  ],
  rejects: [
    'An opponent chooses one of the exiled cards',
    'An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other to the battlefield',
    'You choose one of the exiled cards. You put that card on the bottom of your library and return the other to the battlefield tapped',
    'An opponent chooses one of the exiled cards. You put that card into your hand and return the other to the battlefield tapped',
    'An opponent chooses one of the exiled cards. You put that card on the top of your library and return the other to the battlefield tapped',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /[Aa]n opponent chooses one of the exiled cards\. You put that card on the bottom of your library and return the other to the battlefield tapped(?![\p{L}\p{N}])/u,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.opponent-splits-exiled';
    return {
      ok: true,
      value: [makeClause(id, 'splitCostExiled', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.become-copy-of-those-cards`: "you may have ~ become a copy of an artifact or creature card from among those cards until end of turn" (Spirit of Resilience; CR 707.2,
 * 613.2a, 400.7: the permanent becomes a copy of a card the trigger is about, one of those that left the graveyard; the controller chooses which when there are several). The
 * words "you may" are read here so that a clause after "then" can say them. The engine's `becomeCopyOfCard` of `this`. Not read: another kind of card, another duration, another
 * object than the permanent itself, a card that is not one of "those cards".
 */
export const EFFECT_BECOME_COPY_OF_THOSE_CARDS = defineRule<Clauses>({
  id: 'effect.become-copy-of-those-cards',
  family: 'effect',
  leading: ['you', 'have'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 613.2a (Interaction of Continuous Effects)',
    'CR 400.7 (General)',
  ],
  examples: [
    'you may have ~ become a copy of an artifact or creature card from among those cards until end of turn',
    'have ~ become a copy of an artifact or creature card from among those cards until end of turn',
  ],
  rejects: [
    'you may have ~ become a copy of an artifact or creature card from among those cards',
    'you may have ~ become a copy of a creature card from among those cards until end of turn',
    'you may have ~ become a copy of an artifact or creature card from your graveyard until end of turn',
    'you may have target creature become a copy of an artifact or creature card from among those cards until end of turn',
    'you may have ~ become a copy of an artifact or creature card from among those cards',
    'you may have ~ become a copy of an artifact or creature card from among those cards until your next turn',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /(you may )?have ~ become a copy of an artifact or creature card from among those cards until end of turn(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.become-copy-of-those-cards';
    const span = r.value.span;
    const may: IrFlag = { kind: 'flag', value: r.value.value[1] !== undefined, span, rule: id };
    return { ok: true, value: [makeClause(id, 'becomeCopyOfCards', { may }, span)], pos: r.pos };
  },
});

/**
 * `effect.phase-out`: "any number of other target creatures you control phase out", "target creature phases out" (Guardian of Faith; CR 702.26: the permanents phase out, with
 * what is attached to them, and phase in as their controller's next untap step begins). The engine's `phaseOut`. Not read: "phase in", an effect of a spell on permanents that
 * are not targets ("each creature you control phases out"), the keyword Phasing, another verb.
 */
export const EFFECT_PHASE_OUT = defineRule<Clauses>({
  id: 'effect.phase-out',
  family: 'effect',
  leading: ['any', 'target'],
  cites: ['CR 702.26 (Phasing)', 'CR 702.26a (Phasing)', 'CR 702.26g (Phasing)'],
  examples: [
    'any number of other target creatures you control phase out',
    'target creature phases out',
    'target creature you control phases out',
    'any number of target creatures phase out',
  ],
  rejects: [
    'any number of other target creatures you control phase in',
    'each creature you control phases out',
    'target creature phases',
    'target creature phase out',
    'any number of other target creatures you control phase out and draw a card',
    'phase out',
  ],
  parse: single(
    'effect.phase-out',
    satisfy(
      sequence(
        operands(['noun.any-number-targets', 'noun.target-permanent'], 'effect.phase-out'),
        pattern(/ phases? out(?![\p{L}\p{N}])/iu),
      ),
      // The verb agrees with its subject: "phase out" of several, "phases out" of one.
      ([objects, said]) => (said[0] ?? '').toLowerCase().includes('phases') === !isPlural(objects),
    ),
    ([objects]) => ({ verb: 'phaseOut', args: { objects } }),
  ),
});

/**
 * `effect.exile-random-and-play`: "exile a card from your graveyard at random. You may play the exiled card this turn" (Advanced Reconstruction; CR 701.13, 601.2, 305.1,
 * 611.2a: a card chosen by chance from the controller's graveyard is exiled, and until end of turn the controller may play it, cast it or play it as a land, from exile). Two
 * sentences that `splitSentences` keeps together. The engine's `exileRandomFromGraveyard` and `mayPlay` of `moved`. Not read: another number of cards, another graveyard,
 * another duration, "may cast", a card chosen by the player.
 */
export const EFFECT_EXILE_RANDOM_AND_PLAY = defineRule<Clauses>({
  id: 'effect.exile-random-and-play',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: ['exile a card from your graveyard at random. You may play the exiled card this turn'],
  rejects: [
    'exile a card from your graveyard at random',
    'exile a card from your graveyard. You may play the exiled card this turn',
    'exile two cards from your graveyard at random. You may play the exiled cards this turn',
    'exile a card from an opponent’s graveyard at random. You may play the exiled card this turn',
    'exile a card from your graveyard at random. You may play the exiled card until end of turn',
    'exile a card from your graveyard at random. You may cast the exiled card this turn',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /exile a card from your graveyard at random\. You may play the exiled card this turn(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.exile-random-and-play';
    return {
      ok: true,
      value: [makeClause(id, 'exileRandomAndPlay', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.gain-class-level`: "Level 2" (CR 716.2a, 716.2c: the effect of a class level bar, "[Cost]: Level 2": "this Class's level becomes 2"). The engine's `gainLevel`; the
 * activated ability it is the effect of is at sorcery timing and only at the level before (the face grouping does that, `parse-face.ts`). Not read: level 1, a word for the
 * number, anything after the number.
 */
export const EFFECT_GAIN_CLASS_LEVEL = defineRule<Clauses>({
  id: 'effect.gain-class-level',
  family: 'effect',
  leading: ['level'],
  cites: ['CR 716.2 (Class Cards)', 'CR 716.2a (Class Cards)', 'CR 716.2c (Class Cards)'],
  examples: ['Level 2', 'Level 3', 'level 2'],
  rejects: ['Level 1', 'Level', 'Level two', 'Level 2 and draw a card', 'Level 0', 'Level 2.5'],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/level ([2-9]|[1-9]\d+)(?![\p{L}\p{N}]|\.\d)/iu))(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.gain-class-level';
    const level: IrAmount = { kind: 'number', value: Number(r.value.value[1]), span: r.value.span };
    return {
      ok: true,
      value: [makeClause(id, 'gainLevel', { level }, r.value.span)],
      pos: r.pos,
    };
  },
});

export const HOFRI_EFFECT_RULES = [
  EFFECT_GAIN_CLASS_LEVEL,
  EFFECT_EXILE_RANDOM_AND_PLAY,
  EFFECT_PHASE_OUT,
  EFFECT_BECOME_COPY_OF_THOSE_CARDS,
  EFFECT_OPPONENT_SPLITS_EXILED,
  EFFECT_FOR_EACH_PLAYER_CHOOSE_KEEP,
  EFFECT_EACH_EXILES_THEN_COUNTERS,
  EFFECT_EXILED_OWNER_CREATES_TOKEN,
  EFFECT_LOOK_PUT_TOTAL,
  EFFECT_CREATE_COPY_SPIRIT,
  EFFECT_RETURN_EXILED_CARD,
  EFFECT_PLAYER_ADDS_MANA,
  EFFECT_COPY_THIS_SPELL,
  EFFECT_BECOMES_IN_ADDITION,
];
