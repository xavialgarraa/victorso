/**
 * Marcas que trabajamos, portado de victorso-demo/data.js.
 * Shopify no tiene un objeto "marca" nativo (el vendor del producto es
 * el campo mas cercano), asi que esto vive como contenido editorial
 * propio: nombre, logo, web oficial y una descripcion corta. El conteo
 * real de productos por marca se consulta en vivo contra la Storefront
 * API usando el nombre como filtro de vendor.
 */
export type Brand = {
  name: string;
  slug: string;
  website: string | null;
  logo?: string;
  featured?: boolean;
  description: string;
};

export const BRANDS: Brand[] = [
  {name: 'Pioneer DJ', slug: 'pioneer-dj', featured: true, website: 'https://www.pioneerdj.com', logo: '/assets/logos/pioneer-dj.png',
    description: 'El estándar mundial en cabinas de DJ: sus CDJ, DJM y controladoras equipan las salas, clubes y festivales más importantes del planeta. Es la marca en la que más confiamos en Victor So Professional.'},
  {name: 'AlphaTheta', slug: 'alphatheta', featured: true, website: 'https://www.alphatheta.com', logo: '/assets/logos/alphatheta.jpg',
    description: 'La marca joven del grupo Pioneer DJ / TAG Sound, nacida para explorar lo que viene después: sistemas todo en uno, monitores de estudio y equipos portátiles pensados para DJs que no se conforman con lo de siempre.'},
  {name: 'Walkasse', slug: 'walkasse', featured: true, website: 'https://www.walkasse.com', logo: '/assets/logo-walkasse.jpg',
    description: 'Flight-cases y bolsas de transporte a medida, diseñados para que el equipo de sonido e iluminación llegue entero a cada bolo, por muchas giras que acumule.'},
  {name: 'RCF', slug: 'rcf', featured: true, website: 'https://www.rcf.it', logo: '/assets/logos/rcf.jpg',
    description: 'Sonido profesional italiano con más de 70 años de oficio, presente en salas de conciertos, teatros y directos de todo el mundo.'},
  {name: 'Yamaha', slug: 'yamaha', featured: true, website: 'https://www.yamaha.com', logo: '/assets/logos/yamaha.jpg',
    description: 'Uno de los grandes nombres de la electrónica musical: altavoces, mesas de mezclas y equipos de sonido que llevan décadas ganándose la fama de indestructibles.'},
  {name: 'QSC', slug: 'qsc', featured: true, website: 'https://www.qsc.com', logo: '/assets/logos/qsc.jpg',
    description: 'Marca americana de referencia en altavoces activos, pensada tanto para instalaciones fijas como para salas de conciertos y giras que no pueden fallar.'},
  {name: 'Rode', slug: 'rode', featured: true, website: 'https://www.rode.com', logo: '/assets/logos/rode.png',
    description: 'Micrófonos de estudio y grabación desde Australia, con esa combinación de calidad de sonido y precio ajustado que los ha hecho favoritos de creadores de contenido y estudios por igual.'},
  {name: 'Focusrite', slug: 'focusrite', featured: true, website: 'https://focusrite.com', logo: '/assets/logos/focusrite.jpg',
    description: 'Interfaces de audio de referencia para producción musical, con la gama Scarlett como la puerta de entrada más habitual al mundo profesional.'},
  {name: 'Sennheiser', slug: 'sennheiser', featured: true, website: 'https://www.sennheiser.com', logo: '/assets/logos/sennheiser.png',
    description: 'Marca alemana centenaria en audio profesional, reconocida en todo el mundo por sus auriculares y micrófonos de altísima fidelidad.'},
  {name: 'Alesis', slug: 'alesis', website: 'https://www.alesis.com',
    description: 'Marca americana especializada en baterías electrónicas, teclados, controladores MIDI y equipos de grabación para quien produce desde casa.'},
  {name: 'Allen & Heath', slug: 'allen-heath', website: 'https://www.allen-heath.com',
    description: 'Mesas de mezclas analógicas y digitales británicas para directo, instalación y DJ, con más de 50 años puliendo el mismo oficio.'},
  {name: 'Antelope Audio', slug: 'antelope-audio', website: 'https://en.antelopeaudio.com', logo: '/assets/logos/antelope-audio.jpg',
    description: 'Interfaces de audio, relojes maestros y micrófonos modelados de alta gama, para estudios que no quieren ceder ni un milisegundo de precisión.'},
  {name: 'Arkaos', slug: 'arkaos', website: 'https://vj.arkaos.com',
    description: 'Software de referencia para VJs desde 1996: servidores de medios y mapping de LED que siguen sonando en conciertos y grandes eventos.'},
  {name: 'Audient', slug: 'audient', website: 'https://audient.com', logo: '/assets/logos/audient.png',
    description: 'Interfaces de audio, consolas y preamplificadores británicos, de los que más se repiten en estudios de grabación serios.'},
  {name: 'Audio-Technica', slug: 'audio-technica', website: 'https://www.audio-technica.com', logo: '/assets/logos/audio-technica.svg',
    description: 'Micrófonos, auriculares y giradiscos japoneses con décadas de prestigio, tanto en estudios profesionales como en casa de cualquier melómano.'},
  {name: 'Audiolab', slug: 'audiolab', website: 'https://www.audiolab.co.uk',
    description: 'Alta fidelidad británica: amplificadores, reproductores y DACs pensados para quien escucha música con atención, no de fondo.'},
  {name: 'Auralex', slug: 'auralex', website: 'https://auralex.com',
    description: 'Tratamiento acústico de referencia para estudios: espuma acústica, trampas de graves y difusores que marcan la diferencia entre una sala que suena bien y una que no.'},
  {name: 'AVID', slug: 'avid', website: 'https://www.avid.com', logo: '/assets/logos/avid.png',
    description: 'Los creadores de Pro Tools, el estándar de la industria en estaciones de trabajo de audio digital (DAW) desde hace más de tres décadas.'},
  {name: 'Bitwig', slug: 'bitwig', website: 'https://www.bitwig.com', logo: '/assets/logos/bitwig.svg',
    description: 'Estación de trabajo de audio digital alemana, construida a partes iguales para el estudio y para el escenario.'},
  {name: 'Dbx', slug: 'dbx', website: 'https://dbxpro.com', logo: '/assets/logos/dbx.png',
    description: 'Referencia americana en procesadores de dinámica: compresores, limitadores y puertas de ruido que llevan décadas en el rack de cualquier técnico de sonido.'},
  {name: 'DJBAG.PRO', slug: 'djbag-pro', website: null,
    description: 'Mochilas y bolsas de transporte diseñadas por DJs para DJs, pensadas para que la controladora y los auriculares lleguen enteros a cada bolo.'},
  {name: 'Electro-Voice', slug: 'electro-voice', website: 'https://www.electrovoice.com', logo: '/assets/logos/electro-voice.svg',
    description: 'Fabricante americano fundado en 1930, referencia histórica en altavoces y micrófonos para sonido en directo e instalaciones fijas.'},
  {name: 'GAPLASA', slug: 'gaplasa', website: 'https://gaplasapro.com', logo: '/assets/logos/gaplasa.jpg',
    description: 'Distribuidor español de sonido profesional, representante de marcas como Bose Professional y Clockaudio.'},
  {name: 'Gravity', slug: 'gravity', website: null,
    description: 'La rama de soportes del grupo Adam Hall: trípodes y bases para altavoces, micrófonos, teclados e iluminación pensados para montar y desmontar rápido.'},
  {name: 'Gretsch', slug: 'gretsch', website: 'https://www.gretsch.com',
    description: 'Firma histórica americana de guitarras y baterías, con un sonido característico que lleva reconociéndose desde hace más de un siglo.'},
  {name: 'Konig & Meyer', slug: 'konig-meyer', website: 'https://www.k-m.de', logo: '/assets/logos/konig-meyer.png',
    description: 'Fabricante alemán con más de 75 años de experiencia en soportes para micrófonos, altavoces, teclados e instrumentos — el tipo de herrajes en los que no piensas hasta que fallan, y estos no fallan.'},
  {name: 'korg', slug: 'korg', website: 'https://www.korg.com',
    description: 'Compañía japonesa pionera en sintetizadores, pianos digitales, afinadores y procesadores de audio desde los inicios de la música electrónica.'},
  {name: 'KS technology', slug: 'ks-technology', website: 'https://ks-audio.com',
    description: 'Sistemas de altavoces profesionales alemanes para salas, clubes, instalaciones y grandes eventos.'},
  {name: 'M-AUDIO', slug: 'm-audio', website: 'https://www.m-audio.com', logo: '/assets/logos/m-audio.jpg',
    description: 'Interfaces de audio, teclados MIDI y monitores de estudio pensados para quien está montando su primer (o segundo) estudio en casa.'},
  {name: 'Magma', slug: 'magma', website: 'https://www.magma-bags.de', logo: '/assets/logos/magma.png',
    description: 'Bolsas y flight-cases alemanes a medida para controladoras, mesas de mezclas y equipos de DJ, cortados con la precisión justa para cada modelo.'},
  {name: 'MAGNETRON S.A.', slug: 'magnetron', website: 'https://www.magnetron.es',
    description: 'Distribuidor español de audio profesional, representante de marcas como Sennheiser, Neumann y FBT.'},
  {name: 'Native Instruments', slug: 'native-instruments', website: 'https://www.native-instruments.com', logo: '/assets/logos/native-instruments.svg',
    description: 'Software y hardware de referencia para producción musical y DJ, creadores de Traktor y de la suite Komplete.'},
  {name: 'Neumann', slug: 'neumann', website: 'https://www.neumann.com', logo: '/assets/logos/neumann.png',
    description: 'Micrófonos de estudio alemanes desde 1928, sinónimo de calidad de grabación de referencia en cualquier estudio serio del mundo.'},
  {name: 'Neutrik', slug: 'neutrik', website: 'https://www.neutrik.com', logo: '/assets/logos/neutrik.svg',
    description: 'Líder mundial en conectores de audio profesional — sus XLR y speakON son, básicamente, el estándar con el que se comparan todos los demás.'},
  {name: 'OQAN', slug: 'oqan', website: 'https://oqanmusic.com', logo: '/assets/logos/oqan.png',
    description: 'Marca española de instrumentos musicales y accesorios de sonido, con una relación calidad-precio pensada para empezar sin gastar de más.'},
  {name: 'Palmer', slug: 'palmer', website: 'https://www.palmer-germany.com', logo: '/assets/logos/palmer.png',
    description: 'Fabricante alemán conocido sobre todo por sus cajas DI y equipos de re-amplificación, habituales tanto en estudio como en directo.'},
  {name: 'PD-Connex', slug: 'pd-connex', website: null,
    description: 'Cables y conectores de audio, iluminación y alimentación para uso profesional y doméstico.'},
  {name: 'PlayDifferently', slug: 'playdifferently', website: 'https://playdifferently.org', logo: '/assets/logos/playdifferently.jpg',
    description: 'La marca de Andy Rigby-Jones junto a Richie Hawtin, creadores del icónico mixer analógico MODEL 1 — para quien quiere mezclar de otra manera, literalmente.'},
  {name: 'Presonus', slug: 'presonus', website: 'https://www.presonus.com', logo: '/assets/logos/presonus.png',
    description: 'Fabricante americano de interfaces de audio, mezcladores y monitores, creadores del DAW Studio One.'},
  {name: 'RANE_DJ', slug: 'rane', website: 'https://www.rane.com', logo: '/assets/logos/rane.png',
    description: 'Mixers y controladoras DJ de altísima gama, elegidos por DJs profesionales de todo el mundo cuando la fiabilidad en cabina no es negociable.'},
  {name: 'RME', slug: 'rme', website: 'https://rme-audio.de',
    description: 'Interfaces de audio y conversores alemanes, reconocidos sobre todo por su estabilidad y una latencia mínima que se nota nada más conectarlos.'},
  {name: 'Roline', slug: 'roline', website: 'https://theroline.com', logo: '/assets/logos/roline.jpg',
    description: 'Cables y accesorios de conectividad para instalaciones audiovisuales y de red.'},
  {name: 'Samson', slug: 'samson', website: 'https://samsontech.com', logo: '/assets/logos/samson.jpg',
    description: 'Fabricante americano de micrófonos, sistemas inalámbricos y monitores para directo y estudio.'},
  {name: 'Softube', slug: 'softube', website: 'https://www.softube.com', logo: '/assets/logos/softube.svg',
    description: 'Plugins de audio suecos de altísima calidad, hechos en colaboración con marcas históricas como SSL o Tube-Tech para sonar como el hardware original.'},
  {name: 'Sonifex', slug: 'sonifex', website: 'https://www.sonifex.co.uk', logo: '/assets/logos/sonifex.png',
    description: 'Equipos de audio británicos para radio y televisión, en el oficio desde 1969.'},
  {name: 'Sony', slug: 'sony', website: 'https://pro.sony', logo: '/assets/logos/sony.svg',
    description: 'Multinacional japonesa con una amplia gama de soluciones de audio profesional para producción y directo.'},
  {name: 'Stanton', slug: 'stanton', website: 'https://www.stantondj.com',
    description: 'Marca histórica del mundo DJ, pionera en giradiscos, cápsulas y mixers para scratch y turntablism desde los tiempos en que eso era casi todo lo que había.'},
  {name: 'Superlux', slug: 'superlux', website: 'https://en.superlux.com.tw',
    description: 'Micrófonos y auriculares taiwaneses con una relación calidad-precio que sorprende a quien los prueba por primera vez.'},
  {name: 'Synq', slug: 'synq', website: 'https://synq-audio.com', logo: '/assets/logos/synq.png',
    description: 'Equipos de sonido europeos para instalación y DJ: amplificadores, altavoces y mixers pensados para uso diario, no solo de escaparate.'},
  {name: 'Tannoy', slug: 'tannoy', website: 'https://www.tannoy.com', logo: '/assets/logos/tannoy.svg',
    description: 'Altavoces británicos fundados en 1926, con un legado en sonorización profesional que pocas marcas pueden igualar.'},
  {name: 'Tascam', slug: 'tascam', website: 'https://tascam.com', logo: '/assets/logos/tascam.svg',
    description: 'Marca japonesa histórica en grabadores multipista y de campo, presente en estudio, broadcast y producción audiovisual desde hace generaciones.'},
  {name: 'Tc electronic', slug: 'tc-electronic', website: 'https://www.tcelectronic.com', logo: '/assets/logos/tc-electronic.svg',
    description: 'Efectos, procesadores e interfaces de audio daneses de gran prestigio entre músicos y estudios exigentes.'},
  {name: 'Tc Helicon', slug: 'tc-helicon', website: 'https://www.tc-helicon.com',
    description: 'Especialistas en procesadores vocales, armonizadores y micrófonos pensados exclusivamente para cantantes, en directo y en estudio.'},
  {name: 'Technics', slug: 'technics', website: 'https://www.technics.com', logo: '/assets/logos/technics.svg',
    description: 'La marca japonesa que creó el legendario giradiscos SL-1200, todavía hoy el estándar mundial del DJ profesional.'},
  {name: 'Tecshow', slug: 'tecshow', website: null,
    description: 'Equipos de sonido activo e iluminación DMX orientados al mercado profesional y de eventos.'},
  {name: 'teenage engineering', slug: 'teenage-engineering', website: 'https://teenage.engineering',
    description: 'Diseñadora sueca de sintetizadores y grooveboxes de culto, reconocida por un diseño minimalista y un sonido que no se parece a ningún otro.'},
  {name: 'Turbosound', slug: 'turbosound', website: 'https://www.turbosound.com',
    description: 'Altavoces profesionales para sonido en directo, instalaciones y sistemas de línea de array donde la cobertura tiene que llegar hasta el último rincón de la sala.'},
  {name: 'Udg', slug: 'udg', website: 'https://udggear.com',
    description: "Bolsas y maletas de transporte para DJs, conocidas como 'Ultimate DJ Gear' por algo: son de las que más se ven en cabina en todo el mundo."},
  {name: 'Universal audio', slug: 'universal-audio', website: 'https://www.uaudio.com', logo: '/assets/logos/universal-audio.png',
    description: 'Referencia mundial en interfaces de audio y plugins UAD, con emulaciones de equipos de estudio clásicos que suenan sorprendentemente cerca del original.'},
  {name: 'work', slug: 'work-pro', website: 'https://www.workpro.es', logo: '/assets/logos/work-pro.png',
    description: 'La marca de Equipson especializada en altavoces y sistemas de sonido profesional, tanto para instalación fija como para uso portátil.'},
  {name: 'ZENTRALMEDIA', slug: 'zentralmedia', website: 'https://www.zentralmedia.com',
    description: 'Distribuidor español de tecnología musical, audio profesional, DJ e iluminación para instalación.'},
  {name: 'Zomo', slug: 'zomo', website: 'https://www.zomo.de', logo: '/assets/logos/zomo.png',
    description: 'Bolsas, flight-cases y accesorios de transporte alemanes para equipos de DJ, pensados para el uso real, no solo para la foto.'},
];

