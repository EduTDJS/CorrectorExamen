import { useEffect, useMemo, useState } from 'react';
import { guardarReportes, leerReportes } from '../services/storageService';

export const useReportes = () => {
  const [reportes, setReportes] = useState(() => leerReportes());
  const [filtrosHistorial, setFiltrosHistorial] = useState({ materia: '', grupo: '', fecha: '' });

  useEffect(() => {
    guardarReportes(reportes);
  }, [reportes]);

  const reportesFiltrados = useMemo(() => reportes.filter((reporte) => {
    const materiaValida = !filtrosHistorial.materia || reporte.examen.materia === filtrosHistorial.materia;
    const grupoValido = !filtrosHistorial.grupo || reporte.examen.grupo === filtrosHistorial.grupo;
    const fechaValida = !filtrosHistorial.fecha || reporte.examen.fecha === filtrosHistorial.fecha;
    return materiaValida && grupoValido && fechaValida;
  }), [reportes, filtrosHistorial]);

  return { reportes, setReportes, filtrosHistorial, setFiltrosHistorial, reportesFiltrados };
};
