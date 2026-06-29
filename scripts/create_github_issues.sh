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

create_issue 'M1-FEAT' 'MVP1 Feature: Foundation, Tenancy, Identity, Core Membership' 'MVP1 - Foundation' 'phase:mvp1,area:backend,type:feature,priority:p0' 'Secure baseline with auth, tenant isolation, onboarding, member management, and auditing.'
create_issue 'M2-FEAT' 'MVP2 Feature: Parish Operations and Sharing Governance' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:backend,type:feature,priority:p0' 'Parish operations modules with governed sharing between parish and diocese.'
create_issue 'M3-FEAT' 'MVP3 Feature: Finance Core, Reporting, Integrations' 'MVP3 - Finance & Reporting' 'phase:mvp3,area:backend,type:feature,priority:p0,risk:finance' 'Finance workflows, reporting pack, exports, and external integrations.'
create_issue 'M4-FEAT' 'MVP4 Feature: Hardening, Compliance, Scale Readiness' 'MVP4 - Hardening (Optional)' 'phase:mvp4,area:infra,type:feature,priority:p1,risk:security' 'Performance, security, DR, accessibility, and production-readiness hardening.'

create_issue 'M1-01' 'M1-01 Project bootstrap, env strategy, CI checks' 'MVP1 - Foundation' 'phase:mvp1,area:infra,type:chore,priority:p0' 'Set up CI, quality gates, and environment strategy.'
create_issue 'M1-02' 'M1-02 Core schema migrations for diocese/parish/user' 'MVP1 - Foundation' 'phase:mvp1,area:data,type:feature,priority:p0' 'Create core multi-tenant schema and migrations.'
create_issue 'M1-03' 'M1-03 Auth integration and session handling in app shell' 'MVP1 - Foundation' 'phase:mvp1,area:auth-rls,type:feature,priority:p0' 'Implement login/session and role-aware shell.'
create_issue 'M1-04' 'M1-04 JWT custom claims mapping for tenant and roles' 'MVP1 - Foundation' 'phase:mvp1,area:auth-rls,type:feature,priority:p0' 'Map tenant and role claims to JWT.'
create_issue 'M1-05' 'M1-05 Baseline RLS policies for parish isolation' 'MVP1 - Foundation' 'phase:mvp1,area:auth-rls,type:feature,priority:p0,risk:security' 'Implement deny-by-default parish isolation policies.'
create_issue 'M1-06' 'M1-06 Audit event utility and append-only audit path' 'MVP1 - Foundation' 'phase:mvp1,area:backend,type:feature,priority:p1' 'Implement append-only audit trail for auth and CRUD.'
create_issue 'M1-07' 'M1-07 Parish onboarding and parish profile management' 'MVP1 - Foundation' 'phase:mvp1,area:frontend,type:feature,priority:p1' 'Build onboarding and profile UX/API.'
create_issue 'M1-08' 'M1-08 Family CRUD and identifier config implementation' 'MVP1 - Foundation' 'phase:mvp1,area:data,type:feature,priority:p1' 'Implement family lifecycle and identifier rules.'
create_issue 'M1-09' 'M1-09 Member CRUD including role-aware field visibility' 'MVP1 - Foundation' 'phase:mvp1,area:frontend,type:feature,priority:p1' 'Implement member CRUD with field-level role visibility.'
create_issue 'M1-10' 'M1-10 Authorization and tenancy integration test suite' 'MVP1 - Foundation' 'phase:mvp1,area:qa,type:chore,priority:p0,risk:security' 'Add integration tests for role and tenancy isolation.'

create_issue 'M2-01' 'M2-01 Programs and enrollments module' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:frontend,type:feature,priority:p1' 'Implement programs and enrollment workflows.'
create_issue 'M2-02' 'M2-02 Organizations model with membership mode defaults' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:data,type:feature,priority:p1' 'Implement organizations and membership mode defaults.'
create_issue 'M2-03' 'M2-03 DB-level exclusive membership constraint enforcement' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:data,type:feature,priority:p0' 'Add DB enforcement for exclusive membership mode.'
create_issue 'M2-04' 'M2-04 Events, RSVP, attendance workflows' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:frontend,type:feature,priority:p1' 'Implement event lifecycle, RSVP, and attendance.'
create_issue 'M2-05' 'M2-05 Facilities and booking conflict handling' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:backend,type:feature,priority:p2' 'Implement facilities booking and conflict rules.'
create_issue 'M2-06' 'M2-06 DataSharingRequest lifecycle endpoints and notifications' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:backend,type:feature,priority:p0' 'Implement sharing request lifecycle and notifications.'
create_issue 'M2-07' 'M2-07 DataSharingGrant management UI for parish admins' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:frontend,type:feature,priority:p0' 'Create UI for sharing grants and revocation.'
create_issue 'M2-08' 'M2-08 RLS grant-based category access policies' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:auth-rls,type:feature,priority:p0,risk:security' 'Implement grant-aware category-level RLS access.'
create_issue 'M2-09' 'M2-09 Diocese aggregate dashboard and summary report endpoints' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:backend,type:feature,priority:p1' 'Implement aggregate-only diocese reporting layer.'
create_issue 'M2-10' 'M2-10 Member self-registration plus approval queue' 'MVP2 - Operations & Sharing' 'phase:mvp2,area:frontend,type:feature,priority:p2' 'Implement self-registration and approval queue with audit trail.'
