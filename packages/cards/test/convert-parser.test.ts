import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RULES,
  matchAbility,
  NO_RULE,
  normalizeOracleText,
  parseFaceText,
  splitAbilities,
  stripReminderText,
} from '../src/index';

const kw = (kind: string) => ({ kind: 'keyword', keyword: { kind } });
const tapAdd = (production: unknown) => ({
  kind: 'mana',
  cost: [{ kind: 'tap' }],
  production,
});
const paidAdd = (symbols: string[], production: unknown) => ({
  kind: 'mana',
  cost: [{ kind: 'mana', symbols }, { kind: 'tap' }],
  production,
});

describe('normalization', () => {
  const opts = { name: 'SYNTHETIC Test Card', legendary: false };

  test('reminder text is removed with the space before it', () => {
    expect(stripReminderText('Flying (This creature can block fliers.)')).toBe('Flying');
    expect(stripReminderText('({T}: Add {G}.)')).toBe('');
    expect(stripReminderText('A (b (nested) c) d')).toBe('A d');
  });

  test('a line that is only reminder text disappears', () => {
    expect(normalizeOracleText('({T}: Add {W}.)', opts)).toBe('');
    expect(normalizeOracleText('Flying\n(Reminder.)\nHaste', opts)).toBe('Flying\nHaste');
  });

  test('the full name becomes ~', () => {
    expect(normalizeOracleText('SYNTHETIC Test Card deals 3 damage.', opts)).toBe(
      '~ deals 3 damage.',
    );
  });

  test('the short name of a legendary card becomes ~, a non-legendary one keeps it', () => {
    const name = 'Isamaru, Hound of Konda';
    expect(
      normalizeOracleText('Isamaru attacks. Isamaru, Hound of Konda blocks.', {
        name,
        legendary: true,
      }),
    ).toBe('~ attacks. ~ blocks.');
    expect(normalizeOracleText('Isamaru attacks.', { name, legendary: false })).toBe(
      'Isamaru attacks.',
    );
  });

  test('a name inside a longer word is left alone', () => {
    expect(
      normalizeOracleText('Obsidian and Ob Nixilis.', { name: 'Ob, Test', legendary: true }),
    ).toBe('Obsidian and ~ Nixilis.');
  });

  test('names with apostrophes and punctuation are matched literally', () => {
    expect(
      normalizeOracleText("Urza's Tower taps for mana.", {
        name: "Urza's Tower",
        legendary: false,
      }),
    ).toBe('~ taps for mana.');
    expect(normalizeOracleText('A+B deals damage.', { name: 'A+B', legendary: false })).toBe(
      '~ deals damage.',
    );
  });

  test.each([
    'this creature',
    'This artifact',
    'this enchantment',
    'this land',
    'this permanent',
    'this spell',
    'this planeswalker',
  ])('%s becomes ~', (phrase) => {
    expect(normalizeOracleText(`Sacrifice ${phrase}.`, opts)).toBe('Sacrifice ~.');
  });

  test('"this" before another noun is not a self reference', () => {
    expect(normalizeOracleText('This turn, draw.', opts)).toBe('This turn, draw.');
  });

  test('spaces collapse and blank lines vanish', () => {
    expect(normalizeOracleText('  Flying   \n\n  Haste  ', opts)).toBe('Flying\nHaste');
  });
});

describe('splitting abilities', () => {
  test('one ability per line', () => {
    expect(splitAbilities('Flying\n{T}: Add {G}.')).toEqual(['Flying', '{T}: Add {G}.']);
    expect(splitAbilities('')).toEqual([]);
  });

  test('bullets stay with their "Choose one" line', () => {
    expect(splitAbilities('Choose one —\n• Draw a card.\n• Gain 2 life.\nFlying')).toEqual([
      'Choose one —\n• Draw a card.\n• Gain 2 life.',
      'Flying',
    ]);
  });
});

