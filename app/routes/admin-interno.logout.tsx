import {redirect} from 'react-router';
import type {Route} from './+types/admin-interno.logout';
import {destroyAdminSessionCookie} from '~/lib/adminSession.server';

export async function action({request, context}: Route.ActionArgs) {
  const cookie = await destroyAdminSessionCookie(context.env, request);
  return redirect('/admin-interno/login', {headers: {'Set-Cookie': cookie}});
}
