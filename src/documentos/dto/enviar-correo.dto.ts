import { IsEmail } from 'class-validator';

export class EnviarCorreoDto {
  @IsEmail()
  correo!: string;
}
