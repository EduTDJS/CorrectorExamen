import { applyMigrations } from './migrate.js';
import { getDbPoolClient, getDatabasePath } from './pool.js';
import { sqlLiteral } from './client.js';

const SEED_TIMESTAMP = '2026-01-15T10:00:00.000Z';

const SEED_DATA = {
  schools: [
    {
      id: 'seed_school_cy_demo',
      tenant_id: 'tenant_demo',
      name: 'Escuela Demo CalificaYa',
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP
    }
  ],
  groups: [
    {
      id: 'seed_group_6a_2026',
      school_id: 'seed_school_cy_demo',
      name: '6A',
      exam_date: '2026-01-20',
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP
    }
  ],
  exams: [
    {
      id: 'seed_exam_mate_u1_2026',
      group_id: 'seed_group_6a_2026',
      subject: 'Matemáticas',
      exam_date: '2026-01-20',
      total_questions: 5,
      answer_key: JSON.stringify(['A', 'C', 'B', 'D', 'A']),
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP
    }
  ],
  students: [
    {
      id: 'seed_student_ana_001',
      school_id: 'seed_school_cy_demo',
      group_id: 'seed_group_6a_2026',
      name: 'Ana Torres',
      enrollment: 'A001',
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP
    },
    {
      id: 'seed_student_luis_002',
      school_id: 'seed_school_cy_demo',
      group_id: 'seed_group_6a_2026',
      name: 'Luis Pérez',
      enrollment: 'L002',
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP
    }
  ],
  submissions: [
    {
      id: 'seed_submission_ana_exam1',
      exam_id: 'seed_exam_mate_u1_2026',
      student_id: 'seed_student_ana_001',
      report_id: 'seed_report_ana_exam1',
      submitted_at: '2026-01-20T10:05:00.000Z',
      responses_json: JSON.stringify(['A', 'C', 'B', 'D', 'A']),
      source_text: 'Respuestas capturadas por CSV',
      ownership_json: JSON.stringify({ tenantId: 'tenant_demo', source: 'seed' }),
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP
    },
    {
      id: 'seed_submission_luis_exam1',
      exam_id: 'seed_exam_mate_u1_2026',
      student_id: 'seed_student_luis_002',
      report_id: 'seed_report_luis_exam1',
      submitted_at: '2026-01-20T10:06:00.000Z',
      responses_json: JSON.stringify(['A', 'B', 'B', 'D', 'C']),
      source_text: 'Respuestas capturadas por OCR',
      ownership_json: JSON.stringify({ tenantId: 'tenant_demo', source: 'seed' }),
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP
    }
  ],
  grades: [
    {
      id: 'seed_grade_ana_exam1',
      submission_id: 'seed_submission_ana_exam1',
      score: 10,
      letter: 'A',
      teacher_justification: 'Dominio completo del tema.',
      question_scores_json: JSON.stringify([2, 2, 2, 2, 2]),
      ai_justifications_json: JSON.stringify({
        resumen: 'Todas las respuestas coinciden con la clave.'
      }),
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP
    },
    {
      id: 'seed_grade_luis_exam1',
      submission_id: 'seed_submission_luis_exam1',
      score: 6,
      letter: 'C',
      teacher_justification: 'Reforzar reactivos 2 y 5.',
      question_scores_json: JSON.stringify([2, 0, 2, 2, 0]),
      ai_justifications_json: JSON.stringify({
        resumen: 'Muestra comprensión parcial; requiere práctica adicional.'
      }),
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP
    }
  ],
  reports: [
    {
      id: 'seed_report_ana_exam1',
      submission_id: 'seed_submission_ana_exam1',
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP,
      payload_json: JSON.stringify({
        id: 'seed_report_ana_exam1',
        estudiante: { nombre: 'Ana Torres', matricula: 'A001' },
        examen: { materia: 'Matemáticas', grupo: '6A', fecha: '2026-01-20' },
        calificacionFinal: 10,
        observaciones: 'Seed determinístico de referencia.'
      })
    },
    {
      id: 'seed_report_luis_exam1',
      submission_id: 'seed_submission_luis_exam1',
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP,
      payload_json: JSON.stringify({
        id: 'seed_report_luis_exam1',
        estudiante: { nombre: 'Luis Pérez', matricula: 'L002' },
        examen: { materia: 'Matemáticas', grupo: '6A', fecha: '2026-01-20' },
        calificacionFinal: 6,
        observaciones: 'Seed determinístico de referencia.'
      })
    }
  ],
  audit_logs: [
    {
      id: 'seed_audit_report_ana_created',
      report_id: 'seed_report_ana_exam1',
      action: 'report_created',
      actor: 'seed_script',
      created_at: '2026-01-20T10:07:00.000Z',
      metadata_json: JSON.stringify({ reason: 'bootstrap dataset' })
    },
    {
      id: 'seed_audit_report_luis_created',
      report_id: 'seed_report_luis_exam1',
      action: 'report_created',
      actor: 'seed_script',
      created_at: '2026-01-20T10:08:00.000Z',
      metadata_json: JSON.stringify({ reason: 'bootstrap dataset' })
    }
  ]
};

