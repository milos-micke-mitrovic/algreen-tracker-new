import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Layout, theme } from 'antd';
import { useAuthStore } from '@algreen/auth';
import {
  createConnection,
  startConnection,
  joinTenantGroup,
} from '@algreen/signalr-client';
import { tokenManager } from '@algreen/api-client';
import { SidebarMenu } from '../components/SidebarMenu';
import { AppHeader } from '../components/AppHeader';
import { ConnectionAlert } from '../components/ConnectionAlert';
import { useSignalRQueryInvalidation } from '../hooks/useSignalRQueryInvalidation';

const { Sider, Content } = Layout;

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const tenantId = useAuthStore((s) => s.tenantId);
  const { token: themeToken } = theme.useToken();

  useSignalRQueryInvalidation();

  useEffect(() => {
    const jwt = tokenManager.getToken();
    if (!jwt || !tenantId) return;

    let cancelled = false;

    createConnection(jwt);
    startConnection()
      .then(() => {
        if (!cancelled) return joinTenantGroup(tenantId);
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        theme="dark"
        style={{ overflow: 'auto', height: '100vh', position: 'sticky', top: 0, left: 0 }}
      >
        <div
          style={{
            height: 48,
            margin: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <img
            src={collapsed ? '/algreen-logo.png' : '/algreen-logo-text.png'}
            alt="AlGreen"
            style={{ height: collapsed ? 32 : 28, objectFit: 'contain' }}
          />
        </div>
        <SidebarMenu collapsed={collapsed} />
      </Sider>
      <Layout style={{ overflow: 'hidden' }}>
        <AppHeader />
        <Content
          style={{
            margin: 24,
            padding: 24,
            background: themeToken.colorBgContainer,
            borderRadius: themeToken.borderRadius,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}
        >
          <ConnectionAlert />
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
