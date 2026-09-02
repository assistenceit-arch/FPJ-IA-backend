import type { CookieOptions } from 'express';

// Corrección 2026-09-03 (auditoría de seguridad de la PWA): antes, el
// token JWT se guardaba en una cookie escrita por JavaScript del
// navegador (document.cookie en el frontend) -- eso significa que, si
// alguna vez apareciera una vulnerabilidad de inyección de código
// (XSS) en cualquier parte de la aplicación, un atacante podría robar
// la sesión completa de cualquier usuario, incluidos administradores,
// con un simple `document.cookie`. No se encontró ningún vector de XSS
// real hoy, pero esta es una protección de fondo contra cualquiera que
// pudiera aparecer en el futuro -- una cookie HttpOnly es invisible
// para JavaScript del navegador (solo el servidor puede leerla y
// escribirla), sin perder la capacidad de que proxy.ts (que corre en
// el servidor de Next.js, no en el navegador) siga leyéndola para
// proteger rutas.
export const NOMBRE_COOKIE_SESION = 'fpj_ia_token';

// Coincide con la expiración real del token (8h, ver auth.module.ts).
const HORAS_EXPIRACION = 8;

export function opcionesCookieSesion(): CookieOptions {
  return {
    httpOnly: true,
    // Corrección 2026-09-03 (bug real encontrado en el servidor de
    // pruebas): antes, esto dependía únicamente de NODE_ENV==='production'
    // -- pero el servidor de pruebas también corre con NODE_ENV=production
    // (mismo criterio operativo que producción real), SIN tener HTTPS de
    // verdad (se accede directo por IP, sin dominio ni certificado). El
    // navegador rechaza silenciosamente guardar una cookie marcada
    // "Secure" si la conexión no es HTTPS -- el login parecía funcionar
    // (el servidor respondía con éxito), pero la cookie nunca quedaba
    // guardada de verdad, y la aplicación devolvía al usuario al login.
    //
    // Ahora es una variable propia (COOKIE_SECURE), independiente de
    // NODE_ENV -- por defecto sigue el mismo comportamiento de antes
    // (true en producción), pero cada servidor puede indicar
    // explícitamente si de verdad tiene HTTPS o no. El servidor de
    // pruebas debe tener COOKIE_SECURE=false en su .env; producción
    // real (con Caddy y HTTPS real) debe dejarlo sin definir, o en true.
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: HORAS_EXPIRACION * 60 * 60 * 1000,
  };
}