const EXPECTED_COUNTS = Object.fromEntries(
  Object.entries(SEED_DATA).map(([tableName, rows]) => [tableName, rows.length])
);

const buildInsertSql = (tableName, rows) => {
  if (!rows.length) {
    return '';
  }

  return rows
    .map((row) => {
      const keys = Object.keys(row);
      const values = keys.map((key) => sqlLiteral(row[key]));
      return `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${values.join(', ')});`;
    })
    .join('\n');
};

const cleanupSeedSql = () => `
  BEGIN IMMEDIATE TRANSACTION;
  DELETE FROM report_versions WHERE id LIKE 'seed_%' OR report_id LIKE 'seed_%';
  DELETE FROM audit_logs WHERE id LIKE 'seed_%' OR report_id LIKE 'seed_%';
  DELETE FROM grades WHERE id LIKE 'seed_%' OR submission_id LIKE 'seed_%';
  DELETE FROM reports WHERE id LIKE 'seed_%' OR submission_id LIKE 'seed_%';
  DELETE FROM submissions WHERE id LIKE 'seed_%' OR exam_id LIKE 'seed_%' OR student_id LIKE 'seed_%' OR report_id LIKE 'seed_%';
  DELETE FROM students WHERE id LIKE 'seed_%' OR school_id LIKE 'seed_%' OR group_id LIKE 'seed_%';
  DELETE FROM exams WHERE id LIKE 'seed_%' OR group_id LIKE 'seed_%';
  DELETE FROM groups WHERE id LIKE 'seed_%' OR school_id LIKE 'seed_%';
  DELETE FROM schools WHERE id LIKE 'seed_%';
  COMMIT;
`;

const insertSeedSql = () => `
  BEGIN IMMEDIATE TRANSACTION;
  ${buildInsertSql('schools', SEED_DATA.schools)}
  ${buildInsertSql('groups', SEED_DATA.groups)}
  ${buildInsertSql('exams', SEED_DATA.exams)}
  ${buildInsertSql('students', SEED_DATA.students)}
  ${buildInsertSql('submissions', SEED_DATA.submissions)}
  ${buildInsertSql('grades', SEED_DATA.grades)}
  ${buildInsertSql('reports', SEED_DATA.reports)}
  ${buildInsertSql('audit_logs', SEED_DATA.audit_logs)}
  COMMIT;
`;

const validateSeed = async (client) => {
  const checks = await Promise.all(
    Object.keys(EXPECTED_COUNTS).map(async (tableName) => {
      const row = await client.get(
        `SELECT COUNT(*) AS total FROM ${tableName} WHERE id LIKE 'seed_%';`
      );
      return {
        tableName,
        expected: EXPECTED_COUNTS[tableName],
        actual: Number(row?.total || 0)
      };
    })
  );

  const failed = checks.filter(({ expected, actual }) => expected !== actual);
  if (failed.length) {
    const details = failed
      .map(({ tableName, expected, actual }) => `${tableName}: esperado=${expected}, actual=${actual}`)
      .join(' | ');
    throw new Error(`Validación del seed incompleta. ${details}`);
  }

  return checks;
};

const run = async () => {
  await applyMigrations();
  const client = await getDbPoolClient();

  await client.exec(cleanupSeedSql());
  await client.exec(insertSeedSql());

  const checks = await validateSeed(client);
  const summary = checks.map(({ tableName, actual }) => `${tableName}=${actual}`).join(', ');

  process.stdout.write(
    `Seed aplicado correctamente en ${getDatabasePath()} (${summary}).\n`
  );
};

run().catch((error) => {
  process.stderr.write(`Error ejecutando seed: ${error?.message || error}\n`);
  process.exitCode = 1;
});
