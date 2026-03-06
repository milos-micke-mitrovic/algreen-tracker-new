import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@algreen/i18n';

function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as { message?: string })?.message ?? '';
  const code = (error as { code?: string })?.code ?? '';
  return (
    msg === 'Network Error' ||
    code === 'ERR_NETWORK' ||
    code === 'ECONNREFUSED' ||
    msg.includes('ERR_CONNECTION_REFUSED')
  );
}

export function ConnectionAlert() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('dashboard');
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    const cache = queryClient.getQueryCache();

    const checkErrors = () => {
      const queries = cache.getAll();
      const hasNetworkError = queries.some(
        (q) => q.state.status === 'error' && isNetworkError(q.state.error),
      );
      setServerDown(hasNetworkError);
    };

    // Check on mount
    checkErrors();

    // Subscribe to cache changes
    const unsubscribe = cache.subscribe(checkErrors);
    return unsubscribe;
  }, [queryClient]);

  if (!serverDown) return null;

  return (
    <Alert
      message={t('common:errors.connectionFailed')}
      description={t('common:errors.connectionFailedDescription')}
      type="error"
      showIcon
      banner
      style={{ marginBottom: 16 }}
    />
  );
}
