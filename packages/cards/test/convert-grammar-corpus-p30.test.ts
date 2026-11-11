// The template corpus of stage P30 (D-135, D-136): the recursion slice. The first group is the real Oracle text of the nine cards the golden
// corpus added for the Zombies precon (packages/cards/test/fixtures/corpus/golden.jsonl), with the name replaced by ~; the siblings, the
// variants, the near misses and the lines the D-135 survey marks as not built are SYNTHETIC. Each line says whether it must import as
// supported, or where and why it stops, so a change that makes the grammar read less OR more than it should fails here. The kinds of
// expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const REAL: readonly Line[] = [
  {
    kind: 'sorcery',
    text: "Return target creature card from your graveyard to your hand. If it's a Zombie card, draw a card.",
    expect: OK,
    note: 'Cemetery Recruitment',
  },
  {
    kind: 'creature',
    text: "Menace\nWhen ~ enters, sacrifice any number of other permanents, then draw that many cards.\nWhen ~ dies or is put into exile from the battlefield, you may put her into her owner's library third from the top.",
    expect: OK,
    note: 'God-Eternal Bontu',
  },
  {
    kind: 'creature',
    text: 'Gift a card\nReach\nWhen ~ enters, if the gift was promised, destroy target artifact or enchantment an opponent controls.',
    expect: OK,
    note: 'Scrapshooter',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, mill three cards.\nWhen ~ dies, you may exile it. When you do, return target creature card from your graveyard to your hand.',
    expect: OK,
    note: 'Undead Butler',
  },
  {
    kind: 'creature',
    text: "~ can't block.\n{4}{B}{B}: Return this card from your graveyard to the battlefield with a +1/+1 counter on it. This ability costs {4} less to activate if an opponent controls four or more nonbasic lands.",
    expect: OK,
    note: 'Razorlash Transmogrant',
  },
  {
    kind: 'land',
    text: 'This land enters tapped unless you control three or more other Swamps.\nWhen ~ enters untapped, you may put target creature card from your graveyard on top of your library.',
    expect: OK,
    note: "Witch's Cottage (its mana ability is the basic land type's)",
  },
  {
    kind: 'land',
    text: "{T}: Add {C}.\n{3}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card.",
    expect: OK,
    note: 'War Room',
  },
  {
    kind: 'creature',
    text: 'Ward—Pay 2 life.\n{T}: You may cast target Zombie creature card from your graveyard this turn.',
    expect: OK,
    note: 'Zul Ashur, Lich Lord',
  },
  {
    kind: 'instant',
    text: 'Gift a card\nTarget opponent sacrifices a creature with the greatest power among creatures they control. If the gift was promised, return target creature card from your graveyard to your hand.',
    expect: OK,
    note: 'Consumed by Greed',
  },
];

