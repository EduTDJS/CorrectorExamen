import crypto from 'node:crypto';
import { getReportsStorageAdapter } from '../db/database.js';

const nowIso = () => new Date().toISOString();
const createId = (prefix) => {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const parseJson = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const toOwnership = (ownership = {}) => {
  const tenantId = String(ownership.tenantId || '').trim();
  const userId = String(ownership.userId || '').trim();
  const role = String(ownership.role || '').trim();

  if (!tenantId && !userId && !role) {
    return undefined;
  }

  return {
    tenantId: tenantId || undefined,
    userId: userId || undefined,
    role: role || undefined
  };
};

const matchesAccessScope = (reportPayload, { tenantId, userId, enforceUserScope } = {}) => {
  if (!tenantId) {
    return true;
  }

  const reportTenantId = String(reportPayload?.ownership?.tenantId || '').trim();
  if (!reportTenantId || reportTenantId !== tenantId) {
    return false;
  }

  if (!enforceUserScope) {
    return true;
  }

  const reportUserId = String(reportPayload?.ownership?.userId || '').trim();
  return Boolean(userId && reportUserId && reportUserId === userId);
};

const toAuditLog = ({ reportId, action, actor, metadata = {} }) => ({
  id: createId('audit'),
  report_id: reportId,
  action,
  actor,
  created_at: nowIso(),
  metadata_json: JSON.stringify(metadata)
});

const stableSlug = (value, fallback = 'general') => {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
};

const buildNormalizedRecord = (reportPayload, { reportId, createdAt, updatedAt }) => {
  const tenantId = String(reportPayload?.ownership?.tenantId || '').trim() || 'tenant_general';
  const schoolId = `school_${stableSlug(tenantId)}`;
  const groupName = String(reportPayload?.examen?.grupo || 'Grupo general').trim();
  const groupId = `group_${stableSlug(`${schoolId}_${groupName}`)}`;
  const subject = String(reportPayload?.examen?.materia || 'Materia general').trim();
  const examDate = String(reportPayload?.examen?.fecha || '') || null;
  const examId = `exam_${stableSlug(`${groupId}_${subject}_${examDate || 'sin_fecha'}`)}`;
  const enrollment = String(reportPayload?.estudiante?.matricula || '').trim() || null;
  const studentName = String(reportPayload?.estudiante?.nombre || 'Estudiante sin nombre').trim();
  const studentDiscriminator = enrollment || `${studentName}_${reportId}`;
  const studentId = `student_${stableSlug(`${schoolId}_${studentDiscriminator}`)}`;
  const submissionId = `submission_${reportId}`;

  return {
    school: {
      id: schoolId,
      tenantId,
      name: tenantId,
      createdAt,
      updatedAt
    },
    group: {
      id: groupId,
      schoolId,
      name: groupName,
      examDate,
      createdAt,
      updatedAt
    },
    exam: {
      id: examId,
      groupId,
      subject,
      examDate,
      totalQuestions: Number(reportPayload?.examen?.totalPreguntas) || 0,
      answerKey: String(reportPayload?.examen?.claveRespuestas || ''),
      createdAt,
      updatedAt
    },
    student: {
      id: studentId,
      schoolId,
      groupId,
      name: studentName,
      enrollment,
      createdAt,
      updatedAt
    },
    submission: {
      id: submissionId,
      examId,
      studentId,
      reportId,
      submittedAt: String(reportPayload?.creadoEn || createdAt),
      responsesJson: JSON.stringify(reportPayload?.respuestas || {}),
      sourceText: String(reportPayload?.respuestas?.texto || ''),
      ownershipJson: JSON.stringify(reportPayload?.ownership || {}),
      createdAt,
      updatedAt
    },
    grade: {
      id: `grade_${reportId}`,
      submissionId,
      score: Number(reportPayload?.calificacionFinal?.notaSobre100) || 0,
      letter: String(reportPayload?.calificacionFinal?.letra || ''),
      teacherJustification: String(reportPayload?.calificacionFinal?.justificacionDocente || ''),
      questionScoresJson: JSON.stringify(reportPayload?.puntuacionPorPregunta || []),
      aiJustificationsJson: JSON.stringify(reportPayload?.justificacionesIA || []),
      createdAt,
      updatedAt
    }
  };
};

const toProjectionRecord = (reportPayload, { reportId, createdAt, updatedAt }) => ({
  id: reportId,
  created_at: createdAt,
  updated_at: updatedAt,
  payload_json: JSON.stringify({
    ...reportPayload,
    id: reportId,
    creadoEn: reportPayload.creadoEn || createdAt
  })
});

const fromStorageRow = (row) => {
  const fallbackPayload = parseJson(row?.payload_json, null);

  if (!row?.submission_id) {
    return fallbackPayload;
  }

  const ownership = parseJson(row.ownership_json, fallbackPayload?.ownership || {});
  const respuestas = parseJson(row.responses_json, fallbackPayload?.respuestas || {});
  const puntuacionPorPregunta = parseJson(row.question_scores_json, fallbackPayload?.puntuacionPorPregunta || []);
  const justificacionesIA = parseJson(row.ai_justifications_json, fallbackPayload?.justificacionesIA || []);

  return {
    ...(fallbackPayload || {}),
    id: row.id,
    creadoEn: fallbackPayload?.creadoEn || row.created_at,
    ownership,
    examen: {
      ...(fallbackPayload?.examen || {}),
      materia: row.exam_subject,
      grupo: row.group_name,
      fecha: row.exam_date,
      totalPreguntas: row.total_questions,
      claveRespuestas: row.answer_key
    },
    estudiante: {
      ...(fallbackPayload?.estudiante || {}),
      nombre: row.student_name,
      matricula: row.enrollment
    },
    respuestas,
    puntuacionPorPregunta,
    justificacionesIA,
    calificacionFinal: {
      ...(fallbackPayload?.calificacionFinal || {}),
      notaSobre100: Number(row.score),
      letra: row.letter,
      justificacionDocente: row.teacher_justification
    }
  };
};

const persistReport = async (reportPayload, {
  reportId,
  actor,
  action,
  ownership,
  auditMetadata,
  createdAt,
  updatedAt
}) => {
  const storage = await getReportsStorageAdapter();
  const ownershipMetadata = toOwnership(ownership);
  const payloadWithOwnership = ownershipMetadata
    ? { ...reportPayload, ownership: ownershipMetadata }
    : reportPayload;

  const projection = toProjectionRecord(payloadWithOwnership, { reportId, createdAt, updatedAt });
  const normalized = buildNormalizedRecord(payloadWithOwnership, { reportId, createdAt, updatedAt });

  await storage.upsertReportGraph(
    projection,
    normalized,
    toAuditLog({
      reportId,
      action,
      actor,
      metadata: { source: 'api', id: reportId, ...auditMetadata }
    })
  );

  return fromStorageRow({ ...projection, ...normalized.submission, ...normalized.exam, ...normalized.group, ...normalized.student, ...normalized.grade });
};

export const createReport = async (reportPayload, {
  actor = 'sistema_backend',
  ownership,
  auditMetadata = {}
} = {}) => {
  const timestamp = nowIso();
  const reportId = String(reportPayload.id || createId('report'));
  return persistReport(reportPayload, {
    reportId,
    actor,
    action: 'report_created',
    ownership,
    auditMetadata,
    createdAt: reportPayload.creadoEn || timestamp,
    updatedAt: timestamp
  });
};

export const updateReport = async (reportId, reportPayload, {
  actor = 'sistema_backend',
  ownership,
  auditMetadata = {}
} = {}) => {
  const storage = await getReportsStorageAdapter();
  const current = await storage.getReportRecordById(reportId);
  if (!current) {
    return null;
  }

  const currentPayload = fromStorageRow(current) || {};

  return persistReport(reportPayload, {
    reportId,
    actor,
    action: 'report_updated',
    ownership,
    auditMetadata,
    createdAt: currentPayload.creadoEn || current.created_at,
    updatedAt: nowIso()
  });
};

export const getReportById = async (reportId, accessScope = {}) => {
  const storage = await getReportsStorageAdapter();
  const found = await storage.getReportRecordById(reportId);
  const report = fromStorageRow(found);
  return matchesAccessScope(report, accessScope) ? report : null;
};

export const getReportByIdUnscoped = async (reportId) => {
  const storage = await getReportsStorageAdapter();
  const found = await storage.getReportRecordById(reportId);
  return fromStorageRow(found);
};

export const listReports = async (accessScope = {}) => {
  const storage = await getReportsStorageAdapter();
  const rows = await storage.listReportRecords();
  return rows
    .map((row) => fromStorageRow(row))
    .filter((row) => Boolean(row) && matchesAccessScope(row, accessScope));
};

export const listAuditLogs = async () => {
  const storage = await getReportsStorageAdapter();
  const rows = await storage.listAuditLogs();

  return rows.map((row) => ({
    id: row.id,
    report_id: row.report_id,
    action: row.action,
    actor: row.actor,
    created_at: row.created_at,
    metadata: parseJson(row.metadata_json, {})
  }));
};
