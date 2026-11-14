// The SYNTHETIC template corpus of stage P15: a second class-T sweep of reports/template-replay.md
// (the wordings of what the engine already runs). Each line is a template written after a real shape
// of the replay report (the owner's run, parser version 4; the count of cards is in the note as the
// report prints it) or marked SYNTHETIC; none is a real card's text, and no real card is marked
// supported here. Each line says whether it must import as supported, or where and why it stops, so a
// change that makes the grammar read less OR more than it should fails here. The kinds of expectation
// are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const TOKENS: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'Whenever you cast an artifact spell, create a 1/1 colorless Thopter artifact creature token with flying.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your upkeep, you lose 1 life and create a 1/1 black Faerie Rogue creature token with flying.',
    expect: OK,
    note: 'replay: 1 card; a life loss and a token in one sentence',
  },
  {
    kind: 'enchantment',
    text: 'At the beginning of each upkeep, if you control no Snakes, create a 1/1 black Snake creature token with deathtouch.',
    expect: OK,
    note: 'replay: 1 card; a creature type in the intervening "if"',
  },
  {
    kind: 'instant',
    text: 'Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, create a 0/1 green Plant creature token for each land you control.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'Whenever a land you control enters, investigate.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'sorcery',
    text: 'Create a 2/2 white Knight creature token with first strike and vigilance.',
    expect: OK,
    note: 'SYNTHETIC; two keywords',
  },
  {
    kind: 'sorcery',
    text: 'Create a 1/1 white Soldier creature token with changeling.',
    expect: no('with changeling.', 'token.custom'),
    note: 'SYNTHETIC; a token is never made without its ability; the grammar reads only the words the engine can grant (D-110), which changeling is not',
  },
  {
    kind: 'sorcery',
    text: 'Create two Treasure tokens for each land you control.',
    expect: OK,
    note: 'SYNTHETIC; read since stage P28 (D-131): two for each is `multiple` of the count',
  },
  {
    kind: 'sorcery',
    text: 'Investigate twice.',
    expect: no('twice.', 'effect.investigate'),
    note: 'SYNTHETIC; "investigate" alone is read',
  },
];

