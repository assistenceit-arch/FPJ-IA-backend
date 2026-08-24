import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// Adenda 2026-08-24: hasta ahora los 4 endpoints de auth (login,
// verificar-2fa, olvide-password, restablecer-password) recibían el
// body como un tipo de objeto plano de TypeScript en vez de una clase
// DTO -- la validación global de NestJS (ValidationPipe con
// class-validator) SOLO protege clases decoradas, no tipos planos.
// En la práctica, esto dejaba estos 4 endpoints sin ninguna validación
// real de formato ni de tamaño. Se corrige con DTOs propios, mismo
// patrón que el resto del sistema.
export class LoginDto {
  @IsEmail()
  correo!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;
}
