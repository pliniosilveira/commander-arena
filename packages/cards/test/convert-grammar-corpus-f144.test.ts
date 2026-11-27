// The template corpus of deck support issue 144 (the Goblin deck). The first group is the real Oracle text of the four cards the golden corpus added (packages/cards/test/fixtures/corpus/golden.jsonl,
// source "issue #144"), with the name replaced by ~; the siblings and the near misses are SYNTHETIC. Each line says whether it must import as supported, or where and why it stops, so a change that
// makes the grammar read less OR more than it should fails here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const REAL: readonly Line[] = [
  {
    kind: 'creature',
    text: "Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, you may cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead.",
    expect: OK,
    note: 'Goblin Dark-Dwellers',
    stats: ['4', '4'],
  },
  {
    kind: 'sorcery',
    text: 'Exile the top three cards of your library. You may play those cards this turn. At the beginning of the next end step, if any of those cards remain exiled, put them into your graveyard, then create a 0/1 colorless Eldrazi Spawn creature token for each card put into your graveyard this way. Those tokens have "Sacrifice this token: Add {C}."',
    expect: OK,
    note: 'Glimpse the Impossible',
  },
  {
    kind: 'creature',
    text: 'Play with the top card of your library revealed.\nYou may cast Goblin spells from the top of your library.\nAs long as the top card of your library is a Goblin card, this creature has all activated abilities of that card.',
    expect: OK,
    note: 'Conspicuous Snoop',
    stats: ['2', '2'],
  },
  {
    kind: 'creature',
    text: "Whenever a creature you control deals combat damage to a player, choose one —\n• Goad target creature that player controls.\n• Exile the top card of that player's library. Until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell.",
    expect: OK,
    note: 'Grenzo, Havoc Raiser',
    stats: ['2', '2'],
  },
];

const SIBLINGS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'When ~ enters, you may cast target sorcery card from your graveyard without paying its mana cost.',
    expect: OK,
    note: 'SYNTHETIC: one type, no rider',
  },
  {
    kind: 'creature',
    text: 'Whenever a creature you control deals combat damage to a player, goad target creature that player controls.',
    expect: OK,
    note: 'SYNTHETIC: the first mode alone',
  },
  {
    kind: 'creature',
    text: "Whenever a creature you control deals combat damage to a player, exile the top card of that player's library. Until end of turn, you may cast that card.",
    expect: OK,
    note: 'SYNTHETIC: the second mode without the rider on the mana',
  },
  {
    kind: 'creature',
    text: 'You may cast Elf spells from the top of your library.',
    expect: OK,
    note: 'SYNTHETIC: another creature type',
  },
  {
    kind: 'creature',
    text: 'As long as the top card of your library is a creature card, ~ has all activated abilities of that card.',
    expect: OK,
    note: 'SYNTHETIC: a card type instead of a creature type',
  },
  {
    kind: 'sorcery',
    text: 'Exile the top three cards of your library. You may play those cards this turn. At the beginning of the next end step, put them into your graveyard, then create a 0/1 colorless Eldrazi Spawn creature token for each card put into your graveyard this way.',
    expect: OK,
    note: 'SYNTHETIC: without the condition and the rider on the tokens',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'When ~ enters, you may cast target creature card from your graveyard without paying its mana cost.',
    expect: no(
      'cast target creature card from your graveyard without paying its mana cost.',
      'ability.triggered',
    ),
    note: 'SYNTHETIC: a permanent card is not read (only an instant or a sorcery is)',
  },
  {
    kind: 'creature',
    text: 'As long as the top card of your library is a Goblin card, ~ has all abilities of that card.',
    expect: no(
      'the top card of your library is a Goblin card, ~ has all abilities of that card.',
      'static.conditional-prefix',
    ),
    note: 'SYNTHETIC: only the activated abilities of the card on top are given',
  },
  {
    kind: 'creature',
    text: 'You may cast Goblin Warrior spells from the top of your library.',
    expect: no('Warrior spells from the top of your library.', 'static.conditional-suffix'),
    note: 'SYNTHETIC: one creature type or one card type, as the permission says it',
  },
];

runCorpus('the template corpus (issue 144): the cards of the golden corpus', REAL);
runCorpus('the template corpus (issue 144): the sibling wordings', SIBLINGS);
runCorpus('the template corpus (issue 144): what stays unread', UNREAD);
