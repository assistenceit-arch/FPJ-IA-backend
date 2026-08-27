/**
 * Corrección 2026-08-27 (auditoría de seguridad): antes existía un
 * respaldo fijo ('fpj_ia_secret', visible en el código y expuesto en
 * un repositorio que fue público en algún momento) para cuando
 * JWT_SECRET faltaba -- si eso pasara en producción, el sistema
 * firmaría todas las sesiones con esa palabra conocida, permitiendo
 * fabricar una sesión de administrador válida sin credenciales reales.
 *
 * Esta función se usa en los dos lugares que necesitan la llave (el
 * módulo que la firma, y la estrategia que la verifica) para que, si
 * alguna vez falta, el sistema se niegue a arrancar con un error claro
 * -- nunca que arranque de forma insegura en silencio. JWT_SECRET ya
 * es obligatoria en environment.validation.ts (Joi), pero esa
 * validación no protege código que lee `process.env` directamente
 * como este; esta función es la segunda barrera, independiente de esa
 * validación.
 */
export function obtenerJwtSecret(): string {
  const secreto = process.env.JWT_SECRET;
  if (!secreto) {
    throw new Error(
      'JWT_SECRET no está configurada. Por seguridad, el sistema no puede arrancar sin una llave de firma real -- defínela en el archivo .env antes de continuar.',
    );
  }
  return secreto;
}
