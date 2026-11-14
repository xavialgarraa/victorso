import type {IconName} from '~/lib/icons';

/**
 * Icono por defecto para una categoría/subcategoría del mega-menú, a
 * partir de su nombre — para que cada una tenga un icono con sentido sin
 * que nadie tenga que subir nada a mano. Si en el futuro hace falta un
 * icono distinto para un caso concreto, se puede seguir sobreescribiendo
 * con una carátula real desde /admin-interno/categorias (ver
 * MegaMenuTileIcon en Header.tsx, que prioriza la foto si existe).
 */
const KEYWORD_ICON_MAP: Array<[RegExp, IconName]> = [
  [/ilumina|led|luz|foco|laser|estrobosc/i, 'bulb'],
  [/v[ií]deo|camara|proyector/i, 'camera'],
  [/instrumento|guitarra|piano|teclado|bateria|bajo/i, 'musicNote'],
  [/soporte|estructura|rack|trípode|tripode|pie de/i, 'tripod'],
  [/cable|conexi[oó]n|conector/i, 'plug'],
  [/micr[oó]fono/i, 'mic'],
  [/auricular|casco/i, 'headphones'],
  [/mezcla|mixer|mesa de/i, 'sliders'],
  [/altavoz|monitor|subwoofer|sonido|pa\b|sistema/i, 'speaker'],
  [/flight.?case|maleta|bolsa|transporte/i, 'suitcase'],
  [/amplificador|etapa de potencia|procesador|interface/i, 'plug'],
  [/dj\b|controladora|plato|reproductor/i, 'headphones'],
];

export function guessCategoryIcon(title: string): IconName {
  for (const [pattern, icon] of KEYWORD_ICON_MAP) {
    if (pattern.test(title)) return icon;
  }
  return 'tag';
}
