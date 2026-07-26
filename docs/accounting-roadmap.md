# Accounting Roadmap — Known Future Refinements

## Contracts: Schedule of Values (Fixed fee + Time & Material)

**Status:** Flagged for future work. Current implementation is intentionally kept simple.

**Today:** A contract holds a single flat `original_amount` ("Contract Amount"),
and Billed Amount is the sum of transactions tagged to it. Retainage is one
`default_retainage_percent` with per-line Default/Custom/Exempt overrides.

**Why it needs refinement:** Some contracts are not a single flat fee. Example:
the Intech TPS architect agreement (ITPS-001) is part **fixed fee** (design lump
sum) and part **time & material** (billed on actual hours/materials for certain
scopes, often with a not-to-exceed cap). A single Contract Amount can't describe
this, and "% billed vs contract" is only meaningful for the fixed / NTE portions.

**Intended direction:** Give each contract a Schedule of Values — one or more
scope lines, each marked **Fixed** (with a scheduled value) or **T&M** (with an
optional not-to-exceed, or left open). Billed amount rolls up per line; change
orders adjust a specific line or add one; uncapped T&M lines show no
percent-complete. This line structure is also what a contract-native G703 needs.

**Open question to resolve when building:** Do T&M portions usually carry a
not-to-exceed cap, or are they genuinely open-ended?

**Implications for building accounting features in the meantime:**
- Do NOT hard-code the assumption that Billed Amount cannot exceed Contract
  Amount — for T&M/mixed contracts, exceeding is legitimate, not an error.
- Design G702/G703 and reporting so they can later accommodate per-line
  Fixed vs T&M rather than a single contract total.

## Uncontracted transactions: "Non-contract cost" vs "Unassigned" (deferred)

Currently a transaction either has a contract (green dot) or does not (black dot).
"No contract" conflates two things: costs that legitimately never have a contract
(real estate taxes, HOA/owner dues, insurance, utilities) and contracted spend
that simply hasn't been tagged yet. A future refinement would make these two
explicit states so the team can filter for "contracted spend missing its tag"
without taxes/dues polluting the results.
