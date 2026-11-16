# Proposal: creatures must block this turn if able (issue 57)

**Status: approved by the owner on 2026-11-16; implementation in progress.**

## Card text that needs it

`Domineering Will` says: "Target player gains control of up to three target nonattacking creatures until end of turn. Untap those creatures. They block this turn if able." The control-change and untap instructions have existing engine paths. The final sentence does not: it gives each selected creature a requirement to block during the turn.

## Proposed shape

Add a temporary `mustBlock` requirement to the selected creatures for the current turn. During blocker declaration, the engine would test whether a proposed legal assignment satisfies as many applicable requirements as possible, alongside existing blocker legality and attacker-side requirements. The effect would add the requirement to the objects named by the spell at resolution; creatures entering later would not receive it. AI uses legal actions, but its blocker planner may need to rank assignments that satisfy the requirement.

Keep this distinct from `mustBeBlocked`, which is a requirement on the defending player to block a particular attacker. A creature that cannot legally block any attacker creates no legal blocking requirement to satisfy.

## Work and checks

- Confirm the exact rule and interactions against the Comprehensive Rules text before implementing; that source was unavailable in this session.
- Add engine scenarios for a creature that can block, one that cannot, multiple affected creatures and attackers, and interactions with existing requirements.
- Extend blocker-legality validation and AI choice generation to respect the requirement. Add parser support for the printed phrase and prove `Domineering Will` through the golden corpus.
- Update engine version, rules coverage and mechanics documentation after the approved behavior is implemented.

This is independent of the other unsupported cards in issue 57. Those cards can continue while this proposal waits.
