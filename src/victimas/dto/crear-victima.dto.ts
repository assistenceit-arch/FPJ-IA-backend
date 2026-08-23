import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

// Adenda 2026-08-20: Víctima (Sección 4 del FPJ 5, núcleo
// común transversal a todos los delitos). Misma dinámica de
// diligenciamiento que CrearCapturadoDto: todos los campos opcionales
// salvo el nombre, con el mismo criterio de "no aporta" para
// fecha de nacimiento / edad manual.
export class CrearVictimaDto {
  @IsNotEmpty()
  @IsString()
  primerNombre!: string;

  @IsOptional()
  @IsString()
  segundoNombre?: string;

  @IsNotEmpty()
  @IsString()
  primerApellido!: string;

  @IsOptional()
  @IsString()
  segundoApellido?: string;

  @IsOptional()
  @IsString()
  tipoDocumento?: string;

  @IsOptional()
  @IsString()
  numeroDocumento?: string;

  @IsOptional()
  @IsString()
  expedicionDocumento?: string;

  // Igual criterio que Capturado: viene fechaNacimiento O edadManual,
  // nunca ambos (validado en VictimasService.resolverEdad).
  @ValidateIf((o) => o.edadManual === undefined || o.edadManual === null)
  @IsOptional()
  @IsDateString()
  fechaNacimiento?: string;

  @ValidateIf((o) => o.fechaNacimiento === undefined || o.fechaNacimiento === null)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  edadManual?: number;

  @IsOptional()
  @IsString()
  genero?: string;

  // Lugar de nacimiento desglosado (a diferencia de Capturado, que solo
  // tiene un campo libre) -- a solicitud del usuario.
  @IsOptional()
  @IsString()
  paisNacimiento?: string;

  @IsOptional()
  @IsString()
  departamentoNacimiento?: string;

  @IsOptional()
  @IsString()
  municipioNacimiento?: string;

  @IsOptional()
  @IsString()
  profesionOficio?: string;

  @IsOptional()
  @IsString()
  estadoCivil?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  // Mismo criterio que CrearCapturadoDto.correo: cadena vacía o "No
  // aporta" no debe activar la validación de formato de correo.
  @ValidateIf(
    (o) =>
      o.correo !== undefined &&
      o.correo !== null &&
      o.correo !== '' &&
      o.correo.trim().toLowerCase() !== 'no aporta',
  )
  @IsEmail()
  correo?: string;

  // Único campo que Víctima tiene y Testigo no: relación con el
  // indiciado/interviniente (ej. "desconocido", "conocido de vista",
  // "cliente de la aplicación"). Texto libre.
  @IsOptional()
  @IsString()
  relacionIndiciado?: string;

  // Adenda 2026-08-22 (módulo Lesiones Personales): estado físico de la
  // víctima -- mismo criterio y campos que CrearCapturadoDto, salvo
  // motivoLesion (no aplica a víctimas). Núcleo común, no exclusivo de
  // este módulo.
  @IsOptional()
  @IsBoolean()
  presentaLesiones?: boolean;

  @ValidateIf((o) => o.presentaLesiones === true)
  @IsString()
  descripcionLesiones?: string;

  @ValidateIf((o) => o.presentaLesiones === true)
  @IsString()
  parteCuerpoLesion?: string;

  @ValidateIf((o) => o.presentaLesiones === true)
  @IsString()
  causanteLesion?: string;

  @ValidateIf((o) => o.presentaLesiones === true)
  @IsString()
  elementoCausante?: string;

  @IsOptional()
  @IsBoolean()
  trasladoCentroAsistencial?: boolean;

  @ValidateIf((o) => o.trasladoCentroAsistencial === true)
  @IsString()
  centroAsistencial?: string;

  @ValidateIf((o) => o.trasladoCentroAsistencial === true)
  @IsString()
  motivoTraslado?: string;

  // Adenda 2026-08-22 (módulo Violencia contra Servidor Público):
  // exclusivo de este delito. Toda víctima registrada bajo este delito
  // es, por definición, un servidor público -- no hay un booleano
  // "esServidorPublico" separado.
  @IsOptional()
  @IsString()
  entidadServidorPublico?: string;

  @IsOptional()
  @IsString()
  cargoServidorPublico?: string;

  @IsOptional()
  @IsBoolean()
  uniformado?: boolean;

  @IsOptional()
  @IsBoolean()
  enEjercicioFunciones?: boolean;

  @IsOptional()
  @IsBoolean()
  indiciadoConocioCalidad?: boolean;

  // Adenda 2026-08-22 (módulo Violencia Intrafamiliar): exclusivo de
  // este delito. relacionFamiliar es texto libre, sin selector de
  // categorías fijas (a solicitud del usuario).
  @IsOptional()
  @IsString()
  relacionFamiliar?: string;

  @IsOptional()
  @IsBoolean()
  existenMedidasProteccion?: boolean;

  @ValidateIf((o) => o.existenMedidasProteccion === true)
  @IsString()
  descripcionMedidasProteccion?: string;

  @IsOptional()
  @IsBoolean()
  existenAntecedentesViolencia?: boolean;

  @ValidateIf((o) => o.existenAntecedentesViolencia === true)
  @IsString()
  descripcionAntecedentesViolencia?: string;

  // Adenda 2026-08-23 (módulo Homicidio): exclusivo de este delito.
  // Soporta también la tentativa (fallecio = false).
  @IsOptional()
  @IsBoolean()
  fallecio?: boolean;

  // Adenda 2026-08-23 (módulo Secuestro): exclusivo de este delito.
  @ValidateIf(
    (o) =>
      o.fechaInicioPrivacionLibertad !== undefined &&
      o.fechaInicioPrivacionLibertad !== null &&
      o.fechaInicioPrivacionLibertad !== '',
  )
  @IsDateString()
  fechaInicioPrivacionLibertad?: string;

  @IsOptional()
  @IsString()
  horaInicioPrivacionLibertad?: string;

  @IsOptional()
  @IsString()
  finalidadPrivacionLibertad?: string;

  @IsOptional()
  @IsString()
  lugaresRetencion?: string;

  // Adenda 2026-08-23 (módulo Extorsión): exclusivo de este delito.
  @IsOptional()
  @IsString()
  montoExigido?: string;

  @IsOptional()
  @IsString()
  motivoExigencia?: string;

  @IsOptional()
  @IsString()
  medioExigencia?: string;

  @IsOptional()
  @IsBoolean()
  existenAmenazas?: boolean;

  @ValidateIf((o) => o.existenAmenazas === true)
  @IsString()
  descripcionAmenazas?: string;

  @IsOptional()
  @IsString()
  lugarEntregaExigido?: string;

  // Adenda 2026-08-23 (módulo Daño en Bien Ajeno o del Estado):
  // exclusivo de este delito.
  @IsOptional()
  @IsString()
  descripcionBienDanado?: string;

  @IsOptional()
  @IsString()
  mecanismoDano?: string;

  @IsOptional()
  @IsString()
  valorEstimadoDano?: string;

  @IsOptional()
  @IsBoolean()
  esBienEstatal?: boolean;

  @ValidateIf((o) => o.esBienEstatal === true)
  @IsString()
  entidadPropietariaBien?: string;
}
