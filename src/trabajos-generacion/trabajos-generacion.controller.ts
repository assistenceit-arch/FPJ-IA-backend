import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

  // Corrección 2026-09-02, bug real reportado tras prueba en local: el
  // frontend pregunta el estado de un trabajo cada 2 segundos mientras
  // espera a que termine -- con el límite general de la aplicación (20
  // peticiones cada 60 segundos), bastan ~40 segundos de esa espera
  // normal para agotarlo, sin que el funcionario esté haciendo nada
  // fuera de lo común. Este endpoint solo consulta el estado del
  // PROPIO trabajo del usuario autenticado (no es un blanco atractivo
  // para un bot, a diferencia de login/registro), así que tiene
  // sentido darle un límite propio, mucho más generoso.
  @Throttle({ default: { limit: 60, ttl: 60000 } })
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
