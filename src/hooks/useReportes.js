import { useEffect, useMemo, useState } from 'react';
import {
  guardarReporteApi,
  guardarReportes,
  leerReportes,
  listarReportesApi,
  normalizarNombreMateria
} from '../services/storageService';

export const agruparReportesPorMateria = (reportes) => {
  const mapa = new Map();

  (Array.isArray(reportes) ? reportes : []).forEach((reporte) => {
    const materiaVisible = reporte.examen.materia || 'Sin materia';
    const materiaNormalizada = reporte.organizacion?.materiaNormalizada || normalizarNombreMateria(materiaVisible);
    const materiaFolderId = reporte.organizacion?.materiaFolderId || `materia:${materiaNormalizada || 'sin-definir'}`;

    if (!mapa.has(materiaFolderId)) {
      mapa.set(materiaFolderId, {
        materiaFolderId,
        materia: materiaVisible,
        materiaNormalizada,
        totalReportes: 0,
        reportes: []
      });
    }

    const carpeta = mapa.get(materiaFolderId);
    carpeta.reportes.push(reporte);
    carpeta.totalReportes += 1;
  });

  return Array.from(mapa.values())
    .map((carpeta) => ({
      ...carpeta,
      reportes: carpeta.reportes.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
    }))
    .sort((a, b) => a.materia.localeCompare(b.materia, 'es', { sensitivity: 'base' }));
};

export const detectarMatriculasDuplicadas = (reportes, matriculas = []) => {
  const registradas = new Set(
    (Array.isArray(reportes) ? reportes : [])
      .map((reporte) => String(reporte?.estudiante?.matricula || '').trim())
      .filter(Boolean)
  );

  return (Array.isArray(matriculas) ? matriculas : []).filter((matricula, indice, arr) => {
    const limpia = String(matricula || '').trim();
    return limpia && registradas.has(limpia) && arr.indexOf(matricula) === indice;
  });
};

export const useReportes = () => {
  const [reportes, setReportes] = useState([]);
  const [filtrosHistorial, setFiltrosHistorial] = useState({ materia: '', grupo: '', fecha: '' });
  const [usaBackend, setUsaBackend] = useState(null);
  const [errorSesion, setErrorSesion] = useState('');

  useEffect(() => {
    let cancelado = false;
    listarReportesApi()
      .then((data) => {
        if (cancelado) return;
        setReportes(data);
        setUsaBackend(true);
        setErrorSesion('');
      })
      .catch((error) => {
        if (cancelado) return;

        setUsaBackend(false);
        setReportes(leerReportes());

        if (error?.status === 401 || error?.status === 403) {
          setErrorSesion(error.message);
          return;
        }

        setErrorSesion('');
      });

    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (usaBackend === false) {
      guardarReportes(reportes);
    }
  }, [reportes, usaBackend]);

  const guardarReporte = async (reporte) => {
    if (usaBackend === false) {
      setReportes((previo) => {
        const existe = previo.some((item) => item.id === reporte.id);
        if (!existe) return [reporte, ...previo];
        return previo.map((item) => (item.id === reporte.id ? reporte : item));
      });
      return reporte;
    }

    try {
      const guardado = await guardarReporteApi(reporte);
      setErrorSesion('');
      setReportes((previo) => {
        const existe = previo.some((item) => item.id === guardado.id);
        if (!existe) return [guardado, ...previo];
        return previo.map((item) => (item.id === guardado.id ? guardado : item));
      });
      return guardado;
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        setErrorSesion(error.message);
      }
      throw error;
    }
  };

  const reportesFiltrados = useMemo(() => reportes.filter((reporte) => {
    const filtroMateriaNormalizada = normalizarNombreMateria(filtrosHistorial.materia);
    const materiaReporteNormalizada = reporte.organizacion?.materiaNormalizada
      || normalizarNombreMateria(reporte.examen.materia);
    const materiaValida = !filtroMateriaNormalizada || materiaReporteNormalizada.includes(filtroMateriaNormalizada);
    const grupoValido = !filtrosHistorial.grupo || reporte.examen.grupo === filtrosHistorial.grupo;
    const fechaValida = !filtrosHistorial.fecha || reporte.examen.fecha === filtrosHistorial.fecha;
    return materiaValida && grupoValido && fechaValida;
  }), [reportes, filtrosHistorial]);

  const reportesAgrupadosPorMateria = useMemo(
    () => agruparReportesPorMateria(reportesFiltrados),
    [reportesFiltrados]
  );

  return {
    reportes,
    setReportes,
    guardarReporte,
    filtrosHistorial,
    setFiltrosHistorial,
    reportesFiltrados,
    reportesAgrupadosPorMateria,
    errorSesion
  };
};
