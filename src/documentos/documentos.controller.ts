import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { DocumentosService } from './documentos.service';
import { GenerarFpj5Dto } from './dto/generar-fpj5.dto';
import { EnviarCorreoDto } from './dto/enviar-correo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller()
export class DocumentosController {
  constructor(private readonly service: DocumentosService) {}

  @Post('procedimientos/:procedimientoId/capturados/:capturadoId/documentos/acta-incautacion')
  generarActaIncautacion(
    @Param('procedimientoId') procedimientoId: string,
    @Param('capturadoId') capturadoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.generarActaIncautacion(
      procedimientoId,
      capturadoId,
      usuario.sub,
      usuario.correo,
      usuario.rol,
    );
  }

  // Adenda 2026-08-14: Acta de Incautación para elementos "sin
  // individualizar" (hallados en un lugar común, sin poder atribuirse a
  // una persona específica) -- a nivel de procedimiento, no de un
  // capturado en particular.
  @Post('procedimientos/:procedimientoId/documentos/acta-incautacion-colectiva')
  generarActaIncautacionColectiva(
    @Param('procedimientoId') procedimientoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.generarActaIncautacionColectiva(
      procedimientoId,
      usuario.sub,
      usuario.correo,
      usuario.rol,
    );
  }

  @Post('procedimientos/:procedimientoId/capturados/:capturadoId/documentos/fpj6-acta-derechos')
  generarFpj6(
    @Param('procedimientoId') procedimientoId: string,
    @Param('capturadoId') capturadoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.generarFpj6ActaDerechos(
      procedimientoId,
      capturadoId,
      usuario.sub,
      usuario.correo,
      usuario.rol,
    );
  }

  // La narración de los hechos (sección 9) se genera automáticamente por
  // IA. Si falta información o hay una inconsistencia según las reglas del
  // CORE, responde 409 con la pregunta exacta (ver AclaracionRequeridaException)
  // y NO genera ningún documento. Reenviar la solicitud agregando la
  // respuesta del funcionario en `aclaraciones`.
  @Post('procedimientos/:procedimientoId/documentos/fpj5-informe-captura')
  generarFpj5(
    @Param('procedimientoId') procedimientoId: string,
    @Body() dto: GenerarFpj5Dto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.generarFpj5Informe(
      procedimientoId,
      usuario.sub,
      usuario.correo,
      dto.aclaraciones ?? [],
      usuario.rol,
    );
  }

  @Post('procedimientos/:procedimientoId/elementos/:elementoId/documentos/fpj7-rotulo')
  generarFpj7(
    @Param('procedimientoId') procedimientoId: string,
    @Param('elementoId') elementoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.generarFpj7Rotulo(
      procedimientoId,
      elementoId,
      usuario.sub,
      usuario.correo,
      usuario.rol,
    );
  }

  @Post('procedimientos/:procedimientoId/elementos/:elementoId/documentos/fpj8-cadena-custodia')
  generarFpj8(
    @Param('procedimientoId') procedimientoId: string,
    @Param('elementoId') elementoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.generarFpj8CadenaCustodia(
      procedimientoId,
      elementoId,
      usuario.sub,
      usuario.correo,
      usuario.rol,
    );
  }

  @Get('procedimientos/:procedimientoId/documentos')
  listar(
    @Param('procedimientoId') procedimientoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.listar(procedimientoId, usuario.sub, usuario.rol);
  }

  @Get('documentos/:documentoId/descargar')
  async descargar(
    @Param('documentoId') documentoId: string,
    @CurrentUser() usuario: JwtPayload,
    @Res() res: Response,
  ) {
    const documento = await this.service.obtenerArchivo(documentoId, usuario.sub, usuario.rol);
    return res.download(documento.rutaArchivo);
  }

  // Adenda 2026-08-26: alternativa a la descarga directa, a solicitud
  // del usuario -- útil sobre todo desde el celular.
  @Post('documentos/:documentoId/enviar-correo')
  async enviarCorreo(
    @Param('documentoId') documentoId: string,
    @Body() dto: EnviarCorreoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.enviarPorCorreo(documentoId, dto.correo, usuario.sub, usuario.rol);
  }
}