const NOUNS: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'Whenever a land you control enters, you may put a +1/+1 counter on each Plant creature you control.',
    expect: OK,
    note: 'replay: 1 card; a creature type before "creature"',
  },
  {
    kind: 'enchantment',
    text: 'Whenever an Equipment you control enters, you may draw a card.',
    expect: OK,
    note: 'replay: 1 card; an artifact type alone',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you sacrifice a Clue, put a +1/+1 counter on ~.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'artifact',
    text: '{T}: Untap target Forest.',
    expect: OK,
    note: 'replay: 1 card; a land type is a subtype',
  },
  {
    kind: 'creature',
    text: '{T}: Untap another target permanent.',
    expect: OK,
    note: 'replay: 4 cards',
  },
  {
    kind: 'artifact',
    text: '{1}, {T}: Untap another target artifact.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'instant',
    text: 'Target creature you control gets +1/+1 and gains hexproof until end of turn. Untap it.',
    expect: OK,
    note: 'replay: 3 cards',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, put a +1/+1 counter on each of up to two target creatures.',
    expect: OK,
    note: 'replay: 6 cards',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, return target instant or sorcery card from your graveyard to your hand.',
    expect: OK,
    note: 'replay: 8 cards',
  },
  {
    kind: 'creature',
    text: 'When ~ dies, return another target artifact card from your graveyard to your hand.',
    expect: OK,
    note: 'replay: 3 cards',
  },
  {
    kind: 'creature',
    text: '{B}, {T}: Exile target instant or sorcery card from a graveyard. Each opponent loses 2 life.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: '{G}, Sacrifice ~: Exile target noncreature artifact or noncreature enchantment.',
    expect: OK,
    note: 'replay: 1 card; each member of the choice has its own modifier',
  },
  {
    kind: 'enchantment',
    text: 'All creatures have haste.',
    expect: OK,
    note: 'replay: 4 cards',
  },
  {
    kind: 'enchantment',
    text: 'Elves you control get +1/+1.',
    expect: OK,
    note: 'SYNTHETIC; a creature type without "other"',
  },
  {
    kind: 'creature',
    text: '{2}, {T}, Sacrifice a Desert: Exile all graveyards.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'sorcery',
    text: 'Untap it.',
    expect: no('it.', 'noun.it', { reason: 'unboundReference' }),
    note: 'SYNTHETIC; "it" with nothing before it',
  },
  {
    kind: 'instant',
    text: 'Exile target creature. Tap it.',
    expect: no('Tap it.', 'effect.tap', { reason: 'notRunnable' }),
    note: 'SYNTHETIC; "it" is the exiled card, which has no tapped state to change (CR 400.7)',
  },
  {
    kind: 'creature',
    text: '{T}: Untap another creature.',
    expect: no('another creature.', 'effect.untap'),
    note: 'SYNTHETIC; "another" belongs to a target ("another target creature")',
  },
  {
    kind: 'instant',
    text: 'Destroy target tapped creature or planeswalker.',
    expect: no('or planeswalker.', 'noun.target-permanent'),
    note: 'SYNTHETIC; what "tapped" modifies is ambiguous',
  },
  {
    kind: 'enchantment',
    text: 'Creature tokens you control get +1/+1.',
    expect: OK,
    note: "replay: 5 cards; read since stage P64 (D-217): `noun.token-permanents`, the engine's `token` filter",
  },
  {
    kind: 'enchantment',
    text: 'All creatures with flying have haste.',
    expect: OK,
    note: 'SYNTHETIC; stage P33 (D-149, D-150): a keyword in the subject of a keyword grant is read after the effects that do not read keywords (CR 613.8)',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, put a +1/+1 counter on each of up to two other target creatures.',
    expect: no('other target creatures.', 'noun.target-permanent'),
    note: 'SYNTHETIC; "other target" is not Oracle wording ("another target")',
  },
];

const TRIGGERS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'When ~ is put into a graveyard from the battlefield, draw a card.',
    expect: OK,
    note: 'replay: 12 cards; "dies" in the words of CR 700.4',
  },
  {
    kind: 'enchantment',
    text: 'Whenever another creature or artifact you control is put into a graveyard from the battlefield, each opponent loses 1 life.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: 'Whenever a player sacrifices a permanent, ~ deals 1 damage to any target.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ becomes the target of a spell or ability an opponent controls, you gain 2 life.',
    expect: OK,
    note: 'SYNTHETIC; no line of the replay has exactly this wording',
  },
  {
    kind: 'creature',
    text: '{1}{U}, {T}: Creatures your opponents control attack this turn if able.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'sorcery',
    text: 'Put all creature cards from all graveyards onto the battlefield under your control.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: "When ~ is put into a graveyard from anywhere, return it to its owner's hand.",
    expect: no(
      "is put into a graveyard from anywhere, return it to its owner's hand.",
      'trigger.or',
    ),
    note: 'replay: 20 cards; "from anywhere" is not "dies" (CR 700.4)',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ becomes the target of a spell, create a Treasure token.',
    expect: OK,
    note: 'SYNTHETIC; a spell alone is the engine becomesTarget with spellOnly (stage P36, D-178)',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ becomes the target of a spell or ability an opponent controls, counter it.',
    expect: no('it.', 'effect.counter'),
    note: 'SYNTHETIC; "it" would be the spell or ability, which the binding pass cannot tell from ~',
  },
  {
    kind: 'enchantment',
    text: 'Whenever a player sacrifices a creature you control, draw a card.',
    expect: no('you control, draw a card.', 'trigger.sacrifice'),
    note: 'SYNTHETIC; whoever sacrifices, the permanent is theirs',
  },
  {
    kind: 'enchantment',
    text: 'Whenever an opponent sacrifices a permanent, draw a card.',
    expect: no('opponent sacrifices a permanent, draw a card.', 'trigger.or'),
    note: 'SYNTHETIC; the engine trigger knows you and any player',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.',
    expect: no(', Equipment, or Vehicle spell, draw a card.', 'trigger.cast'),
    note: 'replay: 1 card; the segmenter ends a trigger at its first comma',
  },
  {
    kind: 'enchantment',
    text: 'Whenever equipped creature dies, draw two cards.',
    expect: no('equipped creature dies, draw two cards.', 'noun.attached-permanent', {
      reason: 'notRunnable',
    }),
    note: 'replay: 1 card; only an Equipment has an equipped creature (stage P18: read, and refused on an enchantment)',
  },
  {
    kind: 'instant',
    text: "Creatures without flying can't block this turn.",
    expect: OK,
    note: 'SYNTHETIC; read since stage P29: "without flying" is a part of the filter (D-133)',
  },
];

