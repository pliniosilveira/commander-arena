# Lord of the Nazgûl deck: remaining subsystem proposals (issue 57)

These proposals use only the card text supplied in issue 57 and existing repository behavior. The Comprehensive Rules text and Scryfall rulings were unavailable in this workspace; citations and card-specific rulings remain unverified. No implementation in these slices should be marked supported before the real-card acceptance scenarios pass.

## March of Swirling Mist — variable exile cost and cost reduction

**Gap class: S (cost-payment and cost-adjustment slice).** The existing phasing effect is sufficient, but the spell lets its caster optionally exile any number of blue cards from hand as an additional cost, then reduces its generic mana cost by two for each card exiled this way. The spell also phases out up to X target creatures.

**Proposed design:** represent the optional exile as a spell additional cost, ask for the chosen cards during the normal cost-payment sequence, record the number paid on that spell, and apply the matching generic reduction to that cast only. Keep X announcement and target selection consistent with the number of legal creature targets and preserve the chosen value on a copy. The exile must be paid as a cost, even when the reduction makes the mana portion zero.

**Proof:** cast with zero, one, and multiple eligible cards; verify the offered generic costs, payment and exile zone; decline the optional cost; test X at zero and with fewer legal creatures than the initially chosen X; test a spell copy; and verify that only the chosen targets phase out. Run parser/engine tests, both package typechecks, lint and regenerate corpus/digests.

## Fandaniel, Telophoroi Ascian — opponent-by-opponent optional sacrifice

**Gap class: S (resolution decisions across opponents).** At the beginning of its controller's end step, each opponent may sacrifice a nontoken creature of their choice; each opponent who declines loses two life for each instant and sorcery card in its controller's graveyard.

**Proposed design:** add a general per-opponent resolving choice that is presented to each opponent in turn order. Each can select one creature they control or decline; the following loss applies only to opponents who declined and uses the graveyard count specified by the card text. Keep the choices and resulting life changes in the ordinary deterministic action/event log. The implementation must distinguish a creature sacrificed by its controller from a token or an opponent's other permanent.

**Proof:** two opponents independently choose sacrifice and decline; test no legal nontoken creature, token-only boards, zero matching graveyard cards, and intervening changes before each player's choice. The end-step trigger and every opponent's result must be covered by a real-card engine scenario.

## Lord of the Nazgûl — Ring-bearer protection and Wraith threshold

**Gap class: S (protection from a game designation plus conditional group base stats).** The static ability gives Wraiths controlled by the card's controller protection from Ring-bearers. Its cast trigger creates a 3/3 black Wraith with menace for each instant or sorcery cast; if the controller then controls at least nine Wraiths, their Wraiths have base power and toughness 9/9 until end of turn.

**Proposed design:** extend protection to a general object predicate that can identify Ring-bearers, and add a continuous-effect condition that counts the controller's Wraiths after the token is created. Apply the 9/9 base values in the base-power/toughness layer for the remainder of the turn; later counters and modifiers continue to apply. Count the newly created token and stop the effect when its duration ends.

**Proof:** protection prevents targeting, damage, blocking and attachment as applicable; Ring-bearer designation changes are reflected immediately. Threshold tests cover eight, nine and more Wraiths, the newly created token crossing the threshold, non-Wraith creatures, counters/modifiers and end-of-turn expiry.

## Maskwood Nexus — all creature types across object zones

**Gap class: S (characteristic-defining type effect across zones).** Creatures controlled by the artifact, creature spells its controller controls, and creature cards its owner owns outside the battlefield are every creature type. Its activated ability creates the specified blue Shapeshifter token with changeling.

**Proposed design:** implement the all-creature-types characteristic effect as a continuous effect with the correct zone and controller/owner scope. Ensure it composes with printed types and other type-setting effects under the existing layer machinery. Reuse the existing changeling keyword behavior for the token rather than adding a card-name special case.

**Proof:** check creatures, creature spells, creature cards in hand/graveyard/exile, and cards owned by the controller in another player's zone; verify noncreature cards and opponents' spells are unaffected. Test type choices/counts and type-dependent spell legality with and without the artifact, plus token creation and type layers.

## Sauron's Ransom — hidden pile division and private information

**Gap class: S (hidden-information choices involving another player).** The card's controller chooses an opponent; that opponent looks at the top four cards of the controller's library and separates them into one face-down and one face-up pile. One pile goes to the controller's hand and the other to their graveyard, then the Ring tempts them.

**Proposed design:** add a decision owned by the chosen opponent to divide the revealed cards into two piles, preserve the face-down pile's hidden contents from unauthorized views and logs, then ask the spell's controller which pile goes to their hand. Move all four cards in one resolution and tempts the controller afterward. Represent private knowledge explicitly so public game views, logs and replay do not disclose the face-down pile's identities to the wrong seats.

**Proof:** cover every split shape (including an empty pile if rules permit), pile selection, library exhaustion, card ownership, public versus private views/logs, replay determinism and the subsequent Ring temptation. The scenario must assert both each seat's view and the final zones.

## Approval

These are separate subsystems and should be approved individually or together before implementation. Work may proceed on another card only when its gap is independent of these designs. Once approved, move the relevant proposal into `docs/design/` and record the implementation decision in `docs/DECISIONS.md`.
