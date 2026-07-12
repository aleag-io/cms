-- Native Supabase branch seed.
-- Synthetic data only. Supabase branching does not run seed files in production.
-- Disposable login: preview.admin@example.invalid / Preview@Local1

BEGIN;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'preview.admin@example.invalid',
  extensions.crypt('Preview@Local1', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Preview Diocese Admin"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = now();

INSERT INTO auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000001',
    'email', 'preview.admin@example.invalid',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
)
ON CONFLICT (provider_id, provider) DO UPDATE SET
  identity_data = EXCLUDED.identity_data,
  updated_at = now();

INSERT INTO "Diocese" ("id", "name", "createdAt", "updatedAt")
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'CMS Synthetic Preview Diocese',
  now(),
  now()
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updatedAt" = now();

INSERT INTO "Parish" (
  "id",
  "dioceseId",
  "name",
  "address",
  "createdAt",
  "updatedAt"
)
VALUES (
  '20000000-0000-0000-0000-000000000010',
  '20000000-0000-0000-0000-000000000001',
  'St. Thomas Synthetic Preview Parish',
  'Preview environment only',
  now(),
  now()
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "address" = EXCLUDED."address",
  "updatedAt" = now();

INSERT INTO "AppUser" (
  "id",
  "email",
  "displayName",
  "role",
  "dioceseId",
  "parishId",
  "createdAt",
  "updatedAt"
)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'preview.admin@example.invalid',
  'Preview Diocese Admin',
  'DIOCESE_ADMIN',
  '20000000-0000-0000-0000-000000000001',
  NULL,
  now(),
  now()
)
ON CONFLICT ("id") DO UPDATE SET
  "email" = EXCLUDED."email",
  "displayName" = EXCLUDED."displayName",
  "role" = EXCLUDED."role",
  "dioceseId" = EXCLUDED."dioceseId",
  "parishId" = EXCLUDED."parishId",
  "updatedAt" = now();

INSERT INTO "Family" (
  "id",
  "dioceseId",
  "parishId",
  "familyNumber",
  "familyName",
  "primaryContactEmail",
  "address",
  "createdAt",
  "updatedAt"
)
VALUES (
  '20000000-0000-0000-0000-000000000020',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000010',
  'PREVIEW-0001',
  'Synthetic Preview Family',
  'preview.family@example.invalid',
  'Preview environment only',
  now(),
  now()
)
ON CONFLICT ("id") DO UPDATE SET
  "familyName" = EXCLUDED."familyName",
  "primaryContactEmail" = EXCLUDED."primaryContactEmail",
  "address" = EXCLUDED."address",
  "updatedAt" = now();

INSERT INTO "Member" (
  "id",
  "dioceseId",
  "parishId",
  "familyId",
  "memberIdentifier",
  "firstName",
  "lastName",
  "email",
  "createdAt",
  "updatedAt"
)
VALUES (
  '20000000-0000-0000-0000-000000000030',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000010',
  '20000000-0000-0000-0000-000000000020',
  'PREVIEW-0001.1',
  'Synthetic',
  'Member',
  'preview.member@example.invalid',
  now(),
  now()
)
ON CONFLICT ("id") DO UPDATE SET
  "firstName" = EXCLUDED."firstName",
  "lastName" = EXCLUDED."lastName",
  "email" = EXCLUDED."email",
  "updatedAt" = now();

INSERT INTO "MemberParish" (
  "id",
  "memberId",
  "parishId",
  "membershipType",
  "isPrimary",
  "joinedAt",
  "createdAt",
  "updatedAt"
)
VALUES (
  '20000000-0000-0000-0000-000000000040',
  '20000000-0000-0000-0000-000000000030',
  '20000000-0000-0000-0000-000000000010',
  'PRIMARY',
  true,
  now(),
  now(),
  now()
)
ON CONFLICT ("id") DO UPDATE SET
  "membershipType" = EXCLUDED."membershipType",
  "isPrimary" = EXCLUDED."isPrimary",
  "updatedAt" = now();

COMMIT;
