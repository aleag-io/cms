#!/usr/bin/env bash
set -euo pipefail
repo='aleag-io/cms'

create_issue() {
  local id="$1"
  local title="$2"
  local milestone="$3"
  local labels="$4"
  local summary="$5"

  if gh issue list -R "$repo" --state all --limit 500 --search "\"$title\" in:title" --json title --jq '.[] | select(.title=="'"$title"'") | .title' | grep -Fxq "$title"; then
    echo "exists: $id"
    return
  fi

  local body
  body=$(cat <<EOF
## Summary
$summary

## Definition of Done
- [ ] Implementation merged with tests
- [ ] Access control behavior verified
- [ ] Audit logging covered where applicable
- [ ] Documentation updated

Sequence ID: $id
EOF
)

  local url
  url=$(gh issue create -R "$repo" --title "$title" --body "$body" --milestone "$milestone" --label "$labels")
  echo "created: $id -> $url"
}

create_issue 'M3-01' 'M3-01 Chart of accounts and journal entry schema' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:data,type:feature,priority:p0,risk:finance' 'Implement finance schema for accounts, journals, and posting references.'
create_issue 'M3-02' 'M3-02 Double-entry posting engine with invariant checks' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:backend,type:feature,priority:p0,risk:finance' 'Implement double-entry posting engine with balancing invariants and tests.'
create_issue 'M3-03' 'M3-03 Maker-checker policy engine by scope' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:auth-rls,type:feature,priority:p0,risk:finance' 'Implement strict/threshold/hybrid approval policy engine across scopes.'
create_issue 'M3-04' 'M3-04 Budgets and variance reporting' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:backend,type:feature,priority:p1,risk:finance' 'Implement annual budgets and variance reporting across account/fund dimensions.'
create_issue 'M3-05' 'M3-05 Vendor bills and payment workflow' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:backend,type:feature,priority:p1,risk:finance' 'Implement vendor bill lifecycle and payment execution workflow.'
create_issue 'M3-06' 'M3-06 Period open/close/reopen with audited reason' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:backend,type:feature,priority:p0,risk:finance' 'Implement period state transitions and mandatory audit reasons for reopen.'
create_issue 'M3-07' 'M3-07 Stripe webhook ingestion with idempotency' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:infra,type:feature,priority:p1,risk:finance' 'Implement replay-safe webhook handling and donation ingestion.'
create_issue 'M3-08' 'M3-08 Giving statements and financial report pack exports' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:backend,type:feature,priority:p1,risk:finance' 'Implement statements and export pack with role-safe field projections.'
create_issue 'M3-09' 'M3-09 Bank reconciliation via CSV import' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:backend,type:feature,priority:p2,risk:finance' 'Implement CSV-based reconciliation workflow and matching engine.'
create_issue 'M3-10' 'M3-10 Finance UAT and regression suite' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:qa,type:chore,priority:p0,risk:finance' 'Create finance UAT scripts and regression suite for month-end scenarios.'

create_issue 'M4-01' 'M4-01 Load and performance tuning against p95 targets' 'MVP4 - Hardening (Optional)' 'phase:mvp4,area:infra,type:feature,priority:p1' 'Tune query and app performance to meet p95 latency objectives.'
create_issue 'M4-02' 'M4-02 Security review and RLS policy hardening pass' 'MVP4 - Hardening (Optional)' 'phase:mvp4,area:auth-rls,type:feature,priority:p0,risk:security' 'Perform security review and harden RLS with remediation tracking.'
create_issue 'M4-03' 'M4-03 DR drill and backup restore validation' 'MVP4 - Hardening (Optional)' 'phase:mvp4,area:infra,type:chore,priority:p1' 'Run disaster recovery drill and validate backup/restore procedures.'
create_issue 'M4-04' 'M4-04 Accessibility audit closure and UX polish' 'MVP4 - Hardening (Optional)' 'phase:mvp4,area:frontend,type:feature,priority:p1' 'Close accessibility gaps and finalize UX quality for production readiness.'
