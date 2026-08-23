// Contexto estructurado que se envía al modelo de IA para generar la
// narración de los hechos del FPJ-5 (REGLA INV-FPJ5-002: la narrativa se
// construye a partir de Servicio Prestado, Lugar, Intervinientes, Elementos
// Hallados y Actuaciones Realizadas — únicamente variables ya persistidas
// en el Modelo de Datos V1, sin campos de texto libre adicionales).

export interface ElementoNarracion {
  tipoElemento: string; // SUSTANCIA | DINERO | CELULAR | OTRO
  descripcionBase: string;
  ubicacionHallazgo: string;
  direccionIncautacion: string;
  observaciones?: string | null;
  // Adenda 2026-08-23 (módulo Receptación): fuente de verificación de
  // que el elemento tiene reporte de hurto, y datos propios de esa
  // fuente. Uso operativo exclusivo de Receptación.
  fuenteVerificacionHurto?: string | null; // APLICATIVO | DENUNCIA
  nombreAplicativo?: string | null;
  numeroReporteAplicativo?: string | null;
  numeroDenuncia?: string | null;
  entidadDenuncia?: string | null;
  fechaDenuncia?: string | null;
  denuncianteNombre?: string | null;
  denuncianteDocumento?: string | null;
  denuncianteTelefono?: string | null;
  // Adenda 2026-08-23 (delitos contra la fe pública: Uso de Documento
  // Falso, Falsedad Personal, Tráfico de Moneda Falsa): campos
  // compartidos entre los tres.
  contextoExhibicion?: string | null;
  criteriosSospecha?: string | null;
}

export interface IntervinienteNarracion {
  tipoInterviniente: string; // CAPTURADO | APREHENDIDO
  nombreCompleto: string;
  edad: number;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  elementos: ElementoNarracion[];
  // Adenda 2026-07-22 (Bloque 5/6): datos individuales para reducir la
  // dependencia del ciclo de aclaraciones.
  participacionHechos?: string | null;
  comportamientoAbordaje?: string | null;
  // Adenda 2026-08-22: antecedentes y pertenencia a organización
  // delincuencial -- transversal, ya no exclusivo de SRPA ni preguntado
  // por la IA en cada narrativa (bug real reportado tras caso en vivo:
  // la IA lo preguntaba repetidamente aunque ya se supiera la
  // respuesta).
  tieneProcedimientosAnteriores?: boolean | null;
  descripcionProcedimientosAnteriores?: string | null;
  perteneceGrupoDelincuencial?: boolean | null;
  descripcionGrupoDelincuencial?: string | null;
  identificacionPlena: boolean;
  formaIdentificacion?: string | null;
  // Adenda 2026-08-06: faltaba por completo -- el dato se capturaba en
  // el Bloque 2 pero nunca llegaba al contexto que se le manda a la IA,
  // así que el FPJ-5 nunca lo mencionaba.
  escolaridad?: string | null;
  // Adenda 2026-08-21: lectura de derechos (y la hora de captura que de
  // ahí se deriva) pasa a ser individual por interviniente -- antes
  // vivía en `actuaciones`, general para todo el procedimiento, lo que
  // impedía capturas/aprehensiones en momentos distintos dentro del
  // mismo procedimiento (bug real reportado tras caso en vivo). Mismo
  // criterio ya aplicado a esposas/lesiones.
  derechosLeidos?: boolean | null;
  fechaCaptura?: string | null;
  horaCaptura?: string | null;
  comprendeDerechos?: boolean | null;
  // Adenda 2026-08-03: uso de esposas pasa a ser individual por
  // interviniente (antes vivía en `actuaciones`, general para todo el
  // procedimiento).
  usoEsposas?: boolean | null;
  justificacionEsposas?: string | null;
  // Adenda 2026-08-11: tiempo y motivo de retiro, junto con la
  // justificación de por qué se colocaron.
  tiempoEsposado?: string | null;
  motivoRetiroEsposas?: string | null;

