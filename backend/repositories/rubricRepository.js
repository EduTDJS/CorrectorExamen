import crypto from 'node:crypto';
import { applyMigrations } from '../db/migrate.js';
import { getDbPoolClient } from '../db/pool.js';
import { sqlLiteral } from '../db/client.js';

const DEFAULT_TENANT = 'global';

const createRubricId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return `rubrica_${crypto.randomUUID()}`;
  }
  return `rubrica_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const createRubricVersionId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return `rubrica_ver_${crypto.randomUUID()}`;
  }
  return `rubrica_ver_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const parseJson = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const normalizarCriterio = (criterio = {}, indice = 0) => ({
  pregunta: Number(criterio.pregunta || indice + 1),
  descripcion: String(criterio.descripcion || `Criterio ${indice + 1}`).trim(),
  respuestaCorrecta: String(criterio.respuestaCorrecta || '').trim().toUpperCase(),
  peso: Number.isFinite(Number(criterio.peso)) ? Number(criterio.peso) : 1
});

const normalizarReglas = (payload = {}) => ({
  penalizacionSinRespuesta: Number(payload?.penalizacionSinRespuesta || 0),
  bonificacionPorRachaCorrecta: {
    minimoConsecutivas: Number(payload?.bonificacionPorRachaCorrecta?.minimoConsecutivas || 0),
    puntosExtra: Number(payload?.bonificacionPorRachaCorrecta?.puntosExtra || 0)
  }
});

const validarRubrica = (payload = {}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('El payload de rúbrica debe ser un objeto JSON.');
  }
  if (!String(payload.materia || '').trim()) {
    throw new Error('El campo "materia" es obligatorio.');
  }
  if (!String(payload.grado || '').trim()) {
    throw new Error('El campo "grado" es obligatorio.');
  }
  if (!Array.isArray(payload.criterios) || payload.criterios.length === 0) {
    throw new Error('El campo "criterios" debe ser un arreglo con al menos un criterio.');
  }
};

const toDomainRubric = (row) => ({
  id: row.rubric_id,
  materia: row.materia,
  grado: row.grado,
  criterios: parseJson(row.criterios_json, []),
  reglasPenalizacionBonificacion: parseJson(row.reglas_json, normalizarReglas({})),
  version: Number(row.version_number),
  creadoEn: row.version_created_at,
  tenantId: row.tenant_id
});

const resolveTenantId = (tenantId) => String(tenantId || DEFAULT_TENANT).trim() || DEFAULT_TENANT;

const getClient = async () => {
  await applyMigrations();
  return getDbPoolClient();
};

