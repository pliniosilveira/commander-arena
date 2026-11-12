// SPEC scenario test 28 (hidden information): a view never contains the opponent's hand contents
// or any library order. For every decision handed to an agent, in many games, we compute from the
// real state what the viewing seat may not know and check that none of it shows up in its view.
import {
  applyAction,
  type CardId,
  createGame,
  type GameConfig,
  type GameState,
  type GameView,
  getView,
  type ObjectId,
  type PendingDecision,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  type Agent,
  type DecideContext,
  RandomLegalAgent,
  replayGame,
  runGame,
} from '../src/index';
import {
  CTX,
  deckFromMix,
  LATER_STYLE_PAIRS,
  LIBRARY_STYLE_PAIRS,
  MANIFEST_STYLE_PAIRS,
  PLAY_RULE_STYLE_PAIRS,
  SEARCH_STYLE_PAIRS,
  smallGameConfig,
  stylesFor,
} from './helpers';

const LIMITS = { maxTurns: 150, maxActions: 5000 };

function nameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  if (obj === undefined) throw new Error(`${id} is not an object`);
  // Tokens have no card and abilities on the stack are not cards: they are public objects.
  if (obj.card === null)
    return obj.token === null ? `(ability ${id})` : obj.token.characteristics.name;
  const card = state.cards[obj.card];
  const def = card === undefined ? undefined : state.definitions[card.definition];
  if (def === undefined) throw new Error(`no definition for ${id}`);
  return def.name;
}

interface Secrets {
  /** Object ids the viewer must not see: the opponent's hand and every library. */
  readonly objectIds: Set<string>;
  /** Ids of the cards behind those objects. No view carries card ids except commanders' (public). */
  readonly cardIds: Set<string>;
  /** Names that appear only in the opponent's hand or in a library, nowhere the viewer can see. */
  readonly names: Set<string>;
}

/** What `viewer` may not know at this moment, computed from the real state. */
function secretsFor(state: GameState, viewer: SeatId): Secrets {
  const hidden: ObjectId[] = [];
  // D-128 (CR 702.143a): a foretold card is face down in exile and only its owner may look at it. That a card is
  // there is public (its object id is in the exile list), so only its name and its card id are secrets from the
  // other seat.
  const faceDown = state.exile.filter((id) => {
    const obj = state.objects[id];
    return obj?.foretoldTurn !== undefined && obj.owner !== viewer;
  });
  // D-965 (CR 708.5): a face-down permanent controlled by another player is a secret too: its card id, its name and its text are not shown, and its object is on the
  // battlefield as a 2/2 with a label. Which seat controls it is what the view says (control effects are derived, not stored).
  const shown = getView(state, viewer);
  const downOfOthers = [...state.battlefield, ...(state.phased ?? [])].filter((id) => {
    if (state.objects[id]?.faceDown === undefined) return false;
    const v = [...shown.battlefield, ...(shown.phasedOut ?? [])].find((o) => o.id === id);
    return v?.controller !== viewer;
  });
  const visible: ObjectId[] = [
    ...state.battlefield.filter((id) => !downOfOthers.includes(id)),
    ...state.exile.filter((id) => !faceDown.includes(id)),
    ...state.stack,
    // D-234 (CR 702.26): a phased-out permanent is on the battlefield, face up, and the view shows it to both players, so
    // its name is no secret even when another card of that name is in a library.
    ...(state.phased ?? []).filter((id) => !downOfOthers.includes(id)),
  ];
  faceDown.push(...downOfOthers);
  for (const seat of state.seats) {
    hidden.push(...seat.library);
    visible.push(...seat.graveyard, ...seat.command);
    if (seat.id === viewer) visible.push(...seat.hand);
    else hidden.push(...seat.hand);
  }
  const visibleNames = new Set(visible.map((id) => nameOf(state, id)));
  const objectIds = new Set<string>(hidden);
  const cardIds = new Set<string>();
  for (const id of [...hidden, ...faceDown]) {
    const card = state.objects[id]?.card;
    // A commander's card id is public: commander tax and commander damage are keyed by it.
    if (card !== null && card !== undefined && state.cards[card]?.isCommander !== true) {
      cardIds.add(card);
    }
  }
  const names = new Set(
    [...hidden, ...faceDown].map((id) => nameOf(state, id)).filter((n) => !visibleNames.has(n)),
  );
  return { objectIds, cardIds, names };
}

