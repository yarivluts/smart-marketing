'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { PluginInstallView } from '@/lib/orgs/plugin-view';

export interface PluginInstallListProps {
  orgId: string;
  projectId: string;
  installs: readonly PluginInstallView[];
}

const STATUS_LABEL_KEYS = {
  installed: 'statusInstalled',
  disabled: 'statusDisabled',
  uninstalled: 'statusUninstalled',
} as const;

/** Lists a project's plugin installs with enable/disable/uninstall actions (KAN-46 AC: "Install/uninstall/disable lifecycle"). */
export function PluginInstallList({ orgId, projectId, installs }: PluginInstallListProps): React.ReactElement {
  const t = useTranslations('ProjectPlugins');
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function performAction(installId: string, action: 'disable' | 'enable' | 'uninstall'): Promise<void> {
    setError(null);
    setPendingId(installId);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/plugins/${installId}/${action}`, { method: 'POST' });
      if (!response.ok) {
        setError(t('actionError'));
        return;
      }
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (installs.length === 0) {
    return <p className="text-muted-foreground">{t('noInstalls')}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {installs.map((install) => (
          <li key={install.id} className="flex flex-col gap-2 rounded-md border border-input px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{t('installLine', { pluginId: install.pluginId, version: install.version })}</span>
              <span className="text-xs text-muted-foreground">{t(STATUS_LABEL_KEYS[install.status])}</span>
            </div>
            <div className="flex items-center gap-2">
              {install.status === 'installed' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendingId === install.id}
                  onClick={() => performAction(install.id, 'disable')}
                >
                  {t('disableButton')}
                </Button>
              ) : null}
              {install.status === 'disabled' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendingId === install.id}
                  onClick={() => performAction(install.id, 'enable')}
                >
                  {t('enableButton')}
                </Button>
              ) : null}
              {install.status !== 'uninstalled' ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pendingId === install.id}
                  onClick={() => performAction(install.id, 'uninstall')}
                >
                  {t('uninstallButton')}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
