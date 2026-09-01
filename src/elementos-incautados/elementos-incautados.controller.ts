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

@UseGuards(JwtAuthGuard)
@Controller('procedimientos/:procedimientoId/capturados/:capturadoId/elementos')
export class ElementosIncautadosController {
  constructor(private readonly service: ElementosIncautadosService) {}

  @Post()
  crear(
    @Param('procedimientoId') procedimientoId: string,
    @Param('capturadoId') capturadoId: string,
    @Body() dto: CrearElementoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.crear(
      procedimientoId,
      capturadoId,
      dto,
      usuario.sub,
      usuario.correo,
      usuario.rol,
    );
  }

  @Get()
  listar(
    @Param('procedimientoId') procedimientoId: string,
    @Param('capturadoId') capturadoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.listar(procedimientoId, capturadoId, usuario.sub, usuario.rol);
  }

  @Get(':elementoId')
  obtener(
    @Param('procedimientoId') procedimientoId: string,
    @Param('capturadoId') capturadoId: string,
    @Param('elementoId') elementoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.obtener(procedimientoId, capturadoId, elementoId, usuario.sub, usuario.rol);
  }

  @Patch(':elementoId')
  actualizar(
    @Param('procedimientoId') procedimientoId: string,
    @Param('capturadoId') capturadoId: string,
    @Param('elementoId') elementoId: string,
    @Body() dto: ActualizarElementoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.actualizar(
      procedimientoId,
      capturadoId,
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
    @Param('capturadoId') capturadoId: string,
    @Param('elementoId') elementoId: string,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.eliminar(
      procedimientoId,
      capturadoId,
      elementoId,
      usuario.sub,
      usuario.correo,
      usuario.rol,
    );
  }
}
