import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RestablecerPasswordDto {
  @IsNotEmpty()
  @IsString()
  token!: string;

  // Adenda 2026-08-24: antes el mínimo de 8 caracteres solo se validaba
  // en el frontend (fácil de saltar llamando directamente a la API) --
  // este DTO es lo que realmente lo hace obligatorio.
  @MinLength(8)
  nuevaPassword!: string;
}
