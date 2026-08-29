import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TrabajosGeneracionService } from './trabajos-generacion.service';
import { CrearTrabajoGeneracionDto } from './dto/crear-trabajo-generacion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller()
export class TrabajosGeneracionController {
  constructor(private readonly service: TrabajosGeneracionService) {}

  @Post('procedimientos/:procedimientoId/trabajos-generacion')
  crear(
    @Param('procedimientoId') procedimientoId: string,
    @Body() dto: CrearTrabajoGeneracionDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.crear(procedimientoId, dto, usuario.sub, usuario.rol);
  }

  @Get('trabajos-generacion/:id')
  consultar(@Param('id') id: string, @CurrentUser() usuario: JwtPayload) {
    return this.service.consultar(id, usuario.sub, usuario.rol);
  }

  @Patch('trabajos-generacion/:id/responder-aclaracion')
  responderAclaracion(
    @Param('id') id: string,
    @Body() body: { respuesta: string },
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.responderAclaracion(id, body.respuesta, usuario.sub, usuario.rol);
  }
}
