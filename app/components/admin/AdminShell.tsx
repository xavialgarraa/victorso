import {Form, NavLink} from 'react-router';

const NAV_ITEMS = [
  {to: '/admin-interno', label: 'Resumen', end: true},
  {to: '/admin-interno/proveedores', label: 'Proveedores', end: false},
  {to: '/admin-interno/historial', label: 'Historial', end: false},
  {to: '/admin-interno/resenas', label: 'Reseñas', end: false},
  {to: '/admin-interno/solicitudes', label: 'Solicitudes', end: false},
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
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
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
