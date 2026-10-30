import {redirect} from 'react-router';

/** No tenemos una página propia de "todas las colecciones" (el listado
 * nativo de Shopify no lleva nuestro diseño ni filtra las colecciones de
 * uso interno) — la fila "Encuentra tu equipo" de la home ya muestra
 * todas las categorías reales, así que "/collections" lleva ahí. */
export async function loader() {
  return redirect('/#categorySection');
}