const SIBLINGS: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'When ~ enters, you may discard a card. If you do, draw two cards.',
    expect: OK,
    note: "Bitter Reunion's wording: the engine's `may` and `didPrevious`",
  },
  {
    kind: 'artifact',
    text: 'Whenever you cast a creature spell, you may discard a card. If you do, draw a card.',
    expect: OK,
    note: "Hazoret's Monument's wording",
  },
  {
    kind: 'sorcery',
    text: "Return target creature card from your graveyard to the battlefield. If it's an Angel, put two +1/+1 counters on it.",
    expect: OK,
    note: 'the Angels deck: the object that was moved, for the condition and the counters',
  },
  {
    kind: 'sorcery',
    text: "Return target creature card from your graveyard to your hand. If it's a Goblin card, draw a card.",
    expect: OK,
    note: 'another creature type: one rule for every type of the table',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you may sacrifice another creature. When you do, ~ deals 3 damage to any target.',
    expect: OK,
    note: 'a reflexive ability with its own target (CR 603.12)',
  },
  {
    kind: 'creature',
    text: 'Whenever another Zombie you control dies or is put into exile from the battlefield, draw a card.',
    expect: OK,
    note: 'the zones list for a filter subject',
  },
  {
    kind: 'creature',
    text: 'Whenever another Zombie you control enters untapped, you gain 1 life.',
    expect: OK,
    note: 'enters untapped for a filter subject',
  },
  {
    kind: 'sorcery',
    text: "Put target creature into its owner's library third from the top.",
    expect: OK,
    note: 'a library position for a target',
  },
  {
    kind: 'creature',
    text: '{2}{B}: Return this card from your graveyard to your hand. This ability costs {2} less to activate if you control a commander.',
    expect: OK,
    note: 'an ability from the graveyard to the hand, with another condition for the reduction',
  },
  {
    kind: 'instant',
    text: 'Gift a card\nDestroy target creature. If the gift was promised, destroy target artifact.',
    expect: OK,
    note: 'a target that exists only if the gift was promised (CR 702.174m)',
  },
  {
    kind: 'sorcery',
    text: 'Each opponent sacrifices a creature with the greatest toughness among creatures they control.',
    expect: OK,
    note: 'the greatest of another stat, for each opponent',
  },
  {
    kind: 'land',
    text: '{T}, Pay life equal to the number of creatures you control: Draw a card.',
    expect: OK,
    note: 'another count for the life paid',
  },
  {
    kind: 'creature',
    text: '{T}: You may cast target Goblin creature card from your graveyard this turn.',
    expect: OK,
    note: 'another creature type for the permission',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'You may draw a card. If you do, draw a card.',
    expect: no('may draw a card. If you do, draw a card.', 'effect.player'),
    note: 'a spell reads only the offer to discard (stage P56, D-214); any other "you may" is not in its grammar',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you may gain 2 life. If you do, draw a card.',
    expect: no('you may gain 2 life. If you do, draw a card.', 'effect.life', {
      reason: 'notRunnable',
    }),
    note: 'the engine cannot tell whether a gain of life was done: `may` wraps six kinds of effect',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you may exile it. When you do, draw a card. Gain 1 life.',
    expect: no('When you do, draw a card. Gain 1 life.', 'effect.draw', { reason: 'notRunnable' }),
    note: 'the reflexive ability is the last effect of its sequence',
  },
  {
    kind: 'sorcery',
    text: "Return target creature card from your graveyard to your hand. If it's not a Zombie card, draw a card.",
    expect: no("If it's not a Zombie card, draw a card.", 'spell.effect'),
    note: 'a negative condition is not read',
  },
  {
    kind: 'creature',
    text: '{T}: You may cast target Zombie creature card from a graveyard this turn.',
    expect: no('from a graveyard this turn.', 'effect.may-cast'),
    note: 'only a card of your own graveyard',
  },
  {
    kind: 'creature',
    text: '{2}: Return this card from your graveyard to the battlefield tapped.',
    expect: no('tapped.', 'effect.return-self'),
    note: 'the words after the battlefield are the counters of "with"',
  },
  {
    kind: 'land',
    text: '{T}, Pay life equal to the number of creatures you control: Add {B}.',
    expect: no(
      'Pay life equal to the number of creatures you control: Add {B}.',
      'cost.pay-life-amount',
      { reason: 'notRunnable' },
    ),
    note: 'a mana ability takes no amount of life (the engine pays a number there)',
  },
  {
    kind: 'creature',
    text: "Whenever another creature you control dies, put it into its owner's library third from the top.",
    expect: no("it into its owner's library third from the top.", 'noun.it', {
      reason: 'notRunnable',
    }),
    note: 'only for the card of ~ itself: "it" is a card the engine can name for the death of the source',
  },
  {
    kind: 'sorcery',
    text: 'Mill three cards, then draw that many cards.',
    expect: no('Mill three cards, then draw that many cards.', 'effect.mill', {
      reason: 'notRunnable',
    }),
    note: '"that many" counts what a sacrifice before it did, nothing else',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, sacrifice any number of creatures an opponent controls.',
    expect: no('an opponent controls.', 'noun.any-number-permanents'),
    note: 'you sacrifice only what you control',
  },
  {
    kind: 'sorcery',
    text: 'Gift a Food\nDraw a card.',
    expect: no('Gift a Food', 'none'),
    note: 'the other gifts (CR 702.174d, 702.174f to 702.174i) are not built',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, if the gift was promised, draw a card.',
    expect: { engine: 'need a gift ability' },
    note: 'read, and refused by the engine: the condition needs the keyword Gift on the face',
  },
];

runCorpus('the template corpus (stage P30): the cards of the golden corpus', REAL);
runCorpus('the template corpus (stage P30): the sibling wordings', SIBLINGS);
runCorpus('the template corpus (stage P30): what stays unread', UNREAD);
