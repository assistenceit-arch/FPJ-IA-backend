import { Equals, IsBoolean, IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

// Adenda 2026-08-06: registro autónomo desde la pantalla de login. A
// diferencia de CreateUsuarioDto (creación por un administrador), NO
// pide apellidos ni identificación, y NUNCA acepta un rol del cliente
// -- el rol siempre queda en FUNCIONARIO (ver UsuariosService.registrarPublico).
export class RegistrarPublicoDto {
  @IsNotEmpty()
  @IsString()
  nombres!: string;

  @IsEmail()
  correo!: string;

  @IsNotEmpty()
  @IsString()
  telefono!: string;

  @MinLength(8)
  password!: string;

  // Corrección 2026-09-04, a solicitud del usuario: exige explícitamente
  // que el valor sea `true` (no solo "definido" ni "verdadero o falso")
  // -- si alguien intentara registrarse sin marcar la casilla, o
  // manipulando la petición directamente, el registro se rechaza aquí,
  // no solo en el frontend.
  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar la Política de Tratamiento de Datos para registrarte.' })
  aceptaPoliticaDatos!: boolean;
}
