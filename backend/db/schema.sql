-- Esquema relacional normalizado para persistencia transaccional de reportes

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

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

-- reports se mantiene como proyección/snapshot de lectura rápida y compatibilidad.
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  submission_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

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

CREATE INDEX IF NOT EXISTS idx_schools_tenant_id ON schools(tenant_id);
CREATE INDEX IF NOT EXISTS idx_groups_school_name ON groups(school_id, name);
CREATE INDEX IF NOT EXISTS idx_exams_group_date ON exams(group_id, exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_students_group_enrollment ON students(group_id, enrollment);
CREATE INDEX IF NOT EXISTS idx_submissions_exam_student ON submissions(exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_report_id ON submissions(report_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_report_created_at ON audit_logs(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_versions_report_version ON report_versions(report_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_report_versions_report_created_at ON report_versions(report_id, created_at DESC);


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
CREATE INDEX IF NOT EXISTS idx_rubric_versions_rubric_version ON rubric_versions(rubric_id, version_number DESC);
