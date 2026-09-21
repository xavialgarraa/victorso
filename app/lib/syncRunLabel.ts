import type {SyncRunLog} from '~/lib/connectors/suppliers.server';

export function syncRunLabel(type: SyncRunLog['type']): {text: string; badgeClass: string} {
  if (type === 'apply') return {text: 'Aplicado', badgeClass: 'admin-badge--apply'};
  if (type === 'auto-apply') return {text: 'Auto (stock)', badgeClass: 'admin-badge--apply'};
  return {text: 'Comparado', badgeClass: 'admin-badge--dry'};
}
