import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ElementosIncautadosService } from './elementos-incautados.service';
import { CrearElementoDto } from './dto/crear-elemento.dto';
import { ActualizarElementoDto } from './dto/actualizar-elemento.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

/**
 * Adenda 2026-08-14: elementos "sin individualizar" -- hallados en un
 * lugar común (ej. interior de un vehículo con varios ocupantes) sin
 * poder atribuirse a una persona específica, pero que de todas formas
 * dieron lugar a la captura de todos los intervinientes del
 * procedimiento. A diferencia de ElementosIncautadosController (anidado
 * bajo un capturado concreto), este controlador vive directamente bajo
 * el procedimiento -- delega en el mismo servicio, pasando
 * capturadoId=null.
 */
@UseGuards(JwtAuthGuard)
@Controller('procedimientos/:procedimientoId/elementos-colectivos')
export class ElementosColectivosController {
  constructor(private readonly service: ElementosIncautadosService) {}

  @Post()
  crear(
    @Param('procedimientoId') procedimientoId: string,
    @Body() dto: CrearElementoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.crear(procedimientoId, null, dto, usuario.sub, usuario.correo, usuario.rol);
  }

  @Get()
  listar(@Param('procedimientoId') procedimientoId: string, @CurrentUser() usuario: JwtPayload) {
    return this.service.listar(procedimientoId, null, usuario.sub, usuario.rol);
  }

  @Get(':elementoId')
  obtener(
    @Param('procedimientoId') procedimientoId: string,
    @Param('elementoId') elementoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.obtener(procedimientoId, null, elementoId, usuario.sub, usuario.rol);
  }

  @Patch(':elementoId')
  actualizar(
    @Param('procedimientoId') procedimientoId: string,
    @Param('elementoId') elementoId: string,
    @Body() dto: ActualizarElementoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.actualizar(
      procedimientoId,
      null,
      elementoId,
      dto,
      usuario.sub,
      usuario.correo,
      usuario.rol,
    );
  }

  @Delete(':elementoId')
  eliminar(
    @Param('procedimientoId') procedimientoId: string,
    @Param('elementoId') elementoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.eliminar(
      procedimientoId,
      null,
      elementoId,
      usuario.sub,
      usuario.correo,
      usuario.rol,
    );
  }
}