  // Adenda 2026-08-11: lesiones pasan a ser individuales por
  // interviniente (antes vivían en `actuaciones`, general para todo el
  // procedimiento) -- mismo criterio ya aplicado a esposas.
  presentaLesiones?: boolean | null;
  descripcionLesiones?: string | null;
  parteCuerpoLesion?: string | null;
  motivoLesion?: string | null;
  // Adenda 2026-08-22 (módulo Lesiones Personales): quién causó la
  // lesión y con qué -- transversal a todos los delitos.
  causanteLesion?: string | null;
  elementoCausante?: string | null;
  trasladoCentroAsistencial?: boolean | null;
  centroAsistencial?: string | null;
  motivoTraslado?: string | null;

  // Adenda 2026-08-12: exclusivo del módulo de Porte Ilegal de Armas de
  // Fuego. PORTE | TENENCIA | NINGUNO | null (procedimiento de otro
  // delito).
  tipoPermisoArma?: string | null;

  // Adenda 2026-08-11: corrige un bug real -- este dato se diligenciaba
  // en el Bloque 2 (Contacto de notificación) pero nunca llegaba al
  // contexto de la narrativa IA, así que el sistema preguntaba por él
  // en cada generación sin importar que ya estuviera guardado. `null`
  // cuando el interviniente no tiene un registro de contacto todavía.
  contacto?: {
    nombre?: string | null;
    parentesco?: string | null;
    telefono?: string | null;
    comunicacionExitosa: boolean;
    horaComunicacion?: string | null;
    justificacionNoComunicacion?: string | null;
  } | null;
}

// Adenda 2026-08-20: Testigos de los hechos (Sección 5 del FPJ 5, hasta
// ahora fija en N/A). Núcleo común, transversal a todos los delitos.
// Adenda 2026-08-21 (módulo Hurto): Víctimas (Sección 4 del FPJ 5).
// Núcleo común, transversal. Para Estupefacientes se mantiene la regla
// automática N/A existente (no se le pasa este campo a la IA en ese
// caso, o llega vacío).
export interface VictimaNarracion {
  nombreCompleto: string;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  edad?: number | null;
  genero?: string | null;
  relacionIndiciado?: string | null;
  // Elementos que le fueron hurtados a esta víctima específica, con su
  // estado de recuperación -- para que la IA pueda narrar con claridad
  // qué le sustrajeron a cada quien y si fue recuperado.
  elementosHurtados: {
    descripcionBase: string;
    recuperado: boolean | null;
    recuperadoPor: string | null;
    // Adenda 2026-08-23 (módulo Receptación): esta víctima solo se
    // vincula ocasionalmente en Receptación -- cuando existe, la fuente
    // de verificación del reporte de hurto también es relevante en su
    // contexto.
    fuenteVerificacionHurto?: string | null;
    nombreAplicativo?: string | null;
    numeroReporteAplicativo?: string | null;
    numeroDenuncia?: string | null;
    entidadDenuncia?: string | null;
    fechaDenuncia?: string | null;
    denuncianteNombre?: string | null;
    denuncianteDocumento?: string | null;
    denuncianteTelefono?: string | null;
  }[];
  // Adenda 2026-08-22 (módulo Lesiones Personales): estado físico de la
  // víctima -- mismo criterio que IntervinienteNarracion, sin
  // motivoLesion (no aplica a víctimas). Núcleo común.
  presentaLesiones?: boolean | null;
  descripcionLesiones?: string | null;
  parteCuerpoLesion?: string | null;
  causanteLesion?: string | null;
  elementoCausante?: string | null;
  trasladoCentroAsistencial?: boolean | null;
  centroAsistencial?: string | null;
  motivoTraslado?: string | null;
  // Adenda 2026-08-23 (módulo Homicidio): exclusivo de este delito.
  // Soporta tanto el caso consumado como la tentativa (fallecio =
  // false, la víctima sobrevivió a pesar de la agresión).
  fallecio?: boolean | null;
  // Adenda 2026-08-22 (módulo Violencia contra Servidor Público):
  // exclusivo de este delito.
  entidadServidorPublico?: string | null;
  cargoServidorPublico?: string | null;
  uniformado?: boolean | null;
  enEjercicioFunciones?: boolean | null;
  indiciadoConocioCalidad?: boolean | null;
  // Adenda 2026-08-22 (módulo Violencia Intrafamiliar): exclusivo de
  // este delito.
  relacionFamiliar?: string | null;
  existenMedidasProteccion?: boolean | null;
  descripcionMedidasProteccion?: string | null;
  existenAntecedentesViolencia?: boolean | null;
  descripcionAntecedentesViolencia?: string | null;
  // Adenda 2026-08-23 (módulo Secuestro): exclusivo de este delito.
  fechaInicioPrivacionLibertad?: string | null;
  horaInicioPrivacionLibertad?: string | null;
  finalidadPrivacionLibertad?: string | null;
  lugaresRetencion?: string | null;
  // Adenda 2026-08-23 (módulo Extorsión): exclusivo de este delito.
  montoExigido?: string | null;
  motivoExigencia?: string | null;
  medioExigencia?: string | null;
  existenAmenazas?: boolean | null;
  descripcionAmenazas?: string | null;
  lugarEntregaExigido?: string | null;
  // Adenda 2026-08-23 (módulo Daño en Bien Ajeno o del Estado):
  // exclusivo de este delito.
  descripcionBienDanado?: string | null;
  mecanismoDano?: string | null;
  valorEstimadoDano?: string | null;
  esBienEstatal?: boolean | null;
  entidadPropietariaBien?: string | null;
}

