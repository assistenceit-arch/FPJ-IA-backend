import { IsDateString, IsOptional } from 'class-validator';

// Adenda 2026-09-02: el backend recibe un rango de fechas genérico
// (desde/hasta) en vez de una palabra clave como "semana" o "mes" --
// es el frontend quien traduce la selección del usuario (día, semana,
// mes, año) al rango de fechas real antes de consultar. Esto mantiene
// el backend simple y reutilizable, sin tener que enseñarle sobre
// zonas horarias o convenciones de calendario (ej. si la semana
// empieza en lunes o domingo).
export class ConsultarEstadisticasDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