const queryRubrics = async ({ tenantId, materia, grado, version, vigente = true, rubricId, includeHistory = false } = {}) => {
  const client = await getClient();
  const tenant = resolveTenantId(tenantId);
  const filters = [
    `r.tenant_id = ${sqlLiteral(tenant)}`
  ];

  if (materia) {
    filters.push(`r.materia = ${sqlLiteral(String(materia).trim())}`);
  }
  if (grado) {
    filters.push(`r.grado = ${sqlLiteral(String(grado).trim())}`);
  }
  if (rubricId) {
    filters.push(`r.id = ${sqlLiteral(String(rubricId).trim())}`);
  }

  let versionFilter = '';
  if (Number.isInteger(version) && version > 0) {
    versionFilter = `AND rv.version_number = ${sqlLiteral(version)}`;
  } else if (vigente && !includeHistory) {
    versionFilter = 'AND rv.version_number = r.current_version';
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const rows = await client.all(`
    SELECT
      r.id AS rubric_id,
      r.tenant_id,
      r.materia,
      r.grado,
      r.current_version,
      r.created_at AS rubric_created_at,
      r.updated_at AS rubric_updated_at,
      rv.version_number,
      rv.criterios_json,
      rv.reglas_json,
      rv.created_at AS version_created_at,
      rv.created_by
    FROM rubrics r
    JOIN rubric_versions rv ON rv.rubric_id = r.id
    ${whereSql}
    ${versionFilter}
    ORDER BY r.materia ASC, r.grado ASC, rv.version_number DESC;
  `);

  return rows.map(toDomainRubric);
};

export const listRubrics = async (filters = {}) => queryRubrics(filters);

export const listRubricHistory = async ({ rubricId, tenantId }) => queryRubrics({
  rubricId,
  tenantId,
  includeHistory: true,
  vigente: false
});

export const createRubric = async (payload = {}, { tenantId, actor = 'system' } = {}) => {
  validarRubrica(payload);

  const tenant = resolveTenantId(tenantId);
  const materia = String(payload.materia).trim();
  const grado = String(payload.grado).trim();
  const criterios = payload.criterios.map((item, indice) => normalizarCriterio(item, indice));
  const reglas = normalizarReglas(payload.reglasPenalizacionBonificacion || {});
  const now = new Date().toISOString();
  const client = await getClient();

  const requestedId = String(payload.id || '').trim();
  const existing = await client.get(`
    SELECT id, tenant_id, materia, grado, current_version, created_at
    FROM rubrics
    WHERE tenant_id = ${sqlLiteral(tenant)}
      AND (
        id = ${sqlLiteral(requestedId || '__none__')}
        OR (materia = ${sqlLiteral(materia)} AND grado = ${sqlLiteral(grado)})
      )
    ORDER BY CASE WHEN id = ${sqlLiteral(requestedId || '__none__')} THEN 0 ELSE 1 END
    LIMIT 1;
  `);

  if (!existing) {
    const rubricId = requestedId || createRubricId();
    const versionId = createRubricVersionId();

    await client.exec(`
      BEGIN IMMEDIATE TRANSACTION;
      INSERT INTO rubrics (id, tenant_id, materia, grado, current_version, created_at, updated_at)
      VALUES (
        ${sqlLiteral(rubricId)},
        ${sqlLiteral(tenant)},
        ${sqlLiteral(materia)},
        ${sqlLiteral(grado)},
        1,
        ${sqlLiteral(now)},
        ${sqlLiteral(now)}
      );

      INSERT INTO rubric_versions (
        id,
        rubric_id,
        version_number,
        criterios_json,
        reglas_json,
        created_at,
        created_by
      ) VALUES (
        ${sqlLiteral(versionId)},
        ${sqlLiteral(rubricId)},
        1,
        ${sqlLiteral(JSON.stringify(criterios))},
        ${sqlLiteral(JSON.stringify(reglas))},
        ${sqlLiteral(now)},
        ${sqlLiteral(actor)}
      );
      COMMIT;
    `);

    return {
      id: rubricId,
      materia,
      grado,
      criterios,
      reglasPenalizacionBonificacion: reglas,
      version: 1,
      creadoEn: now,
      tenantId: tenant
    };
  }

  const nextVersion = Number(existing.current_version) + 1;
  const versionId = createRubricVersionId();

  await client.exec(`
    BEGIN IMMEDIATE TRANSACTION;
    UPDATE rubrics
    SET
      materia = ${sqlLiteral(materia)},
      grado = ${sqlLiteral(grado)},
      current_version = ${sqlLiteral(nextVersion)},
      updated_at = ${sqlLiteral(now)}
    WHERE id = ${sqlLiteral(existing.id)};

    INSERT INTO rubric_versions (
      id,
      rubric_id,
      version_number,
      criterios_json,
      reglas_json,
      created_at,
      created_by
    ) VALUES (
      ${sqlLiteral(versionId)},
      ${sqlLiteral(existing.id)},
      ${sqlLiteral(nextVersion)},
      ${sqlLiteral(JSON.stringify(criterios))},
      ${sqlLiteral(JSON.stringify(reglas))},
      ${sqlLiteral(now)},
      ${sqlLiteral(actor)}
    );
    COMMIT;
  `);

  return {
    id: existing.id,
    materia,
    grado,
    criterios,
    reglasPenalizacionBonificacion: reglas,
    version: nextVersion,
    creadoEn: now,
    tenantId: tenant
  };
};
