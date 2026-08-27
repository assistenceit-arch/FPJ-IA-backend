import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { PagosService } from './pagos.service';
import { VerificarPagoDto } from './dto/verificar-pago.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('procedimientos/:procedimientoId/pago')
export class PagosController {
  constructor(private readonly service: PagosService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('comprobante', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      // Corrección 2026-08-27 (auditoría de seguridad): antes no había
      // ninguna restricción de tipo de archivo -- un funcionario podía
      // adjuntar cualquier cosa como "comprobante de pago" (un
      // ejecutable, un script, cualquier documento), no solo una
      // imagen o PDF real de un comprobante. Se restringe a los únicos
      // formatos razonables para este propósito.
      fileFilter: (_req, file, callback) => {
        const tiposPermitidos = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!tiposPermitidos.includes(file.mimetype)) {
          callback(
            new BadRequestException(
              'El comprobante debe ser una imagen (JPG, PNG) o un PDF.',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  registrar(
    @Param('procedimientoId') procedimientoId: string,
    @UploadedFile() comprobante: Express.Multer.File,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.registrar(procedimientoId, comprobante, usuario.sub, usuario.correo);
  }

  @Get()
  obtener(
    @Param('procedimientoId') procedimientoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.obtener(procedimientoId, usuario.sub, usuario.rol);
  }

  @Get('comprobante')
  async descargarComprobante(
    @Param('procedimientoId') procedimientoId: string,
    @CurrentUser() usuario: JwtPayload,
    @Res() res: Response,
  ) {
    const ruta = await this.service.obtenerRutaComprobante(
      procedimientoId,
      usuario.sub,
      usuario.rol,
    );
    return res.download(ruta);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  @Patch('verificar')
  verificar(
    @Param('procedimientoId') procedimientoId: string,
    @Body() dto: VerificarPagoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.verificar(procedimientoId, dto, usuario.sub, usuario.correo);
  }
}
