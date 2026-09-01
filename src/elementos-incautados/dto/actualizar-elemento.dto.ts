import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CrearElementoDto } from './crear-elemento.dto';

// Adenda 2026-09-01: a solicitud del usuario -- hoy solo se puede
// eliminar un elemento ya registrado, no editarlo (a diferencia de
// capturados/aprehendidos, víctimas y testigos, que sí se pueden
// editar). Se reutilizan los mismos campos de creación, todos
// opcionales -- excepto `tipoElemento`, que se omite deliberadamente:
// el tipo de elemento (sustancia, dinero, celular, arma, otro) NO se
// puede cambiar en una edición, porque cada tipo tiene una tabla de
// detalle completamente distinta -- si el funcionario se equivocó de
// tipo, la corrección correcta es eliminar el elemento y registrarlo
// de nuevo con el tipo correcto, no "editarle el tipo".
export class ActualizarElementoDto extends PartialType(
  OmitType(CrearElementoDto, ['tipoElemento'] as const),
) {}