interface Audit {
  views: number;
  forbiddenIdsChecked: number;
  forbiddenNamesChecked: number;
  decisionViews: number;
  /** Views that contained combat state (attackers and blockers), and combat decisions shown. */
  combatViews: number;
  combatDecisionViews: number;
  /** Views of a library search: the searcher's (cards on offer) and everyone else's. */
  searchOwnViews: number;
  searchOtherViews: number;
  /** Views of a scry, surveil or reordering: the one who looks (cards on offer) and everyone else. */
  arrangeOwnViews: number;
  arrangeOtherViews: number;
  /** Views that showed the viewer the top card of their own library (CR 401.5, D-125). */
  topCardViews: number;
  /** Views that showed a face-down foretold card of the other seat as a placeholder (CR 702.143a, D-128). */
  faceDownViews: number;
  /** Views that showed a face-down permanent of the other seat as a labelled 2/2 (CR 708.2, D-965). */
  faceDownPermanentViews: number;
}

const newAudit = (): Audit => ({
  views: 0,
  forbiddenIdsChecked: 0,
  forbiddenNamesChecked: 0,
  decisionViews: 0,
  combatViews: 0,
  combatDecisionViews: 0,
  searchOwnViews: 0,
  searchOtherViews: 0,
  arrangeOwnViews: 0,
  arrangeOtherViews: 0,
  topCardViews: 0,
  faceDownViews: 0,
  faceDownPermanentViews: 0,
});

const COMBAT_KINDS = ['declareAttackers', 'declareBlockers', 'assignDamage'];

