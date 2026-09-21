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
        <h1 style={{fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.3rem', margin: '0 0 4px'}}>
          Panel interno
        </h1>
        <p style={{fontSize: '.85rem', color: '#6b6b73', margin: '0 0 8px'}}>
          Acceso restringido a personal autorizado.
        </p>
        <Form method="post" className="admin-form">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email">Email</label>
          <input id="email" type="email" name="email" required autoFocus />
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" name="password" required />
          <button type="submit" className="admin-btn admin-btn--primary" style={{marginTop: 16, width: '100%', justifyContent: 'center'}}>
            Entrar
          </button>
          {actionData?.error && <p className="admin-msg--error">{actionData.error}</p>}
        </Form>
      </div>
    </div>
  );
}