const CHOSEN: readonly Line[] = [
  {
    kind: 'creature',
    text: 'As ~ enters, choose a creature type.',
    expect: OK,
    note: 'replay: 56 cards (D-100)',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a color.',
    expect: OK,
    note: 'replay: 43 cards (D-100)',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.',
    expect: OK,
    note: 'replay: 9 cards',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a color.\nCreatures you control of the chosen color get +1/+0.',
    expect: OK,
    note: 'replay: 3 cards',
  },
  {
    kind: 'creature',
    text: 'As ~ enters, choose a creature type.\n~ is the chosen type in addition to its other types.',
    expect: OK,
    note: 'replay: 5 cards',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a creature type.\nSpells you cast of the chosen type cost {1} less to cast.',
    expect: OK,
    note: 'replay: 4 cards',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a creature type.\nWhenever you cast a creature spell of the chosen type, draw a card.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a creature type.\nWhenever a creature you control of the chosen type enters or attacks, draw a card.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'Creatures you control of the chosen type get +1/+1.',
    expect: { engine: 'does not choose one as it enters' },
    note: 'SYNTHETIC; a reader of the choice with no question: the engine refuses the card, naming it (CR 607.2d)',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a creature type.\nAs ~ enters, choose a color.',
    expect: { engine: 'at most one ability may ask a question' },
    note: 'SYNTHETIC; one question per face (D-100)',
  },
  {
    kind: 'sorcery',
    text: 'As ~ enters, choose a creature type.',
    expect: { engine: 'only a permanent can ask' },
    note: 'SYNTHETIC; a spell is not a permanent that enters',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a color other than white.',
    expect: no(', choose a color other than white.', 'replacement.as-enters-choose'),
    note: 'replay: part of the Thriving lands; only the plain question is built',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a creature type.\n{T}: Add one mana of the chosen color.',
    expect: {
      engine: 'it refers to the chosen color but does not choose one as it enters',
    },
    note: 'replay: 18 cards; stage P33 (D-149, D-150): read since the engine mana ability makes mana of the chosen color, refused because this card chooses a creature type',
  },
  {
    kind: 'creature',
    text: '~ enters tapped. As it enters, choose a color.',
    expect: OK,
    note: 'replay: 9 cards; two replacement effects in one line, read one sentence each',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a creature type.\nEach creature you control is the chosen type in addition to its other types.',
    expect: no('is the chosen type in addition to its other types.', 'static.each'),
    note: 'SYNTHETIC; only ~ itself gets the type (D-100): the group stops at its verb',
  },
];

runCorpus('the template corpus (stage P15): the choice made as a permanent enters', CHOSEN);
runCorpus('the template corpus (stage P15): tokens', TOKENS);
runCorpus('the template corpus (stage P15): nouns', NOUNS);
runCorpus('the template corpus (stage P15): triggers and effects', TRIGGERS);
