const redondear = (valor) => Number(valor.toFixed(2));

export const calcularPuntajeRubrica = ({
  desgloseBase = [],
  rubrica = null,
  overridesDocente = {}
}) => {
  if (!rubrica || !Array.isArray(rubrica.criterios) || rubrica.criterios.length === 0) {
    return desgloseBase;
  }

  const criterioPorPregunta = new Map(rubrica.criterios.map((criterio) => [Number(criterio.pregunta), criterio]));
  const sumaPesos = rubrica.criterios.reduce((acc, item) => acc + Number(item.peso || 0), 0) || 1;
  const bonusRegla = rubrica.reglasPenalizacionBonificacion?.bonificacionPorRachaCorrecta || {};
  const penalizacionSinRespuesta = Number(rubrica.reglasPenalizacionBonificacion?.penalizacionSinRespuesta || 0);
  let consecutivas = 0;

  return desgloseBase.map((item) => {
    const criterio = criterioPorPregunta.get(item.numero);
    if (!criterio) {
      return item;
    }

    const pesoNormalizado = Number(criterio.peso || 0) / sumaPesos;
    const basePorCriterio = pesoNormalizado * 100;
    const override = overridesDocente[item.numero];
    const tieneOverride = override !== '' && override !== undefined && override !== null;

    let puntaje = item.correcta ? basePorCriterio : 0;
    if (!item.respuestaEstudiante) {
      puntaje = Math.max(puntaje - penalizacionSinRespuesta, 0);
    }

    if (item.correcta) {
      consecutivas += 1;
      if (Number(bonusRegla.minimoConsecutivas || 0) > 0 && consecutivas >= Number(bonusRegla.minimoConsecutivas)) {
        puntaje += Number(bonusRegla.puntosExtra || 0);
      }
    } else {
      consecutivas = 0;
    }

    if (tieneOverride && Number.isFinite(Number(override))) {
      puntaje = Number(override);
    }

    return {
      ...item,
      puntaje: redondear(Math.max(puntaje, 0)),
      desglose: {
        ...item.desglose,
        criterioAplicado: `${criterio.descripcion} (peso ${Number(criterio.peso || 0)})`,
        resultado: tieneOverride
          ? `Puntaje ajustado manualmente por docente: ${Number(override).toFixed(2)}.`
          : item.desglose.resultado
      }
    };
  });
};