export function findBrand(slug: string): Brand | undefined {
  return BRANDS.find((b) => b.slug === slug);
}

// StelOrder (y otros proveedores) mandan el nombre de marca en su propio
// formato (todo mayúsculas, abreviado distinto...) que nunca hace match
// exacto con el `name` canónico de arriba — sin esto, "PIONEER" y
// "Pioneer DJ" quedan como dos marcas distintas para Shopify (vendor es
// solo texto libre) y la página /marcas/pioneer-dj no encuentra sus
// productos. Alias manuales para los casos que no son un simple problema
// de mayúsculas/minúsculas.
const VENDOR_ALIASES: Record<string, string> = {
  PIONEER: 'Pioneer DJ',
  'PIONEER DJ': 'Pioneer DJ',
  'ALPHA THETA': 'AlphaTheta',
  ALPHATHETA: 'AlphaTheta',
  RANE: 'RANE_DJ',
  'RANE DJ': 'RANE_DJ',
  WORK: 'work',
  'WORK PRO': 'work',
  'ALLEN & HEATH': 'Allen & Heath',
  'ALLEN HEATH': 'Allen & Heath',
  KORG: 'korg',
};

function normalizeKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

const BRANDS_BY_KEY = new Map(BRANDS.map((b) => [normalizeKey(b.name), b.name]));

/**
 * Convierte un nombre de marca "en crudo" (de StelOrder, Walkasse, etc.)
 * al nombre canónico ya usado en BRANDS si existe uno, para que el
 * producto cuente en la página de esa marca. Si no hay ningún match,
 * devuelve el nombre original convertido a Title Case (mejor que dejarlo
 * todo en mayúsculas) en vez de perderlo.
 */
export function normalizeVendorName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const key = normalizeKey(trimmed);
  if (VENDOR_ALIASES[key]) return VENDOR_ALIASES[key];

  const known = BRANDS_BY_KEY.get(key);
  if (known) return known;

  // Sin marca conocida: Title Case en vez de MAYÚSCULAS SIN MÁS.
  return trimmed
    .toLowerCase()
    .replace(/(^|\s|&)([a-záéíóúñ])/g, (_, sep, letter) => sep + letter.toUpperCase());
}