describe('rule keyword.line', () => {
  test.each([
    ['Flying', ['flying']],
    ['flying', ['flying']],
    ['First strike', ['firstStrike']],
    ['Double strike', ['doubleStrike']],
    ['Deathtouch', ['deathtouch']],
    ['Defender', ['defender']],
    ['Haste', ['haste']],
    ['Indestructible', ['indestructible']],
    ['Lifelink', ['lifelink']],
    ['Menace', ['menace']],
    ['Reach', ['reach']],
    ['Trample', ['trample']],
    ['Vigilance', ['vigilance']],
    ['Flying, vigilance', ['flying', 'vigilance']],
    ['Flying, first strike, lifelink', ['flying', 'firstStrike', 'lifelink']],
    ['Flying; trample', ['flying', 'trample']],
    ['Trample,haste', ['trample', 'haste']],
    // Enforced by the engine since M5 (CR 702.8 Flash, 702.11 Hexproof, 702.18 Shroud).
    ['Flash', ['flash']],
    ['Hexproof', ['hexproof']],
    ['Shroud', ['shroud']],
  ])('parses %j', (text, kinds) => {
    const m = matchAbility(text);
    expect(m).toMatchObject({ ok: true, ruleId: 'keyword.line' });
    if (m.ok) expect(m.abilities).toEqual(kinds.map(kw));
  });

  test.each([
    ['Banding', 'Banding'],
    ['Flyingx', 'Flyingx'],
    ['Flying.', '.'],
  ])('does not parse %j (stops at %j)', (text, stoppedAt) => {
    const m = matchAbility(text);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.stoppedAt).toBe(stoppedAt);
  });

  test('a supported keyword followed by an unsupported one stops at the second', () => {
    const m = matchAbility('Flying, ward—Discard a card.');
    expect(m).toEqual({
      ok: false,
      stoppedAt: 'ward—Discard a card.',
      closestRule: 'keyword.line',
    });
    expect(matchAbility('Flying, vigilance, banding')).toEqual({
      ok: false,
      stoppedAt: 'banding',
      closestRule: 'keyword.line',
    });
  });

  test('text that ends where more was expected stops at the empty remainder', () => {
    expect(matchAbility('Flying,')).toEqual({
      ok: false,
      stoppedAt: '',
      closestRule: 'keyword.line',
    });
  });
});

describe('rule mana.tap-add', () => {
  test.each([
    ['{T}: Add {G}.', tapAdd({ kind: 'fixed', mana: ['G'] })],
    ['{T}: Add {C}{C}.', tapAdd({ kind: 'fixed', mana: ['C', 'C'] })],
    ['{T}: Add {W}{U}{B}{R}{G}.', tapAdd({ kind: 'fixed', mana: ['W', 'U', 'B', 'R', 'G'] })],
    ['{t}: add {g}.', tapAdd({ kind: 'fixed', mana: ['G'] })],
    ['{T}: Add one mana of any color.', tapAdd({ kind: 'anyColor' })],
    [
      "{T}: Add one mana of any color in your commander's color identity.",
      tapAdd({ kind: 'commanderIdentity' }),
    ],
    ['{T}: Add {G} or {U}.', tapAdd({ kind: 'oneOf', colors: ['G', 'U'] })],
    ['{T}: Add {W}, {U}, or {B}.', tapAdd({ kind: 'oneOf', colors: ['W', 'U', 'B'] })],
    ['{1}, {T}: Add {G}{G}.', paidAdd(['1'], { kind: 'fixed', mana: ['G', 'G'] })],
    ['{2}{B}, {T}: Add {U}{B}.', paidAdd(['2', 'B'], { kind: 'fixed', mana: ['U', 'B'] })],
    // Stage P14: a choice among combinations (stored in W, U, B, R, G, C order), a hybrid cost and a
    // production that reads the lands.
    [
      '{T}: Add {R}{R}, {R}{W}, or {W}{W}.',
      tapAdd({
        kind: 'combination',
        options: [
          ['R', 'R'],
          ['W', 'R'],
          ['W', 'W'],
        ],
      }),
    ],
    [
      '{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}.',
      paidAdd(['R/W'], {
        kind: 'combination',
        options: [
          ['R', 'R'],
          ['W', 'R'],
          ['W', 'W'],
        ],
      }),
    ],
    [
      '{T}: Add one mana of any type that a land you control could produce.',
      tapAdd({
        kind: 'couldProduce',
        lands: { types: ['land'], controller: 'you' },
        anyType: true,
      }),
    ],
  ])('parses %j', (text, ability) => {
    const m = matchAbility(text);
    expect(m).toMatchObject({ ok: true, ruleId: 'mana.tap-add' });
    if (m.ok) expect(m.abilities).toEqual([ability]);
  });

  test.each([
    ['{T}: Add {G} or {U}', ''],
    ['{T}: Add {X}.', '{X}.'],
    ['{T}: Add {2}.', '{2}.'],
    ['{X}, {T}: Add {G}{G}.', '{X}, {T}: Add {G}{G}.'],
    ['{G/P}, {T}: Add {G}{G}.', '{G/P}, {T}: Add {G}{G}.'],
    [
      '{T}: Add one mana of any type that a land you control could produce, then draw a card.',
      '{T}: Add one mana of any type that a land you control could produce, then draw a card.',
    ],
  ])('does not parse %j (stops at %j)', (text, stoppedAt) => {
    const m = matchAbility(text);
    expect(m.ok).toBe(false);
    if (!m.ok) {
      expect(m.stoppedAt).toBe(stoppedAt);
    }
  });

  test('an ability that adds mana and does more is read, but is not a mana ability (CR 605.1a)', () => {
    // The text is fully understood; the engine has no activated abilities yet, so the diagnostic
    // names what is missing instead of pointing at a word.
    const m = matchAbility('{T}: Add {G}. Draw a card.');
    expect(m).toEqual({
      ok: false,
      stoppedAt: '{T}: Add {G}. Draw a card.',
      closestRule: 'ability.activated',
    });
    const parsed = parseFaceText(
      '{T}: Add {G}. Draw a card.',
      { name: 'SYNTHETIC X', legendary: false },
      0,
    );
    expect(parsed.unparsed[0]).toMatchObject({
      reason: 'notRunnable',
      recognised: ['cost.tap', 'effect.add-mana', 'effect.draw', 'amount.article'],
    });
  });

  test('the closest rule is the one that got farthest', () => {
    expect(matchAbility('{T}: Add {R}{W}, {W}{R}, or {R}{R}.')).toMatchObject({
      ok: false,
      closestRule: 'ability.activated',
    });
  });
});

