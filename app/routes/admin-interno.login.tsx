import {Form, redirect, useActionData, useLoaderData} from 'react-router';
import type {Route} from './+types/admin-interno.login';
import {signInWithPassword} from '~/lib/firebaseAuth.server';
import {createAdminSessionCookie, isAllowedAdminEmail} from '~/lib/adminSession.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Acceso panel interno — Victor So Professional'}];
};

export async function loader({request}: Route.LoaderArgs) {
  const next = new URL(request.url).searchParams.get('next') || '/admin-interno';
  return {next};
}

export async function action({request, context}: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/admin-interno');

  if (!email || !password) {
    return {error: 'Introduce email y contraseña.'};
  }

  try {
    const result = await signInWithPassword(context.env, email, password);
    if (!isAllowedAdminEmail(context.env, result.email)) {
      // Firebase Auth por sí solo no basta como control de acceso — ver
      // la nota en adminSession.server.ts. Esta cuenta es válida para
      // Firebase pero no está en la lista de administradores autorizados.
      return {error: 'Esta cuenta no tiene acceso al panel interno.'};
    }
    const cookie = await createAdminSessionCookie(context.env, {
      idToken: result.idToken,
      refreshToken: result.refreshToken,
      expiresAt: Date.now() + result.expiresInSeconds * 1000,
    });
    return redirect(next, {headers: {'Set-Cookie': cookie}});
  } catch (error) {
    console.error('[admin-interno/login]', error);
    return {error: 'Email o contraseña incorrectos.'};
  }
}

export default function AdminLogin() {
  const {next} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="admin-login">
      <div className="admin-login__box">
        <div className="admin-login__brand">
          <span className="admin-login__brand-dot" aria-hidden="true" />
          <span className="admin-login__brand-name">Victor So</span>
        </div>
        <h1 className="admin-login__title">Panel interno</h1>
        <p className="admin-login__subtitle">Acceso restringido a personal autorizado.</p>
        <Form method="post" className="admin-form">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email">Email</label>
          <input id="email" type="email" name="email" required autoFocus autoComplete="username" />
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" name="password" required autoComplete="current-password" />
          <button type="submit" className="admin-btn admin-btn--primary" style={{marginTop: 20, width: '100%', justifyContent: 'center'}}>
            Entrar
          </button>
          {actionData?.error && <p className="admin-msg--error">{actionData.error}</p>}
        </Form>
      </div>
    </div>
  );
}
