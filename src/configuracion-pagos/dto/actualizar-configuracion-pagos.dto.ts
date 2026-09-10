import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ActualizarConfiguracionPagosDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  valorEstandar!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  valorComplejo!: number;

  // Adenda 2026-08-07: métodos de pago mostrados al funcionario en el
  // Bloque 8, cada uno con su propio interruptor de habilitado/
  // deshabilitado. Los datos (número, banco, etc.) son opcionales incluso
  // si el método está habilitado -- el backend no obliga a llenarlos,
  // pero un método habilitado sin datos no tendría sentido mostrarlo, así
  // que esa validación queda del lado del frontend.
  @IsOptional()
  @IsBoolean()
  nequiHabilitado?: boolean;

  @IsOptional()
  @IsString()
  nequiNumero?: string;

  @IsOptional()
  @IsBoolean()
  cuentaHabilitada?: boolean;

  @IsOptional()
  @IsString()
  cuentaBanco?: string;

  @IsOptional()
  @IsString()
  cuentaTipo?: string;

  @IsOptional()
  @IsString()
  cuentaNumero?: string;

  @IsOptional()
  @IsBoolean()
  tarjetaHabilitada?: boolean;

  @IsOptional()
  @IsString()
  tarjetaInstrucciones?: string;

  // Adenda 2026-09-06, a solicitud del usuario: Wompí (enlace externo)
  // y Llave (Bre-B), mismo criterio que los demás métodos.
  @IsOptional()
  @IsBoolean()
  wompiHabilitado?: boolean;

  @IsOptional()
  @IsString()
  wompiLink?: string;

  @IsOptional()
  @IsBoolean()
  llaveHabilitada?: boolean;

  @IsOptional()
  @IsString()
  llaveNumero?: string;

  @IsOptional()
  @IsBoolean()
  verificacionIaHabilitada?: boolean;

  // Adenda 2026-08-08: contacto de asesoría para procedimientos
  // complejos, mostrado en el Bloque 8 tras adjuntar el comprobante.
  @IsOptional()
  @IsString()
  contactoTelefono?: string;

  @IsOptional()
  @IsString()
  contactoCorreo?: string;
}
