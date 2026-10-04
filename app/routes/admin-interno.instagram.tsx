import {useState} from 'react';
import {data, useLoaderData} from 'react-router';
import type {Route} from './+types/admin-interno.instagram';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Instagram — Panel interno'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  return data({user}, {headers});
}

/** Saca el código corto (shortcode) de cualquier URL de publicación de
 * Instagram: /p/, /reel/ o /tv/, con o sin parámetros al final. */
function extractShortcode(url: string): {type: string; shortcode: string} | null {
  const match = url.trim().match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  if (!match) return null;
  return {type: match[1], shortcode: match[2]};
}

export default function AdminInstagram() {
  const {user} = useLoaderData<typeof loader>();
  const [url, setUrl] = useState('');
  const [captioned, setCaptioned] = useState(true);
  const [copied, setCopied] = useState(false);

  const parsed = extractShortcode(url);
  const embedSrc = parsed
    ? `https://www.instagram.com/${parsed.type}/${parsed.shortcode}/embed${captioned ? '/captioned' : ''}/`
    : null;
  const iframeCode = embedSrc
    ? `<iframe src="${embedSrc}" width="400" height="${captioned ? 600 : 480}" style="border:none; max-width:100%; display:block; margin:0 auto;" frameborder="0" scrolling="no" allowtransparency="true"></iframe>`
    : '';

  return (
    <AdminShell user={user}>
      <h1>Generador de iframe de Instagram</h1>
      <p style={{color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 640}}>
        Pega el enlace de una publicación de Instagram y te doy el código para pegar en el editor del blog
        (Contenido → Publicaciones de blog → ese artículo → botón <code>&lt;&gt;</code> "Mostrar HTML").
      </p>

      <div className="admin-card">
        <label style={{display: 'block', fontSize: '.8rem', fontWeight: 600, margin: '0 0 4px'}}>
          Enlace de la publicación
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setCopied(false);
          }}
          placeholder="https://www.instagram.com/p/ABC123XYZ/"
          style={{width: '100%', maxWidth: 480}}
        />

        <label style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 14}}>
          <input
            type="checkbox"
            checked={captioned}
            onChange={(e) => setCaptioned(e.target.checked)}
            style={{width: 'auto'}}
          />
          Incluir pie de foto / descripción debajo
        </label>

        {url && !parsed && (
          <p className="admin-msg--error" style={{marginTop: 14}}>
            No reconozco ese enlace — tiene que ser del tipo{' '}
            <code>instagram.com/p/XXXXX</code> o <code>instagram.com/reel/XXXXX</code>.
          </p>
        )}

        {parsed && (
          <>
            <h2 style={{marginTop: 24}}>Código para pegar</h2>
            <textarea
              readOnly
              value={iframeCode}
              rows={3}
              style={{width: '100%', maxWidth: 640, fontFamily: 'monospace', fontSize: '.8rem'}}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div style={{marginTop: 10}}>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(iframeCode);
                  setCopied(true);
                }}
              >
                {copied ? 'Copiado ✓' : 'Copiar código'}
              </button>
            </div>

            <h2 style={{marginTop: 24}}>Vista previa</h2>
            <div style={{maxWidth: 420}}>
              <iframe
                src={embedSrc ?? undefined}
                width="400"
                height={captioned ? 600 : 480}
                style={{border: 'none', maxWidth: '100%', display: 'block'}}
                scrolling="no"
                allowTransparency
                title="Vista previa de Instagram"
              />
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
