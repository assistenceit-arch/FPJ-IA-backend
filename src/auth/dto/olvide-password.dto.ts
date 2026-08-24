import { IsEmail } from 'class-validator';

export class OlvidePasswordDto {
  @IsEmail()
  correo!: string;
}
