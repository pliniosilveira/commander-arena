// The three meta tests over the phrase-rule registry (D-065, proposal 3.9), and the checks that
// keep the registry honest: ids are unique and carry their family, every example is read by its own
// rule alone (so rule order never carries meaning), every `rejects` line is refused, and every
// rule is reached by the full pipeline.
import { describe, expect, test } from 'vitest';
import {
  ALL_RULES,
  buildRuleSet,
  compileLine,
  type PhraseRule,
  runDetailed,
  segment,
} from '../src/convert/parser/index';

const RULES: readonly PhraseRule<unknown>[] = ALL_RULES;
const SET = buildRuleSet(RULES);

/** Whether `rule` reads the whole of `text` (the rules of other families are available to it). */
function reads(rule: PhraseRule<unknown>, text: string) {
  return runDetailed(rule.parse, text, 0, text.length, SET);
}

describe('registration', () => {
  test('ids are unique, start with their family, and every rule documents itself', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of RULES) {
      expect(rule.id.startsWith(`${rule.family}.`), rule.id).toBe(true);
      expect(rule.examples.length, `${rule.id} has examples`).toBeGreaterThan(0);
      expect((rule.rejects ?? []).length, `${rule.id} has rejects`).toBeGreaterThan(0);
      expect(rule.cites.length, `${rule.id} cites the CR`).toBeGreaterThan(0);
      for (const cite of rule.cites) expect(cite, rule.id).toMatch(/^CR \d/);
    }
  });

  test('a rule can start where its `leading` words say (dispatch never hides an example)', () => {
    for (const rule of RULES) {
      for (const example of rule.examples) {
        const tried = SET.candidates(rule.family, example, 0).map((r) => r.id);
        expect(tried, `${rule.id} on "${example}"`).toContain(rule.id);
      }
    }
  });
});

describe('meta test 1: each example is read completely by exactly one rule of its family', () => {
  test.each(RULES.map((r) => [r.id, r] as const))('%s', (_id, rule) => {
    for (const example of rule.examples) {
      const readers = RULES.filter((q) => q.family === rule.family && reads(q, example).ok).map(
        (q) => q.id,
      );
      expect(readers, `"${example}"`).toEqual([rule.id]);
    }
  });

  test('the node a rule builds carries the rule id', () => {
    for (const rule of RULES) {
      for (const example of rule.examples) {
        const run = reads(rule, example);
        if (!run.ok) throw new Error(`${rule.id} does not read "${example}"`);
        const value = run.value as unknown;
        const nodes = Array.isArray(value) ? value : [value];
        for (const node of nodes) {
          const rule_ = (node as { rule?: string }).rule;
          // Amounts are spans without a rule id: their id is on the match list instead.
          if (rule_ !== undefined) expect(rule_, `${rule.id} on "${example}"`).toBe(rule.id);
          else expect(run.recognised, `${rule.id} on "${example}"`).toContain(rule.id);
        }
      }
    }
  });
});

describe('meta test 2: every rejects line fails its own rule', () => {
  test.each(RULES.map((r) => [r.id, r] as const))('%s', (_id, rule) => {
    for (const text of rule.rejects ?? []) {
      expect(reads(rule, text).ok, `"${text}"`).toBe(false);
    }
  });
});

/**
 * Meta test 3: every rule is reached by the full pipeline (segment, read, bind, lower), through a
 * line that contains one of its examples. A new rule must say how to embed its examples: the test
 * fails on a rule it has no embedding for.
 */
type Embed = { readonly face: 'spell' | 'permanent'; readonly line: (example: string) => string };

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const spell = (line: (example: string) => string): Embed => ({ face: 'spell', line });
const asIs: Embed = { face: 'permanent', line: (example) => example };

const permanent = (line: (example: string) => string): Embed => ({ face: 'permanent', line });
/** A trigger example is the condition only: it is embedded after "Whenever" and before a body. */
const whenever = permanent((e) => `Whenever ${e}, you gain 1 life.`);
const asChapter = permanent((e) => `${e} — You gain 1 life.`);
const atStep = permanent((e) => `At ${e}, you gain 1 life.`);

