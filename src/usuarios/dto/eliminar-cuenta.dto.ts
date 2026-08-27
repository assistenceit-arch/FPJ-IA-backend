import { IsNotEmpty, IsString, MinLength } from 'class-validator';

// Adenda 2026-08-27: a solicitud del usuario, eliminar la propia cuenta
// exige explicar el motivo -- para que la institución pueda conocer qué
// piensan los usuarios o por qué se van.
export class EliminarCuentaDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  motivo!: string;
}
