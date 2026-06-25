# Features

## Overview

This document provides a detailed description of each feature area of the Mar Thoma Church Management System (CMS) for the Diocese of North America, organized by functional domain. Each feature includes a description, key workflows, and notes for refinement.

---

## 1. Diocese Administration

### 1.1 Diocese Dashboard

**Summary:** A high-level overview of the entire diocese with at-a-glance statistics.

**Key Information Displayed:**

- Total parishes, active families, and registered members
- Recent registrations and membership changes
- Upcoming diocese-wide events
- Aggregate giving summary for current period
- Alerts (pending tasks, parishes with incomplete data)

**User:** Diocese Admin, Diocese Staff

---

### 1.2 Parish Management

**Summary:** Create and manage all parishes within the diocese.

**Key Workflows:**

1. Create a new parish (name, address, pastor, contact info)
2. Assign a Parish Admin user to a parish
3. Update parish profile and settings
4. View parish health metrics (membership trends, event activity)
5. Deactivate or merge parishes
6. Transfer families/members between parishes

**User:** Diocese Admin

---

### 1.3 Diocese Programs

**Summary:** Manage programs that operate across the entire diocese or are shared with parishes.

**Examples:** Religious education standards, diocesan youth ministry, RCIA curriculum

**Key Workflows:**

1. Create a diocese-wide program with description and dates
2. Associate program with participating parishes
3. Track enrollment counts by parish
4. Assign a diocesan coordinator
5. Archive or close completed programs

---

### 1.4 Diocese Organizations

**Summary:** Manage organizations that operate at the diocese level.

**Examples:** Diocesan pastoral council, Knights of Columbus chapter, Catholic Charities

**Key Workflows:**

1. Create and describe an organization
2. Manage organization leadership (diocese-level)
3. Link chapters at the parish level
4. Track membership across parishes

---

### 1.5 Diocese Communications

**Summary:** Send mass communications to all parishes or targeted subsets.

**Key Workflows:**

1. Compose message (email/newsletter)
2. Select recipients: all parishes, specific parishes, all Parish Admins
3. Schedule or send immediately
4. View delivery reports and open rates
5. Manage communication templates

---

### 1.6 Liturgical Calendar

**Summary:** Maintain and publish the official diocesan liturgical calendar.

**Key Features:**

- Feast days, holy days of obligation, diocesan events
- Publishable to all parishes
- Exportable as iCal / PDF
- Parishes can add local events without modifying diocesan entries

---

## 2. Parish Administration

### 2.1 Parish Dashboard

**Summary:** A parish-specific overview for daily operations.

**Key Information Displayed:**

- Total families and members
- New registrations this month
- Upcoming events this week
- Recent donations and giving totals
- Pending tasks (incomplete sacramental records, pending RSVPs)
- Communications sent/received

**User:** Parish Admin, Parish Staff

---

### 2.2 Membership Management

#### 2.2.1 Family Registration

**Summary:** Register a new family unit with the parish.

**Key Workflows:**

1. Enter family name, mailing address, primary contact info
2. Assign envelope number
3. Add family members and define relationships
4. Set registration date and status
5. Optionally send welcome communication

#### 2.2.2 Member Registration

**Summary:** Add individual members, either as part of a family or standalone.

**Key Workflows:**

1. Enter personal information (name, DOB, gender, contact)
2. Link to an existing family or create a new family record
3. Set relationship role within family
4. Upload member photo
5. Record initial sacramental information
6. Enter education level and work notes
7. (Clergy only) Enter private notes — this field is only visible to parish clergy

#### 2.2.3 Member Search & Directory

**Summary:** Search and browse parish membership.

**Key Features:**

- Search by name, family, member number, status, sacrament, program, organization
- Export member directories (PDF, CSV) — private notes are always excluded from exports
- Filter by ministry, age group, status
- View complete member profile

#### 2.2.4 Extended Family Relationships

**Summary:** Link members across separate family records to capture extended family ties within the parish.

**Key Workflows:**

