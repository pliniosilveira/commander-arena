// The template corpus of issue 144: the Oracle wording of Boggart Shenanigans, Gempalm Incinerator, Goblin Negotiation and Frontline Heroism, with the card's own name replaced by ~. Every line
// is SYNTHETIC (the card data of the issue was not fetched, so the cards themselves are not in the golden corpus): the first group is the wording of the issue, the siblings are variants of the
// same templates, and the last group is what stays unread, with where and why it stops. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const ISSUE: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'Whenever another Goblin you control is put into a graveyard from the battlefield, you may have ~ deal 1 damage to target player or planeswalker.',
    expect: OK,
    note: 'Boggart Shenanigans',
  },
  {
    kind: 'creature',
    text: 'Cycling {1}{R}\nWhen you cycle ~, you may have it deal X damage to target creature, where X is the number of Goblins on the battlefield.',
    expect: OK,
    note: 'Gempalm Incinerator',
    stats: ['2', '1'],
    noX: true,
  },
  {
    kind: 'sorcery',
    text: '~ deals X damage to target creature. Create a number of 1/1 red Goblin creature tokens equal to the amount of excess damage dealt to that creature this way.',
    expect: OK,
    note: 'Goblin Negotiation',
  },
  {
    kind: 'enchantment',
    text: 'When ~ enters, create a 1/1 red Soldier creature token with haste.\nWhenever you cast a spell that targets only a single creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that token.',
    expect: OK,
    note: 'Frontline Heroism',
  },
];

const SIBLINGS: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'Whenever another Goblin you control dies, you may have ~ deal 1 damage to any target.',
    expect: OK,
    note: '"have ~ deal" with any target',
  },
  {
    kind: 'creature',
    text: 'Cycling {1}{R}\nWhen you cycle ~, it deals 2 damage to target creature.',
    expect: OK,
    note: '"it" of a cycling trigger is the cycled card, which deals the damage from the graveyard',
  },
  {
    kind: 'creature',
    text: 'Cycling {1}{R}\nWhen you cycle ~, you may have it deal 2 damage to each opponent.',
    expect: OK,
    note: 'the causative with a player recipient',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ attacks, you may have it deal 2 damage to target player.',
    expect: OK,
    note: '"have it deal" outside a cycling trigger',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast an instant or sorcery spell that targets only a single creature you control, draw a card.',
    expect: OK,
    note: '"targets only a single creature you control" as a cast filter of its own',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast a spell that targets only a single creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell.',
    expect: OK,
    note: 'the copy keeps the target of the spell when the second sentence is missing',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'Whenever another Goblin you control dies, you may have ~ deals 1 damage to any target.',
    expect: no('deals 1 damage to any target.', 'effect.fight'),
    note: 'the verb after "have" is the bare one',
  },
  {
    kind: 'enchantment',
    text: 'Whenever another Goblin you control dies, you may have target creature deal 1 damage to any target.',
    expect: no('deal 1 damage to any target.', 'effect.fight'),
    note: 'only ~ and "it" are made to deal the damage',
  },
  {
    kind: 'enchantment',
    text: 'Whenever another Goblin you control dies, you may have ~ deal damage to any target.',
    expect: no('to any target.', 'effect.have-damage'),
    note: 'a stated amount',
  },
  {
    kind: 'sorcery',
    text: '~ deals X damage to target creature. Create a number of 1/1 red Goblin creature tokens equal to the amount of excess damage dealt to that player this way.',
    expect: no(
      'equal to the amount of excess damage dealt to that player this way.',
      'token.number-of',
    ),
    note: 'excess damage (CR 120.10) is dealt to a creature or a planeswalker',
  },
  {
    kind: 'sorcery',
    text: '~ deals X damage to target creature. Create a number of 1/1 red Goblin creature tokens equal to the amount of excess damage dealt this turn.',
    expect: no('equal to the amount of excess damage dealt this turn.', 'token.number-of'),
    note: 'only the damage of this resolution',
  },
  {
    kind: 'sorcery',
    text: 'Create a number of 1/1 red Goblin creature tokens equal to the amount of excess damage dealt to that creature this way.',
    expect: no(
      'Create a number of 1/1 red Goblin creature tokens equal to the amount of excess damage dealt to that creature this way.',
      'effect.create-token',
      { reason: 'notRunnable' },
    ),
    note: 'there is no damage instruction before it to count',
  },
  {
    kind: 'sorcery',
    text: '~ deals X damage to target creature. You gain life equal to the amount of excess damage dealt to that creature this way.',
    expect: no(
      'equal to the amount of excess damage dealt to that creature this way.',
      'effect.player.life',
    ),
    note: 'only the number of tokens reads the count',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast a spell that targets only a creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that token.',
    expect: no(
      'that targets only a creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that token.',
      'trigger.cast',
    ),
    note: '"only a creature" is not "only a single creature"',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast a spell that targets only a single creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that creature.',
    expect: no('The copy targets that creature.', 'ability.triggered'),
    note: 'only "that token"',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast a spell that targets only a single creature you control, copy that spell. The copy targets that token.',
    expect: { engine: "'moved' needs an exile, destroy or moveToZone effect before it" },
    note: 'read, and refused by the engine: no token was made before it, so the copy has nothing to target',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast a spell that targets only a single creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell. You may choose new targets for the copy. The copy targets that token.',
    expect: no('The copy targets that token.', 'ability.triggered'),
    note: 'the permission to choose and the new target are not said together',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast a spell that targets only a single creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell and the copy targets that token.',
    expect: no('and the copy targets that token.', 'effect.copy-spell'),
    note: 'the new target is a sentence of its own',
  },
];

runCorpus('the template corpus (issue 144): the wording of the issue', ISSUE);
runCorpus('the template corpus (issue 144): the sibling wordings', SIBLINGS);
runCorpus('the template corpus (issue 144): what stays unread', UNREAD);