describe('unmatched abilities', () => {
  test('no rule consumed anything: closest rule is none and stoppedAt is the whole text', () => {
    expect(matchAbility('Destroy target creature.')).toEqual({
      ok: false,
      stoppedAt: 'Destroy target creature.',
      closestRule: NO_RULE,
    });
  });

  test('rule ids are stable and unique', () => {
    expect(DEFAULT_RULES.map((r) => r.id)).toEqual([
      'keyword.line',
      'keyword.cycling',
      'keyword.typecycling',
      'keyword.enchant',
      'keyword.equip',
      'keyword.equip-quality',
      'keyword.equip-commander',
      'keyword.kicker',
      'keyword.kicker-and-or',
      'keyword.multikicker',
      'keyword.flashback',
      'keyword.overload',
      'keyword.evoke',
      'keyword.dash',
      'keyword.spectacle',
      'keyword.unearth',
      'keyword.encore',
      'keyword.escape',
      'keyword.echo',
      'keyword.cumulative-upkeep',
      'keyword.suspend',
      'keyword.madness',
      'keyword.foretell',
      'keyword.miracle',
      'keyword.storm',
      'keyword.replicate',
      'keyword.gift',
      'keyword.living-weapon',
      'keyword.job-select',
      'keyword.can-be-commander',
      'keyword.escalate',
      'keyword.ward',
      'keyword.crew',
      'replacement.enters-tapped',
      'replacement.as-enters-choose',
      'replacement.enters-with-counters',
      'replacement.enters-tapped-unless',
      'replacement.enters-tapped-unless-pays',
      'replacement.enters-tapped-unless-reveals',
      'replacement.enters-prepared',
      'replacement.enters-with-counters-kicked',
      'replacement.would-die',
      'replacement.life-gain-bonus',
      'replacement.enters-as-copy',
      'replacement.redirect-damage',
      'replacement.tokens-instead',
      'replacement.skip-draw',
      'cost.tap',
      'cost.tap-permanents',
      'cost.mana-hybrid',
      'cost.mana-x',
      'cost.mana',
      'cost.sacrifice',
      'cost.discard',
      'cost.discard-filtered',
      'cost.discard-this',
      'cost.exile-this',
      'cost.exile-graveyard-cards',
      'cost.mill',
      'cost.energy',
      'cost.pay-life',
      'cost.pay-life-amount',
      'cost.pay-life-that-much',
      'cost.pay-x-life',
      'cost.remove-counters',
      'cost.put-counters',
      'cost.return-to-hand',
      'cost.loyalty',
      'trigger.enters-and-cast',
      'trigger.or',
      'trigger.or-subjects',
      'trigger.becomes-target',
      'trigger.cast',
      'trigger.landfall',
      'trigger.cycled',
      'trigger.cast-self',
      'trigger.you-attack',
      'trigger.ring-tempts',
      'trigger.taps-for-mana',
      'trigger.life-gained',
      'trigger.counters-added',
      'trigger.attack-batch',
      'trigger.attack-one-or-more',
      'trigger.enters-one-or-more',
      'trigger.cast-or-copy',
      'trigger.cards-leave-graveyard',
      'trigger.cards-exiled-library-graveyard',
      'trigger.cast-nth',
      'trigger.enters-one-or-more-creatures',
      'trigger.you-create-tokens',
      'trigger.leaves-to',
      'trigger.enters-state',
      'trigger.combat-damage-batch',
      'trigger.tapped-for-mana',
      'trigger.state',
      'trigger.enters-during',
      'trigger.enters',
      'trigger.dies',
      'trigger.attacks-you',
      'trigger.attacks-alone',
      'trigger.attacks-while',
      'trigger.attacks-first-time',
      'trigger.attacks',
      'trigger.becomes-tapped',
      'trigger.becomes-untapped',
      'trigger.blocks',
      'trigger.becomes-blocked',
      'trigger.sacrifice',
      'trigger.upkeep',
      'trigger.end-step',
      'trigger.step',
      'trigger.drawn',
      'trigger.combat-damage',
      'trigger.dealt-damage',
      'trigger.leaves',
      'trigger.noncombat-damage',
      'trigger.dies-batch',
      'trigger.discarded',
      'trigger.cycled-or-discarded',
      'trigger.chapter',
      'condition.same-name',
      'condition.had-counters',
      'condition.those-attacked-you',
      'condition.life-gained-this-turn',
      'condition.life-above-starting',
      'condition.unless-return',
      'condition.own-and-control-named',
      'condition.die-result',
      'condition.this-in-your-graveyard',
      'condition.control-at-least',
      'condition.control-a',
      'condition.control-at-most',
      'condition.control-none',
      'condition.control-land-type',
      'condition.opponents-at-least',
      'condition.control-commander',
      'condition.designation',
      'condition.amount-count',
      'condition.total-stat',
      'condition.opponent-has-more',
      'condition.control-your-commander',
      'condition.life-total',
      'condition.this-tapped',
      'condition.attached-to',
      'condition.paired',
      'condition.it-matches',
      'condition.its-mana-value',
      'condition.gift-promised',
      'condition.opponent-controls-at-least',
      'condition.control-greatest',
      'condition.dont-control-a',
      'condition.object-has-keyword',
      'condition.attacking-most-life',
      'condition.attackers-total-power',
      'condition.player-dealt-damage',
      'condition.entered-this-turn',
      'condition.put-this-way',
      'condition.your-main-phase',
      'condition.ring-bearer',
      'condition.it-targets',
      'condition.mana-spent-at-least',
      'condition.card-left-graveyard',
      'condition.cast-from-graveyard',
      'condition.mana-spent-or-more',
      'condition.spells-cast-this-turn',
      'condition.cards-in-library',
      'condition.player-declines',
      'condition.discarded-this-way',
      'condition.discarded-spell-this-way',
      'condition.created-token',
      'condition.cards-in-graveyard',
      'condition.that-player-more-lands',
      'condition.opponents-control-at-least',
      'condition.kicked',
      'condition.unless-pays',
      'condition.unless-escaped',
      'condition.if-you-do',
      'effect.damage',
      'effect.damage-count',
      'effect.bite',
      'effect.double-pt',
      'effect.fight',
      'effect.fight-each',
      'effect.excess-damage',
      'effect.reveal-until',
      'effect.cast-free',
      'effect.for-each-create',
      'effect.damage-divided',
      'effect.exile-top',
      'effect.may-play',
      'effect.extra-combat',
      'effect.discover',
      'effect.discover-treasures',
      'effect.exile-until-cast',
      'effect.shuffle-reveal-top',
      'effect.look-top-take',
      'effect.behold',
      'effect.pay-any-amount',
      'effect.mana-rider',
      'effect.mana-rider-scry',
      'effect.mana-rider-scry-commander',
      'effect.damage-other-targets',
      'effect.discard-any-number',
      'effect.exile-top-face-down',
      'effect.may-look-and-play',
      'effect.it-has-ability',
      'effect.extra-combat-after',
      'effect.gain-keyword-targets',
      'effect.return-chosen-card',
      'effect.shuffle-graveyard',
      'effect.require-attack',
      'effect.shuffle-self-and-graveyard',
      'effect.mana-rider-copy',
      'effect.copy-spell-for-each',
      'effect.cast-graveyard-card',
      'effect.extra-beginning-phase',
      'effect.amass',
      'effect.gain-control',
      'effect.vote',
      'effect.ring-tempts',
      'effect.life-total-becomes',
      'effect.empower-jace',
      'effect.get-emblem',
      'effect.lead-becomes-creature',
      'effect.damage-by-it',
      'effect.damage-it',
      'effect.destroy',
      'effect.meld',
      'effect.flicker',
      'effect.return-delayed',
      'effect.return-at-upkeep',
      'effect.exile',
      'effect.return',
      'effect.counter-unless',
      'effect.counter',
      'effect.copy-spell',
      'effect.change-target',
      'effect.proliferate',
      'effect.exile-per-opponent',
      'effect.destroy-per-opponent',
      'effect.once-each-turn',
      'effect.spend-only',
      'effect.choose-graveyard-cards',
      'effect.remove-all-counters',
      'effect.gain-keyword-while-remains',
      'effect.gain-keyword-while-controlling',
      'effect.put-exiled-with',
      'effect.choose-target',
      'effect.counters-if-it-is',
      'effect.connive',
      'effect.become-copy',
      'effect.target-becomes-copy',
      'effect.gain-each-of-two',
      'effect.copy-each',
      'effect.do-once-each-turn',
      'effect.pay-x-at-most',
      'effect.return-exiled-cards-to-hand',
      'effect.roll-die',
      'effect.gain-static-ability',
      'effect.choose-graveyard-pair',
      'effect.gain-class-level',
      'effect.exile-random-and-play',
      'effect.phase-out',
      'effect.become-copy-of-those-cards',
      'effect.opponent-splits-exiled',
      'effect.for-each-player-choose-keep',
      'effect.each-exiles-then-counters',
      'effect.exiled-owner-creates-token',
      'effect.look-put-total',
      'effect.create-copy-spirit',
      'effect.return-exiled-card',
      'effect.player-adds-mana',
      'effect.copy-this-spell',
      'effect.becomes-in-addition',
      'effect.reveal-separate-piles',
      'effect.tap-chosen',
      'effect.untap-chosen',
      'effect.untap-those',
      'effect.deals-damage-and',
      'effect.reselect-attack',
      'effect.tap',
      'effect.untap',
      'effect.add-additional-mana',
      'effect.add-mana',
      'effect.choose-color',
      'effect.delayed-draw',
      'effect.delayed-draw-up-to',
      'effect.delayed-mana',
      'effect.player',
      'effect.draw',
      'effect.discard-hand',
      'effect.discard',
      'effect.life',
      'effect.manifest',
      'effect.mill',
      'effect.shuffle',
      'effect.sacrifice',
      'effect.add-counters',
      'effect.add-counters-number-of',
      'effect.create-token',
      'effect.investigate',
      'effect.pump',
      'effect.pump-all',
      'effect.pump-each',
      'effect.gain-keyword',
      'effect.gain-keyword-all',
      'effect.gain-keyword-each',
      'effect.lead-gain',
      'effect.lead-gain-all',
      'effect.restrict',
      'effect.restrict-all',
      'effect.restrict-self',
      'effect.restrict-while-controlling',
      'effect.loses-abilities',
      'effect.becomes',
      'effect.each-becomes',
      'effect.base-pt',
      'effect.lead-becomes',
      'effect.lead-becomes-target',
      'effect.have-base-pt',
      'effect.search',
      'effect.search-by',
      'effect.prevent-all',
      'effect.prevent-next',
      'effect.transform',
      'effect.attach',
      'effect.scry',
      'effect.surveil',
      'effect.look-reorder',
      'effect.look-take',
      'effect.look-take-bottom',
      'effect.look-split',
      'effect.put-hand-top',
      'effect.put-library',
      'effect.put-battlefield',
      'effect.put-from-hand',
      'effect.put-library-nth',
      'effect.may-cast',
      'effect.return-self-attached',
      'effect.return-self',
      'effect.regenerate',
      'effect.cant-be-regenerated',
      'effect.pay',
      'duration.until-end-of-turn',
      'restriction.sorcery',
      'restriction.if',
      'restriction.once-each-turn',
      'restriction.cost-reduction',
      'restriction.cost-reduced-by',
      'token.predefined',
      'token.custom',
      'token.named-legendary',
      'token.number-of',
      'token.copy',
      'noun.any-target',
      'noun.player-or-planeswalker',
      'noun.each-permanent-of-player',
      'noun.you-and-player',
      'noun.each-other-player',
      'noun.defending-player',
      'noun.that-player',
      'noun.they',
      'noun.each-player-discarded',
      'noun.each-player-attacked',
      'noun.paired-creatures',
      'noun.player',
      'noun.target-spell',
      'noun.target-commander',
      'noun.any-number-targets',
      'noun.each-other-opponent',
      'noun.other-targets',
      'noun.one-or-two-targets',
      'noun.that-object',
      'noun.target-creatures-battlefield-or-graveyard',
      'noun.target-graveyard-card',
      'noun.target-cards-in-your-graveyard',
      'noun.player-graveyard',
      'noun.all-graveyard-cards',
      'noun.all-graveyards',
      'noun.target-permanent',
      'noun.all-permanents',
      'noun.each-permanent-that-is',
      'noun.each-type-union',
      'noun.each-permanent',
      'noun.token-permanents',
      'noun.attacking-opponents',
      'noun.subtype-token-permanents',
      'noun.subtype-union',
      'noun.plain-permanents',
      'noun.it',
      'noun.each-of-them',
      'noun.that-token',
      'noun.target-triggered-ability-or-spell',
      'noun.that-card',
      'noun.this-card',
      'noun.the-chosen-cards',
      'noun.its-controller',
      'noun.attacked-by-it',
      'noun.attached-permanent',
      'noun.other-permanents',
      'noun.other-subtype-permanents',
      'noun.bare-permanent',
      'noun.bare-land-type',
      'noun.self',
      'noun.a-greatest-permanent',
      'noun.a-permanent',
      'noun.any-number-permanents',
      'noun.one-or-more-permanents',
      'noun.all-they-control',
      'noun.library-card',
      'amount.for-each-color',
      'amount.for-each-commander-cast',
      'amount.for-each-own-nontoken-destroyed',
      'amount.life-lost-this-turn',
      'amount.number',
      'amount.x',
      'amount.article',
      'amount.that-much',
      'amount.that-many',
      'amount.equal-to',
      'amount.where-x',
      'amount.power-of',
      'amount.mana-value-of',
      'amount.life-lost-this-way',
      'amount.milled-value-this-way',
      'amount.for-each',
      'amount.number-of',
      'amount.for-each-counter',
      'amount.for-each-opponent',
      'amount.for-each-this-way',
      'amount.times-kicked',
      'amount.for-each-still-exiled',
      'amount.for-each-mana-spent',
      'static.no-maximum-hand-size',
      'static.attached',
      'static.permanents',
      'static.each',
      'static.pt-count',
      'static.defines-pt',
      'static.self',
      'static.self-chosen-type',
      'static.additional-land',
      'static.look-at-top',
      'static.attack-tax',
      'static.optional-untap',
      'static.untap-in-others-step',
      'static.self-cost-reduction',
      'static.spells-cost-reduction',
      'static.additional-cost',
      'static.free-cast',
      'static.conditional-prefix',
      'static.conditional-suffix',
      'static.cast-from-graveyard',
      'static.during-your-turn',
      'static.cast-as-though-flash',
      'static.linked-exile',
      'static.attached-unless-monarch',
      'static.cant-attack-block-unless',
      'static.attached-becomes',
      'static.pt-amount',
      'static.player-hexproof',
      'static.cant-lose-win',
      'static.prevent-damage-to-self',
      'static.cant-cast-early',
      'static.block-tax',
      'static.others-enter-with-counters',
      'static.tap-alt-cost',
      'static.unspent-mana',
      'static.cast-from-top',
      'static.pt-times-attacked',
      'static.opponents-cant-cast',
      'static.group-enters-untapped',
      'static.spells-cant-be-countered',
      'static.opponents-cant-cast-spells',
      'static.keeps-damage',
      'static.triggers-additional-time',
      'static.triggers-additional-time-cause',
      'static.graveyard-play-once-each-turn',
      'static.opponents-cant-gain-life',
      'static.you-and-creatures-protection-chosen-type',
      'modal.choose',
      'modal.choose-commander',
      'modal.choose-widen',
      'modal.choose-not-repeated',
      'modal.choose-repeatable',
    ]);
  });

  test('an empty rule list matches nothing', () => {
    expect(matchAbility('Flying', [])).toMatchObject({ ok: false, closestRule: NO_RULE });
  });
});

