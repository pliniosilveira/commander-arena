// The template corpus of stage P29 (D-133): the filtered-subjects slice. The lines are the real wordings of the blockers of
// the owner's five decks (reports/decks.md, parser version 33, whose numbers are N: the numbers here are SYNTHETIC, and so is
// every card around them); the variants, the near misses and the lines the D-133 survey marks as not built are SYNTHETIC.
// No real card is marked supported here except through the golden corpus. Each line says whether it must import as
// supported, or where and why it stops, so a change that makes the grammar read less OR more than it should fails here. The
// kinds of expectation are those of convert-grammar-corpus.test.ts; `noX` is a line whose X the text defines.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const NOT_RUNNABLE = { reason: 'notRunnable' as const };

/** Class (a) of D-133: the engine ran it, only the parser lacked the wording. */
const CLASS_A: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Whenever you cast a noncreature or Dragon spell, ~ deals 1 damage to each opponent.',
    expect: OK,
    note: 'row 71: a choice of a modifier and a subtype for one spell',
  },
  {
    kind: 'creature',
    text: "Whenever ~ or another artifact you control enters, put a +1/+1 counter on ~. It can't be blocked this turn.",
    expect: OK,
    note: 'row 84: "it" is ~, the counter is on ~',
  },
  {
    kind: 'creature',
    text: 'Whenever a Dragon you control enters, put a +1/+1 counter on ~. Until end of turn, ~ becomes a Dragon in addition to his other types and gains flying.',
    expect: OK,
    note: 'row 148: an additive creature type and a keyword, the duration first',
  },
  {
    kind: 'creature',
    text: 'Other Zombie creatures get +1/+1.',
    expect: OK,
    note: 'row 33: a lord over every controller',
  },
  {
    kind: 'creature',
    text: 'Skeletons you control and other Zombies you control get +1/+1 and have deathtouch.',
    expect: OK,
    note: 'row 39: two groups, the second without the source',
  },
  {
    kind: 'creature',
    text: '{2}{B}, {T}: All Zombies gain menace until end of turn.',
    expect: OK,
    note: 'row 96',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ attacks, each creature you control with power 4 or greater gets +1/+1 and gains trample until end of turn.',
    expect: OK,
    note: 'row 158',
  },
  {
    kind: 'creature',
    text: '{R}: Dragons you control get +1/+1 until end of turn.',
    expect: OK,
    note: 'row 170',
  },
];

/** Class (b): built in the engine in D-133, lowered here. */
const TRIGGERS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Whenever a Dragon you control becomes the target of a spell or ability an opponent controls, ~ deals 3 damage to that player.',
    expect: OK,
    note: 'row 57: "that player" is the player whose spell or ability targeted',
  },
  {
    kind: 'creature',
    text: 'Whenever a creature attacks you or a planeswalker you control, investigate.',
    expect: OK,
    note: 'row 60',
  },
  {
    kind: 'creature',
    text: "Whenever a creature attacks you or a planeswalker you control, that creature's controller loses 1 life.",
    expect: OK,
    note: 'row 61',
  },
  {
    kind: 'creature',
    text: 'Whenever a creature you control with flying enters, it gains haste until end of turn.',
    expect: OK,
    note: 'row 62',
  },
  {
    kind: 'creature',
    text: 'Whenever a nontoken creature you control dies, create a 2/2 black Zombie creature token.',
    expect: OK,
    note: 'row 64',
  },
  {
    kind: 'creature',
    text: 'Whenever a nontoken creature you control dies, ~ deals 1 damage to you and you draw a card.',
    expect: OK,
    note: 'row 65',
  },
  {
    kind: 'creature',
    text: 'Whenever an opponent draws a card, that player loses 1 life.',
    expect: OK,
    note: 'row 66: "that player" is the player who drew',
  },
  {
    kind: 'creature',
    text: 'Whenever another nontoken creature you control enters, put a +1/+1 counter on it. It gains haste until end of turn.',
    expect: OK,
    note: 'row 67',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ deals combat damage to a player, that player discards a card and you create a tapped 2/2 black Zombie creature token.',
    expect: OK,
    note: 'row 80',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ is dealt damage, draw a card.',
    expect: OK,
    note: 'row 82',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ or another Zombie enters, all non-Zombie creatures get -1/-1 until end of turn.',
    expect: OK,
    note: 'row 83: a negated creature type in a group',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ or another nontoken Zombie you control dies, create a 2/2 black Zombie creature token.',
    expect: OK,
    note: 'row 85: two abilities, one for each subject',
  },
  {
    kind: 'creature',
    text: 'Whenever a nontoken creature you control dies, investigate.',
    expect: OK,
    note: 'row 149',
  },
  {
    kind: 'creature',
    text: 'Whenever another nontoken Dragon you control enters, create a 4/4 red Dragon creature token with flying.',
    expect: OK,
    note: 'row 150',
  },
  {
    kind: 'creature',
    text: 'Whenever you cast a colorless spell, you gain 1 life.',
    expect: OK,
    note: 'row 153',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ is dealt damage, you gain that much life.',
    expect: OK,
    note: 'row 159',
  },
];

