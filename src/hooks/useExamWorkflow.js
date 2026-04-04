import { useCallback, useState } from "react";
import {
  RUBRICAS_SEMILLA,
  normalizarRubrica,
} from "../features/rubrics/rubricModel";

const estadoAsyncInicial = {
  cargando: false,
  error: "",
};

export const useExamWorkflow = (pasos) => {
  const [pasoActual, setPasoActual] = useState(0);
  const [estadoPaso, setEstadoPaso] = useState(
    pasos.map(() => ({ ...estadoAsyncInicial })),
  );
  const [rubricas, setRubricas] = useState([...RUBRICAS_SEMILLA]);
  const [rubricaSeleccionadaId, setRubricaSeleccionadaId] = useState("");
  const [estadoRubricas, setEstadoRubricas] = useState({
    cargando: false,
    error: "",
  });
  const [rosters, setRosters] = useState([]);
  const [rosterSeleccionadoId, setRosterSeleccionadoId] = useState("");
  const [estadoRosters, setEstadoRosters] = useState({
    cargando: false,
    error: "",
  });

  const cambiarEstadoPaso = (indice, nuevoEstado) => {
    setEstadoPaso((previo) =>
      previo.map((estado, i) =>
        i === indice ? { ...estado, ...nuevoEstado } : estado,
      ),
    );
  };

  const avanzarPaso = async (validarPaso) => {
    if (!validarPaso(pasoActual)) {
      return;
    }
    cambiarEstadoPaso(pasoActual, { cargando: true, error: "" });
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (pasoActual < pasos.length - 1) {
        setPasoActual((previo) => previo + 1);
      }
    } finally {
      cambiarEstadoPaso(pasoActual, { cargando: false });
    }
  };

  const retrocederPaso = (onBack) => {
    if (onBack) {
      onBack();
    }
    if (pasoActual > 0) {
      setPasoActual((previo) => previo - 1);
    }
  };

  const cargarRubricas = useCallback(async () => {
    setEstadoRubricas({ cargando: true, error: "" });
    try {
      const response = await fetch("/api/rubricas");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || "No se pudieron cargar las rúbricas.",
        );
      }
      const rubricasApi = Array.isArray(payload?.data)
        ? payload.data.map((item) => normalizarRubrica(item))
        : [];
      setRubricas(rubricasApi.length > 0 ? rubricasApi : [...RUBRICAS_SEMILLA]);
      setEstadoRubricas({ cargando: false, error: "" });
    } catch (error) {
      setRubricas([...RUBRICAS_SEMILLA]);
      setEstadoRubricas({
        cargando: false,
        error:
          error?.message ||
          "No se pudieron cargar las rúbricas desde backend. Se usarán plantillas locales.",
      });
    }
  }, []);

  const seleccionarRubrica = (rubricaId) => {
    setRubricaSeleccionadaId(String(rubricaId || ""));
  };

  const cargarRosters = useCallback(async ({ group = "", term = "" } = {}) => {
    setEstadoRosters({ cargando: true, error: "" });
    try {
      const params = new URLSearchParams();
      if (group) params.set("group", group);
      if (term) params.set("term", term);
      const response = await fetch(
        `/api/rosters${params.toString() ? `?${params.toString()}` : ""}`,
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.error?.message ||
            "No se pudieron cargar las listas del grupo.",
        );
      }
      setRosters(Array.isArray(payload?.data) ? payload.data : []);
      setEstadoRosters({ cargando: false, error: "" });
    } catch (error) {
      setRosters([]);
      setEstadoRosters({
        cargando: false,
        error: error?.message || "No se pudieron cargar las listas del grupo.",
      });
    }
  }, []);

  const seleccionarRoster = (rosterId) => {
    setRosterSeleccionadoId(String(rosterId || ""));
  };

  const rubricaSeleccionada =
    rubricas.find((item) => item.id === rubricaSeleccionadaId) || null;

  return {
    pasoActual,
    pasos,
    estadoPaso,
    estadoActual: estadoPaso[pasoActual],
    avanzarPaso,
    retrocederPaso,
    rubricas,
    rubricaSeleccionada,
    rubricaSeleccionadaId,
    estadoRubricas,
    rosters,
    rosterSeleccionadoId,
    estadoRosters,
    cargarRubricas,
    seleccionarRubrica,
    cargarRosters,
    seleccionarRoster,
  };
};
