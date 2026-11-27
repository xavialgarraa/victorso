import {Form, NavLink} from 'react-router';

const NAV_GROUPS: Array<{label: string | null; items: Array<{to: string; label: string; end: boolean}>}> = [
  {
    label: null,
    items: [{to: '/admin-interno', label: 'Resumen', end: true}],
  },
  {
    label: 'Catálogo',
    items: [
      {to: '/admin-interno/proveedores', label: 'Proveedores', end: false},
      {to: '/admin-interno/distribuidores', label: 'Distribuidores', end: false},
      {to: '/admin-interno/crear-producto', label: 'Crear producto', end: false},
    ],
  },
  {
    label: 'Contenido de la web',
    items: [
      {to: '/admin-interno/hero', label: 'Hero', end: false},
      {to: '/admin-interno/categorias', label: 'Carátulas categorías', end: false},
      {to: '/admin-interno/colecciones', label: 'Banners de colección', end: false},
      {to: '/admin-interno/descripcion', label: 'Descripción de producto', end: false},
      {to: '/admin-interno/recomendaciones', label: 'Recomendaciones carrito', end: false},
    ],
  },
  {
    label: 'Comunidad',
    items: [
      {to: '/admin-interno/instalaciones', label: 'Instalaciones', end: false},
      {to: '/admin-interno/instagram', label: 'Instagram', end: false},
      {to: '/admin-interno/faq', label: 'Preguntas frecuentes', end: false},
      {to: '/admin-interno/resenas', label: 'Reseñas', end: false},
      {to: '/admin-interno/solicitudes', label: 'Solicitudes', end: false},
    ],
  },
  {
    label: 'Actividad',
    items: [{to: '/admin-interno/historial', label: 'Historial', end: false}],
  },
];

export function AdminShell({
  user,
  wide,
  children,
}: {
  user: {email: string};
  /** Sin el ancho máximo de 1100px — para páginas con tablas anchas. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell">
      <aside className="admin-shell__sidebar">
        <div className="admin-shell__brand">
          <span className="admin-shell__brand-name">Victor So</span>
          <span className="admin-shell__brand-sub">Panel interno</span>
        </div>
        <nav className="admin-shell__nav">
          {NAV_GROUPS.map((group, i) => (
            <div key={group.label ?? `group-${i}`}>
              {group.label && <div className="admin-shell__nav-group-label">{group.label}</div>}
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end}>
                  <span className="admin-shell__nav-dot" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-shell__user">
          <span className="admin-shell__user-email">{user.email}</span>
          <Form method="post" action="/admin-interno/logout">
            <button type="submit" className="admin-shell__logout">
              Cerrar sesión
            </button>
          </Form>
        </div>
      </aside>
      <main className={`admin-shell__main${wide ? ' admin-shell__main--wide' : ''}`}>{children}</main>
    </div>
  );
}
