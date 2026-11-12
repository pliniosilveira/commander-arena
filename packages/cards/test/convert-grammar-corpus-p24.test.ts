// The template corpus of stage P24: the play rules of the engine slice of D-125 (ENGINE_VERSION 24). The lines are the
// real shapes of reports/templates.json ("You may play an additional land on each of your turns.", "You may play N
// additional lands on each of your turns.", "Each player may play an additional land on each of their turns.", "You may
// look at the top card of your library any time.", the two attack-tax wordings and "You may choose not to untap ~
// during your untap step."); everything else is SYNTHETIC (the Oracle text of the cards that have them is not in the
// repository). No real card is marked supported here except through the golden corpus. Each line says whether it must
// import as supported, or where and why it stops, so a change that makes the grammar read less OR more than it should
// fails here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const PROPAGANDA =
  "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.";
const NORNS_ANNEX =
  "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures.";
const SPHERE_OF_SAFETY =
  "Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those creatures, where X is the number of enchantments you control.";

const SUPPORTED: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'You may play an additional land on each of your turns.',
    expect: OK,
    note: 'the real line; SYNTHETIC card around it',
  },
  {
    kind: 'creature',
    text: 'You may play an additional land on each of your turns.',
    expect: OK,
    note: 'the real line on a creature (Oracle of Mul Daya is shaped so); SYNTHETIC card',
  },
  {
    kind: 'enchantment',
    text: 'You may play two additional lands on each of your turns.',
    expect: OK,
    note: 'the real shape with a count',
  },
  {
    kind: 'enchantment',
    text: 'Each player may play an additional land on each of their turns.',
    expect: OK,
    note: 'the real line for every player',
  },
  {
    kind: 'artifact',
    text: 'You may play an additional land on each of your turns.\nYou may look at the top card of your library any time.',
    expect: OK,
    note: 'SYNTHETIC: two play rules on one permanent',
  },
  {
    kind: 'enchantment',
    text: 'You may look at the top card of your library any time.',
    expect: OK,
    note: 'the real line; SYNTHETIC card around it',
  },
  {
    kind: 'creature',
    text: 'You may look at the top card of your library any time.',
    expect: OK,
    note: 'the real line on a creature (Realmwalker is shaped so); SYNTHETIC card',
  },
  {
    kind: 'artifact',
    text: 'You may look at the top card of your library any time.',
    expect: OK,
    note: 'the real line on an artifact; SYNTHETIC card',
  },
  {
    kind: 'enchantment',
    text: PROPAGANDA,
    expect: OK,
    note: 'the real line of Propaganda; SYNTHETIC card around it',
  },
  {
    kind: 'creature',
    text: PROPAGANDA,
    expect: OK,
    note: 'the real line on a creature (Windborn Muse is shaped so); SYNTHETIC card',
  },
  {
    kind: 'artifact',
    text: NORNS_ANNEX,
    expect: OK,
    note: 'the real planeswalker line (Phyrexian cost); SYNTHETIC card around it',
  },
  {
    kind: 'enchantment',
    text: "Creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.",
    expect: OK,
    note: 'SYNTHETIC cost in the planeswalker wording',
  },
  {
    kind: 'enchantment',
    text: "Creatures can't attack you unless their controller pays {W}{W} for each creature they control that's attacking you.",
    expect: OK,
    note: 'SYNTHETIC: colored mana in the tax',
  },
  {
    kind: 'enchantment',
    text: "Creatures can't attack you unless their controller pays {R/W} for each creature they control that's attacking you.",
    expect: OK,
    note: 'SYNTHETIC: a hybrid symbol is planned like any payment',
  },
  {
    kind: 'artifact',
    text: 'You may choose not to untap ~ during your untap step.',
    expect: OK,
    note: 'the real line; SYNTHETIC card around it',
  },
  {
    kind: 'creature',
    text: 'You may choose not to untap ~ during your untap step.',
    expect: OK,
    note: 'the real line on a creature; SYNTHETIC card',
  },
  {
    kind: 'land',
    text: 'You may choose not to untap ~ during your untap step.',
    expect: OK,
    note: 'the real line on a land (Ice Floe is shaped so); SYNTHETIC card',
  },
  {
    kind: 'artifact',
    text: 'You may choose not to untap ~ during your untap step.\n{T}: Draw a card.',
    expect: OK,
    note: 'SYNTHETIC: the line beside an activated ability',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'enchantment',
    text: SPHERE_OF_SAFETY,
    expect: no(
      '{X} for each of those creatures, where X is the number of enchantments you control.',
      'static.attack-tax',
    ),
    note: 'the real shape of Sphere of Safety: the cost counts something (X), not built (D-125)',
  },
  {
    kind: 'enchantment',
    text: "Creatures can't attack you unless their controller pays {X} for each creature they control that's attacking you.",
    expect: no("{X} for each creature they control that's attacking you.", 'static.attack-tax'),
    note: 'SYNTHETIC: X in the tax',
  },
  {
    kind: 'enchantment',
    text: 'You may play an additional land this turn.',
    expect: no('You may play an additional land this turn.', NONE),
    note: 'the real line (5 cards): an effect of a spell, a different thing',
  },
  {
    kind: 'enchantment',
    text: 'Play with the top card of your library revealed.',
    expect: no('Play with the top card of your library revealed.', NONE),
    note: 'the real line (12 cards): a different ability, everyone sees the card',
  },
  {
    kind: 'enchantment',
    text: "Untap target land during each other player's untap step.",
    expect: no("Untap target land during each other player's untap step.", NONE),
    note: 'another permanent (the permanent itself is read since D-983)',
  },
  {
    kind: 'artifact',
    text: 'You may choose not to untap target artifact during your untap step.',
    expect: no('You may choose not to untap target artifact during your untap step.', NONE),
    note: 'SYNTHETIC: the optional untap of another permanent is not built',
  },
  {
    kind: 'instant',
    text: 'You may play an additional land on each of your turns.',
    expect: no('may play an additional land on each of your turns.', 'effect.player'),
    note: 'SYNTHETIC: an instant has no static ability of this kind',
  },
  {
    kind: 'artifact',
    text: 'You may look at the top card of your library any time.\nYou may play lands from the top of your library.',
    expect: no('You may play lands from the top of your library.', NONE),
    note: "SYNTHETIC second line (Bolas's Citadel-shaped): the look is read, the other line is the reason",
  },
];

runCorpus('stage P24: play rule lines read and run', SUPPORTED);
runCorpus('stage P24: what stays unread', UNREAD);
