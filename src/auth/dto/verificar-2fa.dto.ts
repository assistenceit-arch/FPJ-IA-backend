import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class Verificar2FADto {
  @IsEmail()
  correo!: string;

  // Siempre 6 dígitos (ver AuthService.solicitarCodigo2FA) -- Length
  // rechaza de una vez cualquier valor con longitud distinta, antes de
  // siquiera comparar contra el código real.
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  codigo!: string;
}
