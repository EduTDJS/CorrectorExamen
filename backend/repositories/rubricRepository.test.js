import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDbPool } from '../db/pool.js';
import { resetMigrationStateForTests } from '../db/migrate.js';
import { createRubric, listRubricHistory, listRubrics } from './rubricRepository.js';

const ORIGINAL_ENV = { ...process.env };
let tempDir = '';

const restoreEnv = () => {
  process.env = { ...ORIGINAL_ENV };
};

describe('rubricRepository (sqlite)', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'corrector-rubrics-'));
    restoreEnv();
    process.env.REPORTS_DB_FILE = path.join(tempDir, 'rubrics.sqlite');
    process.env.NODE_ENV = 'test';
    closeDbPool();
    resetMigrationStateForTests();
  });

  afterEach(async () => {
    closeDbPool();
    resetMigrationStateForTests();
    restoreEnv();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('mantiene persistencia tras reinicio simulado del pool', async () => {
    const created = await createRubric({
      materia: 'Biología',
      grado: '2do secundaria',
      criterios: [{ pregunta: 1, descripcion: 'Célula', respuestaCorrecta: 'B', peso: 1 }],
      reglasPenalizacionBonificacion: { penalizacionSinRespuesta: 0 }
    }, { tenantId: 'Colegio Norte', actor: 'tester' });

    expect(created.version).toBe(1);

    closeDbPool();
    resetMigrationStateForTests();

    const rubricas = await listRubrics({ tenantId: 'Colegio Norte', vigente: true });
    expect(rubricas).toHaveLength(1);
    expect(rubricas[0]).toMatchObject({
      id: created.id,
      materia: 'Biología',
      grado: '2do secundaria',
      version: 1
    });
  });

  it('crea versión incremental al editar plantilla existente', async () => {
    const v1 = await createRubric({
      materia: 'Historia',
      grado: '3ro secundaria',
      criterios: [{ pregunta: 1, descripcion: 'Periodo colonial', respuestaCorrecta: 'A', peso: 1 }],
      reglasPenalizacionBonificacion: { penalizacionSinRespuesta: 0 }
    }, { tenantId: 'Colegio Norte', actor: 'tester' });

    const v2 = await createRubric({
      id: v1.id,
      materia: 'Historia',
      grado: '3ro secundaria',
      criterios: [{ pregunta: 1, descripcion: 'República', respuestaCorrecta: 'C', peso: 2 }],
      reglasPenalizacionBonificacion: { penalizacionSinRespuesta: 0.25 }
    }, { tenantId: 'Colegio Norte', actor: 'tester' });

    expect(v2.id).toBe(v1.id);
    expect(v2.version).toBe(2);

    const vigentes = await listRubrics({ tenantId: 'Colegio Norte', materia: 'Historia', grado: '3ro secundaria' });
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0].version).toBe(2);
    expect(vigentes[0].criterios[0].descripcion).toBe('República');
  });

  it('permite lectura de historial por rúbrica', async () => {
    const first = await createRubric({
      materia: 'Física',
      grado: '1ro secundaria',
      criterios: [{ pregunta: 1, descripcion: 'MRU', respuestaCorrecta: 'D', peso: 1 }],
      reglasPenalizacionBonificacion: { penalizacionSinRespuesta: 0 }
    }, { tenantId: 'Colegio Norte', actor: 'tester' });

    await createRubric({
      id: first.id,
      materia: 'Física',
      grado: '1ro secundaria',
      criterios: [{ pregunta: 1, descripcion: 'MRUV', respuestaCorrecta: 'B', peso: 1 }],
      reglasPenalizacionBonificacion: { penalizacionSinRespuesta: 0 }
    }, { tenantId: 'Colegio Norte', actor: 'tester' });

    const history = await listRubricHistory({ rubricId: first.id, tenantId: 'Colegio Norte' });
    expect(history.map((item) => item.version)).toEqual([2, 1]);
    expect(history[0].criterios[0].descripcion).toBe('MRUV');
    expect(history[1].criterios[0].descripcion).toBe('MRU');
  });
});
