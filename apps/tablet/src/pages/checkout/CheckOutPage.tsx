import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@algreen/auth';
import { processWorkflowApi } from '@algreen/api-client';
import { BigButton } from '../../components/BigButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useTranslation, useEnumTranslation } from '@algreen/i18n';
import { useWorkSessionStore } from '../../stores/work-session-store';
import { unsubscribeFromPush } from '../../services/push';

export function CheckOutPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const tenantId = useAuthStore((s) => s.tenantId);
  const logout = useAuthStore((s) => s.logout);
  const clearWorkSession = useWorkSessionStore((s) => s.clear);
  const processId = useWorkSessionStore((s) => s.processId);
  const processName = useWorkSessionStore((s) => s.processName);
  const checkInTime = useWorkSessionStore((s) => s.checkInTime);
  const { t } = useTranslation('tablet');
  const { tEnum } = useEnumTranslation();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      if (user?.id && processId && tenantId) {
        await processWorkflowApi.pauseStation({ processId, tenantId, userId: user.id });
      }
    } catch {
      // Still proceed with logout even if pause fails
    }
    unsubscribeFromPush().catch(() => {});
    clearWorkSession();
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="space-y-6 pt-8">
      <h1 className="text-tablet-xl font-bold text-center">{t('checkout.title')}</h1>

      <div className="card text-center py-6">
        <div className="text-tablet-2xl font-bold text-gray-700">
          {user?.fullName}
        </div>
        <div className="text-tablet-sm text-gray-500 mt-1">
          {user?.role ? tEnum('UserRole', user.role) : ''}
        </div>
      </div>

      {/* Shift summary */}
      {(processName || checkInTime) && (
        <div className="card space-y-2">
          {processName && (
            <div className="flex justify-between text-tablet-sm">
              <span className="text-gray-500">{t('checkout.process')}</span>
              <span className="font-semibold">{processName}</span>
            </div>
          )}
          {checkInTime && (
            <div className="flex justify-between text-tablet-sm">
              <span className="text-gray-500">{t('checkout.checkedInAt')}</span>
              <span className="font-semibold">
                {new Date(checkInTime).toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <BigButton
          variant="danger"
          onClick={() => setShowConfirm(true)}
          loading={isLoading}
        >
          {t('checkout.checkOut')}
        </BigButton>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title={t('checkout.confirmTitle')}
        message={t('checkout.confirmMessage')}
        confirmLabel={t('checkout.checkOut')}
        cancelLabel={t('common:actions.cancel')}
        variant="danger"
        loading={isLoading}
        onConfirm={handleLogout}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