function auditView(state: GameState, viewer: SeatId, audit: Audit): void {
  const view = getView(state, viewer);
  const text = JSON.stringify(view);
  // The one exception to "no library card is known": a search shows the searcher the cards that
  // match (CR 701.23a), in the decision and in `pendingCards`, and only the searcher.
  const choosing = state.pending;
  const searching =
    choosing?.kind === 'chooseCards' && choosing.zone === 'library' && choosing.seat === viewer
      ? choosing
      : null;
  // The other exception: a scry, a surveil or a reordering shows the player who looks the top cards
  // (CR 701.22a, 701.25a), in the decision and in `pendingCards`, and only that player.
  const arranging = choosing?.kind === 'arrangeCards' && choosing.seat === viewer ? choosing : null;
  const { pending: _pending, pendingCards: _pendingCards, ...outsideTheChoice } = view;
  const exemptIds = new Set<ObjectId>(searching?.legal ?? arranging?.cards ?? []);
  // The third exception (CR 401.5, D-125): a permanent that says "You may look at the top card of your library
  // any time" shows its controller the top card of their own library, in their own view and nowhere else.
  for (const seat of view.seats) {
    if (seat.id !== viewer) {
      expect(seat.libraryTop, `viewer ${viewer} sees seat ${seat.id}'s top card`).toBeUndefined();
      continue;
    }
    if (seat.libraryTop === undefined) continue;
    audit.topCardViews += 1;
    expect(seat.libraryTop.id).toBe(state.seats[viewer]?.library[0]);
    const source = view.battlefield.some(
      (o) =>
        o.controller === viewer &&
        o.oracleText.toLowerCase().includes('look at the top card of your library'),
    );
    expect(source, 'a top card is shown with no permanent that allows it').toBe(true);
    exemptIds.add(seat.libraryTop.id);
  }
  const exemptCardIds = new Set<string>();
  const exemptNames = new Set<string>();
  for (const id of exemptIds) {
    const obj = state.objects[id];
    if (obj?.card != null) exemptCardIds.add(obj.card);
    exemptNames.add(nameOf(state, id));
  }
  const at = `turn ${state.turn.number}, action ${state.actionCount}, viewer ${viewer}`;
  audit.views += 1;
  // D-128: a foretold card of the other seat is a placeholder, a foretold card of the viewer is shown in full.
  for (const id of state.exile) {
    const obj = state.objects[id];
    if (obj?.foretoldTurn === undefined) continue;
    const shown = view.exile.find((o) => o.id === id);
    if (obj.owner === viewer) {
      expect(shown?.foretold, at).toBe(true);
      expect(shown?.name, at).toBe(nameOf(state, id));
    } else {
      expect(shown?.faceDown, at).toBe(true);
      expect(shown?.name, at).toBe('Face-down card');
      audit.faceDownViews += 1;
    }
  }

  // D-965: a face-down permanent of the other seat is a labelled 2/2 with nothing of its card.
  for (const id of [...state.battlefield, ...(state.phased ?? [])]) {
    const obj = state.objects[id];
    if (obj?.faceDown === undefined) continue;
    const shown = [...view.battlefield, ...(view.phasedOut ?? [])].find((o) => o.id === id);
    expect(shown?.faceDown, at).toBe(true);
    expect(shown?.name, at).toMatch(/^Face-down creature \d+$/);
    if (shown?.controller !== viewer) {
      audit.faceDownPermanentViews += 1;
      expect(shown?.hiddenFace, at).toBeUndefined();
      expect(shown?.oracleText, at).toBe('');
    }
  }

  // Only the viewer's own hand is listed; the opponent's is a count.
  for (const seat of view.seats) {
    const real = state.seats[seat.id];
    expect(seat.handCount, at).toBe(real?.hand.length);
    expect(seat.libraryCount, at).toBe(real?.library.length);
    if (seat.id === viewer) {
      expect(
        seat.hand?.map((o) => o.id),
        at,
      ).toEqual(real?.hand);
    } else {
      expect(seat.hand, at).toBeNull();
    }
  }

  // No library contents or order: the view has no library field at all, and no library object.
  const withoutTop = (v: unknown) =>
    JSON.stringify(v, (key, value) => (key === 'libraryTop' ? undefined : value));
  expect(
    searching === null && arranging === null ? withoutTop(view) : withoutTop(outsideTheChoice),
    at,
  ).not.toContain('"library"');
  expect(text, at).not.toContain('"libraryOrder"');

  // One assertion for all secrets: thousands of per-id expectations would dominate the runtime.
  const secrets = secretsFor(state, viewer);
  const leaks: string[] = [];
  for (const id of [...secrets.objectIds, ...secrets.cardIds]) {
    if (exemptIds.has(id as ObjectId) || exemptCardIds.has(id)) continue;
    audit.forbiddenIdsChecked += 1;
    if (text.includes(`"${id}"`)) leaks.push(`id ${id}`);
  }
  for (const name of secrets.names) {
    if (exemptNames.has(name)) continue;
    audit.forbiddenNamesChecked += 1;
    if (text.includes(JSON.stringify(name))) leaks.push(`name ${name}`);
  }
  if (choosing?.kind === 'chooseCards' && choosing.seat === viewer) {
    // The chooser is offered exactly the cards of the decision, nothing from the rest of the library.
    if (searching !== null) audit.searchOwnViews += 1;
    expect(
      view.pendingCards?.map((o) => o.id),
      at,
    ).toEqual(choosing.legal);
    expect(view.waitingOn, at).toBeUndefined();
  } else if (choosing?.kind === 'chooseCards') {
    // Everyone else sees that a search or a discard is in progress, and nothing more.
    expect(view.pendingCards, at).toBeUndefined();
    expect(view.waitingOn?.seat, at).toBe(choosing.seat);
    expect(view.waitingOn?.purpose, at).toBe(choosing.purpose);
    if (choosing.zone === 'library') audit.searchOtherViews += 1;
  } else if (choosing?.kind === 'arrangeCards' && choosing.seat === viewer) {
    // The one who looks is offered exactly the cards looked at, top first.
    audit.arrangeOwnViews += 1;
    expect(
      view.pendingCards?.map((o) => o.id),
      at,
    ).toEqual(choosing.cards);
    expect(view.waitingOn, at).toBeUndefined();
  } else if (choosing?.kind === 'arrangeCards') {
    // Everyone else sees that a scry, surveil or reordering is on, and nothing more.
    audit.arrangeOtherViews += 1;
    expect(view.pending, at).toBeNull();
    expect(view.pendingCards, at).toBeUndefined();
    expect(view.waitingOn?.seat, at).toBe(choosing.seat);
    expect(view.waitingOn?.purpose, at).toBe(choosing.purpose);
  } else {
    expect(view.pendingCards, at).toBeUndefined();
    expect(view.waitingOn, at).toBeUndefined();
  }
  expect(leaks, `${at}: leaked`).toEqual([]);

  // Combat is public (CR 506-509): attackers, what they attack and who blocks them are the same
  // for both seats and name only permanents on the battlefield, which both seats can see.
  const other = getView(state, viewer === 0 ? 1 : 0);
  expect(view.combat, `${at}: combat differs between seats`).toEqual(other.combat);
  expect(view.combat === null, `${at}: combat view`).toBe(state.combat === null);
  if (view.combat !== null) {
    audit.combatViews += 1;
    const onField = new Set<string>(state.battlefield);
    for (const a of view.combat.attackers) {
      expect(onField.has(a.object), `${at}: attacker ${a.object} is not on the battlefield`).toBe(
        true,
      );
      for (const b of a.blockedBy) expect(onField.has(b), `${at}: blocker ${b}`).toBe(true);
      if (a.target.kind === 'permanent') {
        // CR 506.4c: after the attacked planeswalker or battle dies the attacker stays in combat,
        // so the target may be an id that no longer exists; it is never a card in a hidden zone.
        const zone = state.objects[a.target.object]?.zone;
        expect(
          zone === undefined || zone === 'battlefield',
          `${at}: attack target in ${zone}`,
        ).toBe(true);
      }
    }
    // Nothing but these fields: no hand, library, or per-seat choice rides along with combat.
    expect(Object.keys(view.combat), at).toEqual(['attackers']);
    for (const a of view.combat.attackers) {
      expect(Object.keys(a).sort(), at).toEqual(['blocked', 'blockedBy', 'object', 'target']);
    }
  }

  // The pending decision is shown only to the seat that has to answer it.
  const pending = state.pending;
  expect(view.decidingSeat, at).toBe(pending?.seat ?? null);
  if (pending !== null && pending.seat === viewer) {
    expect(view.pending, at).toBe(pending);
    audit.decisionViews += 1;
    if (COMBAT_KINDS.includes(pending.kind)) {
      audit.combatDecisionViews += 1;
      // A combat decision names only battlefield permanents and seats: no hidden object id.
      const onField = new Set<string>(state.battlefield);
      for (const id of JSON.stringify(pending).match(/"o\d+"/g) ?? []) {
        expect(onField.has(id.slice(1, -1)), `${at}: ${pending.kind} names ${id}`).toBe(true);
      }
    }
  } else {
    expect(view.pending, at).toBeNull();
  }
}

