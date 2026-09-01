import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateProcedimientoDto {
  @IsOptional()
  @IsString()
  nunc?: string;

  @IsNotEmpty()
  @IsDateString()
  fechaCaptura!: Date;

  @IsNotEmpty()
  @IsString()
  horaCaptura!: string;

  // No se conocen al momento de crear el procedimiento (ver comentario en
  // schema.prisma). Se completan después mediante actualización.
  @IsOptional()
  @IsDateString()
  fechaDisposicion?: Date;

  @IsOptional()
  @IsString()
  horaDisposicion?: string;

  @IsNotEmpty()
  @IsString()
  delito!: string;

  @IsNotEmpty()
  @IsString()
  tipoProcedimiento!: string;

  // El estado inicial lo controla el sistema (Borrador), no el cliente —
  // ver ProcedimientosService.create(). Solo se acepta aquí para permitir
  // que UpdateProcedimientoDto (PartialType de este DTO) lo modifique más
  // adelante en el ciclo de vida del procedimiento.
  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsString()
  observacionesGenerales?: string;

  // Adenda 2026-09-01: el funcionario confirma explícitamente que no
  // hay elementos incautados en este procedimiento -- ver comentario
  // en schema.prisma. Solo se acepta aquí para permitir que
  // UpdateProcedimientoDto lo modifique (nunca se envía al crear el
  // procedimiento, solo después, desde el Bloque 5).
  @IsOptional()
  @IsBoolean()
  sinElementosIncautados?: boolean;
}