export interface TestigoNarracion {
  nombreCompleto: string;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  edad?: number | null;
  genero?: string | null;
}

export interface ContextoNarracionFpj5 {
  procedimiento: {
    delito: string;
    tipoProcedimiento: string;
    fechaCaptura: string; // ISO
    horaCaptura: string;
    fechaDisposicion: string; // ISO
    horaDisposicion: string;
  };
  funcionario: {
    nombreCompleto: string;
    cargo: string;
    placa: string;
    servicio: string;
    estacion: string;
    cai?: string | null;
  };
  companero: {
    nombreCompleto: string;
    placa: string;
    grado?: string | null;
  } | null;
  lugar: {
    departamento: string;
    municipio: string;
    barrio: string;
    direccion: string;
    caracteristicas?: string | null;
    // Adenda 2026-08-22: existencia de cámaras -- transversal, ya no
    // preguntado por la IA en cada narrativa (bug real reportado tras
    // caso en vivo).
    existenCamaras?: boolean | null;
    descripcionCamaras?: string | null;
  };
  intervinientes: IntervinienteNarracion[];
  // Adenda 2026-08-14: elementos "sin individualizar" -- hallados en un
  // lugar común (ej. interior de un vehículo) sin poder atribuirse a
  // una persona específica, pero que dieron lugar a la captura de
  // todos los intervinientes del procedimiento. Separado de la lista
  // de `elementos` de cada interviniente porque, precisamente, no
  // pertenecen a ninguno en particular.
  elementosSinIndividualizar: ElementoNarracion[];
  // Adenda 2026-08-20: vacío = Sección 5 se genera en N/A (regla
  // automática existente); con contenido, se listan en el informe.
  testigos: TestigoNarracion[];
  // Adenda 2026-08-21 (módulo Hurto): vacío = Sección 4 se genera en N/A
  // (regla automática existente para Estupefacientes se mantiene igual).
  victimas: VictimaNarracion[];
  actuaciones: {
    // Adenda 2026-08-21: derechosLeidos/fechaDerechos/horaDerechos/
    // comprendeDerechos se quitan de aquí -- pasan a ser individuales por
    // interviniente (ver IntervinienteNarracion), mismo criterio ya
    // aplicado a esposas/lesiones.
    autoridadReceptora: string;
    // Adenda 2026-08-20: en procedimientos mixtos, la autoridad
    // receptora puede diferir para mayores y menores de edad.
    autoridadReceptoraAdultos?: string | null;
    autoridadReceptoraMenores?: string | null;
    demoraExistente: boolean;
    justificacionDemora?: string | null;
    // Adenda 2026-07-22 (Bloque 5/6):
    observacionInicial?: string | null;
    desarrolloIntervencion?: string | null;
    circunstanciaRelevante?: string | null;
    observacionAdicional?: string | null;
  };
}

export type ResultadoNarracion =
  | { tipo: 'narracion'; texto: string }
  | { tipo: 'aclaracion_requerida'; pregunta: string };
