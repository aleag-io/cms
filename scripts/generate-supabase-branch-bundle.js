const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const prismaMigrationsDir = path.join(root, 'prisma', 'migrations');
const supabaseDir = path.join(root, 'supabase');
const branchRoot = path.join(root, 'supabase-branch', 'supabase');
const branchMigrationsDir = path.join(branchRoot, 'migrations');
const manifestPath = path.join(branchRoot, 'migration-manifest.json');
const branchConfigPath = path.join(branchRoot, 'config.toml');

const nativeVersionOverrides = new Map([
  // The first RLS migration uses Member.userId, which this historical Prisma
  // migration added after the RLS file's original timestamp.
  ['20260629133320_phase1_schema', '20260629090000'],
]);

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sqlFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

function prismaMigrationNames() {
  return fs
    .readdirSync(prismaMigrationsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        fs.existsSync(
          path.join(prismaMigrationsDir, entry.name, 'migration.sql'),
        ),
    )
    .map((entry) => entry.name)
    .sort();
}

function generatedSql(source, digest, content) {
  return [
    '-- GENERATED FILE - DO NOT EDIT.',
    `-- Source: ${source}`,
    `-- SHA-256: ${digest}`,
    '',
    content.trimEnd(),
    '',
  ].join('\n');
}

function replaceSectionBoolean(config, section, key, value) {
  const lines = config.split('\n');
  let activeSection = '';
  let replaced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const sectionMatch = lines[index].match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      activeSection = sectionMatch[1];
      continue;
    }
    if (
      activeSection === section &&
      new RegExp(`^${key}\\s*=`).test(lines[index])
    ) {
      lines[index] = `${key} = ${value}`;
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    throw new Error(`Could not find ${section}.${key} in supabase/config.toml`);
  }
  return lines.join('\n');
}

function expectedBundle() {
  const files = new Map();
  const entries = [];

  for (const migrationName of prismaMigrationNames()) {
    const sourcePath = path.join(
      prismaMigrationsDir,
      migrationName,
      'migration.sql',
    );
    const source = path.relative(root, sourcePath);
    const content = fs.readFileSync(sourcePath, 'utf8');
    const digest = sha256(content);
    const sourceVersion = migrationName.slice(0, 14);
    const nativeVersion =
      nativeVersionOverrides.get(migrationName) ?? sourceVersion;
    const output = `${nativeVersion}_prisma_${migrationName}.sql`;

    files.set(output, generatedSql(source, digest, content));
    entries.push({
      kind: 'prisma',
      source,
      sourceVersion,
      nativeVersion,
      output,
      sha256: digest,
    });
  }

  for (const fileName of sqlFiles(path.join(supabaseDir, 'migrations'))) {
    const sourcePath = path.join(supabaseDir, 'migrations', fileName);
    const source = path.relative(root, sourcePath);
    const content = fs.readFileSync(sourcePath, 'utf8');
    const digest = sha256(content);

    files.set(fileName, generatedSql(source, digest, content));
    entries.push({
      kind: 'supabase',
      source,
      sourceVersion: fileName.slice(0, 14),
      nativeVersion: fileName.slice(0, 14),
      output: fileName,
      sha256: digest,
    });
  }

  const versions = new Map();
  for (const entry of entries) {
    const previous = versions.get(entry.nativeVersion);
    if (previous) {
      throw new Error(
        `Native migration version collision ${entry.nativeVersion}: ` +
          `${previous} and ${entry.output}`,
      );
    }
    versions.set(entry.nativeVersion, entry.output);
  }

  entries.sort((left, right) =>
    left.nativeVersion.localeCompare(right.nativeVersion),
  );

  const manifest = `${JSON.stringify(
    {
      formatVersion: 1,
      description:
        'Generated native Supabase branch migrations. Canonical sources remain under prisma/migrations and supabase/migrations.',
      entries,
    },
    null,
    2,
  )}\n`;

  const rootConfig = fs.readFileSync(
    path.join(supabaseDir, 'config.toml'),
    'utf8',
  );
  let config = rootConfig.replace(
    'project_id = "cms"',
    'project_id = "cms-native-branch"',
  );
  config = replaceSectionBoolean(config, 'db.migrations', 'enabled', 'true');
  config = replaceSectionBoolean(config, 'db.seed', 'enabled', 'true');
  config = [
    '# GENERATED FILE - DO NOT EDIT.',
    '# Source: supabase/config.toml',
    '# This deployment bundle is used by native Supabase GitHub branches.',
    '',
    config.trimEnd(),
    '',
  ].join('\n');

  return { files, manifest, config };
}

function writeBundle(expected) {
  fs.mkdirSync(branchMigrationsDir, { recursive: true });

  for (const fileName of sqlFiles(branchMigrationsDir)) {
    if (!expected.files.has(fileName)) {
      fs.rmSync(path.join(branchMigrationsDir, fileName));
    }
  }
  for (const [fileName, content] of expected.files) {
    fs.writeFileSync(path.join(branchMigrationsDir, fileName), content);
  }
  fs.writeFileSync(manifestPath, expected.manifest);
  fs.writeFileSync(branchConfigPath, expected.config);
}

function checkBundle(expected) {
  const failures = [];
  const actualFiles = fs.existsSync(branchMigrationsDir)
    ? sqlFiles(branchMigrationsDir)
    : [];
  const expectedFiles = [...expected.files.keys()].sort();

  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    failures.push('generated migration file list is stale');
  }
  for (const [fileName, content] of expected.files) {
    const filePath = path.join(branchMigrationsDir, fileName);
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== content) {
      failures.push(`${fileName} is missing or stale`);
    }
  }
  if (
    !fs.existsSync(manifestPath) ||
    fs.readFileSync(manifestPath, 'utf8') !== expected.manifest
  ) {
    failures.push('migration-manifest.json is missing or stale');
  }
  if (
    !fs.existsSync(branchConfigPath) ||
    fs.readFileSync(branchConfigPath, 'utf8') !== expected.config
  ) {
    failures.push('generated config.toml is missing or stale');
  }
  if (!fs.existsSync(path.join(branchRoot, 'seed.sql'))) {
    failures.push('seed.sql is missing');
  }

  if (failures.length > 0) {
    console.error('Native Supabase branch bundle check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error('Run `npm run db:branch:generate` and commit the results.');
    process.exit(1);
  }
}

const expected = expectedBundle();
if (process.argv.includes('--check')) {
  checkBundle(expected);
  console.log('Native Supabase branch bundle is current.');
} else {
  writeBundle(expected);
  console.log(
    `Generated ${expected.files.size} native Supabase migrations in ${path.relative(root, branchMigrationsDir)}.`,
  );
}
