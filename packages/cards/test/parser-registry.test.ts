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
  'keyword.line': asIs,
  'replacement.enters-tapped': asIs,
  'replacement.enters-with-counters': asIs,
  'replacement.enters-tapped-unless': asIs,
  'replacement.enters-tapped-unless-pays': asIs,
  'replacement.enters-tapped-unless-reveals': asIs,
  'replacement.enters-prepared': asIs,
  'static.no-maximum-hand-size': asIs,
  // Stage P24: the play rules are lines of their own.
  'static.additional-land': asIs,
  'static.look-at-top': asIs,
  'static.attack-tax': asIs,
  'static.optional-untap': asIs,
  'keyword.enchant': asIs,
  'keyword.equip': asIs,
  'keyword.kicker': asIs,
  'keyword.kicker-and-or': asIs,
  'keyword.multikicker': asIs,
  'keyword.flashback': asIs,
  // Stage P22: the named alternative costs are lines of their own.
  'keyword.overload': asIs,
  'keyword.evoke': asIs,
  'keyword.dash': asIs,
  // Stage P23: Spectacle, Unearth and Escape are lines of their own.
  'keyword.spectacle': asIs,
  'keyword.unearth': asIs,
  // Stage P40: Encore is a line of its own, like Unearth.
  'keyword.encore': asIs,
  'keyword.escape': asIs,
  // Stage P25: Echo and Cumulative upkeep are lines of their own.
  'keyword.echo': asIs,
  'keyword.cumulative-upkeep': asIs,
  // Stage P26: Suspend, Madness and Foretell are lines of their own.
  'keyword.suspend': asIs,
  'keyword.madness': asIs,
  'keyword.foretell': asIs,
  // Stage P27: Storm and Replicate are lines of their own.
  'keyword.storm': asIs,
  'keyword.replicate': asIs,
  'keyword.ward': asIs,
  'keyword.crew': asIs,
  'token.copy': spell((e) => `Create ${e}.`),
  'replacement.enters-with-counters-kicked': asIs,
  'replacement.as-enters-choose': asIs,
  'static.self-chosen-type': asIs,
  'static.attached': asIs,
  'static.permanents': asIs,
  'static.self': asIs,
  // Stage P13: what a spell costs. The statements are lines of their own.
  'static.self-cost-reduction': asIs,
  'static.spells-cost-reduction': asIs,
  'static.additional-cost': asIs,
  'static.free-cast': asIs,
  // Stage P20: power and toughness from a count; the statements are lines of their own.
  'static.pt-count': asIs,
  'static.defines-pt': asIs,
  'cost.discard': permanent((e) => `${e}: Draw a card.`),
  'cost.mill': permanent((e) => `{T}, ${e}: Add {C}.`),
  // Stage P51 (D-209): the energy cost is the payment of an "unless you pay" of a spell.
  'cost.energy': spell((e) => `Draw a card. Then discard a card at random unless you pay ${e}.`),
  'condition.control-commander': permanent(
    (e) => `If ${e}, you may cast ~ without paying its mana cost.`,
  ),
  'amount.for-each': spell((e) => `Draw a card ${e}.`),
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
  'cost.remove-counters': permanent((e) => `${e}: Draw a card.`),
  'restriction.sorcery': permanent((e) => `{1}: Draw a card. ${cap(e)}`),
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
  'noun.library-card': spell(
    (e) =>
      `Search your library for ${e}, put ${e.startsWith('up to') ? 'them' : 'it'} into your hand, then shuffle.`,
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
  'noun.any-target': spell((e) => `~ deals 1 damage to ${e}.`),
  'noun.player': spell((e) => `~ deals 1 damage to ${e}.`),
  'noun.target-spell': spell((e) => `Counter ${e}.`),
  'noun.target-graveyard-card': spell((e) => `Exile ${e}.`),
  'noun.player-graveyard': spell((e) => `Exile ${e}.`),
  'noun.all-graveyard-cards': spell((e) => `Exile ${e}.`),
  'noun.all-graveyards': spell((e) => `Exile ${e}.`),
  'noun.target-permanent': spell((e) => `Destroy ${e}.`),
  'noun.all-permanents': spell((e) => `Destroy ${e}.`),
  'noun.each-permanent': spell((e) => `Destroy ${e}.`),
  'amount.number': spell((e) => `Draw ${e} cards.`),
  'amount.x': spell((e) => `Draw ${e} cards.`),
  'amount.article': spell((e) => `Draw ${e} card.`),
  'amount.power-of': spell((e) => `Exile target creature. You gain life ${e}.`),
  'amount.mana-value-of': spell((e) => `Exile target creature. You lose life ${e}.`),
  'amount.times-kicked': spell((e) => `Draw a card ${e}.`),
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
  // Stage P21: the life lost by the instruction before it.
  'amount.life-lost-this-way': spell((e) => `Each opponent loses 1 life. You gain life ${e}.`),
  // Stage P19: the header line of a modal spell, followed by two bullets.
  // Stage P29 (D-133): the subjects of triggers and statics, "that player", "that much", the costs that tap permanents, the
  // conditions of a static ability, the death replacement and the permission to cast from the graveyard.
  'trigger.attacks-you': whenever,
  'trigger.dealt-damage': whenever,
  'noun.that-player': permanent((e) => `Whenever an opponent draws a card, ${e} loses 1 life.`),
  'amount.that-much': permanent((e) => `Whenever ~ is dealt damage, you gain ${e} life.`),
  'noun.subtype-union': permanent((e) => `${cap(e)} get +1/+1.`),
  'cost.tap-permanents': permanent((e) => `${e}: Draw a card.`),
  'condition.control-your-commander': permanent((e) => `As long as ${e}, ~ gets +1/+1.`),
  'condition.life-total': permanent((e) => `As long as ${e}, ~ gets +1/+1.`),
  'condition.this-tapped': permanent((e) => `As long as ${e}, ~ gets +1/+1.`),
  'static.each': asIs,
  'static.conditional-prefix': asIs,
  'static.conditional-suffix': asIs,
  'static.cast-from-graveyard': asIs,
  'replacement.would-die': asIs,
  // Stage P30 (D-135, D-136): the recursion slice. "Gift a card" is a line of its own; the conditions begin a sentence or follow the
  // trigger; "enters untapped" and "dies or is put into exile" are triggers; the reduction of a cost ends an activated ability.
  'keyword.gift': asIs,
  'condition.it-matches': spell(
    (e) => `Return target creature card from your graveyard to your hand. If ${e}, draw a card.`,
  ),
  'condition.gift-promised': permanent((e) => `When ~ enters, if ${e}, you gain 1 life.`),
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
  'cost.loyalty': permanent((e) => `${e}: Draw a card.`),
  'cost.put-counters': permanent((e) => `{T}, ${e}: Draw a card.`),
  'cost.return-to-hand': permanent((e) => `{U}, ${e}: Draw a card.`),
  'trigger.combat-damage-batch': whenever,
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
  // Stage P33 (D-149, D-150): the Angels slice. The statements and the replacement are lines of their own; the triggers follow "Whenever";
  // the conditions follow "if" (an intervening "if", a trailing "if" or the "Activate only if" of an ability); the nouns are operands.
  'replacement.life-gain-bonus': asIs,
  'static.player-hexproof': asIs,
  'static.cant-lose-win': asIs,
  'static.prevent-damage-to-self': asIs,
  'static.cant-cast-early': asIs,
  'static.block-tax': asIs,
  'static.others-enter-with-counters': asIs,
  'static.tap-alt-cost': asIs,
  'trigger.life-gained': whenever,
  'trigger.counters-added': whenever,
  'trigger.attack-batch': whenever,
  'condition.had-counters': permanent(
    (e) =>
      `Whenever another permanent you control leaves the battlefield, if ${e}, you gain 1 life.`,
  ),
  'condition.those-attacked-you': permanent(
    (e) => `Whenever another player attacks with two or more creatures, they draw a card if ${e}.`,
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
  'replacement.redirect-damage': asIs,
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
  // Stage P69 (D-252): the Bruna deck.
  'condition.life-above-starting': permanent(
    (e) => `At the beginning of your end step, draw a card if ${e}.`,
  ),
  // Stage P69 (D-258): "sacrifice it unless you return ..." ends the one instruction of an enters trigger.
  'condition.unless-return': permanent((e) => `When ~ enters, sacrifice it ${e}.`),
  'condition.life-gained-this-turn': permanent(
    (e) => `At the beginning of your end step, if ${e}, you gain 1 life.`,
  ),
  'condition.entered-this-turn': permanent((e) => `As long as ${e}, ~ gets +1/+1.`),
  'noun.each-other-opponent': spell((e) => `~ deals 1 damage to ${e}.`),
  'noun.other-targets': spell((e) => `~ deals 1 damage to any target and 1 damage to ${e}.`),
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
  'modal.choose-not-repeated': spell((e) => `${e}\n• Draw a card.\n• You gain 1 life.`),
  // Stage P37 (D-180): the Korvold deck's triggers and small statics. The statics are lines of their own; the trigger follows "When"; the
  // conditions follow "As long as" or "If"; the nouns are operands of damage; the amount follows "gets +1/+1".
  'trigger.cycled': permanent((e) => `When ${e}, you gain 1 life.`),
  'condition.attached-to': permanent(
    (e) => `As long as ${e}, your opponents can't cast spells during your turn.`,
  ),
  'condition.put-this-way': spell(
    (e) => `You may put a land card from your hand onto the battlefield. If ${e}, you gain 4 life.`,
  ),
  'noun.player-or-planeswalker': spell((e) => `~ deals 1 damage to ${e}.`),
  'noun.each-permanent-of-player': spell((e) => `~ deals 1 damage to target player and ${e}.`),
  'amount.for-each-color': permanent((e) => `Equipped creature gets +1/+1 ${e}.`),
  'static.opponents-cant-cast': asIs,
  'static.group-enters-untapped': asIs,
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
  // Stage P48 (D-205): the Vraska deck's text and token slice. The trigger follows "When"; the noun follows a sentence about several targets.
  'trigger.enters-and-cast': permanent((e) => `When ${e}, you gain 1 life.`),
  'noun.each-of-them': spell((e) => `Tap up to two target creatures. Put a stun counter on ${e}.`),
  // Stage P49 (D-206): the Vraska deck's triggers, conditions and statics. A trigger follows "Whenever"; a condition follows the trigger it conditions or
  // "Then if" in a spell; the static is a line of its own.
  'keyword.job-select': asIs,
  'trigger.becomes-untapped': whenever,
  'trigger.dies-batch': whenever,
  'trigger.discarded': whenever,
  'condition.mana-spent-at-least': permanent(
    (e) => `Whenever you cast a noncreature spell, if ${e}, you gain 1 life.`,
  ),
  'condition.card-left-graveyard': permanent(
    (e) => `At the beginning of each end step, if ${e}, you gain 1 life.`,
  ),
  // Stage P67 (D-220): trigger doubling is a line of its own, and so is the equip of a creature type.
  'static.triggers-additional-time': asIs,
  'keyword.equip-quality': asIs,
  // Stage P70 (D-259): the equip of a commander is a line of its own.
  'keyword.equip-commander': asIs,
  // Stage P66 (D-219): the replacement of the creation of tokens is a line of its own.
  'replacement.tokens-instead': asIs,
  // Stage P65 (D-218): the batch triggers, magecraft and the attackers of the opponents.
  'trigger.attack-one-or-more': whenever,
  'trigger.enters-one-or-more': whenever,
  'trigger.cast-or-copy': whenever,
  'noun.attacking-opponents': permanent((e) => `When ~ enters, ${e} get +1/+0 until end of turn.`),
  // Stage P64 (D-217): the nouns, effects and conditions of the Vraska EDHREC deck's second group.
  'noun.token-permanents': permanent((e) => `${cap(e)} have haste.`),
  // Stage P63 (D-216): the Vraska EDHREC deck.
  'condition.created-token': permanent(
    (e) => `At the beginning of each end step, if ${e}, you gain 1 life.`,
  ),
  'condition.cast-from-graveyard': spell(
    (e) =>
      `Create a 3/3 blue Robot Warrior artifact creature token. Then if ${e}, put two +1/+1 counters on that token.`,
  ),
  'static.during-your-turn': asIs,
  // Stage P50 (D-207): the costs, nouns and conditions of the Vraska deck's third group.
  'condition.it-targets': permanent((e) => `~ costs {3} less to cast if ${e}.`),
  'cost.discard-filtered': permanent((e) => `{1}, {T}, ${e}: Draw a card.`),
  'noun.target-triggered-ability-or-spell': spell((e) => `Counter ${e}.`),
  // Stage P52 (D-210): the players an effect asks, and what the instructions before them did.
  'condition.player-declines': permanent(
    (e) => `When ~ enters, target opponent may have you draw a card. If ${e}, you gain 1 life.`,
  ),
  'condition.discarded-this-way': permanent(
    (e) =>
      `At the beginning of your end step, each player may discard a card. If ${e}, you gain 1 life.`,
  ),
  'noun.each-player-discarded': permanent(
    (e) =>
      `At the beginning of your end step, each player may discard a card. ${cap(e)} draws a card.`,
  ),
  'amount.milled-value-this-way': permanent(
    (e) => `When ~ enters, you mill three cards, then ~ deals damage to target opponent ${e}.`,
  ),
  // Stage P68 (D-229): the Hofri Ghostforge deck. The triggers follow "Whenever"; the conditions follow a trigger or "As long as"; the costs are costs of an
  // activated ability; the rider follows the "Add" sentence; the amount follows a pump; the static is a line of its own.
  'trigger.cards-leave-graveyard': whenever,
  'trigger.cards-exiled-library-graveyard': whenever,
  'trigger.cast-nth': whenever,
  'trigger.enters-one-or-more-creatures': whenever,
  'trigger.you-create-tokens': whenever,
  'condition.cards-in-graveyard': permanent((e) => `As long as ${e}, ~ has flying.`),
  'condition.opponents-control-at-least': permanent((e) => `~ enters tapped unless ${e}.`),
  'condition.that-player-more-lands': permanent(
    (e) => `Whenever a land an opponent controls enters, if ${e}, you gain 1 life.`,
  ),
  'cost.discard-this': permanent((e) => `{1}, ${e}: Draw a card.`),
  'cost.exile-this': permanent((e) => `{1}, {T}, ${e}: Draw a card.`),
  // Group 5 (D-233): the exile of cards of the graveyard as a cost.
  'cost.exile-graveyard-cards': permanent((e) => `{1}, {T}, ${e}: Draw a card.`),
  'effect.mana-rider-scry-commander': permanent((e) => `{T}: Add {G}. ${cap(e)}.`),
  'amount.for-each-commander-cast': permanent((e) => `Creatures you control get +1/+1 ${e}.`),
  'static.untap-in-others-step': asIs,
  // Group 4 (D-232): the permission to play from the graveyard is a line of its own.
  'static.graveyard-play-once-each-turn': asIs,
  // Group 4 (D-208): the rider of the mana a land adds follows the "Add" sentence of its mana ability.
  'effect.mana-rider-scry': permanent((e) => `{T}: Add {G}. ${cap(e)}.`),
  // Group 2 (D-230).
  'noun.each-permanent-that-is': spell((e) => `Put two +1/+1 counters on ${e}.`),
  // D-931: a target of two zones, read by `exile`.
  'noun.target-creatures-battlefield-or-graveyard': spell((e) => `Exile ${e}.`),
  'amount.for-each-own-nontoken-destroyed': spell(
    (e) => `Destroy all creatures. Then create a 3/2 red and white Spirit creature token ${e}.`,
  ),
  'effect.create-copy-spirit': permanent(
    (e) => `Whenever another nontoken creature you control dies, exile it. If you do, ${e}`,
  ),
  'noun.that-token': spell(
    (e) =>
      `Create a 3/3 blue Robot Warrior artifact creature token. Put two +1/+1 counters on ${e}.`,
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