1. From a member's profile, add a relationship to another member at the same parish
2. Select the relationship type (parent, grandparent, sibling, aunt/uncle, cousin, in-law, etc.)
3. Relationship is stored bidirectionally so both members show the link
4. Extended family relationships are visible on the member profile for pastoral context

**Example:** John Smith (family #100) is the son of Robert Smith (family #101). The `MemberRelationship` record links John → Robert as `parent` / Robert → John as `child`, even though they belong to separate family records.

#### 2.2.4 Member Transfers

**Summary:** Handle parishioners moving to or from another parish.

**Key Workflows:**

1. Initiate transfer request (from origin or destination parish)
2. Transfer carries member record, sacramental history, giving history
3. Receiving parish reviews and accepts transfer
4. Original parish record is marked "transferred"

---

### 2.3 Sacramental Records

**Summary:** Record and retrieve official sacramental records for each member.

**Supported Sacraments:**
| Sacrament | Key Data Captured |
|-----------|------------------|
| Baptism | Date, presiding priest, godparents, parish |
| First Communion | Date, presiding priest, parish |
| Confirmation | Date, presiding bishop/priest, sponsor, parish |
| Marriage | Date, spouse, witnesses, presiding minister, parish |
| Anointing of the Sick | Date, presiding priest, parish |
| Holy Orders | Date, ordaining bishop, parish |

**Key Workflows:**

1. Search for member
2. Add sacramental record with all required fields
3. Record book/page/entry numbers for official register reference
4. Print sacramental certificates
5. Generate sacramental history report per member

**Privacy Note:** Sacramental records are restricted to Parish Admin and explicitly authorized Parish Staff.

---

### 2.4 Events & Scheduling

**Summary:** Plan, publish, and track parish events.

**Key Workflows:**

1. Create an event with title, type, date/time, location, description
2. Set recurrence for regular events (weekly Mass, monthly meeting)
3. Publish to parish calendar (and optionally public)
4. Enable RSVP with optional capacity limits
5. Record attendance after the event
6. Send reminders to registered attendees

**Event Types:**

- Mass / Liturgy
- Sacramental preparation class
- Parish meeting
- Social event / fundraiser
- Retreat / pilgrimage
- Youth event
- Community outreach

---

### 2.5 Facility Management

**Summary:** Manage rooms and spaces within the parish and coordinate bookings.

**Key Features:**

- Define facilities (names, capacity, equipment, availability)
- Book a facility for an event
- View facility calendar to avoid conflicts
- Manage maintenance or closure periods

---

### 2.6 Parish Programs & Ministries

**Summary:** Manage parish-level programs and enroll members.

**Examples:** RCIA, Faith Formation, Choir, Altar Servers, Youth Group, Men's Group, Women's Group

**Key Workflows:**

1. Create a program with type, description, schedule, and coordinator
2. Enroll members (admin-initiated or self-enrollment via portal)
3. Track session attendance within the program
4. Mark program completion for individual participants
5. Archive completed programs

---

### 2.7 Parish Organizations

**Summary:** Manage guilds, councils, apostolates, fellowship groups, and other organizations within the parish.

**Supported Organization Types:** Youth Fellowship, Young Family Fellowship, Sunday School, Prayer Group, Women's Guild, Men's Group, Choir, Knights of Columbus chapter, Parish Council, Finance Committee, Apostolate, Confraternity, Sodality, Third Order, and other custom types.

**Organization Type and Membership Mode:**

When an admin creates an organization, the **type is required**. The type determines the default **membership mode**:

| Membership Mode                        | Behavior                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `open` (default for most types)        | A member may belong to any number of active organizations of this type simultaneously.            |
| `exclusive` (default for Prayer Group) | A member may belong to **only one** active organization of this type at a time within the parish. |

The admin may override the default membership mode when creating or editing an organization. This allows, for example, designating a particular choir as exclusive if the parish policy requires it.

**Key Workflows:**

1. Create organization record — **type is required**; name, description, meeting schedule, membership mode (defaults from type), and ledger flag are also set at this step.
2. Manage membership roster — adding a member to an `exclusive`-mode organization surfaces an error and blocks the action if the member already has an active membership in another organization of the same type; the admin must end the prior membership first.
3. Manage **organization officers**: add officers with formal titles (President, Vice President, Secretary, Treasurer, Chaplain, etc.) and optional term dates. Multiple officers may hold different roles simultaneously. Track officer history when terms end.
4. Track meeting history
5. Link to related events and programs
6. (When `has_own_ledger = true`) Manage organization-level chart of accounts and double-entry journal entries, separate from the parish general ledger. The parish admin retains read-only visibility into all organization ledgers.

---

### 2.8 Parish Officers & Board

**Summary:** Manage the official officers of the parish itself — both clergy and lay leadership.

**Key Workflows:**

1. Add clergy officers (Vicar, Associate Pastor, Deacon) with title and effective dates
2. Add lay board/committee officers (Board Chairman, Executive Committee member, Trustee, Finance Committee member, Secretary, Treasurer)
3. View current officer roster and historical terms
4. Officers designated as clergy automatically receive access to member private notes within the parish

**User:** Parish Admin

---

### 2.8 Communications

**Summary:** Send targeted communications to parish members.

**Channels Supported:** Email (Resend/SendGrid), SMS (Twilio). Browser push notifications are planned for a future phase.

**Key Workflows:**

1. Compose message using a rich-text editor
2. Choose audience: all parishioners, specific families, program enrollees, organization members
3. Choose delivery channel: email, SMS, or both
4. Schedule delivery or send immediately
5. View delivery status and open/click metrics
6. Member opt-out management per channel

**Templates:** Common templates provided (weekly bulletin, event reminder, sacramental prep reminder, giving statement).

---

### 2.9 Giving & Stewardship

#### 2.9.1 Chart of Accounts

- Each parish maintains a chart of accounts defining funds and expense/income categories
- Standard account types: General Fund, Building Fund, Missions, Salaries, Utilities, etc.
- Accounts can be added or customized per parish

#### 2.9.2 General Ledger

- Double-entry journal entries record all financial transactions
- Each entry includes: date, accounts debited/credited, amounts, description, and reference
- Ledger supports month-end and year-end close processes
- Full transaction history with audit trail
- Export to CSV for import into external accounting tools (QuickBooks, etc.)

#### 2.9.3 Giving Campaigns

- Create campaigns with goals, dates, and fund designations
- Track progress against goal (total received vs. pledged vs. goal)
- Assign campaign to specific account in the chart of accounts

#### 2.9.4 Donation Recording

- Record individual donations linked to a family or member
- Support multiple payment methods (cash, check, online, ACH)
- Track check numbers and payment processor transaction IDs
- Import donation batches from CSV
- Donations automatically generate ledger journal entries

#### 2.9.5 Pledge Management

- Create pledge commitments for campaigns
- Track fulfillment status and reminders
- Generate pledge reminders for lapsed pledges

#### 2.9.6 Online Giving Integration (Stripe)

- Accept payments via Stripe (one-time and recurring)
- Donations automatically create records and ledger entries
- Webhook-driven: Stripe events trigger database updates

#### 2.9.7 Financial Reports

- Income statement (revenue vs. expenses by period)
- Balance sheet
- Fund balance summary
- Giving summary by fund, campaign, and period
- Pledge fulfillment report

#### 2.9.8 Annual Giving Statements

- Generate IRS-compliant giving statements per family
- Batch generation and bulk email delivery
- Export as PDF

---

## 2.10 Church Admin Settings

**Summary:** A dedicated settings area for Parish Admins to configure parish-specific behavior, including member ID formatting, granular role permissions, and parish officer management.

### 2.10.1 Member ID Configuration

- Set the member number format: prefix (optional), digit width, starting value, auto-increment on/off
- Preview how a sample number will look with current settings
- Reassign or manually override individual member numbers

### 2.10.2 Granular Permissions

- View a permission matrix showing every role's capabilities for the parish's resources
- Override individual role/resource/action combinations above or below the system defaults
- Examples of configurable overrides:
  - Allow `parish_staff` to read and write sacramental records
  - Restrict `organization_leader` from exporting member data
  - Allow a specific `ministry_leader` to send communications directly without approval
- All overrides are logged to the audit trail and can be reset to system defaults
- Parish Admins cannot grant permissions they do not themselves hold

### 2.10.3 Parish Officers & Board

_(See 2.8)_

### 2.10.4 Organization Ledger Settings

- Enable or disable the own-ledger feature per organization
- View a summary of all active organization ledgers within the parish

---

## 3. Member Self-Service Portal

**Summary:** A simplified interface for parishioners to manage their own information and engage with the parish.

### 3.1 Profile Management

- Update personal contact information
- Upload profile photo
- Manage communication preferences (email, SMS, opt-outs)

### 3.2 Family Record View

- View household members and relationships (read-only)
- Request updates via parish office

### 3.3 Sacramental History

- View own sacramental records (read-only)
- Request official certificates via portal (fulfilled by parish admin)

### 3.4 Giving History

- View personal/family giving history
- Download annual giving statement
- Set up or modify recurring online giving

### 3.5 Events & RSVP

- Browse parish event calendar
- RSVP to upcoming events
- View registered events

### 3.6 Ministry Enrollment

- Browse available parish programs and ministries
- Request enrollment (approved by Ministry Leader or Parish Admin)
- View enrolled programs and upcoming sessions

---

## 4. Reporting & Analytics

### 4.1 Standard Reports

| Report                   | Level            | Description                                |
| ------------------------ | ---------------- | ------------------------------------------ |
| Membership Summary       | Diocese / Parish | Counts by status, age, gender              |
| New & Lost Members       | Parish           | Registrations and departures by period     |
| Sacramental Statistics   | Diocese / Parish | Sacraments administered by type and period |
| Event Attendance         | Parish           | Attendance by event and aggregate          |
| Program Enrollment       | Parish           | Enrollment by program and completion rates |
| Giving Summary           | Parish           | Total donations by fund, campaign, period  |
| Pledge Fulfillment       | Parish           | Pledge status and fulfillment rate         |
| Annual Giving Statements | Parish           | Per-family tax statements                  |
| Parish Health Dashboard  | Diocese          | Comparative metrics across parishes        |

### 4.2 Ad-Hoc Reporting

- Filter-based query builder for advanced users
- Exportable to CSV, Excel, PDF

### 4.3 Audit Reports

- Access log: who accessed what and when
- Change history for sensitive records

---

## 5. System Administration

### 5.1 User Management

- Create, update, deactivate, and unlock user accounts
- Assign roles and scoped access
- Force MFA enrollment
- View user login history

### 5.2 Audit Log Viewer

- Browse and search audit entries
- Filter by user, action type, entity, and date range
- Export audit reports

### 5.3 Data Import/Export

- Import members from CSV
- Import historical donation data from CSV
- Export full parish data snapshot

### 5.4 Notification Settings

- Configure which system events trigger notifications
- Set notification channels per event type
- Manage parish communication templates

---

## 6. Feature Backlog (Proposed for Future Phases)

| Feature                    | Description                                                                                                         | Priority              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Expo Mobile App            | Separate React Native / Expo project with offline capability and native device features. Consumes the CMS REST API. | High (future project) |
| Browser Push Notifications | In-app and browser push notifications for event reminders and communications                                        | Medium                |
| Volunteer Scheduling       | Schedule volunteers for Masses and events by ministry/role                                                          | TBD                   |
| Cemetery Records           | Track parish cemetery plots and burials                                                                             | TBD                   |
| School Integration         | Link CMS to parish school student records                                                                           | TBD                   |
| Mass Intentions            | Record and manage Mass intention requests and scheduling                                                            | TBD                   |
| Property Management        | Track parish-owned property assets and maintenance                                                                  | TBD                   |
| Multi-language Support     | Localization for Spanish and other common languages                                                                 | TBD                   |
| Multiple Diocese Support   | Extend the tenancy model to support additional dioceses                                                             | Future priority       |
