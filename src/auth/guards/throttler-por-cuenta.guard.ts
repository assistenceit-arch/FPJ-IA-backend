import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Corrección 2026-08-29 (escalabilidad, a solicitud del usuario): el
 * guard por defecto de @nestjs/throttler cuenta las peticiones
 * únicamente por dirección IP -- si varios funcionarios de la misma
 * oficina comparten la misma salida a internet (lo normal en una
 * estación de policía), todos juntos podrían agotar el límite pensado
 * para una sola persona (o un bot), bloqueando a compañeros que ni
 * siquiera están relacionados entre sí.
 *
 * Este guard cuenta, en cambio, por la combinación de IP + la cuenta
 * de correo específica que se está intentando usar (tomada del cuerpo
 * de la petición) -- así, varios funcionarios iniciando sesión cada
 * uno en SU PROPIA cuenta desde la misma oficina no se estorban entre
 * sí, pero alguien (persona o bot) intentando muchas veces contra UNA
 * MISMA cuenta sigue bloqueado exactamente igual que antes.
 *
 * El guard general por IP (registrado globalmente en app.module.ts)
 * sigue aplicando además de este, como respaldo contra abuso genérico
 * que no se dirige a ninguna cuenta en particular.
 */
@Injectable()
export class ThrottlerPorCuentaGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    const correo =
      typeof req.body?.correo === 'string' ? req.body.correo.toLowerCase().trim() : 'sin-correo';
    return `${ip}-${correo}`;
  }
}
