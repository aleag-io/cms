# Glossary

This glossary defines domain-specific terminology used throughout the CMS documentation.

---

## A

**Anointing of the Sick**
A sacrament administered to those who are seriously ill, offering spiritual strength, comfort, and healing grace.

**Apostolate**
A group dedicated to a specific ministry or mission within the Church (e.g., a Marian apostolate, pro-life apostolate).

**Audit Log**
A chronological record of all user actions in the system, used for security, compliance, and troubleshooting.

---

## B

**Baptism**
Also called **Holy Baptism**. The sacrament of initiation into the Church and the new covenant. A sacramental record is created for each baptism.

**Bishop**
The ordained leader of a diocese. In some jurisdictions, the title is Archbishop (for an archdiocese).

---

## C

**Campaign (Giving Campaign)**
A time-limited fundraising effort for a specific purpose (e.g., "Annual Parish Fund 2025," "Building Campaign").

**Catechism / Catechesis**
Religious instruction provided to Catholics, typically through formal classes. See also: _Faith Formation_, _RCIA_.

**Choir**
A music ministry that leads congregational singing at liturgical celebrations. Often a parish _Organization_ in the CMS.

**Confirmation**
Also called **Miron Anointing**. A sacrament in which a baptized person is strengthened by the Holy Spirit for Christian life and witness.

**CMS**
Church Management System — the software product described in this documentation.

---

## D

**Diocese**
A geographic administrative division of the Church, led by a Bishop. A diocese contains multiple _parishes_. In the CMS, the diocese is the **root tenant**.

**Donation**
A monetary gift made by a family or member to the parish, optionally associated with a _campaign_ or _fund_.

---

## E

**Envelope Number**
A unique identifier assigned to a family for tracking their giving contributions. Named after the physical giving envelopes used in many parishes.

---

## F

**Faith Formation**
Religious education programs for children, youth, and adults within a parish or diocese.

**Family**
A household unit registered with a parish. A family contains one or more _members_ with defined relationship roles.

**Feast Day**
A day in the liturgical calendar commemorating a saint, mystery of faith, or event in the life of Christ or Mary.

**Holy Communion (Holy Qurbana)**
The central sacramental act of worship in which believers partake of consecrated bread and wine in remembrance of Christ's sacrifice.

**Confession (Reconciliation)**
The sacrament of confessing sins to God and receiving absolution, often incorporated into liturgical worship.

**Fund**
A designated category for donated money (e.g., General Fund, Building Fund, Mission Fund, Special Collection).

---

## G

**Godparent**
A sponsor who witnesses the sacrament of Baptism or Confirmation and takes on a spiritual role in the recipient's faith journey. Recorded in the sacramental record.

**Giving Statement**
An annual document provided to families summarizing total contributions made during the year. Used for tax purposes (IRS documentation for charitable deductions).

---

## H

**Head of Household**
The primary adult member of a family record. Used to designate the family's primary contact for parish purposes.

**Holy Orders**
Also called **Ordination**. The sacrament by which persons are ordained to diaconal, priestly, or episcopal ministry.

**Holy Day of Obligation**
A feast day on which Catholics are obligated to attend Mass (e.g., Christmas, Assumption of Mary).

---

## I

**Inactive (Status)**
A member or family that is no longer actively participating in the parish, but whose records are retained for historical purposes.

---

## K

**Knights of Columbus**
A prominent Catholic fraternal organization commonly found at the parish level. May be modeled as a parish _Organization_ in the CMS.

---

## L

**Liturgical Calendar**
The official calendar of the Church year, including seasons (Advent, Lent, Ordinary Time), feasts, and solemnities.

**Liturgy**
The formal public worship of the Church, including Mass, the Liturgy of the Hours, and sacramental rites.

---

## M

**Marriage (Sacrament)**
A sacrament by which a man and woman enter into a covenant of lifelong union. The CMS records the date, presiding minister, spouse, and parish.

**Mass**
The central act of Catholic worship, also called the Eucharistic celebration or the Divine Liturgy.

**Mass Intention**
A Mass celebrated for a specific spiritual intention (e.g., the repose of the soul of a deceased person, or the healing of a sick family member). See also: _Feature Backlog_.

**Member**
An individual person associated with a parish, either through a family record or as a standalone registration.

**Ministry**
A structured service or apostolate within a parish (e.g., Eucharistic Ministers, Lectors, Altar Servers, Hospitality). In the CMS, ministries are modeled as _Programs_ or _Organizations_.

**Multi-tenancy**
An architecture in which a single software instance serves multiple isolated customer groups (tenants). In the CMS, the diocese is the root tenant and parishes are sub-tenants.

---

## O

**Organization**
In the CMS context, an ongoing group or association within the diocese or parish (e.g., parish council, youth group, Knights of Columbus). Distinct from a _Program_, which is time-limited.

---

## P

**Parish**
A local community of Catholic faithful, typically centered around a church building, led by a pastor. In the CMS, each parish is a sub-tenant of the diocese.

**Pastor**
The ordained priest assigned by the bishop to lead a parish.

**Parishioner**
A member of a parish community.

**Pledge**
A commitment by a family or member to give a specified amount over a defined period. May be associated with a giving _campaign_.

**Program**
In the CMS context, a structured, often time-limited educational or ministerial activity (e.g., RCIA, Faith Formation classes, confirmation preparation). Distinct from an _Organization_, which is ongoing.

---

## R

**RCIA (Rite of Christian Initiation for Adults)**
The formal process by which adults are received into the Catholic Church through the sacraments of Baptism, Confirmation, and Eucharist. Commonly managed as a _program_ in the CMS.

**Registration Date**
The date a family formally joined and registered at a parish.

**Role (RBAC)**
A defined set of permissions assigned to a user, determining what actions they can perform in the system. See [user-roles.md](user-roles.md).

**Row-Level Security (RLS)**
A database feature that restricts which rows a user can query or modify, used as a secondary defense for tenant data isolation.

---

## S

**Sacrament**
In the Mar Thoma Church, one of the seven sacramental rites: Holy Baptism, Holy Communion (Holy Qurbana), Confirmation (Miron Anointing), Confession (Reconciliation), Marriage (Matrimony), Ordination (Holy Orders), and Anointing of the Sick.

**Sacramental Record**
An official record of a sacrament administered to a person, including date, minister, parish, and register reference (book, page, entry number).

**SSO (Single Sign-On)**
An authentication method allowing users to log in using a third-party identity provider (e.g., Google Workspace, Microsoft Entra) rather than a separate username/password.

**Stewardship**
The practice of generous giving of time, talent, and treasure to support the parish community. In the CMS, stewardship features relate to giving campaigns and pledge management.

**Sub-tenant**
In a multi-tenant system, a tenant nested beneath another. In the CMS, each parish is a sub-tenant of the diocese.

---

## T

**Tenant**
A logically isolated customer in a multi-tenant system. The diocese is the root tenant; parishes are sub-tenants.

**Transfer (Member Transfer)**
The process of moving a family or member's active registration from one parish to another.

---

## V

**Volunteer**
A parishioner who donates their time to a ministry or program. The CMS tracks volunteer skills, interests, and program participation.

---

## W

**Webhook**
An HTTP callback that the CMS sends to external systems when specified events occur (e.g., "new member registered," "donation received").
