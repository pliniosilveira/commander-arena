// The template corpus of issue 144: the four lands and artifacts of the request (Den of the Bugbear, Fountainport, Arena of Glory, Throne of
// Eldraine). The first group is the real Oracle text with the name replaced by ~; the variants and near misses are SYNTHETIC. The kinds of
// expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const REAL: readonly Line[] = [
  {
    kind: 'artifact',
    text: 'As ~ enters, choose a color.\n{T}: Add four mana of the chosen color. Spend this mana only to cast monocolored spells of that color.\n{3}, {T}: Draw two cards. Spend only mana of the chosen color to activate this ability.',
    expect: OK,
    note: 'Throne of Eldraine',
  },
  {
    kind: 'land',
    text: '~ enters tapped unless you control a Mountain.\n{T}: Add {R}.\n{R}, {T}, Exert ~: Add {R}{R}. If any of that mana is spent on a creature spell, it gains haste until end of turn.',
    expect: OK,
    note: 'Arena of Glory',
  },
  {
    kind: 'land',
    text: 'If you control two or more other lands, ~ enters tapped.\n{T}: Add {R}.\n{3}{R}: Until end of turn, ~ becomes a 3/2 red Goblin creature with "Whenever ~ attacks, create a 1/1 red Goblin creature token that\'s tapped and attacking." It\'s still a land.',
    expect: OK,
    note: 'Den of the Bugbear',
  },
  {
    kind: 'land',
    text: '{2}, {T}, Sacrifice a token: Draw a card.',
    expect: OK,
    note: 'Fountainport (its other abilities read already)',
  },
];

const SIBLINGS: readonly Line[] = [
  {
    kind: 'land',
    text: 'If you control two or more other lands, ~ enters tapped.\n{T}: Add {R}.',
    expect: OK,
    note: 'Den of the Bugbear first two abilities: the "if" wording of the conditional enters-tapped replacement',
  },
  {
    kind: 'land',
    text: 'If you control a Dragon, ~ enters the battlefield tapped.\n{T}: Add {G}.',
    expect: OK,
    note: 'the same with another condition',
  },
  {
    kind: 'artifact',
    text: '{1}, Sacrifice a token: Draw a card.',
    expect: OK,
    note: 'a token of any kind, no {T}',
  },
  {
    kind: 'artifact',
    text: '{T}, Sacrifice two tokens: You gain 2 life.',
    expect: OK,
    note: 'a count of tokens',
  },
  {
    kind: 'artifact',
    text: '{T}, Sacrifice another token: Draw a card.',
    expect: OK,
    note: 'another token',
  },
  {
    kind: 'land',
    text: '{R}, {T}, Exert ~: Add {R}{R}.',
    expect: OK,
    note: 'exert as a cost of a mana ability, with no rider',
  },
  {
    kind: 'land',
    text: '{G}, {T}, Exert ~: Add {G}{G}. If any of that mana is spent on a creature spell, it gains haste until end of turn.',
    expect: OK,
    note: 'the same in another color',
  },
  {
    kind: 'artifact',
    text: 'As ~ enters, choose a color.\n{T}: Add three mana of the chosen color. Spend this mana only to cast monocolored spells of that color.',
    expect: OK,
    note: 'another count of the chosen color',
  },
  {
    kind: 'artifact',
    text: 'As ~ enters, choose a color.\n{2}, {T}: Draw a card. Spend only mana of the chosen color to activate this ability.',
    expect: OK,
    note: 'the restriction on an activation, with another cost and effect',
  },
  {
    kind: 'land',
    text: '{2}{R}: Until end of turn, ~ becomes a 2/2 red Elemental creature with "Whenever ~ attacks, you gain 1 life." It\'s still a land.',
    expect: OK,
    note: 'a land that becomes a creature with an attack trigger of another kind',
  },
  {
    kind: 'creature',
    text: "Whenever ~ attacks, create a 1/1 red Goblin creature token that's tapped and attacking.",
    expect: OK,
    note: 'the token joins the combat the source attacks',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'artifact',
    text: '{T}, Sacrifice a token an opponent controls: Draw a card.',
    expect: no('an opponent controls: Draw a card.', 'noun.a-token'),
    note: 'you sacrifice only what you control',
  },
  {
    kind: 'artifact',
    text: '{T}, Exert ~: Draw a card.',
    expect: no('{T}, Exert ~: Draw a card.', 'ability.activated', { reason: 'notRunnable' }),
    note: 'exert is a cost of a mana ability only',
  },
  {
    kind: 'creature',
    text: "Whenever another creature you control attacks, create a 1/1 red Goblin creature token that's tapped and attacking.",
    expect: no("a 1/1 red Goblin creature token that's tapped and attacking.", 'token.custom', {
      reason: 'notRunnable',
    }),
    note: "the source is not the attacker, so whom the token attacks is the controller's choice, not built",
  },
  {
    kind: 'artifact',
    text: 'As ~ enters, choose a color.\n{T}: Add {G}. Spend this mana only to cast monocolored spells of that color.',
    expect: no(
      'Spend this mana only to cast monocolored spells of that color.',
      'effect.spend-only-monocolored-chosen',
      { reason: 'notRunnable' },
    ),
    note: '"that color" is the chosen color: the mana must be of it',
  },
  {
    kind: 'artifact',
    text: '{T}: Draw a card. Spend only mana of the chosen color to activate this ability.',
    expect: no(
      '{T}: Draw a card. Spend only mana of the chosen color to activate this ability.',
      'ability.activated',
      { reason: 'notRunnable' },
    ),
    note: 'no mana cost to restrict, and no color chosen',
  },
  {
    kind: 'land',
    text: '{3}{R}: Until end of turn, ~ becomes a 3/2 red Goblin creature with "Whenever ~ attacks, you gain 1 life." It\'s still a creature.',
    expect: no("It's still a creature.", 'effect.lead-becomes-land-creature-ability'),
    note: '"still a land" is what keeps its type',
  },
];

runCorpus('the template corpus (issue 144): the real cards', REAL);
runCorpus('the template corpus (issue 144): the sibling wordings', SIBLINGS);
runCorpus('the template corpus (issue 144): what stays unread', UNREAD);