const EMBED: Readonly<Record<string, Embed>> = {
  'replacement.life-gain-double': asIs,
  'keyword.line': asIs,
  'replacement.enters-tapped': asIs,
  'replacement.enters-with-counters': asIs,
  // Issue 245 (Vivid Grove).
  'replacement.enters-tapped-with-counters': asIs,
  'replacement.enters-tapped-unless': asIs,
  // Issue 144 (Den of the Bugbear).
  'replacement.enters-tapped-if': asIs,
  'replacement.enters-tapped-unless-pays': asIs,
  'replacement.enters-tapped-unless-reveals': asIs,
  'replacement.enters-tapped-unless-reveals-or': asIs,
  'replacement.enters-prepared': asIs,
  // Danitha deck, group 4 (D-417): the keyword line of an Aura.
  'replacement.umbra-armor': asIs,
  // Gisa deck, group 5 (D-482).
  'replacement.escapes-with-counters': asIs,
  'static.no-maximum-hand-size': asIs,
  // Stage P24: the play rules are lines of their own.
  'static.additional-land': asIs,
  'static.look-at-top': asIs,
  'static.reveal-top': asIs,
  'static.play-lands-from-top': asIs,
  'static.play-lands-from-graveyard': asIs,
  // Issue 345: the play-from-the-top lines are lines of their own.
  'static.look-and-play-lands-from-top': asIs,
  'static.activate-as-though-haste': asIs,
  'static.attack-tax': asIs,
  'static.attack-tax-counters': asIs,
  'static.optional-untap': asIs,
  'keyword.enchant': asIs,
  'keyword.enchant-player': asIs,
  'keyword.equip': asIs,
  'keyword.kicker': asIs,
  'keyword.kicker-and-or': asIs,
  'keyword.multikicker': asIs,
  'keyword.flashback': asIs,
  // Stage P22: the named alternative costs are lines of their own.
  'keyword.overload': asIs,
  'keyword.evoke': asIs,
  'keyword.dash': asIs,
  'keyword.bestow': asIs,
  // Stage P23: Spectacle, Unearth and Escape are lines of their own.
  'keyword.spectacle': asIs,
  'keyword.unearth': asIs,
  // Stage P40: Encore is a line of its own, like Unearth.
  'keyword.encore': asIs,
  // Hashaton deck group 5 (D-384): Eternalize is a line of its own, like Encore.
  'keyword.eternalize': asIs,
  // Issue 104: Embalm is a line of its own, like Eternalize.
  'keyword.embalm': asIs,
  'keyword.escape': asIs,
  'keyword.impending': asIs,
  'static.eminence-cost-reduction': asIs,
  'static.each-spell-cost-reduction': asIs,
  // Stage P25: Echo and Cumulative upkeep are lines of their own.
  'keyword.echo': asIs,
  'keyword.cumulative-upkeep': asIs,
  // Stage P26: Suspend, Madness and Foretell are lines of their own.
  'keyword.suspend': asIs,
  'keyword.madness': asIs,
  'keyword.miracle': asIs,
  'keyword.harmonize': asIs,
  'keyword.foretell': asIs,
  // Morph (CR 702.37) is a line of its own.
  'keyword.morph': asIs,
  // Stage P27: Storm and Replicate are lines of their own.
  'keyword.storm': asIs,
  'keyword.gravestorm': asIs,
  'effect.delayed-combat-prepare': permanent(
    (e) => `Whenever you attack, target creature gains deathtouch until end of turn. ${cap(e)}.`,
  ),
  'trigger.dies-own-graveyard': whenever,
  // D-654: "an enchanted creature dies".
  'trigger.enchanted-creature-dies': whenever,
  'keyword.replicate': asIs,
  'keyword.ward': asIs,
  'keyword.crew': asIs,
  'keyword.station': asIs,
  'token.copy': spell((e) => `Create ${e}.`),
  'token.copy-that-creature': permanent((e) => `Whenever another creature enters, create ${e}.`),
  // Hashaton deck group 5 (D-382): a copy with exceptions of characteristics.
  'token.copy-except': permanent((e) => `Whenever you discard a creature card, create ${e}.`),
  // Issue 103 (Will of the Temur): the same copy with exceptions that are in addition to what it copies.
  'token.copy-except-additive': permanent(
    (e) => `Whenever you discard a creature card, create ${e}.`,
  ),
  'replacement.enters-with-counters-kicked': asIs,
  'replacement.as-enters-choose': asIs,
  'replacement.as-enters-pay-life': asIs,
  'static.self-chosen-type': asIs,
  'static.attached': asIs,
  'static.permanents': asIs,
  'static.self': asIs,
  // Stage P13: what a spell costs. The statements are lines of their own.
  'static.self-cost-reduction': asIs,
  'static.spells-cost-reduction': asIs,
  'static.first-x-spell-cost-reduction': asIs,
  'static.spells-have-affinity': asIs,
  'noun.each-creature-enchanted-by-you': permanent(
    (e) => `${cap(e)} can't attack you or planeswalkers you control.`,
  ),
  'static.additional-cost': asIs,
  'static.free-cast': asIs,
  // Stage P20: power and toughness from a count; the statements are lines of their own.
  'static.pt-count': asIs,
  'static.defines-pt': asIs,
  'static.self-and-enchanted-pt-count': asIs,
  'cost.discard': permanent((e) => `${e}: Draw a card.`),
  'cost.discard-hand': permanent((e) => `${e}: Draw a card.`),
  'cost.mill': permanent((e) => `{T}, ${e}: Add {C}.`),
  // Stage P51 (D-209): the energy cost is the payment of an "unless you pay" of a spell.
  'cost.energy': spell((e) => `Draw a card. Then discard a card at random unless you pay ${e}.`),
  'condition.control-commander': permanent(
    (e) => `If ${e}, you may cast ~ without paying its mana cost.`,
  ),
  'amount.for-each': spell((e) => `Draw a card ${e}.`),
  // Galadriel deck, group 2 (D-539): two counts added.
  'amount.for-each-and-each': permanent((e) => `~ gets +1/+1 ${e}.`),
  'amount.for-each-died': permanent(
    (e) => `Nontoken creatures you control enter with an additional +1/+1 counter on them ${e}.`,
  ),
  'amount.number-of': spell((e) => `You gain life ${e}.`),
  'cost.tap': { face: 'permanent', line: (e) => `${e}: Add {G}.` },
  'cost.mana': permanent((e) => `${e}, {T}: Add {G}.`),
  // Stage P14: a hybrid symbol is a cost of a mana ability, and "Activate only if" ends one.
  'cost.mana-hybrid': permanent((e) => `${e}, {T}: Add {G}.`),
  'restriction.if': permanent((e) => `{T}: Add {G}. ${cap(e)}`),
  'cost.sacrifice': permanent((e) => `${e}: Draw a card.`),
  'cost.pay-life': permanent((e) => `${e}: Draw a card.`),
  // Stage P16: X in the cost of an activated ability, read with an X in its effect.
  'cost.mana-x': permanent((e) => `${e}, {T}: Draw X cards.`),
  'cost.pay-x-life': permanent((e) => `${e}: Draw X cards.`),
  // Group 10 of the Hashaton deck (D-386): "discard X cards" is an additional cost of a spell, and "X target creature cards" the targets that read the X it announces.
  'cost.discard-x': permanent((e) => `${e}: Draw X cards.`),
  'noun.x-target-graveyard-cards': spell((e) => `Return ${e} to your hand.`),
  // Issue 104: the number of targets of a triggered ability, set by the X its sentence defines.
  'noun.up-to-x-target-graveyard-cards': permanent(
    (e) =>
      `When ~ enters, return ${e} to the battlefield, where X is the number of opponents you have.`,
  ),
  'cost.remove-counters': permanent((e) => `${e}: Draw a card.`),
  // Issue 144 (Arena of Glory).
  'cost.exert': permanent((e) => `{R}, ${e}: Draw a card.`),
  'restriction.sorcery': permanent((e) => `{1}: Draw a card. ${cap(e)}`),
  // Feather deck, group 2 (D-444): the two restrictions in the order of Hall of Oracles.
  'restriction.sorcery-and-if': permanent((e) => `{1}: Draw a card. ${cap(e)}`),
  // Issue 345: the sorcery timing and the count of one sentence.
  'restriction.sorcery-once-each-turn': permanent((e) => `{1}: Draw a card. ${cap(e)}`),
  // Gisa deck, group 4 (D-459 to D-462): the restriction of the turn and the cost of the reveal of Tetzimoc, the reduction of Embalmer's Tools, and the sentences of Whip of
  // Erebos and Ghost Vacuum that need the instruction before them (a return from the graveyard, the exile that links).
  'restriction.during-your-turn': permanent((e) => `{1}: Draw a card. ${e}`),
  'restriction.during-your-turn-and-if': permanent((e) => `{1}: Draw a card. ${e}`),
  'restriction.opponents-only': permanent((e) => `{1}: Draw a card. ${e}`),
  'cost.reveal-this': permanent((e) => `{B}, ${e}: Draw a card.`),
  'static.creature-ability-cost-reduction-power': asIs,
  'static.graveyard-ability-cost-reduction': asIs,
  // Food and Fellowship deck, group B: the reduction of the abilities of a group of permanents (Sam).
  'static.permanent-ability-cost-reduction': asIs,
  // Prismari deck, group 1 (D-638, D-641, D-644): strive is the line of a sorcery, "X tokens that are copies of ..." follows "create", and the triggers are read after "Whenever".
  'static.cost-per-extra-target': spell((e) => e),
  'static.spells-cost-increase-targeting-self': asIs,
  'token.copies-x': permanent(
    (e) =>
      `At the beginning of combat on your turn, create ${e}, where X is the number of creatures you control.`,
  ),
  'trigger.cast-from-hand': whenever,
  'trigger.cast-from-graveyard': whenever,
  'trigger.token-combat-damage-batch': whenever,
  'trigger.enters-and-token-damage': permanent((e) => `When ${e}, you gain 1 life.`),
  'effect.exile-instead-when-leaving': permanent(
    (e) => `{T}: Return target creature card from your graveyard to the battlefield. ${cap(e)}.`,
  ),
  'effect.put-exiled-with-battlefield': permanent((e) => `{6}, {T}, Sacrifice ~: ${cap(e)}.`),
  'effect.put-target-exiled-with-battlefield': permanent((e) => `{6}, {T}: ${cap(e)}.`),
  // Sauron, the Necromancer: the delayed sentence that exiles the token it made.
  'effect.exile-made-token-unless-ring-bearer': spell(
    (e) =>
      `Create a 1/1 white Soldier creature token. At the beginning of the next end step, ${e}.`,
  ),
  // Saw in Half.
  'condition.dies-this-way': spell(
    (e) => `Destroy target creature. If ${e}, its controller gains 1 life.`,
  ),
  'token.copies-half-pt': spell(
    (e) => `Destroy target creature. If that creature dies this way, its controller creates ${e}.`,
  ),
  'effect.choose-player-most-life': permanent(
    (e) => `{1}{B}, {T}: ${cap(e)}. Target creature can't be blocked this turn.`,
  ),
  'effect.cant-be-blocked-by-that-players-creatures': permanent(
    (e) => `{1}{B}, {T}: Choose a player with the most life or tied for most life. ${cap(e)}.`,
  ),
  'duration.until-end-of-turn': permanent((e) => `{1}: ~ gets +1/+1 ${e}.`),
  'keyword.cycling': asIs,
  // Stage P17: typecycling is a keyword line, the count of kicks follows a quantity of one.
  'keyword.typecycling': asIs,
  'noun.plain-permanents': spell((e) => `${cap(e)} get +1/+1 until end of turn.`),
  // A pronoun needs an antecedent: a target before it.
  'noun.it': spell((e) => `Put a +1/+1 counter on target creature. Put a +1/+1 counter on ${e}.`),
  'noun.attached-permanent': permanent((e) => `${cap(e)} gets +1/+1.`),
  'noun.other-permanents': permanent((e) => `${cap(e)} get +1/+1.`),
  'noun.other-subtype-permanents': permanent((e) => `${cap(e)} get +1/+1.`),
  'noun.bare-permanent': permanent((e) => `Enchant ${e}`),
  'noun.bare-land-type': permanent((e) => `Enchant ${e}`),
  // "Its controller": the pronoun needs a target before it (CR 109.4).
  'noun.its-controller': spell((e) => `Destroy target creature. ${cap(e)} gains 4 life.`),
  // Issue 279 (Curse of the Swine).
  'noun.each-exiled-controller': spell(
    (e) => `Exile X target creatures. ${cap(e)} creates a 2/2 green Boar creature token.`,
  ),
  'noun.library-card': spell(
    (e) =>
      `Search your library for ${e}, put ${e.startsWith('up to') ? 'them' : 'it'} into your hand, then shuffle.`,
  ),
  'noun.library-cards-counted': spell(
    (e) => `Search your library for ${e}, put them into your hand, then shuffle.`,
  ),
  'noun.library-card-mana-value-x': spell(
    (e) => `Search your library for ${e} and put it onto the battlefield.`,
  ),
  'trigger.enters': whenever,
  'trigger.dies': whenever,
  'trigger.attacks': whenever,
  'trigger.becomes-tapped': whenever,
  // Stage P21: blocks and becomes blocked.
  'trigger.attacks-alone': whenever,
  'trigger.blocks': whenever,
  'trigger.becomes-blocked': whenever,
  'trigger.or': whenever,
  'trigger.landfall': whenever,
  'trigger.sacrifice': whenever,
  'trigger.or-subjects': whenever,
  'trigger.enters-from-graveyard': whenever,
  'trigger.cast': whenever,
  'trigger.becomes-target': whenever,
  'trigger.upkeep': atStep,
  'trigger.end-step': atStep,
  // Stage P18: the other steps, a card drawn, combat damage dealt, leaving the battlefield.
  'trigger.step': atStep,
  'trigger.drawn': whenever,
  'trigger.combat-damage': whenever,
  'trigger.leaves': whenever,
  // "Unless a player pays" ends the one instruction of a triggered ability's body.
  'condition.unless-pays': permanent(
    (e) => `Whenever an opponent casts a spell, you may draw a card ${e}.`,
  ),
  // A Saga's chapter symbol (CR 714.2): the numerals, an em dash and the effect.
  'trigger.chapter': asChapter,
  'condition.control-at-least': permanent((e) => `~ enters tapped unless ${e}.`),
  'condition.control-at-most': permanent((e) => `~ enters tapped unless ${e}.`),
  'condition.control-a': permanent((e) => `~ enters tapped unless ${e}.`),
  'condition.control-land-type': permanent((e) => `~ enters tapped unless ${e}.`),
  'condition.opponents-at-least': permanent((e) => `~ enters tapped unless ${e}.`),
  // An intervening "if" (CR 603.4): the condition follows the trigger, after "if".
  'condition.control-none': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  'condition.kicked': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  // Stage P23: "unless it escaped" ends the sacrifice of a permanent in its own enters trigger.
  'condition.unless-escaped': permanent((e) => `When ~ enters, sacrifice it ${e}.`),
  // Stage P21: "If you do," follows an offer to pay in a triggered ability's body.
  'condition.if-you-do': permanent(
    (e) => `Whenever an opponent casts a spell, you may pay {1}. If ${e}, draw a card.`,
  ),
  'token.predefined': spell((e) => `Create ${e}.`),
  'token.custom': spell((e) => `Create ${e}.`),
  'token.number-of': permanent((e) => `When ~ dies, create ${e}.`),
  'noun.self': spell((e) => `Put a +1/+1 counter on ${e}.`),
  'noun.a-permanent': spell((e) => `Sacrifice ${e}.`),
  // Issue 144 (Fountainport).
  'noun.a-token': permanent((e) => `Sacrifice ${e}: Draw a card.`),
  'noun.up-to-one-permanent': spell((e) => `Put two +1/+1 counters on ${e}.`),
  'noun.up-to-graveyard-cards': spell((e) => `Return ${e} to your hand.`),
  'noun.any-target': spell((e) => `~ deals 1 damage to ${e}.`),
  'noun.player': spell((e) => `~ deals 1 damage to ${e}.`),
  'noun.target-spell': spell((e) => `Counter ${e}.`),
  'noun.target-graveyard-card': spell((e) => `Exile ${e}.`),
  // Group 8 of the Hashaton deck (D-362): the same cards said with "in", the chosen cards, the discard condition and the rider of the cast permission.
  'noun.target-cards-in-your-graveyard': spell((e) => `Choose ${e}.`),
  'noun.the-chosen-cards': spell(
    (e) =>
      `Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return ${e} to the battlefield.`,
  ),
  'condition.discarded-spell-this-way': permanent(
    (e) => `{T}: Draw a card, then discard a card. If ${e}, you gain 1 life.`,
  ),
  'effect.may-cast': spell((e) => `${cap(e).replace('. if that', '. If that')}.`),
  'effect.may-cast-spells': spell((e) => `${cap(e)}.`),
  'effect.may-cast-any-graveyard': spell((e) => `${cap(e).replace('. when', '. When')}.`),
  'noun.target-card-in-a-graveyard': spell((e) => `You may cast ${e} this turn.`),
  'noun.player-graveyard': spell((e) => `Exile ${e}.`),
  // Federation Fleet deck, group F (Stonespeaker Crystal).
  'noun.any-number-target-players-graveyards': spell((e) => `Exile ${e}.`),
  'noun.all-graveyard-cards': spell((e) => `Exile ${e}.`),
  'noun.all-graveyards': spell((e) => `Exile ${e}.`),
  'noun.target-creature-attacking-you': permanent((e) => `{W}, Sacrifice ~: Exile ${e}.`),
  'noun.target-permanent': spell((e) => `Destroy ${e}.`),
  'noun.all-permanents': spell((e) => `Destroy ${e}.`),
  'noun.all-tokens': spell((e) => `Destroy ${e}.`),
  'noun.each-permanent': spell((e) => `Destroy ${e}.`),
  'amount.number': spell((e) => `Draw ${e} cards.`),
  'amount.x': spell((e) => `Draw ${e} cards.`),
  // Quandrix Unlimited deck, group D2: the rounding of "half X" is written next to the X.
  'amount.half-x': spell((e) => `You gain ${e} life.`),
  'amount.article': spell((e) => `Draw ${e} card.`),
  'amount.power-of': spell((e) => `Exile target creature. You gain life ${e}.`),
  'amount.that-spells-mana-value': permanent(
    (e) =>
      `Whenever you cast a spell, return up to one target nonland permanent an opponent controls with mana value less than or equal to ${e} to its owner's hand.`,
  ),
  'amount.mana-value-of': spell((e) => `Exile target creature. You lose life ${e}.`),
  'amount.times-kicked': spell((e) => `Draw a card ${e}.`),
  // Feather deck group 1 (D-450): the count of a pump, or of a draw, after "for each".
  // Meren of Clan Nel Toth: experience counters.
  'amount.experience-counters': permanent(
    (e) =>
      `At the beginning of your end step, choose target creature card in your graveyard. If that card's mana value is less than or equal to ${e}, return it to the battlefield.`,
  ),
  'amount.for-each-card-drawn': spell((e) => `Draw a card ${e}.`),
  'amount.for-each-spell-cast': spell((e) => `Draw a card ${e}.`),
  'amount.for-each-opponent-dealt-damage': permanent(
    (e) =>
      `Whenever one or more Pirates you control deal damage to your opponents, you create a Treasure token ${e}.`,
  ),
  'amount.for-each-spell-color': permanent(
    (e) => `Whenever you cast a spell, you gain 1 life ${e}.`,
  ),
  // Lock and Load (issue 121): the count of the other instants and sorceries cast this turn.
  'amount.for-each-other-spell-cast': spell((e) => `Draw a card ${e}.`),
  // Stage P28 (D-131): the amounts that read the game, the conditions about the state of the game and the player nouns.
  'amount.equal-to': spell((e) => `Exile target creature. You gain life ${e}.`),
  'amount.where-x': spell((e) => `Exile target creature. Draw X cards, ${e}.`),
  'amount.for-each-counter': spell((e) => `Draw a card ${e}.`),
  'amount.for-each-opponent': spell((e) => `Draw a card ${e}.`),
  'amount.for-each-this-way': spell((e) => `Draw a card ${e}.`),
  'condition.designation': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  'condition.amount-count': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  'condition.total-stat': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  'condition.opponent-has-more': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  'noun.you-and-player': spell((e) => `${cap(e)} draw a card.`),
  'noun.each-other-player': spell((e) => `${cap(e)} draws a card.`),
  'noun.defending-player': spell((e) => `${cap(e)} draws a card.`),
  // Federation Fleet deck, group B: "each player other than its controller" after a target ("Exile target nonland permanent. ...").
  'noun.each-player-other-than-its-controller': spell(
    (e) => `Exile target nonland permanent. ${cap(e)} creates a Treasure token.`,
  ),
  'noun.player-to-your-right': spell((e) => `${cap(e)} draws a card.`),
  // Stage P21: the life lost by the instruction before it.
  'amount.life-lost-this-way': spell((e) => `Each opponent loses 1 life. You gain life ${e}.`),
  // Stage P19: the header line of a modal spell, followed by two bullets.
  // Stage P29 (D-133): the subjects of triggers and statics, "that player", "that much", the costs that tap permanents, the
  // conditions of a static ability, the death replacement and the permission to cast from the graveyard.
  'trigger.attacks-you': whenever,
  'trigger.dealt-damage': whenever,
  'noun.that-player': permanent((e) => `Whenever an opponent draws a card, ${e} loses 1 life.`),
  'noun.that-attacking-player': permanent(
    (e) => `Whenever a player attacks one of your opponents, ${e} draws a card.`,
  ),
  'amount.that-much': permanent((e) => `Whenever ~ is dealt damage, you gain ${e} life.`),
  'noun.subtype-union': permanent((e) => `${cap(e)} get +1/+1.`),
  'cost.tap-permanents': permanent((e) => `${e}: Draw a card.`),
  'cost.untap-permanents': permanent((e) => `{T}, ${e}: Draw a card.`),
  'condition.control-your-commander': permanent((e) => `As long as ${e}, ~ gets +1/+1.`),
  'condition.life-total': permanent((e) => `As long as ${e}, ~ gets +1/+1.`),
  'condition.this-tapped': permanent((e) => `As long as ${e}, ~ gets +1/+1.`),
  // CR 602.5b: "Activate only if ~ has a +1/+1 counter on it." is read after "if", like every condition.
  'condition.this-has-counter': permanent((e) => `{2}, {T}: Draw a card. Activate only if ${e}.`),
  // Quandrix Unlimited deck, group F (Mana Bloom): the counters of ~ all gone, in the intervening "if" of an upkeep trigger.
  'condition.this-has-no-counters': permanent(
    (e) => `At the beginning of your upkeep, if ${e}, return ~ to its owner's hand.`,
  ),
  // Primordial Hydra: the count of one kind of counter on ~, after "as long as".
  'condition.this-has-counter-count': permanent((e) => `~ has trample as long as ${e}.`),
  // CR 603.4: "Whenever you cast an instant or sorcery spell, if ~ has fewer than three charge counters on it, ..." is read after "if", like every condition.
  'condition.this-counter-count': permanent(
    (e) => `Whenever you cast a spell, if ${e}, draw a card.`,
  ),
  // Prize Pig: the counters of one kind on ~, in the "Then if" sentence after the counters an instruction put on.
  'condition.there-are-counters-on-self': permanent(
    (e) => `Whenever you gain life, put that many +1/+1 counters on ~. Then if ${e}, draw a card.`,
  ),
  'condition.this-is-token': permanent((e) => `When ~ enters, if ${e}, draw a card.`),
  'static.each': asIs,
  'static.conditional-prefix': asIs,
  'static.conditional-suffix': asIs,
  'static.cast-from-graveyard': asIs,
  'replacement.would-die': asIs,
  'replacement.exile-instead-of-opponent-graveyard': asIs,
  // Stage P30 (D-135, D-136): the recursion slice. "Gift a card" is a line of its own; the conditions begin a sentence or follow the
  // trigger; "enters untapped" and "dies or is put into exile" are triggers; the reduction of a cost ends an activated ability.
  'keyword.gift': asIs,
  'condition.it-matches': spell(
    (e) => `Return target creature card from your graveyard to your hand. If ${e}, draw a card.`,
  ),
  'condition.gift-promised': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  // Issue 100 (Transcendent Dragon): the intervening "if" of an enters trigger of the permanent itself.
  'condition.was-cast': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  'condition.opponent-controls-at-least': permanent(
    (e) =>
      `{4}{B}{B}: Return this card from your graveyard to the battlefield. This ability costs {4} less to activate if ${e}.`,
  ),
  'restriction.cost-reduction': permanent(
    (e) => `{4}{B}{B}: Return this card from your graveyard to the battlefield. ${e}`,
  ),
  'trigger.enters-state': whenever,
  'trigger.leaves-to': whenever,
  'noun.any-number-permanents': spell((e) => `Sacrifice ${e}.`),
  'noun.a-greatest-permanent': spell((e) => `Target opponent sacrifices ${e}.`),
  'amount.that-many': spell(
    (e) => `Sacrifice any number of other permanents, then draw ${e} cards.`,
  ),
  'cost.pay-life-amount': permanent((e) => `${e}: Draw a card.`),
  'modal.choose': spell((e) => `${e}\n• Draw a card.\n• You gain 1 life.`),
  'modal.choose-commander': spell((e) => `${e}\n• Draw a card.\n• You gain 1 life.`),
  // Stage P31 (D-139, D-140): the Artifacts slice. Living weapon is a line of its own; the costs come after {T} or a mana symbol; the
  // triggers, the condition after a trigger, the restrictions after an effect, the nouns in the instruction that reads them.
  'keyword.living-weapon': asIs,
  // Stage P47: "~ can be your commander." is a line of its own.
  'keyword.can-be-commander': asIs,
  // Issue 144 (CR 702.179a): "Start your engines!" is a line of its own.
  'keyword.start-your-engines': asIs,
  'cost.loyalty': permanent((e) => `${e}: Draw a card.`),
  'cost.put-counters': permanent((e) => `{T}, ${e}: Draw a card.`),
  'cost.return-to-hand': permanent((e) => `{U}, ${e}: Draw a card.`),
  'trigger.combat-damage-batch': whenever,
  'trigger.damage-batch': whenever,
  'trigger.tapped-for-mana': whenever,
  'trigger.taps-for-mana': whenever,
  'trigger.state': whenever,
  'trigger.enters-during': whenever,
  'condition.control-greatest': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  'restriction.once-each-turn': permanent((e) => `{1}: Draw a card. ${e}`),
  'restriction.cost-reduced-by': permanent((e) => `{4}: Draw a card. ${e}`),
  'noun.attacked-by-it': permanent((e) => `Whenever ~ attacks, ~ deals 1 damage to ${e}.`),
  'noun.all-they-control': spell((e) => `Each player sacrifices ${e}.`),
  'static.cast-as-though-flash': asIs,
  'static.linked-exile': asIs,
  'static.attached-unless-monarch': asIs,
  // Stage P32 (D-145, D-147): the Dinosaurs slice. Escalate and the statics are lines of their own; the trigger follows "Whenever"; the
  // conditions follow "if" (an intervening "if", or the sentence about a creature that deals damage); the nouns are operands.
  'keyword.escalate': asIs,
  'static.cant-attack-block-unless': asIs,
  'static.creatures-with-less-power-cant-block': asIs,
  'static.attached-becomes': asIs,
  'static.pt-amount': asIs,
  'trigger.attacks-while': whenever,
  'condition.dont-control-a': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  'condition.object-has-keyword': spell(
    (e) =>
      `Target creature you control deals damage equal to its power to target creature you don't control. If ${e}, excess damage is dealt to that creature's controller instead.`,
  ),
  'noun.target-commander': spell((e) => `Destroy ${e}.`),
  'noun.any-number-targets': spell((e) => `~ deals X damage divided as you choose among ${e}.`),
  // Prismari deck, group 2 (D-656, D-657): "creatures named ~" is the group of a restriction, "any number of targets" the targets of a divided damage.
  'noun.creatures-named-self': permanent((e) => `{2}{U}: ${cap(e)} can't be blocked this turn.`),
  // Issue 145 (Gruff Triplets): "each creature you control named ~" is the objects of a counters effect.
  'noun.each-creature-you-control-named-self': permanent(
    (e) => `When ~ dies, put a +1/+1 counter on ${e}.`,
  ),
  'noun.any-number-of-targets': spell((e) => `~ deals 4 damage divided as you choose among ${e}.`),
  // Stage P33 (D-149, D-150): the Angels slice. The statements and the replacement are lines of their own; the triggers follow "Whenever";
  // the conditions follow "if" (an intervening "if", a trailing "if" or the "Activate only if" of an ability); the nouns are operands.
  'replacement.counters-plus': asIs,
  'replacement.life-gain-bonus': asIs,
  'static.player-hexproof': asIs,
  'static.cant-lose-win': asIs,
  'static.prevent-damage-to-self': asIs,
  'static.prevent-damage-to-self-remove-counter': asIs,
  'static.graveyard-sacrifice-alt-cost': asIs,
  'static.sacrifice-alt-cost': asIs,
  // Issue 144 (Goblin Negotiation): the number of tokens follows "create a number of ... tokens".
  'amount.excess-damage-dealt-this-way': spell(
    (e) =>
      `~ deals 3 damage to target creature. Create a number of 1/1 red Goblin creature tokens ${e}.`,
  ),
  'amount.damage-dealt-this-way': spell(
    (e) => `~ deals 3 damage to target creature. You gain life ${e}.`,
  ),
  'static.cant-cast-early': asIs,
  // Hashaton deck, group 2 (D-363 to D-365): the static is a line of its own; the amount follows "loses life"; the cost follows "you may" in a life gain trigger.
  'static.opponents-cant-gain-life': asIs,
  // Everlasting Torment: each line stands alone.
  'static.players-cant-gain-life': asIs,
  'static.damage-cant-be-prevented': asIs,
  'static.all-damage-as-though-wither': asIs,
  // Hashaton deck, group 6 (D-377): the statement is a line of its own.
  'static.you-and-creatures-protection-chosen-type': asIs,
  'static.you-planeswalkers-creatures-hexproof': asIs,
  'amount.attackers-of-affected': permanent(
    (e) => `At the beginning of each end step, each opponent loses life ${e}.`,
  ),
  'amount.life-lost-this-turn': permanent(
    (e) => `At the beginning of each end step, each opponent loses life ${e}.`,
  ),
  'cost.pay-life-that-much': permanent(
    (e) => `Whenever you gain life, you may ${e.toLowerCase()}. If you do, draw that many cards.`,
  ),
  'static.block-tax': asIs,
  'static.others-enter-with-counters': asIs,
  'static.tap-alt-cost': asIs,
  'trigger.life-gained': whenever,
  'trigger.life-lost': whenever,
  'trigger.counters-added': whenever,
  // Midnight Clock (issue 121): the Nth counter of a kind put on the permanent.
  'trigger.nth-counter-put': whenever,
  'trigger.attack-batch': whenever,
  'trigger.attack-with-self-or-commander': whenever,
  'effect.its-controller-may-pay-draw': permanent(
    (e) => `Whenever a creature deals combat damage to a player, ${e}.`,
  ),
  'effect.exile-top-of-target-library': permanent((e) => `{T}: ${cap(e)}.`),
  'effect.may-play-lands-cast-spells-free': permanent(
    (e) => `{T}: Exile the top two cards of your library. ${cap(e)}.`,
  ),
  'effect.exile-top-equal-to-different-names': permanent((e) => `Whenever ~ attacks, ${e}.`),
  'effect.may-play-during-commander-attack-turns': permanent(
    (e) => `Whenever ~ attacks, exile the top two cards of your library. ${cap(e)}.`,
  ),
  'effect.opponents-may-create-tokens': spell((e) => `${cap(e)}.`),
  'effect.double-tokens-this-turn': permanent((e) => `When ~ enters, ${e}.`),
  'trigger.opponents-dealt-combat-damage': whenever,
  'condition.damage-dealt-by-type': permanent(
    (e) => `Whenever your opponents are dealt combat damage, if ${e}, you gain 1 life.`,
  ),
  'trigger.opponent-attacks': whenever,
  'trigger.player-attacks-opponent': whenever,
  'trigger.unblocked-opponent-attackers': whenever,
  'trigger.enchanted-tapped-for-mana': whenever,
  // Lorwyn Eclipsed (Blight Curse deck): the conditions and the noun of the counter group.
  'condition.control-that-creature': permanent(
    (e) => `Whenever one or more -1/-1 counters are put on a creature, draw a card if ${e}.`,
  ),
  'condition.its-stat-was': permanent(
    (e) => `Whenever a creature an opponent controls dies, if ${e}, draw a card.`,
  ),
  'condition.you-put-counter-this-turn': permanent(
    (e) => `At the beginning of each end step, if ${e}, ~ deals 2 damage to each opponent.`,
  ),
  'noun.its-owner': permanent((e) => `When ~ dies, ${e} draws a card.`),
  'condition.had-counters': permanent(
    (e) =>
      `Whenever another permanent you control leaves the battlefield, if ${e}, you gain 1 life.`,
  ),
  'condition.those-attacked-you': permanent(
    (e) => `Whenever another player attacks with two or more creatures, they draw a card if ${e}.`,
  ),
  'trigger.opponent-attacks-bare': whenever,
  'condition.they-attacked-you': permanent(
    (e) => `Whenever an opponent attacks, if ${e}, draw a card.`,
  ),
  'condition.those-attacking-you': permanent(
    (e) => `Whenever an opponent attacks with creatures, if ${e}, draw a card.`,
  ),
  // D-653: the intervening "if" of "a player attacks one of your opponents".
  'condition.attacked-has-more-life': permanent(
    (e) => `Whenever a player attacks one of your opponents, if ${e}, draw a card.`,
  ),
  'condition.same-name': permanent((e) => `{2}, {T}: Draw a card. Activate only if ${e}.`),
  'noun.that-card': spell(
    (e) =>
      `Return target creature card from your graveyard to your hand. Return ${e} to the battlefield.`,
  ),
  'noun.this-card': permanent(
    (e) => `When enchanted creature dies, return ${e} to its owner's hand.`,
  ),
  'noun.they': permanent((e) => `Whenever an opponent draws a card, ${e} lose 1 life.`),
  // Stage P34 (D-151, D-152): the Dragons slice. The statements and the replacement are lines of their own; the trigger follows "Whenever"; the
  // conditions follow "if" (an intervening "if", the trailing "if" of an activated ability) or "As long as"; the nouns are operands of damage.
  'replacement.enters-as-copy': asIs,
  'replacement.enters-as-copy-embalmed': asIs,
  'replacement.enters-as-copy-x-counters': asIs,
  // Issue 103 (Deceptive Frostkite).
  'replacement.enters-as-copy-except': asIs,
  'replacement.enters-as-copy-graveyard': asIs,
  'replacement.redirect-damage': asIs,
  'replacement.damage-bonus': asIs,
  'replacement.damage-double': asIs,
  'static.unspent-mana': asIs,
  'static.cast-from-top': asIs,
  'trigger.attacks-first-time': whenever,
  'condition.attacking-most-life': permanent(
    (e) => `Whenever ~ attacks, if ${e}, you gain 1 life.`,
  ),
  'condition.attackers-total-power': permanent(
    (e) => `Whenever ~ attacks, if ${e}, you gain 1 life.`,
  ),
  'condition.player-dealt-damage': permanent((e) => `{T}: Draw a card if ${e}.`),
  // Issue 41 (D-475): the intervening "if" of a second main phase trigger.
  'condition.combat-damaged-by': permanent(
    (e) => `At the beginning of your second main phase, if ${e}, you gain 1 life.`,
  ),
  // Stage P69 (D-252): the Bruna deck.
  'condition.life-above-starting': permanent(
    (e) => `At the beginning of your end step, draw a card if ${e}.`,
  ),
  // Stage P70 (D-278): the meld ability, "if you both own and control ~ and a creature named X, exile them, then meld them into Y".
  'condition.own-and-control-named': permanent(
    (e) => `At the beginning of your end step, if ${e}, you gain 1 life.`,
  ),
  'effect.meld': permanent(
    (e) =>
      `At the beginning of your end step, if you both own and control ~ and a creature named Graf Rats, ${e}.`,
  ),
  // Stage P69 (D-276): "It gains \"You can't lose the game ...\"" ends a sentence with the quote, so the line is the last of an ability.
  'effect.gain-static-ability': permanent(
    (e) => `{T}: Put a +1/+1 counter on target Angel. ${cap(e)}`,
  ),
  // Stage P69 (D-258): "sacrifice it unless you return ..." ends the one instruction of an enters trigger.
  'condition.unless-return': permanent((e) => `When ~ enters, sacrifice it ${e}.`),
  'condition.life-gained-this-turn': permanent(
    (e) => `At the beginning of your end step, if ${e}, you gain 1 life.`,
  ),
  'condition.entered-this-turn': permanent((e) => `As long as ${e}, ~ gets +1/+1.`),
  // Stage P69 (D-271): the die roll and the card in the graveyard (Arden Angel).
  'effect.roll-die': spell((e) => `${cap(e)}.`),
  'condition.you-win-clash': spell(
    (e) => `You lose 1 life, then clash with an opponent. If ${e}, you gain 1 life.`,
  ),
  'condition.die-result': spell((e) => `Roll a twenty-sided die. If ${e}, you gain 1 life.`),
  'condition.this-in-your-graveyard': permanent(
    (e) =>
      `At the beginning of your upkeep, if ${e}, roll a four-sided die. If the result is 1, return ~ from your graveyard to the battlefield.`,
  ),
  'noun.each-other-opponent': spell((e) => `~ deals 1 damage to ${e}.`),
  'noun.other-targets': spell((e) => `~ deals 1 damage to any target and 1 damage to ${e}.`),
  // D-654: the Auras the controller controlled that were attached to the creature that died.
  'amount.for-each-aura-attached': permanent(
    (e) => `Whenever an enchanted creature dies, draw a card ${e}.`,
  ),
  'amount.for-each-still-exiled': spell((e) => `~ deals 2 damage to each opponent ${e}.`),
  // Stage P35 (D-176): the Korvold deck's text and token slice. The effect is a sentence of its own; the noun follows a sentence about a target.
  'effect.it-has-ability': permanent(
    (e) =>
      `At the beginning of your upkeep, create a 0/1 colorless Eldrazi Spawn creature token. ${cap(e)}`,
  ),
  'noun.that-object': spell(
    (e) =>
      `Target creature gets +1/+1 until end of turn. ${cap(e)} gains trample until end of turn.`,
  ),
  // D-295 to D-298 (the Niv-Mizzet deck, group B): the header of a modal spell, the damage to one or two targets and the sentence about what a target was.
  'modal.choose-widen': spell((e) => `${e}\n• Draw a card.\n• You gain 1 life.\n• Scry 1.`),
  // Death Toll deck, group D: the header of a kicked modal spell, and what a destroy of the same text did.
  'modal.choose-kicked': spell((e) => `${e}\n• Draw a card.\n• You gain 1 life.\n• Scry 1.`),
  'condition.destroyed-this-way': permanent(
    (e) => `When ~ enters, you may destroy another target creature. If ${e}, you gain 1 life.`,
  ),
  'noun.one-or-two-targets': spell((e) => `~ deals 1 damage to ${e}.`),
  'noun.one-or-two-targets-bare': spell(
    (e) => `~ deals 2 damage divided as you choose among ${e}.`,
  ),
  'condition.that-spells-stat': permanent(
    (e) => `Whenever you cast a creature spell, if ${e}, you gain 1 life.`,
  ),
  'condition.its-mana-value': spell(
    (e) => `Return target creature to its owner's hand. If ${e}, scry 1.`,
  ),
  'modal.choose-not-repeated': spell((e) => `${e}\n• Draw a card.\n• You gain 1 life.`),
  'modal.choose-not-repeated-source': permanent(
    (e) => `At the beginning of your end step, ${e}\n• Draw a card.\n• You gain 1 life.`,
  ),
  // Scriv, the Obligator (CR 303.4f): an Aura token created attached to a target, and the "it's attacking one of your opponents" condition.
  'token.aura': permanent(
    (e) =>
      `Whenever ~ attacks, create ${e} attached to target creature. The token has enchant creature.`,
  ),
  'condition.it-was-attacking': permanent(
    (e) => `Whenever a creature you control dies, you gain 1 life if ${e}.`,
  ),
  'condition.it-attacking-opponents': permanent(
    (e) => `Whenever enchanted creature attacks, it gets +2/+0 until end of turn if ${e}.`,
  ),
  // Shadrix Silverquill: "you may choose two" with a different player for each mode (CR 700.2d).
  'modal.choose-may-different': permanent(
    (e) =>
      `At the beginning of combat on your turn, ${e}\n• Target player draws a card and loses 1 life.\n• Target player creates a 2/1 white and black Inkling creature token with flying.`,
  ),
  'noun.each-permanent-they-control': spell((e) => `Target player puts a +1/+1 counter on ${e}.`),
  // D-344 (repeatable modes, CR 700.2d): the header with no dash, its bullets after it.
  'modal.choose-repeatable': spell((e) => `${e}\n• Draw a card.\n• You gain 1 life.`),
  // Danitha deck, group 7 (D-433): Tiered, whose bullets name their mode and its cost before the effect.
  'modal.tiered': spell(
    (e) => `${e}\n• Cure — {0} — Draw a card.\n• Cura — {1} — You gain 1 life.`,
  ),
  // Issue 144: Spree, whose bullets (plus signs in the Oracle text, bullets once normalized) are the cost of the mode and its effect.
  'modal.spree': spell((e) => `${e}\n• {1} — Draw a card.\n• {2} — You gain 1 life.`),
  // Issue 144: a test of the turn before an instruction, and the doubling of the other creatures of the chosen type.
  'condition.your-combat-phase': spell((e) => `If ${e}, draw a card.`),
  'static.triggers-additional-time-another': asIs,
  // Stage P37 (D-180): the Korvold deck's triggers and small statics. The statics are lines of their own; the trigger follows "When"; the
  // conditions follow "As long as" or "If"; the nouns are operands of damage; the amount follows "gets +1/+1".
  'trigger.cycled': permanent((e) => `When ${e}, you gain 1 life.`),
  // Exert (CR 701.43d): the trigger is the first sentence of a paragraph, the body follows "When you do,".
  'trigger.exerted': permanent((e) => `${cap(e)}. When you do, you gain 1 life.`),
  'condition.attached-to': permanent(
    (e) => `As long as ${e}, your opponents can't cast spells during your turn.`,
  ),
  // D-286 (CR 702.95b): the condition follows "As long as"; the noun is the subject of the grant that follows it.
  'condition.paired': permanent((e) => `As long as ${e}, ~ gets +1/+1.`),
  'noun.paired-creatures': permanent(
    (e) => `As long as ~ is paired with another creature, ${e} has flying.`,
  ),
  'condition.milled-this-way': spell(
    (e) => `Mill three cards. If ${e}, each opponent loses 2 life.`,
  ),
  'condition.cast-from-graveyard-this-turn': permanent(
    (e) => `At the beginning of your end step, draw a card if ${e}.`,
  ),
  'condition.put-this-way': spell(
    (e) => `You may put a land card from your hand onto the battlefield. If ${e}, you gain 4 life.`,
  ),
  'condition.exiled-this-way': spell(
    (e) => `Exile target card from a graveyard. If ${e}, draw a card.`,
  ),
  'noun.player-or-planeswalker': spell((e) => `~ deals 1 damage to ${e}.`),
  'noun.each-permanent-of-player': spell((e) => `~ deals 1 damage to target player and ${e}.`),
  'amount.for-each-card-type': spell((e) => `Target creature gets +1/+1 until end of turn ${e}.`),
  // Eris (issue 121): the count of distinct mana values among the cards of a zone.
  'amount.for-each-different-mana-value': spell(
    (e) => `Target creature gets +1/+1 until end of turn ${e}.`,
  ),
  'amount.for-each-card-type-among-those-cards': permanent(
    (e) =>
      `Whenever one or more cards are put into your graveyard from your library, each opponent loses 1 life ${e}.`,
  ),
  'trigger.unlock-this-door': whenever,
  'amount.for-each-color': permanent((e) => `Equipped creature gets +1/+1 ${e}.`),
  'static.opponents-cant-cast': asIs,
  'static.opponents-cant-cast-spells': asIs,
  'static.group-enters-untapped': asIs,
  'static.group-enters-tapped': asIs,
  'static.spells-cant-be-countered': asIs,
  // Stage P43 (D-193): the damage that stays and the redirection of Ancient Adamantoise, lines of their own.
  'static.keeps-damage': asIs,
  // Stage P39 (D-184): the mana spent to cast a spell. The trigger follows "When"; the amount follows a quantity of counters.
  'trigger.cast-self': permanent((e) => `When ${e}, you gain 1 life.`),
  'amount.for-each-mana-spent': permanent(
    (e) => `Each creature you control enters with an additional +1/+1 counter on it ${e}.`,
  ),
  // Stage P41 (D-188): the expensive singles. The trigger follows "Whenever"; the condition follows a landfall trigger's comma; the noun is what a
  // sacrifice names; the static is a line of its own.
  'trigger.you-attack': whenever,
  'condition.your-main-phase': permanent(
    (e) => `Whenever a land you control enters, if ${e}, you gain 1 life.`,
  ),
  'noun.one-or-more-permanents': spell((e) => `Sacrifice ${e}.`),
  'static.pt-times-attacked': asIs,
  // Stage P45 (D-197): the Ring. The trigger follows "Whenever"; the condition follows a landfall trigger's comma; the token is what "create" makes.
  'trigger.ring-tempts': whenever,
  'condition.ring-bearer': permanent(
    (e) => `Whenever a land you control enters, if ${e}, you gain 1 life.`,
  ),
  'token.named-legendary': spell((e) => `Create ${e}.`),
  // Death Toll deck, group C: a token whose own characteristic-defining ability defines its power and toughness; the card whose own ability is a creature off the battlefield.
  'token.defined-pt': spell((e) => `Create ${e}.`),
  'token.noncreature-named': spell((e) => `Create ${e}.`),
  'static.creature-off-battlefield': asIs,
  // Stage P48 (D-205): the Vraska deck's text and token slice. The trigger follows "When"; the noun follows a sentence about several targets.
  'trigger.enters-and-cast': permanent((e) => `When ${e}, you gain 1 life.`),
  'noun.each-of-them': spell((e) => `Tap up to two target creatures. Put a stun counter on ${e}.`),
  // Stage P49 (D-206): the Vraska deck's triggers, conditions and statics. A trigger follows "Whenever"; a condition follows the trigger it conditions or
  // "Then if" in a spell; the static is a line of its own.
  'keyword.job-select': asIs,
  'trigger.becomes-untapped': whenever,
  // Issue 103: "becomes monstrous" follows "Whenever"; the amount follows the damage to each opponent.
  'trigger.becomes-monstrous': whenever,
  'amount.cards-in-hand-of-that-player': permanent(
    (e) => `At the beginning of each end step, ~ deals damage to each opponent ${e}.`,
  ),
  'trigger.dies-batch': whenever,
  // Gisa deck, group 2 (D-464, D-465): "you commit a crime", "you create or sacrifice a token", "Skeletons and Zombies you control".
  'trigger.commit-crime': whenever,
  'trigger.create-token': whenever,
  'trigger.play-card': whenever,
  'trigger.activate-ability': whenever,
  // Hylda deck, group 1 (D-510, D-513): "you tap an untapped creature an opponent controls", "you scry", "it isn't being declared as an attacker".
  'trigger.tap-untapped': whenever,
  'trigger.scry': whenever,
  // Galadriel deck, group 1 (issue 43): "you scry or surveil" follows "Whenever"; the conditions follow a trigger's comma or a sentence of its body.
  'trigger.scry-or-surveil': whenever,
  // Galadriel deck, group 3 (issue 43): "you roll a die's highest natural result" follows "Whenever"; the copy is the token of an enters trigger; "up to one target spell" is the noun of a counter.
  'trigger.roll-highest': whenever,
  'keyword.buyback': asIs,
  // Plot (issue 121): the keyword line stands alone.
  'keyword.plot': asIs,
  'token.copy-not-legendary': permanent((e) => `When ~ enters, create ${e}.`),
  'token.copy-not-legendary-adds-types': permanent((e) => `When ~ enters, create ${e}.`),
  'noun.target-activated-or-triggered-ability': spell((e) => `Counter ${e}.`),
  'noun.up-to-one-target-spell': spell(
    (e) =>
      `Counter ${e} unless its controller pays mana equal to the greatest power among creatures you control.`,
  ),
  'static.crew-saddle-bonus': asIs,
  'static.spells-you-cast-have-keyword': asIs,
  'static.each-spell-you-cast-has-replicate': asIs,
  'static.legend-rule-doesnt-apply': asIs,
  'static.groups-are-the-chosen-type': asIs,
  'static.graveyard-cards-have-encore': asIs,
  'static.every-creature-type': asIs,
  'static.hand-cards-have-cycling': asIs,
  'static.graveyard-cards-have-flashback': asIs,
  'condition.resolved-times': permanent(
    (e) => `Whenever a creature you control enters, scry 1. If ${e}, you gain 1 life.`,
  ),
  'condition.chose-ring-bearer': permanent((e) => `Whenever the Ring tempts you, if ${e}, scry 3.`),
  // Food and Fellowship deck, group C: Revolt, the Ring-bearer and the times the Ring has tempted, "two or more creatures you control attack a player", the counters on ~.
  'condition.permanent-left-under-control': permanent(
    (e) => `At the beginning of your end step, if ${e}, you gain 1 life.`,
  ),
  'condition.this-is-ring-bearer': permanent(
    (e) => `Whenever ~ attacks, draw a card. Then if ${e}, scry 1.`,
  ),
  'condition.ring-tempted-times': permanent(
    (e) => `Whenever ~ attacks, draw a card. Then if ${e}, scry 1.`,
  ),
  'condition.ring-bearer-and-tempted': permanent(
    (e) => `Whenever ~ attacks, draw a card. Then if ${e}, scry 1.`,
  ),
  'trigger.n-or-more-attack-a-player': whenever,
  'static.pt-counters-on-source': asIs,
  'condition.not-declared-attacker': permanent(
    (e) => `Whenever a creature becomes tapped, if ${e}, you gain 1 life.`,
  ),
  // Twilight Diviner: the intervening "if" of a trigger about one or more creatures entering.
  'condition.entered-from-graveyard': permanent(
    (e) => `Whenever one or more creatures you control enter, if ${e}, you gain 1 life.`,
  ),
  'noun.subtype-pair': permanent((e) => `${cap(e)} get +1/+1.`),
  'noun.other-subtype-pair': permanent((e) => `${cap(e)} get +1/+1.`),
  'noun.creatures-subtype-and-or-tokens': permanent((e) => `${cap(e)} get +1/+1.`),
  // Hylda deck, group 3 (issue 42): "any number of target tapped creatures with different controllers".
  'noun.any-number-targets-controllers': spell((e) => `Destroy ${e}.`),
  'trigger.discarded': whenever,
  'trigger.cycled-or-discarded': whenever,
  'condition.mana-spent-at-least': permanent(
    (e) => `Whenever you cast a noncreature spell, if ${e}, you gain 1 life.`,
  ),
  // Issue 25 (the Niv-Mizzet deck): the condition leads the "instead" sentence of a trigger about a spell that was cast.
  'condition.spells-cast-this-turn': permanent((e) => `{T}: Add {G}. Activate only if ${e}.`),
  'condition.spells-cast-last-turn': permanent(
    (e) => `At the beginning of each upkeep, if ${e}, you gain 1 life.`,
  ),
  // Conduit of Worlds: the condition leads the sentence that offers to cast the card.
  'condition.no-spell-cast-this-turn': permanent((e) => `{T}: Add {G}. Activate only if ${e}.`),
  // Issue 279 (Windfall).
  'amount.discarded-most-this-way': spell(
    (e) => `Each player discards their hand, then draws cards ${e}.`,
  ),
  // Issue 279 (Windbrisk Heights).
  'condition.attacked-with-creatures': permanent(
    (e) => `{W}, {T}: You may play the exiled card without paying its mana cost if ${e}.`,
  ),
  'condition.mana-spent-or-more': permanent(
    (e) =>
      `Whenever you cast an instant or sorcery spell, you gain 1 life. If ${e}, you gain 3 life instead.`,
  ),
  // Prismari deck, group 2 (D-646): the condition leads the "instead" sentence of a trigger about a spell that was cast.
  'condition.spell-mana-value-or-more': permanent(
    (e) =>
      `Whenever you cast an instant or sorcery spell, you gain 1 life. If ${e}, you gain 3 life instead.`,
  ),
  // Prismari deck, group 3 (D-661): the condition leads the sentence that casts the spells, after the exile.
  'condition.total-mana-value-exiled-this-way': spell(
    (e) =>
      `As many times as you choose, you may exile the top card of your library. If ${e}, you may cast any number of spells from among those cards without paying their mana costs.`,
  ),
  // Death Toll deck, group B (CR 205.2a): the condition leads the sentence that follows a mill.
  'condition.two-milled-cards-share-all-types': spell(
    (e) => `Mill two cards. If ${e}, you gain 1 life.`,
  ),
  // Prismari deck, group 3 (D-662): a delayed ability for the turn, after the exile of a card.
  'effect.delayed-combat-damage-copy-exiled': permanent(
    (e) => `Whenever you attack, target creature gains deathtouch until end of turn. ${cap(e)}.`,
  ),
  'condition.card-left-graveyard': permanent(
    (e) => `At the beginning of each end step, if ${e}, you gain 1 life.`,
  ),
  'condition.descended-this-turn': permanent(
    (e) => `At the beginning of your end step, if ${e}, you gain 1 life.`,
  ),
  'amount.for-each-nontoken-destroyed': spell(
    (e) => `Destroy all creatures. Then create a 3/2 red and white Spirit creature token ${e}.`,
  ),
  // Stage P67 (D-220): trigger doubling is a line of its own, and so is the equip of a creature type.
  'static.triggers-additional-time': asIs,
  // Issue 25 (D-339): the line of its own, with the card's wording.
  'static.triggers-additional-time-cause': asIs,
  'static.triggers-additional-time-attacking': asIs,
  'static.pt-unspent-mana': asIs,
  'static.unspent-mana-colorless': asIs,
  'keyword.equip-quality': asIs,
  // Stage P70 (D-259): the equip of a commander is a line of its own.
  'keyword.equip-commander': asIs,
  // Issue 345: the equip of a legendary creature is a line of its own.
  'keyword.equip-legendary': asIs,
  // Ahoy Mateys deck, group 10 (Siren Stormtamer): the target of a counter, in the activated ability that sacrifices the creature.
  'noun.target-spell-or-ability-targeting-you': permanent((e) => `{U}, Sacrifice ~: Counter ${e}.`),
  // Ahoy Mateys deck, group 10 (Arm-Mounted Anchor): the equip line with its cost reduction, and the condition of that reduction.
  'keyword.equip-cost-reduced': asIs,
  'condition.you-have-few-cards-in-hand': permanent(
    (e) => `Equip {2}. This ability costs {2} less to activate if ${e}.`,
  ),
  // Stage P66 (D-219): the replacement of the creation of tokens is a line of its own.
  'replacement.tokens-instead': asIs,
  // Issue 25 (D-332): the line of its own; the trigger follows "Whenever".
  'replacement.skip-draw': asIs,
  // Hashaton deck, group 3 (D-378 to D-380): the two replacements of Bard and the static of Darksteel Angel are lines of their own.
  'replacement.draw-instead': asIs,
  'replacement.tokens-double': asIs,
  'static.cant-have-counters': asIs,
  'static.cant-be-sacrificed': asIs,
  'trigger.noncombat-damage': whenever,
  'trigger.player-dealt-damage': whenever,
  'trigger.enchanted-player-attacked': whenever,
  'effect.opponents-attacking-do-same': spell(
    (e) => `Create a 2/2 black Zombie creature token. ${cap(e)}.`,
  ),
  // Danitha deck, group 5 (D-407, D-408): the blight cost of an ordinary ability, and the spell's own permission to be cast as though it had flash (a line of its own).
  'cost.blight': permanent((e) => `{1}, ${e}: Draw a card.`),
  'static.cast-self-as-though-flash': asIs,
  // Group 9 of the Hashaton deck (D-390 to D-395): the Phyrexian cost of an ordinary activation, the trigger about a source, its controller and the exile of a random card.
  'cost.mana-phyrexian': permanent((e) => `${e}: Draw a card.`),
  'trigger.source-deals-damage': whenever,
  // Issue 347: "enchanted creature deals damage to an opponent" and "Treefolk and Forests you control".
  'trigger.deals-damage': whenever,
  'noun.creature-land-pair': spell((e) => `${cap(e)} gain indestructible until end of turn.`),
  'noun.that-sources-controller': permanent(
    (e) => `Whenever a source deals damage to ~, ${e} exiles a card from their hand at random.`,
  ),
  // Stage P65 (D-218): the batch triggers, magecraft and the attackers of the opponents.
  'trigger.attack-one-or-more': whenever,
  'trigger.enchanted-by-you-attack': whenever,
  'trigger.you-attack-with-one-or-more': whenever,
  'trigger.enters-one-or-more': whenever,
  'trigger.cast-or-copy': whenever,
  // D-650: "each other creature that's attacking one of your opponents".
  'noun.each-other-attacking-opponent': permanent(
    (e) => `When ~ enters, ${e} gets +1/+0 until end of turn.`,
  ),
  'noun.attacking-opponents': permanent((e) => `When ~ enters, ${e} get +1/+0 until end of turn.`),
  // Quandrix Unlimited, group D1: "Auras, Equipment, and modified creatures you control gain hexproof until end of turn."
  'noun.auras-equipment-modified': spell((e) => `${cap(e)} gain hexproof until end of turn.`),
  // Stage P64 (D-217): the nouns, effects and conditions of the Vraska EDHREC deck's second group.
  'noun.token-permanents': permanent((e) => `${cap(e)} have haste.`),
  // D-369: "Zombie tokens you control".
  'noun.subtype-token-permanents': permanent((e) => `${cap(e)} have haste.`),
  // Stage P63 (D-216): the Vraska EDHREC deck.
  'condition.created-token': permanent(
    (e) => `At the beginning of each end step, if ${e}, you gain 1 life.`,
  ),
  'condition.cast-from-graveyard': spell(
    (e) =>
      `Create a 3/3 blue Robot Warrior artifact creature token. Then if ${e}, put two +1/+1 counters on that token.`,
  ),
  // Meren of Clan Nel Toth: the condition leads the sentence that returns the card chosen before it.
  'condition.that-mana-value-at-most': permanent(
    (e) =>
      `At the beginning of your end step, choose target creature card in your graveyard. If ${e}, return it to the battlefield.`,
  ),
  // Yavimaya Bloomsage.
  'condition.that-object-power': spell(
    (e) => `Put a +1/+1 counter on target creature you control. Then if ${e}, draw a card.`,
  ),
  // Issue 233 (Martial Coup).
  'condition.x-at-least': spell(
    (e) => `Create X 1/1 white Soldier creature tokens. If ${e}, draw a card.`,
  ),
  // Issue 244 (Return to Dust).
  'condition.cast-in-own-main-phase': spell(
    (e) => `Exile target artifact. If ${e}, exile target enchantment.`,
  ),
  // Burning Curiosity (CR 118.8, 701.68a): the optional blight of the additional cost is what the condition reads.
  'condition.additional-cost-paid': spell((e) => `Draw a card. If ${e}, draw two cards instead.`),
  'static.during-your-turn': asIs,
  // Stage P50 (D-207): the costs, nouns and conditions of the Vraska deck's third group.
  'condition.it-targets': permanent((e) => `~ costs {3} less to cast if ${e}.`),
  'cost.discard-filtered': permanent((e) => `{1}, {T}, ${e}: Draw a card.`),
  'noun.target-triggered-ability-or-spell': spell((e) => `Counter ${e}.`),
  // Issue 26 (the Danitha deck, D-426 to D-428): the conditions about the permanent an Aura enchants, a group of the creatures that are not enchanted, and the Equip reduction.
  'condition.host-is-color': permanent((e) => `As long as ${e}, it gets +1/+1.`),
  'condition.other-attached-to-host': permanent((e) => `As long as ${e}, it has first strike.`),
  'condition.this-entered-this-turn': permanent(
    (e) => `As long as ${e}, enchanted creature has hexproof.`,
  ),
  'noun.all-enchanted': spell((e) => `Destroy ${e}.`),
  'static.equip-cost-reduction': asIs,
  // Stage P52 (D-210): the players an effect asks, and what the instructions before them did.
  // Issue 26 (the Danitha deck, D-403): the condition of the second sentence of an offer to put a card onto the battlefield.
  'condition.you-dont-put-it-onto-battlefield': spell(
    (e) =>
      `Choose target permanent card in your graveyard. You may put it onto the battlefield. If ${e}, put it into your hand.`,
  ),
  // Issue 26 (the Danitha deck, D-411, D-412): the riders of a choice among the cards a mill moved.
  'condition.if-you-dont': permanent(
    (e) =>
      `When ~ enters, mill three cards. You may put a land card from among them into your hand. If ${e}, put a +1/+1 counter on ~.`,
  ),
  'condition.control-or-returned': spell(
    (e) =>
      `Mill four cards. You may put a permanent card from among them into your hand. If ${e}, create a Food token.`,
  ),
  'condition.player-declines': permanent(
    (e) => `When ~ enters, target opponent may have you draw a card. If ${e}, you gain 1 life.`,
  ),
  // Meren deck, Braids: the sentence for the opponents who declined starts with the words instead of an "if".
  'condition.each-opponent-declines': permanent(
    (e) =>
      `At the beginning of your end step, each opponent may discard a card. ${cap(e)}, that player loses 1 life.`,
  ),
  // Meren deck, Braids: the permanent an opponent may sacrifice after the sacrifice of the sentence before it.
  'noun.a-permanent-sharing-type': permanent(
    (e) =>
      `At the beginning of your end step, you may sacrifice a creature. If you do, each opponent may sacrifice ${e}.`,
  ),
  // Witch-king of Angmar: what an opponent sacrifices after combat damage to the controller.
  'noun.a-creature-that-dealt-damage-to-you': permanent(
    (e) =>
      `Whenever one or more creatures deal combat damage to you, each opponent sacrifices ${e}.`,
  ),
  // Echoing Return: the target card and the cards with its name, returned together.
  'noun.target-card-and-same-name': spell((e) => `Return ${e} to your hand.`),
  'condition.discarded-this-way': permanent(
    (e) =>
      `At the beginning of your end step, each player may discard a card. If ${e}, you gain 1 life.`,
  ),
  'noun.each-player-discarded': permanent(
    (e) =>
      `At the beginning of your end step, each player may discard a card. ${cap(e)} draws a card.`,
  ),
  // CR 701.21a: the players a sacrifice found nothing to sacrifice for, as the subject of the next sentence.
  'noun.each-player-cant-sacrifice': permanent(
    (e) =>
      `When ~ enters, each player sacrifices a creature of their choice. ${cap(e)} discards a card.`,
  ),
  // D-269: the players a permanent attacked this turn, as the subject of "loses the game".
  'noun.each-player-attacked': permanent(
    (e) => `At the beginning of your end step, ${e} loses the game.`,
  ),
  // CR 120.2a: the opponents a creature of the card's name has dealt combat damage to this game, as the subject of "loses life".
  'noun.each-opponent-dealt-combat-damage-by-named': permanent(
    (e) => `At the beginning of your end step, ${e} loses 1 life.`,
  ),
  'amount.milled-value-this-way': permanent(
    (e) => `When ~ enters, you mill three cards, then ~ deals damage to target opponent ${e}.`,
  ),
  // Stage P68 (D-229): the Hofri Ghostforge deck. The triggers follow "Whenever"; the conditions follow a trigger or "As long as"; the costs are costs of an
  // activated ability; the rider follows the "Add" sentence; the amount follows a pump; the static is a line of its own.
  'trigger.cards-leave-graveyard': whenever,
  'trigger.graveyard-events': whenever,
  // Death Toll deck, group B (CR 603.2): the trigger of cards put into your graveyard.
  'trigger.put-into-graveyard': whenever,
  'trigger.self-put-into-graveyard': whenever,
  'trigger.cards-exiled-library-graveyard': whenever,
  'trigger.cast-nth': whenever,
  // CR 603.2: a spell cast in a named turn, and two events of one sentence.
  'trigger.cast-during-your-turn': whenever,
  'trigger.cast-turn-and-when': whenever,
  'trigger.cast-x': whenever,
  // Quandrix Unlimited deck, group I (Unbound Flourishing): one trigger for a spell cast and an ability activated, and the "if" on the cost that goes with it.
  'trigger.cast-or-activate': whenever,
  'condition.cost-contains-x': permanent(
    (e) =>
      `Whenever you cast an instant or sorcery spell or activate an ability, if ${e}, copy that spell or ability.`,
  ),
  // Issue 100 (Baral and Kari Zev): "you cast your first instant or sorcery spell each turn".
  'trigger.cast-first-of-kind': whenever,
  'trigger.enters-one-or-more-creatures': whenever,
  'trigger.you-create-tokens': whenever,
  'condition.cards-in-graveyard': permanent((e) => `As long as ${e}, ~ has flying.`),
  'condition.cards-in-library': permanent((e) => `As long as ${e}, ~ has flying.`),
  'condition.opponents-control-at-least': permanent((e) => `~ enters tapped unless ${e}.`),
  'condition.that-player-more-lands': permanent(
    (e) => `Whenever a land an opponent controls enters, if ${e}, you gain 1 life.`,
  ),
  'cost.discard-this': permanent((e) => `{1}, ${e}: Draw a card.`),
  'cost.exile-this': permanent((e) => `{1}, {T}, ${e}: Draw a card.`),
  // The card exiles itself from the graveyard as the cost of an ability it has there; Behold is an additional cost of a spell.
  'cost.exile-this-from-graveyard': permanent((e) => `{1}, ${e}: Draw a card.`),
  'cost.behold': spell((e) => `As an additional cost to cast ~, ${e}. Draw a card.`),
  // Group 5 (D-233): the exile of cards of the graveyard as a cost.
  'cost.exile-graveyard-cards': permanent((e) => `{1}, {T}, ${e}: Draw a card.`),
  'cost.exile-any-hand': spell(
    (e) => `As an additional cost to cast ~, you may ${e}. Draw a card.`,
  ),
  'effect.mana-rider-scry-commander': permanent((e) => `{T}: Add {G}. ${cap(e)}.`),
  // Issue 230 (Forgotten Ancient).
  'effect.move-counters-onto-others': permanent(
    (e) => `At the beginning of your upkeep, you may ${e}.`,
  ),
  // Issue 241 (Opal Palace).
  'effect.mana-rider-counters-commander': permanent((e) => `{T}: Add {G}. ${cap(e)}.`),
  'amount.damage-dealt-by-trigger': permanent(
    (e) =>
      `Whenever one or more creatures you control deal combat damage to a player, create a 0/0 green and blue Fractal creature token. Put a number of +1/+1 counters on it ${e}.`,
  ),
  'amount.for-each-commander-cast': permanent((e) => `Creatures you control get +1/+1 ${e}.`),
  'static.untap-in-others-step': asIs,
  'trigger.class-level': permanent((e) => `When ${e}, draw a card.`),
  'trigger.ring-bearer-chosen': permanent((e) => `Whenever ${e}, draw a card.`),
  // Group 4 (D-232): the permission to play from the graveyard is a line of its own.
  'static.graveyard-play-once-each-turn': asIs,
  // Group 4 (D-208): the rider of the mana a land adds follows the "Add" sentence of its mana ability.
  'effect.mana-rider-scry': permanent((e) => `{T}: Add {G}. ${cap(e)}.`),
  // Group 3-c (D-354): the cast of a card of a graveyard is read in the body of a trigger (a second rider sentence is joined to the first).
  'effect.cast-graveyard-card': permanent((e) => `When ~ enters, ${e}.`),
  'effect.cast-per-opponent-graveyard-free': permanent((e) => `When ~ enters, ${e}.`),
  // Issue 144 (Goblin Dark-Dwellers, Glimpse the Impossible, Conspicuous Snoop).
  'effect.cast-own-graveyard-card-free': permanent((e) => `When ~ enters, ${e}.`),
  'effect.cast-chosen-graveyard-spell-free': permanent((e) => `Whenever ~ attacks, ${e}.`),
  'amount.for-each-card-put-into-your-graveyard': spell(
    (e) =>
      `Exile the top three cards of your library. You may play those cards this turn. At the beginning of the next end step, put them into your graveyard, then create a 0/1 colorless Eldrazi Spawn creature token ${e}.`,
  ),
  'static.top-card-abilities': asIs,
  'static.linked-exile-abilities': asIs,
  // Group 7 (D-356): the additional beginning phase is said in the body of a trigger of the postcombat main phase.
  'effect.extra-beginning-phase': permanent(
    (e) => `At the beginning of each of your postcombat main phases, ${e}.`,
  ),
  // Group 2b-b (D-328): the rider that copies the spell the mana is spent on follows the "Add" sentence of its mana ability.
  'effect.mana-rider-copy': permanent((e) => `{T}: Add {R}. ${cap(e)}.`),
  // Forger's Foundry (issue 121): the rider of the mana the ability before it adds.
  'effect.mana-rider-exile': permanent((e) => `{T}: Add {U}. ${cap(e)}.`),
  // Bloodthirsty Adversary (issue 121): the payment and the ability it buys.
  'effect.pay-any-number-of-times': permanent(
    (e) => `When ~ enters, you may ${e}. When you pay this cost one or more times, draw a card.`,
  ),
  'effect.exile-up-to-that-many-and-copy': permanent(
    (e) =>
      `When ~ enters, you may pay {2}{R} any number of times. When you pay this cost one or more times, ${e}.`,
  ),
  // Group 2 (D-230).
  'noun.each-permanent-that-is': spell((e) => `Put two +1/+1 counters on ${e}.`),
  // Ahoy Mateys deck, group 7.
  'noun.target-permanent-controller-dealt-damage-by': spell((e) => `Gain control of ${e}.`),
  // Ahoy Mateys deck, group 4.
  'noun.each-creature-that-is-subtype-or-subtype': permanent(
    (e) => `${e[0]?.toUpperCase()}${e.slice(1)} gets +1/+1.`,
  ),
  'noun.each-creature-you-control-but-dont-own': permanent(
    (e) => `${e[0]?.toUpperCase()}${e.slice(1)} gets +1/+1.`,
  ),
  // Bruna deck, Ajani (D-268).
  'noun.each-type-union': spell((e) => `Exile ${e}.`),
  // D-270: a target of two zones, read by `exile`.
  'noun.target-creatures-battlefield-or-graveyard': spell((e) => `Exile ${e}.`),
  'amount.for-each-own-nontoken-destroyed': spell(
    (e) => `Destroy all creatures. Then create a 3/2 red and white Spirit creature token ${e}.`,
  ),
  // Hashaton deck group 5 (D-385): copies of the tokens of the chosen type that entered this turn.
  'effect.copy-each-token': permanent((e) => `At the beginning of your end step, ${e}.`),
  'effect.copy-each-creature-token': permanent((e) => `At the beginning of your end step, ${e}.`),
  'effect.create-copy-spirit': permanent(
    (e) => `Whenever another nontoken creature you control dies, exile it. If you do, ${e}`,
  ),
  // Gisa deck, group 3 (D-486, D-488, D-490): the subject "any number of target players each", the cost "Sacrifice X creatures" and "Partner with [name]".
  'noun.any-number-target-players': spell((e) => `${cap(e)} lose 2 life.`),
  'noun.x-permanents': permanent((e) => `{T}, Sacrifice ${e}: Draw X cards.`),
  // Issue 258 (D-585): the sentence after "Choose a color." in an ability that sacrifices one or more artifacts.
  'effect.player-adds-chosen-color-mana': permanent(
    (e) => `{T}, Sacrifice one or more artifacts: Choose a color. ${cap(e)}.`,
  ),
  'keyword.partner-with': asIs,
  'keyword.deck-limit': asIs,
  // D-492: the optional sacrifice and the copies are one statement of a spell.
  'static.additional-cost-sacrifice-copies': spell((e) => e),
  // Hylda deck, group 2 (D-517, D-518, D-520, D-521, D-523): the group of a target player, the group "those creatures" says, a target of the player of the event, the card types of
  // a graveyard, the state of the permanent an Aura enchants and the cost of an ability that depends on the turn.
  'noun.all-permanents-of-target-player': spell((e) => `Tap ${e}.`),
  'noun.all-with-power-above-target': spell((e) => `Destroy ${e}.`),
  'noun.each-permanent-of-target-player': spell((e) => `Goad ${e}.`),
  'noun.group-of-target-player': spell((e) => `${cap(e)} get +1/+1 until end of turn.`),
  'noun.all-nonland-they-control': spell(() => `All nonland permanents they control phase out.`),
  'noun.those-creatures': spell(
    (e) =>
      `Tap up to two target creatures. ${cap(e)} don't untap during their controllers' next untap steps.`,
  ),
  'noun.target-permanent-of-that-player': permanent(
    (e) => `At the beginning of each opponent's upkeep, tap ${e}.`,
  ),
  'condition.card-types-among': permanent(
    (e) =>
      `At the beginning of each opponent's upkeep, if ${e}, tap target creature that player controls.`,
  ),
  'condition.opponent-poison-at-least': permanent(
    (e) => `As long as ${e}, creatures you control with toxic have lifelink.`,
  ),
  'condition.creature-died-this-turn': spell(
    (e) =>
      `Target creature gets -1/-1 until end of turn. That creature gets -13/-13 until end of turn instead if ${e}.`,
  ),
  'condition.modified-creature-died': permanent(
    (e) =>
      `At the beginning of each end step, if ${e}, create a 2/1 white and black Inkling creature token with flying.`,
  ),
  'condition.host-is-tapped': permanent((e) => `At the beginning of each upkeep, if ${e}, tap it.`),
  // Lorehold Spirit deck, group 1 (issue 86): "you search your library this way" after a search; "any number of target cards from your graveyard" of a shuffle.
  // Federation Fleet deck, group D: the cost of Ensign Harry Kim, the intervening "if" of his trigger and the second sentence of Guinan.
  'cost.remove-counters-among': permanent((e) => `{2}, ${e}: Draw a card.`),
  'condition.it-has-greater-power': permanent(
    (e) => `Whenever another creature you control enters, if ${e}, put a +1/+1 counter on ~.`,
  ),
  'condition.put-counters-this-way': permanent(
    (e) =>
      `{1}, {T}: Put a +1/+1 counter on each creature you control that entered this turn. If ${e}, draw a card.`,
  ),
  'condition.searched-this-way': permanent(
    (e) =>
      `When ~ enters, you may search your library for a Plains card and put it onto the battlefield tapped. If ${e}, shuffle.`,
  ),
  // Lorehold Spirit deck, group 3 (issue 86): "a player has one or fewer cards in hand" in the intervening "if" of an upkeep trigger.
  'condition.a-player-cards-in-hand': permanent(
    (e) => `At the beginning of your upkeep, if ${e}, ~ becomes prepared.`,
  ),
  // Federation Fleet deck, group B: "the player is your opponent and has four or more cards in hand" after a draw of the player of a step.
  'condition.the-player-is-opponent-with-cards': permanent(
    (e) =>
      `At the beginning of each player's end step, that player draws a card. If ${e}, ~ deals 2 damage to that player.`,
  ),
  'noun.any-number-target-graveyard-cards': permanent(
    (e) => `{2}, Exile ~: Shuffle ${e} into your library.`,
  ),
  // Lorehold Spirit deck, group 2 (issue 86): a card of your graveyard that is none of two types, "card exiled with ~" and the three sentences of the free cast, and the votes counted.
  'noun.target-nonmatching-graveyard-card': permanent(
    (e) => `At the beginning of your end step, exile ${e}.`,
  ),
  'noun.target-card-exiled-with-self': permanent(
    (e) => `{1}, {T}: Choose ${e}. You may cast that card this turn without paying its mana cost.`,
  ),
  'effect.cast-exiled-with-self': permanent((e) => `{1}, {T}: ${cap(e)}.`),
  'amount.for-each-vote': spell(
    (e) => `Starting with you, each player votes for past or present. You mill a card ${e}.`,
  ),
  'restriction.cost-reduction-your-turn': permanent(
    (e) => `{1}, {T}: Tap target creature. ${cap(e)}`,
  ),
  // Issue 89 (Gift of Immortality): the delayed return of the Aura's own card follows the return of the creature.
  'effect.return-this-card-attached-delayed': permanent(
    (e) =>
      `When enchanted creature dies, return that card to the battlefield under its owner's control. ${cap(e)}.`,
  ),
  // Issue 89 (Animate Dead): the Aura that enchants a creature card in a graveyard, swaps its enchant ability, returns the card and has the creature sacrificed when it leaves.
  'noun.card-in-a-graveyard': permanent((e) => `Enchant ${e}`),
  'noun.put-onto-with-self': permanent(
    (e) =>
      `When ~ enters, it loses "enchant creature card in a graveyard" and gains "enchant ${e}."`,
  ),
  'condition.it-on-battlefield': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
  'condition.cards-exiled-with-self': permanent(
    (e) => `At the beginning of your end step, if ${e}, you gain 1 life.`,
  ),
  'effect.aura-swaps-enchant': permanent((e) => `When ~ enters, ${e}`),
  'effect.return-enchanted-card-attach': permanent((e) => `When ~ enters, ${cap(e)}.`),
  'effect.controller-sacrifices-linked': permanent((e) => `When ~ leaves the battlefield, ${e}.`),
  'condition.and': permanent((e) => `At the beginning of your end step, if ${e}, draw a card.`),
  'condition.prime-number-of': permanent(
    (e) => `At the beginning of your end step, if ${e}, draw a card.`,
  ),
  'noun.target-creature-token': spell((e) => `${cap(e)} can't be blocked this turn.`),
  'noun.commander-creatures-you-own': permanent((e) => `${cap(e)} have hexproof.`),
  'noun.commanders-you-control': permanent((e) => `${cap(e)} have hexproof.`),
  'noun.that-token': spell(
    (e) =>
      `Create a 3/3 blue Robot Warrior artifact creature token. Put two +1/+1 counters on ${e}.`,
  ),
  'amount.for-each-card-type-discarded': spell(
    (e) =>
      `Draw X cards, then discard X cards. Create a 1/1 white Spirit creature token with flying ${e}.`,
  ),
  'trigger.combat-damage-batch-to-you': permanent((e) => `Whenever ${e}, you gain 1 life.`),
  'effect.tap-and-stun-those-creatures': permanent(
    (e) =>
      `Whenever one or more creatures deal combat damage to you while you're the monarch, ${e}.`,
  ),
  'noun.target-spell-or-creature': spell((e) => `Return ${e} to its owner's hand.`),
  'effect.player-reveals-until-you-put': permanent((e) => `When ~ enters, ${e}.`),
  'effect.controller-reveals-until-puts': spell(
    (e) => `Put target creature on the bottom of its owner's library. ${cap(e)}.`,
  ),
  'amount.where-x-exiled-creatures': spell((e) => `Exile all creatures. Incubate X, ${e}.`),
  'effect.incubate': spell((e) => `Exile all creatures. ${cap(e)}.`),
  // Adapt (issue 121): the keyword action stands as an instruction.
  'effect.adapt': permanent((e) => `When ~ enters, ${e}.`),
  // Issue 81 (Jace, Multiverse Architect): the payer is the player whose combat it is.
  'effect.pay-or-cant-attack-planeswalkers': permanent(
    (e) => `At the beginning of combat on each opponent's turn, ${e}.`,
  ),
  'effect.return-to-battlefield-delayed': permanent((e) => `Whenever ~ dies, ${e}.`),
  // Multiverse Reforged deck (issue 81): "that many" is the creatures the exile before it exiled.
  'effect.reveal-until-that-many': spell((e) => `Exile all creatures you control, then ${e}.`),
  // Ahoy Mateys deck, group 8: the condition of the card's own permission to be cast from the graveyard, and the noun of the targets the choice names.
  'condition.control-at-least-subtypes': permanent(
    (e) => `You may cast this card from your graveyard as long as ${e}.`,
  ),
  'noun.target-card-in-a-graveyard-this-turn': spell(
    (e) => `Choose ${e}. Put that card into its owner's hand.`,
  ),
};

