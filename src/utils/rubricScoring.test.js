import { calcularPuntajeRubrica } from './rubricScoring';

describe('rubricScoring', () => {
  const rubrica = {
    id: 'r1',
    materia: 'Matemáticas',
    grado: '6to',
    criterios: [
      { pregunta: 1, descripcion: 'C1', peso: 1 },
      { pregunta: 2, descripcion: 'C2', peso: 1 },
      { pregunta: 3, descripcion: 'C3', peso: 2 }
    ],
    reglasPenalizacionBonificacion: {
      penalizacionSinRespuesta: 0.5,
      bonificacionPorRachaCorrecta: { minimoConsecutivas: 2, puntosExtra: 1 }
    },
    version: 1
  };

  it('aplica criterios y bonus por racha', () => {
    const salida = calcularPuntajeRubrica({
      rubrica,
      desgloseBase: [
        { numero: 1, correcta: true, respuestaEstudiante: 'A', puntaje: 0, desglose: { resultado: '' } },
        { numero: 2, correcta: true, respuestaEstudiante: 'B', puntaje: 0, desglose: { resultado: '' } },
        { numero: 3, correcta: false, respuestaEstudiante: '', puntaje: 0, desglose: { resultado: '' } }
      ]
    });

    expect(salida[0].puntaje).toBe(25);
    expect(salida[1].puntaje).toBe(26);
    expect(salida[2].puntaje).toBe(0);
  });

  it('permite override manual docente por pregunta', () => {
    const salida = calcularPuntajeRubrica({
      rubrica,
      overridesDocente: { 2: '99.5' },
      desgloseBase: [
        { numero: 1, correcta: false, respuestaEstudiante: 'D', puntaje: 0, desglose: { resultado: 'x' } },
        { numero: 2, correcta: false, respuestaEstudiante: 'A', puntaje: 0, desglose: { resultado: 'x' } }
      ]
    });

    expect(salida[1].puntaje).toBe(99.5);
    expect(salida[1].desglose.resultado).toContain('ajustado manualmente');
  });
});
