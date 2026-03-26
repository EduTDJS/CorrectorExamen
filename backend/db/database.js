import { applyMigrations } from './migrate.js';
import { getDatabasePath, getDbPoolClient } from './pool.js';
import { createJsonFallbackAdapter } from './jsonFallbackAdapter.js';
import { sqlLiteral } from './client.js';

const shouldUseJsonFallback = () => {
  const enabled = String(process.env.REPORTS_STORAGE_DEV_FALLBACK || '').toLowerCase();
  return process.env.NODE_ENV === 'development' && (enabled === '1' || enabled === 'true');
};

let adapter;

const insertOrUpdateReportGraphSql = ({ report, normalized, auditLogs = [] }) => `
  BEGIN IMMEDIATE TRANSACTION;
  INSERT OR REPLACE INTO schools (id, tenant_id, name, created_at, updated_at)
  VALUES (
    ${sqlLiteral(normalized.school.id)},
    ${sqlLiteral(normalized.school.tenantId)},
    ${sqlLiteral(normalized.school.name)},
    ${sqlLiteral(normalized.school.createdAt)},
    ${sqlLiteral(normalized.school.updatedAt)}
  );

  INSERT OR REPLACE INTO groups (id, school_id, name, exam_date, created_at, updated_at)
  VALUES (
    ${sqlLiteral(normalized.group.id)},
    ${sqlLiteral(normalized.group.schoolId)},
    ${sqlLiteral(normalized.group.name)},
    ${sqlLiteral(normalized.group.examDate)},
    ${sqlLiteral(normalized.group.createdAt)},
    ${sqlLiteral(normalized.group.updatedAt)}
  );

  INSERT OR REPLACE INTO exams (id, group_id, subject, exam_date, total_questions, answer_key, created_at, updated_at)
  VALUES (
    ${sqlLiteral(normalized.exam.id)},
    ${sqlLiteral(normalized.exam.groupId)},
    ${sqlLiteral(normalized.exam.subject)},
    ${sqlLiteral(normalized.exam.examDate)},
    ${sqlLiteral(normalized.exam.totalQuestions)},
    ${sqlLiteral(normalized.exam.answerKey)},
    ${sqlLiteral(normalized.exam.createdAt)},
    ${sqlLiteral(normalized.exam.updatedAt)}
  );

  INSERT OR REPLACE INTO students (id, school_id, group_id, name, enrollment, created_at, updated_at)
  VALUES (
    ${sqlLiteral(normalized.student.id)},
    ${sqlLiteral(normalized.student.schoolId)},
    ${sqlLiteral(normalized.student.groupId)},
    ${sqlLiteral(normalized.student.name)},
    ${sqlLiteral(normalized.student.enrollment)},
    ${sqlLiteral(normalized.student.createdAt)},
    ${sqlLiteral(normalized.student.updatedAt)}
  );

  INSERT OR REPLACE INTO submissions (
    id, exam_id, student_id, report_id, submitted_at, responses_json, source_text, ownership_json, created_at, updated_at
  ) VALUES (
    ${sqlLiteral(normalized.submission.id)},
    ${sqlLiteral(normalized.submission.examId)},
    ${sqlLiteral(normalized.submission.studentId)},
    ${sqlLiteral(normalized.submission.reportId)},
    ${sqlLiteral(normalized.submission.submittedAt)},
    ${sqlLiteral(normalized.submission.responsesJson)},
    ${sqlLiteral(normalized.submission.sourceText)},
    ${sqlLiteral(normalized.submission.ownershipJson)},
    ${sqlLiteral(normalized.submission.createdAt)},
    ${sqlLiteral(normalized.submission.updatedAt)}
  );

  INSERT OR REPLACE INTO grades (
    id, submission_id, score, letter, teacher_justification, question_scores_json, ai_justifications_json, created_at, updated_at
  ) VALUES (
    ${sqlLiteral(normalized.grade.id)},
    ${sqlLiteral(normalized.grade.submissionId)},
    ${sqlLiteral(normalized.grade.score)},
    ${sqlLiteral(normalized.grade.letter)},
    ${sqlLiteral(normalized.grade.teacherJustification)},
    ${sqlLiteral(normalized.grade.questionScoresJson)},
    ${sqlLiteral(normalized.grade.aiJustificationsJson)},
    ${sqlLiteral(normalized.grade.createdAt)},
    ${sqlLiteral(normalized.grade.updatedAt)}
  );

  INSERT OR REPLACE INTO reports (id, submission_id, created_at, updated_at, payload_json)
  VALUES (
    ${sqlLiteral(report.id)},
    ${sqlLiteral(normalized.submission.id)},
    ${sqlLiteral(report.created_at)},
    ${sqlLiteral(report.updated_at)},
    ${sqlLiteral(report.payload_json)}
  );
  ${auditLogs.map((auditLog) => insertAuditLogSql(auditLog)).join('\n')}
  COMMIT;
`;

