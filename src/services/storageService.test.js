import {
  STORAGE_DECISION_FINAL,
  STORAGE_REPORTES,
  guardarDecisionFinal,
  guardarReportes,
  leerDecisionFinal,
  leerReportes
} from './storageService';

describe('storageService', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('leerDecisionFinal', () => {
    it('devuelve estado inicial si el JSON está corrupto', () => {
      window.localStorage.setItem(STORAGE_DECISION_FINAL, '{mal-json');
      expect(leerDecisionFinal()).toEqual({ puntuacion: '', justificacion: '' });
    });

    it('migra formato antiguo sin schemaVersion', () => {
      window.localStorage.setItem(STORAGE_DECISION_FINAL, JSON.stringify({ puntuacion: 90, justificacion: 'Muy bien' }));
      expect(leerDecisionFinal()).toEqual({ puntuacion: '90', justificacion: 'Muy bien' });
    });

    it('descarta payload inválido versionado', () => {
      window.localStorage.setItem(STORAGE_DECISION_FINAL, JSON.stringify({ schemaVersion: 2, data: { puntuacion: true } }));
      expect(leerDecisionFinal()).toEqual({ puntuacion: '', justificacion: '' });
    });
  });

  describe('leerReportes', () => {
    const reporteValido = {
      id: 'r-1',
      creadoEn: '2026-03-26T00:00:00.000Z',
      examen: {
        materia: 'Matemática',
        grupo: 'A-1',
        fecha: '2026-03-26',
        totalPreguntas: 2,
        claveRespuestas: 'AB'
      },
      estudiante: {
        nombre: 'Ana',
        matricula: '2023001'
      },
      respuestas: {
        lista: ['A', 'B'],
        texto: 'AB'
      },
      puntuacionPorPregunta: [
        {
          numero: 1,
          justificacionIA: 'Correcta',
          desglose: {
            criterioAplicado: 'Comparación directa clave oficial vs respuesta del estudiante',
            evidencia: { clave: 'A', respuestaEstudiante: 'A', estado: 'correcta', confianzaOCR: null, fuente: '' },
            resultado: 'Correcta',
            recomendacion: 'Mantener'
          }
        },
        {
          numero: 2,
          justificacionIA: 'Correcta',
          desglose: {
            criterioAplicado: 'Comparación directa clave oficial vs respuesta del estudiante',
            evidencia: { clave: 'B', respuestaEstudiante: 'B', estado: 'correcta', confianzaOCR: null, fuente: '' },
            resultado: 'Correcta',
            recomendacion: 'Mantener'
          }
        }
      ],
      justificacionesIA: [
        { pregunta: 1, justificacion: 'Correcta', desglose: { criterioAplicado: 'Comparación directa clave oficial vs respuesta del estudiante', evidencia: { clave: 'A', respuestaEstudiante: 'A', estado: 'correcta', confianzaOCR: null, fuente: '' }, resultado: 'Correcta', recomendacion: 'Mantener' } },
        { pregunta: 2, justificacion: 'Correcta', desglose: { criterioAplicado: 'Comparación directa clave oficial vs respuesta del estudiante', evidencia: { clave: 'B', respuestaEstudiante: 'B', estado: 'correcta', confianzaOCR: null, fuente: '' }, resultado: 'Correcta', recomendacion: 'Mantener' } }
      ],
      organizacion: {
        materiaNormalizada: 'matematica',
        materiaFolderId: 'materia:matematica'
      },
      calificacionFinal: {
        notaSobre100: 100,
        letra: 'A',
        justificacionDocente: 'Excelente'
      }
    };

    it('devuelve arreglo vacío si localStorage tiene JSON inválido', () => {
      window.localStorage.setItem(STORAGE_REPORTES, '[[[');
      expect(leerReportes()).toEqual([]);
    });

    it('migra arreglo legacy (v1) y repara campos faltantes recuperables', () => {
      const legacy = [{ ...reporteValido }];
      delete legacy[0].justificacionesIA;
      window.localStorage.setItem(STORAGE_REPORTES, JSON.stringify(legacy));

      expect(leerReportes()).toEqual([
        {
          ...reporteValido,
          examen: {
            ...reporteValido.examen,
            materia: 'Matemática'
          },
          organizacion: {
            materiaNormalizada: 'matematica',
            materiaFolderId: 'materia:matematica'
          },
          justificacionesIA: [
            { pregunta: 1, justificacion: 'Correcta' },
            { pregunta: 2, justificacion: 'Correcta' }
          ]
        }
      ]);
    });

    it('aísla registros corruptos sin romper toda la carga', () => {
      const reporteCorrupto = { id: 'r-2', creadoEn: 123 };
      window.localStorage.setItem(STORAGE_REPORTES, JSON.stringify({
        schemaVersion: 2,
        data: [reporteValido, reporteCorrupto]
      }));

      expect(leerReportes()).toEqual([reporteValido]);
    });

    it('normaliza materia para evitar carpetas duplicadas semánticamente', () => {
      const variante = {
        ...reporteValido,
        id: 'r-2',
        examen: { ...reporteValido.examen, materia: '  MATEMATICA   ' }
      };

      guardarReportes([reporteValido, variante]);

      const guardado = leerReportes();
      expect(guardado).toHaveLength(2);
      expect(guardado[0].organizacion).toEqual({
        materiaNormalizada: 'matematica',
        materiaFolderId: 'materia:matematica'
      });
      expect(guardado[1].organizacion).toEqual({
        materiaNormalizada: 'matematica',
        materiaFolderId: 'materia:matematica'
      });
    });
  });

  describe('guardar*', () => {
    it('guarda reportes y decisionFinal con schemaVersion', () => {
      guardarDecisionFinal({ puntuacion: 75, justificacion: 'Ajuste manual' });
      guardarReportes([]);

      expect(JSON.parse(window.localStorage.getItem(STORAGE_DECISION_FINAL))).toEqual({
        schemaVersion: 2,
        data: { puntuacion: '75', justificacion: 'Ajuste manual' }
      });

      expect(JSON.parse(window.localStorage.getItem(STORAGE_REPORTES))).toEqual({
        schemaVersion: 4,
        data: []
      });
    });
  });
});
