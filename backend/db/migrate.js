import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDbPoolClient } from "./pool.js";

const SCHEMA_FILE = path.resolve(process.cwd(), "backend/db/schema.sql");
let migrated = false;

const MIGRATIONS = [
  {
    version: 1,
    name: "initial_reports_and_audit",
    sql: `
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (report_id) REFERENCES reports(id)
      );

      CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_report_created_at ON audit_logs(report_id, created_at DESC);
    `,
  },
  {
    version: 2,
    name: "normalized_reporting_model",
    sql: `
      CREATE TABLE IF NOT EXISTS schools (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        name TEXT NOT NULL,
        exam_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        exam_date TEXT,
        total_questions INTEGER NOT NULL,
        answer_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        school_id TEXT,
        group_id TEXT,
        name TEXT NOT NULL,
        enrollment TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        report_id TEXT NOT NULL UNIQUE,
        submitted_at TEXT NOT NULL,
        responses_json TEXT,
        source_text TEXT,
        ownership_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS grades (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL UNIQUE,
        score REAL,
        letter TEXT,
        teacher_justification TEXT,
        question_scores_json TEXT,
        ai_justifications_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
      );

      ALTER TABLE reports ADD COLUMN submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_schools_tenant_id ON schools(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_groups_school_name ON groups(school_id, name);
      CREATE INDEX IF NOT EXISTS idx_exams_group_date ON exams(group_id, exam_date DESC);
      CREATE INDEX IF NOT EXISTS idx_students_group_enrollment ON students(group_id, enrollment);
      CREATE INDEX IF NOT EXISTS idx_submissions_exam_student ON submissions(exam_id, student_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_report_id ON submissions(report_id);
    `,
  },
  {
    version: 3,
    name: "backfill_normalized_from_reports",
    sql: `
      INSERT OR IGNORE INTO schools (id, tenant_id, name, created_at, updated_at)
      SELECT
        'school_' || lower(hex(randomblob(8))),
        json_extract(payload_json, '$.ownership.tenantId'),
        COALESCE(NULLIF(json_extract(payload_json, '$.ownership.tenantId'), ''), 'Escuela general'),
        created_at,
        updated_at
      FROM reports;

      INSERT OR IGNORE INTO groups (id, school_id, name, exam_date, created_at, updated_at)
      SELECT
        'group_' || lower(hex(randomblob(8))),
        (SELECT id FROM schools s
          WHERE s.name = COALESCE(NULLIF(json_extract(r.payload_json, '$.ownership.tenantId'), ''), 'Escuela general')
          ORDER BY s.created_at ASC LIMIT 1),
        COALESCE(NULLIF(json_extract(r.payload_json, '$.examen.grupo'), ''), 'Grupo general'),
        json_extract(r.payload_json, '$.examen.fecha'),
        r.created_at,
        r.updated_at
      FROM reports r;
    `,
  },
  {
    version: 4,
    name: "report_versions_history",
    sql: `
      CREATE TABLE IF NOT EXISTS report_versions (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        diff_json TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
        UNIQUE (report_id, version_number)
      );

      CREATE INDEX IF NOT EXISTS idx_report_versions_report_version
      ON report_versions(report_id, version_number DESC);

      CREATE INDEX IF NOT EXISTS idx_report_versions_report_created_at
      ON report_versions(report_id, created_at DESC);

      INSERT INTO report_versions (id, report_id, version_number, snapshot_json, diff_json, actor, created_at)
      SELECT
        'rver_' || lower(hex(randomblob(16))),
        r.id,
        1,
        r.payload_json,
        '{}',
        'system_backfill_v4',
        COALESCE(NULLIF(r.updated_at, ''), r.created_at, datetime('now'))
      FROM reports r
      WHERE NOT EXISTS (
        SELECT 1 FROM report_versions rv WHERE rv.report_id = r.id
      );
    `,
  },
  {
    version: 5,
    name: "rubrics_versioned_persistence",
    sql: `
      CREATE TABLE IF NOT EXISTS rubrics (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'global',
        materia TEXT NOT NULL,
        grado TEXT NOT NULL,
        current_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, materia, grado),
        CHECK (current_version >= 1)
      );

      CREATE TABLE IF NOT EXISTS rubric_versions (
        id TEXT PRIMARY KEY,
        rubric_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        criterios_json TEXT NOT NULL,
        reglas_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        FOREIGN KEY (rubric_id) REFERENCES rubrics(id) ON DELETE CASCADE,
        UNIQUE (rubric_id, version_number),
        CHECK (version_number >= 1)
      );

      CREATE INDEX IF NOT EXISTS idx_rubrics_lookup ON rubrics(tenant_id, materia, grado);
      CREATE INDEX IF NOT EXISTS idx_rubric_versions_rubric_version
      ON rubric_versions(rubric_id, version_number DESC);
    `,
  },
  {
    version: 6,
    name: "rosters_for_classroom_membership",
    sql: `
      CREATE TABLE IF NOT EXISTS rosters (
        id TEXT PRIMARY KEY,
        group_name TEXT NOT NULL,
        term TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (group_name, term)
      );

      CREATE TABLE IF NOT EXISTS roster_students (
        id TEXT PRIMARY KEY,
        roster_id TEXT NOT NULL,
        student_name TEXT NOT NULL,
        student_enrollment TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (roster_id) REFERENCES rosters(id) ON DELETE CASCADE,
        UNIQUE (roster_id, student_enrollment)
      );

      CREATE INDEX IF NOT EXISTS idx_rosters_group_term ON rosters(group_name, term);
      CREATE INDEX IF NOT EXISTS idx_roster_students_roster_enrollment
      ON roster_students(roster_id, student_enrollment);
    `,
  },
];

const ensureMigrationTable = async (client) => {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
};

const listAppliedVersions = async (client) => {
  const rows = await client.all(
    "SELECT version FROM schema_migrations ORDER BY version ASC;",
  );
  return new Set(
    rows
      .map((row) => Number(row.version))
      .filter((value) => Number.isInteger(value)),
  );
};

const applyMigration = async (client, migration) => {
  await client.exec(`
    BEGIN IMMEDIATE TRANSACTION;
    ${migration.sql}
    INSERT INTO schema_migrations (version, name, applied_at)
    VALUES (${migration.version}, '${migration.name}', datetime('now'));
    COMMIT;
  `);
};

export const applyMigrations = async () => {
  if (migrated) {
    return {
      applied: [],
      latestVersion: MIGRATIONS[MIGRATIONS.length - 1].version,
    };
  }

  const client = await getDbPoolClient();
  await ensureMigrationTable(client);
  const appliedVersions = await listAppliedVersions(client);
  const newlyApplied = [];

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    await applyMigration(client, migration);
    newlyApplied.push({ version: migration.version, name: migration.name });
  }

  const schemaSql = await readFile(SCHEMA_FILE, "utf-8");
  await client.exec(schemaSql);
  migrated = true;

  return {
    applied: newlyApplied,
    latestVersion: MIGRATIONS[MIGRATIONS.length - 1].version,
  };
};

export const resetMigrationStateForTests = () => {
  migrated = false;
};
