import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

const TIPOS_VALIDOS = ['FPJ5', 'FPJ6', 'ACTA', 'ACTA_COLECTIVA', 'FPJ7', 'FPJ8'];

export class CrearTrabajoGeneracionDto {
  @IsIn(TIPOS_VALIDOS)
  tipoDocumento!: string;

  @IsOptional()
  @IsString()
  capturadoId?: string;

  @IsOptional()
  @IsString()
  elementoId?: string;

  // Exclusivo del FPJ-5: respuestas a preguntas de aclaración previas.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aclaraciones?: string[];
}
