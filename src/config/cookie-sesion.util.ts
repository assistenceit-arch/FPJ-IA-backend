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
    // secure=true exige HTTPS -- correcto en producción (Caddy sirve
    // todo por HTTPS), pero rompería el login en desarrollo local
    // (http://localhost sin TLS). NODE_ENV=production solo se define
    // así en los servidores reales (ver .env de cada servidor).
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: HORAS_EXPIRACION * 60 * 60 * 1000,
  };
}