describe('parsing a face', () => {
  const opts = { name: 'SYNTHETIC Test Card', legendary: false };

  test('vanilla text has no abilities and no diagnostics', () => {
    expect(parseFaceText('', opts, 0)).toEqual({
      abilities: [],
      spell: null,
      additionalCosts: [],
      alternativeCosts: [],
      additionalCostChoice: null,
      unparsed: [],
      lines: [],
    });
  });

  test('reminder text is ignored', () => {
    const parsed = parseFaceText(
      'Flying (This creature can’t be blocked except by fliers.)',
      opts,
      0,
    );
    expect(parsed.abilities).toEqual([kw('flying')]);
    expect(parsed.unparsed).toEqual([]);
  });

  test('multi-line text: the good ability is kept, the bad one is reported with its index', () => {
    const parsed = parseFaceText(
      'Flying\nWhenever your opponents cast a spell, draw a card.\n{T}: Add {G}.\nBanding',
      opts,
      1,
    );
    expect(parsed.abilities).toEqual([kw('flying'), tapAdd({ kind: 'fixed', mana: ['G'] })]);
    expect(parsed.unparsed).toMatchObject([
      {
        face: 1,
        ability: 1,
        text: 'Whenever your opponents cast a spell, draw a card.',
        stoppedAt: 'Whenever your opponents cast a spell, draw a card.',
        closestRule: NO_RULE,
        // Diagnostics v2: no trigger rule read the trigger, so the slot is the trigger.
        reason: 'unrecognised',
        slot: 'trigger',
        template: 'Whenever your opponents cast a spell, draw a card.',
      },
      {
        face: 1,
        ability: 3,
        text: 'Banding',
        stoppedAt: 'Banding',
        closestRule: NO_RULE,
        reason: 'unrecognised',
        template: 'Banding',
      },
    ]);
  });

  test('indices count normalized lines, so reminder-only lines do not shift them', () => {
    const parsed = parseFaceText('(Reminder only.)\nBanding', opts, 0);
    expect(parsed.unparsed[0]?.ability).toBe(0);
  });

  test('self references are normalized in the diagnostic text', () => {
    const parsed = parseFaceText('SYNTHETIC Test Card deals 1 damage to you.', opts, 0);
    expect(parsed.unparsed[0]?.text).toBe('~ deals 1 damage to you.');
  });

  test('a modal block is one ability', () => {
    const parsed = parseFaceText('Choose one —\n• Draw a card.\n• Gain 2 life.', opts, 0);
    expect(parsed.unparsed).toHaveLength(1);
    expect(parsed.unparsed[0]?.text).toBe('Choose one —\n• Draw a card.\n• Gain 2 life.');
  });
});