function embedding(rule: PhraseRule<unknown>): Embed {
  const given = EMBED[rule.id];
  if (given !== undefined) return given;
  if (rule.family === 'effect') return spell((e) => `${cap(e)}.`);
  throw new Error(`no embedding for ${rule.id}: add one to EMBED`);
}

describe('meta test 3: every rule is reached by the full pipeline', () => {
  test.each(RULES.map((r) => [r.id, r] as const))('%s', (_id, rule) => {
    const { face, line } = embedding(rule);
    for (const example of rule.examples) {
      const text = line(example);
      const result = compileLine(text, { rules: SET, face });
      const recognised = result.ok ? result.recognised : result.failure.recognised;
      expect(recognised, `"${text}"`).toContain(rule.id);
    }
  });

  test('every rule id is among the ids the pipeline reports somewhere', () => {
    const seen = new Set<string>();
    for (const rule of RULES) {
      const { face, line } = embedding(rule);
      for (const example of rule.examples) {
        const result = compileLine(line(example), { rules: SET, face });
        for (const id of result.ok ? result.recognised : result.failure.recognised) seen.add(id);
      }
    }
    expect(RULES.map((r) => r.id).filter((id) => !seen.has(id))).toEqual([]);
  });
});

describe('the segmenter and the rules agree on what a line is', () => {
  test('every example of an ability-level rule segments as the head its family implies', () => {
    for (const rule of RULES.filter((r) => r.family === 'replacement')) {
      for (const example of rule.examples) {
        expect(segment(example, 'permanent').head, example).toBe('replacement');
      }
    }
    for (const rule of RULES.filter((r) => r.family === 'keyword')) {
      for (const example of rule.examples) {
        expect(segment(example, 'permanent').head, example).toBe('other');
      }
    }
  });
});