const insertAuditLogSql = (auditLog) => `
  INSERT INTO audit_logs (id, report_id, action, actor, created_at, metadata_json)
  VALUES (
    ${sqlLiteral(auditLog.id)},
    ${sqlLiteral(auditLog.report_id)},
    ${sqlLiteral(auditLog.action)},
    ${sqlLiteral(auditLog.actor)},
    ${sqlLiteral(auditLog.created_at)},
    ${sqlLiteral(auditLog.metadata_json)}
  );
`;

const deleteReportGraphSql = ({ reportId, submissionId }) => `
  BEGIN IMMEDIATE TRANSACTION;
  DELETE FROM reports WHERE id = ${sqlLiteral(reportId)};
  DELETE FROM submissions WHERE id = ${sqlLiteral(submissionId)};
  DELETE FROM exams
  WHERE id NOT IN (SELECT DISTINCT exam_id FROM submissions WHERE exam_id IS NOT NULL);
  DELETE FROM groups
  WHERE id NOT IN (SELECT DISTINCT group_id FROM exams WHERE group_id IS NOT NULL);
  DELETE FROM schools
  WHERE id NOT IN (SELECT DISTINCT school_id FROM groups WHERE school_id IS NOT NULL);
  DELETE FROM students
  WHERE id NOT IN (SELECT DISTINCT student_id FROM submissions WHERE student_id IS NOT NULL);
  COMMIT;
`;

const createSqlAdapter = async () => {
  await applyMigrations();
  const client = await getDbPoolClient();

  return {
    mode: 'sqlite',
    filePath: getDatabasePath(),
    async upsertReportGraph(reportRecord, normalizedRecord, auditLogs = []) {
      await client.exec(insertOrUpdateReportGraphSql({ report: reportRecord, normalized: normalizedRecord, auditLogs }));
      return reportRecord;
    },
    async deleteReportGraph(reportId, auditLogs = []) {
      const report = await client.get(
        `SELECT id, submission_id FROM reports WHERE id = ${sqlLiteral(reportId)};`
      );
      if (!report) {
        return false;
      }

      const deleteSql = `
        ${deleteReportGraphSql({ reportId, submissionId: report.submission_id })}
        ${auditLogs.map((auditLog) => insertAuditLogSql(auditLog)).join('\n')}
      `;
      await client.exec(deleteSql);

      return true;
    },
    async getReportRecordById(reportId) {
      const row = await client.get(
        `SELECT r.id, r.created_at, r.updated_at, r.payload_json,
                sb.id AS school_id, sb.tenant_id AS school_tenant_id, sb.name AS school_name,
                g.id AS group_id, g.name AS group_name,
                e.id AS exam_id, e.subject AS exam_subject, e.exam_date, e.total_questions, e.answer_key,
                s.id AS student_id, s.name AS student_name, s.enrollment,
                sub.id AS submission_id, sub.responses_json, sub.source_text, sub.ownership_json,
                gr.id AS grade_id, gr.score, gr.letter, gr.teacher_justification, gr.question_scores_json, gr.ai_justifications_json
         FROM reports r
         LEFT JOIN submissions sub ON sub.id = r.submission_id
         LEFT JOIN exams e ON e.id = sub.exam_id
         LEFT JOIN groups g ON g.id = e.group_id
         LEFT JOIN schools sb ON sb.id = g.school_id
         LEFT JOIN students s ON s.id = sub.student_id
         LEFT JOIN grades gr ON gr.submission_id = sub.id
         WHERE r.id = ${sqlLiteral(reportId)};`
      );
      return row || null;
    },
    async listReportRecords() {
      return client.all(
        `SELECT r.id, r.created_at, r.updated_at, r.payload_json,
                sb.id AS school_id, sb.tenant_id AS school_tenant_id, sb.name AS school_name,
                g.id AS group_id, g.name AS group_name,
                e.id AS exam_id, e.subject AS exam_subject, e.exam_date, e.total_questions, e.answer_key,
                s.id AS student_id, s.name AS student_name, s.enrollment,
                sub.id AS submission_id, sub.responses_json, sub.source_text, sub.ownership_json,
                gr.id AS grade_id, gr.score, gr.letter, gr.teacher_justification, gr.question_scores_json, gr.ai_justifications_json
         FROM reports r
         LEFT JOIN submissions sub ON sub.id = r.submission_id
         LEFT JOIN exams e ON e.id = sub.exam_id
         LEFT JOIN groups g ON g.id = e.group_id
         LEFT JOIN schools sb ON sb.id = g.school_id
         LEFT JOIN students s ON s.id = sub.student_id
         LEFT JOIN grades gr ON gr.submission_id = sub.id
         ORDER BY r.created_at DESC;`
      );
    },
    async listAuditLogs() {
      return client.all(
        `SELECT id, report_id, action, actor, created_at, metadata_json
         FROM audit_logs
         ORDER BY created_at DESC;`
      );
    }
  };
};

export const getReportsStorageAdapter = async () => {
  if (adapter) {
    return adapter;
  }

  adapter = shouldUseJsonFallback() ? createJsonFallbackAdapter() : await createSqlAdapter();
  return adapter;
};

export const getReportsStorageInfo = async () => {
  const active = await getReportsStorageAdapter();
  return { mode: active.mode, filePath: active.filePath };
};
