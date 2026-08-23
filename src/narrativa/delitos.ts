import { BadRequestException } from '@nestjs/common';

/**
 * Adenda 2026-08-12: mapeo de delitos soportados al prefijo de sus
 * archivos de prompt especializados (assets/prompts/{prefijo}-*.md).
 *
 * Este es el único lugar donde se registra un delito nuevo del lado
 * del backend -- agregar aquí la entrada y crear los 4 archivos
 * {prefijo}-prompt-especializado.md / {prefijo}-validaciones.md /
 * {prefijo}-flujo-operativo.md / {prefijo}-plantilla-inteligente.md en
 * assets/prompts/ es suficiente para que narrativa.service.ts los
 * recoja automáticamente. El valor de `delito` debe coincidir EXACTO
 * (sensible a mayúsculas/tildes) con el que usa el selector del
 * frontend (procedimientos/nuevo/page.tsx) y con el que ya haya
 * quedado guardado en procedimientos existentes.
 */
export const DELITOS_SOPORTADOS: Record<string, string> = {
  'Tráfico, Fabricación o Porte de Estupefacientes': 'estupefacientes',
  'Porte Ilegal de Armas de Fuego': 'armas',
  'Hurto': 'hurto',
  'Lesiones Personales': 'lesiones-personales',
  'Violencia contra Servidor Público': 'violencia-servidor-publico',
  'Violencia Intrafamiliar': 'violencia-intrafamiliar',
  'Receptación': 'receptacion',
  'Homicidio': 'homicidio',
  'Suministro a Menor': 'suministro-menor',
  'Uso de Documento Falso': 'uso-documento-falso',
  'Falsedad Personal': 'falsedad-personal',
  'Tráfico de Moneda Falsa': 'trafico-moneda-falsa',
  'Secuestro': 'secuestro',
  'Extorsión': 'extorsion',
  'Daño en Bien Ajeno o del Estado': 'dano-en-bien',
};

export function prefijoPromptPorDelito(delito: string): string {
  const prefijo = DELITOS_SOPORTADOS[delito];
  if (!prefijo) {
    throw new BadRequestException(
      `El delito "${delito}" no tiene un módulo de narrativa construido todavía. ` +
        `Delitos soportados: ${Object.keys(DELITOS_SOPORTADOS).join(', ')}.`,
    );
  }
  return prefijo;
}