/** Plays a game with random agents and audits the views of both seats at every decision. */
async function playAndAudit(config: GameConfig, agentSeeds: [number, number]): Promise<Audit> {
  const agents = [
    new RandomLegalAgent({ seed: agentSeeds[0] }),
    new RandomLegalAgent({ seed: agentSeeds[1] }),
  ] as const;
  const audit = newAudit();
  let state = createGame(config).state;
  while (state.result === null) {
    expect(state.turn.number).toBeLessThanOrEqual(LIMITS.maxTurns);
    const pending = state.pending;
    if (pending === null) throw new Error('no pending decision in a running game');
    // The view handed to the agent is audited at every decision. The other seat's view of the
    // same state is audited every fourth decision to keep the test fast.
    // Both seats see every card choice (a search or a discard), where the leaks would be.
    const viewers = state.seats
      .map((s) => s.id)
      .filter(
        (id) =>
          id === pending.seat ||
          state.actionCount % 4 === 0 ||
          pending.kind === 'chooseCards' ||
          pending.kind === 'arrangeCards',
      );
    for (const viewer of viewers) auditView(state, viewer, audit);

    const agent = agents[pending.seat];
    const view = getView(state, pending.seat);
    if (agent === undefined || view.pending === null) throw new Error('decision not visible');
    const action = await agent.decide(view, view.pending, CTX);
    const r = applyAction(state, pending.seat, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return audit;
}

describe('hidden information (SPEC scenario test 28)', () => {
  test('across 12 random games no view leaks the opponent hand or library order', async () => {
    const total = newAudit();
    // Deck styles rotate (spell mix, creature mixes with combat keywords), see stylesFor.
    for (let g = 1; g <= 12; g += 1) {
      const audit = await playAndAudit(smallGameConfig(g, stylesFor(g)), [500 + g, 900 + g]);
      for (const key of Object.keys(total) as (keyof Audit)[]) total[key] += audit[key];
    }
    // The audit was not vacuous: many views, many secret ids and names, and decision views.
    expect(total.views).toBeGreaterThan(5_000);
    expect(total.forbiddenIdsChecked).toBeGreaterThan(50_000);
    expect(total.forbiddenNamesChecked).toBeGreaterThan(0);
    expect(total.decisionViews).toBeGreaterThan(4_000);
    // Combat was on screen: views with attackers, and decisions of the three combat kinds.
    expect(total.combatViews).toBeGreaterThan(100);
    expect(total.combatDecisionViews).toBeGreaterThan(20);
  }, 120_000);

  test('search decks: only the searcher sees the cards on offer; the opponent sees a search is on', async () => {
    const total = newAudit();
    for (let g = 1; g <= 9; g += 1) {
      const styles = SEARCH_STYLE_PAIRS[g % SEARCH_STYLE_PAIRS.length] ?? ['search', 'search'];
      const audit = await playAndAudit(smallGameConfig(70 + g, styles), [100 + g, 200 + g]);
      for (const key of Object.keys(total) as (keyof Audit)[]) total[key] += audit[key];
    }
    // Searches happened, and both the searcher's and the opponent's views of them were audited.
    expect(total.searchOwnViews).toBeGreaterThan(20);
    expect(total.searchOtherViews).toBeGreaterThan(20);
    expect(total.forbiddenIdsChecked).toBeGreaterThan(10_000);
  }, 120_000);

  test('library decks: only the player who scries or surveils sees the cards looked at', async () => {
    const total = newAudit();
    for (let g = 1; g <= 9; g += 1) {
      const styles = LIBRARY_STYLE_PAIRS[g % LIBRARY_STYLE_PAIRS.length] ?? ['library', 'library'];
      const audit = await playAndAudit(smallGameConfig(80 + g, styles), [110 + g, 210 + g]);
      for (const key of Object.keys(total) as (keyof Audit)[]) total[key] += audit[key];
    }
    // Arrangements happened, and both the viewer's and the other seat's views of them were audited.
    expect(total.arrangeOwnViews).toBeGreaterThan(20);
    expect(total.arrangeOtherViews).toBeGreaterThan(20);
    expect(total.forbiddenIdsChecked).toBeGreaterThan(10_000);
  }, 120_000);

  test('play-rule decks: only the player with the permanent sees the top card of their own library', async () => {
    const total = newAudit();
    for (let g = 1; g <= 9; g += 1) {
      const styles = PLAY_RULE_STYLE_PAIRS[g % PLAY_RULE_STYLE_PAIRS.length] ?? [
        'playRules',
        'playRules',
      ];
      const audit = await playAndAudit(smallGameConfig(90 + g, styles), [120 + g, 220 + g]);
      for (const key of Object.keys(total) as (keyof Audit)[]) total[key] += audit[key];
    }
    // The top card was shown to its owner in many views, and never to anyone else (checked in auditView).
    expect(total.topCardViews).toBeGreaterThan(20);
    expect(total.forbiddenIdsChecked).toBeGreaterThan(10_000);
  }, 120_000);

  test('cast-later decks: a foretold card is face down to the other seat and nothing about it leaks', async () => {
    const total = newAudit();
    for (let g = 1; g <= 9; g += 1) {
      const styles = LATER_STYLE_PAIRS[g % LATER_STYLE_PAIRS.length] ?? ['later', 'later'];
      const audit = await playAndAudit(smallGameConfig(95 + g, styles), [130 + g, 230 + g]);
      for (const key of Object.keys(total) as (keyof Audit)[]) total[key] += audit[key];
    }
    // Foretold cards were on the table in many views, as placeholders for the other seat (checked in auditView).
    expect(total.faceDownViews).toBeGreaterThan(20);
    expect(total.forbiddenIdsChecked).toBeGreaterThan(10_000);
  }, 120_000);

  test('manifest decks: a face-down permanent of the other seat is a labelled 2/2 and nothing about its card leaks', async () => {
    const total = newAudit();
    for (let g = 1; g <= 9; g += 1) {
      const styles = MANIFEST_STYLE_PAIRS[g % MANIFEST_STYLE_PAIRS.length] ?? [
        'manifest',
        'manifest',
      ];
      const audit = await playAndAudit(smallGameConfig(120 + g, styles), [140 + g, 240 + g]);
      for (const key of Object.keys(total) as (keyof Audit)[]) total[key] += audit[key];
    }
    // Face-down permanents of the other seat were on the table in many views (checked in auditView), and their names and card ids were among the secrets.
    expect(total.faceDownPermanentViews).toBeGreaterThan(20);
    expect(total.forbiddenIdsChecked).toBeGreaterThan(10_000);
  }, 120_000);

  test('keyword-creature decks: combat views and combat decisions leak nothing', async () => {
    const total = newAudit();
    for (let g = 1; g <= 6; g += 1) {
      const config = smallGameConfig(40 + g, ['brawl', 'brawl']);
      const audit = await playAndAudit(config, [300 + g, 700 + g]);
      for (const key of Object.keys(total) as (keyof Audit)[]) total[key] += audit[key];
    }
    expect(total.combatViews).toBeGreaterThan(50);
    expect(total.combatDecisionViews).toBeGreaterThan(10);
  }, 120_000);

  test('with disjoint decks every card name in the opponent hand or library is a real secret', async () => {
    // Seat 0 holds only white cards and basic Plains; seat 1 holds cards seat 0 never has, so a
    // name that leaks from seat 1's hand or library is detectable for the whole game.
    const config: GameConfig = {
      seed: 99,
      decks: [
        deckFromMix({
          commander: 'Isamaru, Hound of Konda',
          lands: Array(10).fill('Plains'),
          spells: Array(12).fill("Angel's Mercy"),
        }),
        deckFromMix({
          commander: 'Yargle, Glutton of Urborg',
          lands: [...Array(5).fill('Swamp'), ...Array(5).fill('Island')],
          spells: [
            ...Array(4).fill('Murder'),
            ...Array(4).fill('Counterspell'),
            ...Array(4).fill('Divination'),
          ],
        }),
      ],
    };
    const audit = await playAndAudit(config, [1, 2]);
    // Seat 0 always has seat 1's unique cards to not know about.
    expect(audit.forbiddenNamesChecked).toBeGreaterThan(500);
  }, 60_000);

  test('the viewer sees own hand in full, with the objects of its pending decision', async () => {
    const created = createGame(smallGameConfig(4)).state;
    const pending = created.pending;
    if (pending === null || pending.kind !== 'mulligan') throw new Error('expected a mulligan');
    const own = getView(created, pending.seat);
    const other = getView(created, pending.seat === 0 ? 1 : 0);
    expect(own.seats[pending.seat]?.hand).toHaveLength(7);
    expect(own.pending).toEqual(pending);
    expect(other.pending).toBeNull();
    expect(other.seats[pending.seat]?.hand).toBeNull();
    expect(other.seats[pending.seat]?.handCount).toBe(7);
    // The mulligan decision lists the hand's object ids, so it must reach only its owner.
    for (const id of pending.kind === 'mulligan' ? pending.hand : []) {
      expect(JSON.stringify(other).includes(`"${id}"`)).toBe(false);
    }
  });
});

/**
 * The sample of the context (A31, D-161): a determinized copy for the deciding seat. A probe agent asks for one
 * at every decision and keeps it; the test replays the log to get the real state of each decision and compares.
 */
class SampleProbe implements Agent {
  readonly name = 'sample-probe';
  readonly samples: GameState[] = [];
  readonly inner: RandomLegalAgent;
  constructor(seed: number) {
    this.inner = new RandomLegalAgent({ seed });
  }
  async decide(view: GameView, decision: PendingDecision, ctx: DecideContext) {
    if (ctx.sample === undefined) throw new Error('the runner gave no sample');
    this.samples.push(ctx.sample(this.samples.length + 1));
    return this.inner.decide(view, decision, ctx);
  }
}

const cardIdsOf = (state: GameState, ids: readonly ObjectId[]): (CardId | null)[] =>
  ids.map((id) => state.objects[id]?.card ?? null);

describe('the sample handed to an agent (A31, D-161)', () => {
  test('it never carries the other seat hand or library in the real order, nor the real seed or rng', async () => {
    let checked = 0;
    for (let g = 1; g <= 4; g += 1) {
      const config = smallGameConfig(g, stylesFor(g));
      const probe = new SampleProbe(40 + g);
      const run = await runGame(config, [probe, new RandomLegalAgent({ seed: 80 + g })], LIMITS);
      expect(run.agentErrors).toEqual([]);
      expect(run.rejected).toEqual([]);
      // The probe was seat 0's agent: replay the log, and compare at each decision of seat 0.
      let state = createGame(config).state;
      let n = 0;
      for (const entry of run.log) {
        if (entry.seat === 0) {
          const sample = probe.samples[n];
          n += 1;
          if (sample === undefined) throw new Error('missing sample');
          const at = `game ${g}, action ${state.actionCount}`;
          expect(sample.rng, at).not.toEqual(state.rng);
          expect(sample.seed, at).not.toBe(state.seed);
          expect(getView(sample, 0), at).toEqual(getView(state, 0));
          const real = state.seats[1];
          const got = sample.seats[1];
          if (real === undefined || got === undefined) throw new Error('no seat 1');
          // Zone sizes are public; what the cards are is not.
          expect(got.hand.length, at).toBe(real.hand.length);
          expect(got.library.length, at).toBe(real.library.length);
          const realCards = [...cardIdsOf(state, real.hand), ...cardIdsOf(state, real.library)];
          const sampleCards = [...cardIdsOf(sample, got.hand), ...cardIdsOf(sample, got.library)];
          expect([...sampleCards].sort(), at).toEqual([...realCards].sort());
          if (realCards.length >= 8) {
            checked += 1;
            expect(sampleCards, at).not.toEqual(realCards);
            // Neither zone alone is the real one in order (a zone of one or two cards can match by chance).
            if (real.hand.length >= 4) {
              expect(cardIdsOf(sample, got.hand), at).not.toEqual(cardIdsOf(state, real.hand));
            }
            if (real.library.length >= 4) {
              expect(cardIdsOf(sample, got.library), at).not.toEqual(
                cardIdsOf(state, real.library),
              );
            }
          }
        }
        const r = applyAction(state, entry.seat, entry.action);
        if (!r.ok) throw new Error(r.error);
        state = r.state;
      }
      expect(n).toBe(probe.samples.length);
    }
    expect(checked).toBeGreaterThan(200);
  }, 120_000);

  test('asking for samples does not disturb the game, and an agent that ignores them plays as before', async () => {
    for (const g of [2, 5]) {
      const config = smallGameConfig(g, stylesFor(g));
      const plain = await runGame(
        config,
        [new RandomLegalAgent({ seed: 40 + g }), new RandomLegalAgent({ seed: 80 + g })],
        LIMITS,
      );
      const probe = new SampleProbe(40 + g);
      const probed = await runGame(config, [probe, new RandomLegalAgent({ seed: 80 + g })], LIMITS);
      expect(probed.log).toEqual(plain.log);
      expect(stateHash(probed.state)).toBe(stateHash(plain.state));
      expect(stateHash(replayGame(config, probed.log))).toBe(stateHash(probed.state));
    }
  }, 120_000);

  test('the same seed gives the same sample within a decision, another seed another', async () => {
    const seen: { same: boolean; other: boolean }[] = [];
    const inner = new RandomLegalAgent({ seed: 1 });
    const agent: Agent = {
      name: 'twice',
      async decide(view, decision, ctx) {
        const sample = ctx.sample;
        if (sample === undefined) throw new Error('no sample');
        const first = stateHash(sample(7));
        seen.push({
          same: first === stateHash(sample(7)),
          other: first !== stateHash(sample(8)),
        });
        return inner.decide(view, decision, ctx);
      },
    };
    await runGame(smallGameConfig(3), [agent, new RandomLegalAgent({ seed: 2 })], {
      maxTurns: 150,
      maxActions: 300,
    });
    expect(seen.length).toBeGreaterThan(20);
    expect(seen.every((s) => s.same)).toBe(true);
    expect(seen.filter((s) => s.other).length).toBeGreaterThan(seen.length / 2);
  });
});