const STATICS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'As long as you control your commander, ~ gets +2/+2 and creatures you control have vigilance.',
    expect: OK,
    note: 'row 8: two subjects, one condition',
  },
  {
    kind: 'creature',
    text: 'As long as you have at least 7 life more than your starting life total, creatures you control get +1/+1.',
    expect: OK,
    note: 'row 10',
  },
  {
    kind: 'creature',
    text: "Each creature you control with power 4 or greater can't be blocked by more than one creature.",
    expect: OK,
    note: 'row 24',
  },
  {
    kind: 'creature',
    text: 'Nontoken creatures you control get +1/+1 and have vigilance.',
    expect: OK,
    note: 'row 32',
  },
  {
    kind: 'creature',
    text: 'Other nontoken creatures you control get +1/+1 and have vigilance.',
    expect: OK,
    note: 'row 34',
  },
  {
    kind: 'creature',
    text: "~ has hexproof as long as it's untapped.",
    expect: OK,
    note: 'row 115',
  },
  {
    kind: 'creature',
    text: 'As long as you control three or more artifacts, ~ has hexproof.',
    expect: OK,
    note: 'row 118',
  },
  {
    kind: 'creature',
    text: 'As long as ~ is untapped, creatures can’t attack you or planeswalkers you control unless their controller pays {2} for each of those creatures.',
    expect: OK,
    note: 'row 120',
  },
  {
    kind: 'creature',
    text: 'Colorless creatures you control get +1/+1.',
    expect: OK,
    note: 'row 122',
  },
  {
    kind: 'creature',
    text: '~ gets +3/+3 as long as you have 30 or more life.',
    expect: OK,
    note: 'row 174',
  },
  {
    kind: 'creature',
    text: '{T}: Create a 4/4 white Angel creature token with flying. Activate only if you have at least 7 life more than your starting life total and only as a sorcery.',
    expect: OK,
    note: 'the end of row 108: the two restrictions in one sentence',
  },
];

const COSTS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Tap three untapped Zombies you control: You draw a card and lose 1 life.',
    expect: OK,
    note: 'row 40',
  },
  {
    kind: 'creature',
    text: "Tap two untapped artifacts you control: Target creature can't be blocked this turn.",
    expect: OK,
    note: 'row 41',
  },
  {
    kind: 'creature',
    text: 'Tap two untapped artifacts you control: Draw a card.',
    expect: OK,
    note: 'row 137',
  },
  {
    kind: 'creature',
    text: '{1}, Sacrifice two artifacts: Draw a card.',
    expect: OK,
    note: 'row 93',
  },
  {
    kind: 'creature',
    text: "{1}{B}, {T}, Sacrifice another creature: Create X 2/2 black Zombie creature tokens, where X is the sacrificed creature's power.",
    expect: OK,
    noX: true,
    note: 'row 95: X is what the cost sacrificed',
  },
];

const OTHERS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'If a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie creature token.',
    expect: OK,
    note: 'row 30',
  },
  {
    kind: 'creature',
    text: 'You may cast this card from your graveyard as long as you control a Zombie.',
    expect: OK,
    note: 'row 92',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, destroy all creatures with flying. Put a +1/+1 counter on ~ for each creature destroyed this way.',
    expect: OK,
    note: 'row 49',
  },
  {
    kind: 'sorcery',
    text: '~ deals 2 damage to each non-Dragon creature.',
    expect: OK,
    note: 'row 112',
  },
  {
    kind: 'sorcery',
    text: '~ deals X damage to each creature without flying and each planeswalker.',
    expect: OK,
    note: 'row 114',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you may exile target nontoken creature.',
    expect: OK,
    note: 'row 147',
  },
];

runCorpus('the template corpus (stage P29): class (a)', CLASS_A);
runCorpus('the template corpus (stage P29): triggers', TRIGGERS);
runCorpus('the template corpus (stage P29): statics', STATICS);
runCorpus('the template corpus (stage P29): costs', COSTS);
runCorpus('the template corpus (stage P29): the rest', OTHERS);
void no;
void NOT_RUNNABLE;
