import {Form, data, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.faq';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {createFaqItem, deleteFaqItem, listFaqItems, updateFaqItem, type FaqItem} from '~/lib/faq.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Preguntas frecuentes — Panel interno'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const items = await listFaqItems(context.env);
  return data({user, items}, {headers});
}

type ActionResult =
  | {intent: 'add-item'; ok: true}
  | {intent: 'add-item'; ok: false; error: string}
  | {intent: 'update-item'; ok: true}
  | {intent: 'update-item'; ok: false; error: string}
  | {intent: 'delete-item'; ok: true};

function itemFromForm(formData: FormData): FaqItem {
  return {
    order: Number(formData.get('order')) || 0,
    question: String(formData.get('question') || '').trim(),
    answer: String(formData.get('answer') || '').trim(),
  };
}

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');

  if (intent === 'add-item') {
    const item = itemFromForm(formData);
    if (!item.question || !item.answer) {
      return data<ActionResult>({intent: 'add-item', ok: false, error: 'Escribe la pregunta y la respuesta.'}, {headers});
    }
    try {
      await createFaqItem(context.env, item);
      return data<ActionResult>({intent: 'add-item', ok: true}, {headers});
    } catch (error) {
      console.error('[admin-interno/faq] add-item', error);
      return data<ActionResult>(
        {intent: 'add-item', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'update-item') {
    try {
      const id = String(formData.get('id') || '');
      if (!id) throw new Error('Falta el id de la pregunta.');
      await updateFaqItem(context.env, id, itemFromForm(formData));
      return data<ActionResult>({intent: 'update-item', ok: true}, {headers});
    } catch (error) {
      console.error('[admin-interno/faq] update-item', error);
      return data<ActionResult>(
        {intent: 'update-item', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'delete-item') {
    const id = String(formData.get('id') || '');
    if (id) await deleteFaqItem(context.env, id);
    return data<ActionResult>({intent: 'delete-item', ok: true}, {headers});
  }

  return data<ActionResult>({intent: 'delete-item', ok: true}, {headers});
}

export default function AdminFaq() {
  const {user, items} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';

  return (
    <AdminShell user={user} wide>
      <h1>Preguntas frecuentes</h1>
      <p style={{color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 640}}>
        Se muestran al final de la home, en formato acordeón, y también se mandan a Google como datos
        estructurados (FAQPage) — ayuda al SEO porque Google puede sacarlas directamente en el resultado de
        búsqueda. El "Orden" decide en qué posición sale cada una (menor va primero).
      </p>

      <div className="admin-card">
        <h2 style={{marginTop: 0}}>Todas ({items.length})</h2>

        {items.length === 0 && <div className="hero-admin__empty">Sin preguntas todavía — añade la primera abajo.</div>}

        <div className="hero-admin__list">
          {items.map(({id, item}) => (
            <div key={id} className="hero-admin__card" style={{gridTemplateColumns: '1fr auto'}}>
              <div>
                <div className="hero-admin__order" style={{position: 'static', display: 'inline-flex', marginRight: 8}}>
                  {item.order}
                </div>
                <div className="hero-admin__title">{item.question || <em>(sin pregunta)</em>}</div>
                <span className="hero-admin__link">{item.answer}</span>
              </div>
              <div className="hero-admin__card-actions">
                <details style={{position: 'relative'}}>
                  <summary className="hero-admin__icon-btn" style={{listStyle: 'none', display: 'flex'}}>
                    ✎
                  </summary>
                  <div
                    className="hero-admin__add-form"
                    style={{position: 'absolute', right: 0, top: 36, zIndex: 5, width: 380, boxShadow: 'var(--shadow-lg)'}}
                  >
                    <Form method="post" className="admin-form">
                      <input type="hidden" name="intent" value="update-item" />
                      <input type="hidden" name="id" value={id} />
                      <label>Pregunta</label>
                      <input type="text" name="question" defaultValue={item.question} required />
                      <label>Respuesta</label>
                      <textarea name="answer" rows={4} defaultValue={item.answer} required />
                      <label>Orden</label>
                      <input type="number" name="order" defaultValue={item.order} />
                      <button type="submit" className="admin-btn admin-btn--outline" style={{marginTop: 8}} disabled={isBusy}>
                        Guardar cambios
                      </button>
                    </Form>
                    <Form
                      method="post"
                      style={{marginTop: 8}}
                      onSubmit={(e) => {
                        if (!confirm('¿Borrar esta pregunta?')) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="intent" value="delete-item" />
                      <input type="hidden" name="id" value={id} />
                      <button type="submit" className="admin-btn admin-btn--danger" style={{width: '100%'}}>
                        Borrar
                      </button>
                    </Form>
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>

        <details className="hero-admin__add-tile" style={{display: 'block', border: 'none', padding: 0, marginTop: 16}}>
          <summary className="hero-admin__add-tile">+ Añadir pregunta</summary>
          <div className="hero-admin__add-form">
            <Form method="post" className="admin-form">
              <input type="hidden" name="intent" value="add-item" />
              <label>Pregunta</label>
              <input type="text" name="question" placeholder="Ej. ¿Hacéis envíos a toda España?" required />
              <label>Respuesta</label>
              <textarea name="answer" rows={4} placeholder="Respuesta completa, en un tono cercano..." required />
              <label>Orden</label>
              <input type="number" name="order" defaultValue={items.length} />
              <button type="submit" className="admin-btn admin-btn--primary" style={{marginTop: 8}} disabled={isBusy}>
                Añadir pregunta
              </button>
            </Form>
            {actionData?.intent === 'add-item' && !actionData.ok && (
              <p className="admin-msg--error">{actionData.error}</p>
            )}
          </div>
        </details>
      </div>
    </AdminShell>
  );
}
