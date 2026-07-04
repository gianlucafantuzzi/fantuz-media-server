import React, { useState } from 'react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  activeView: string;
  onViewChange: (view: string) => void;
  activeDevice: string;
  onChangeDevice: (device: string) => void;
  onCastClick: () => void;
  isCastDisabled: boolean;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activeView,
  onViewChange,
  activeDevice,
  onChangeDevice,
  onCastClick,
  isCastDisabled,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-container">
      <TopBar
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        activeDevice={activeDevice}
        onChangeDevice={onChangeDevice}
        onCastClick={onCastClick}
        isCastDisabled={isCastDisabled}
      />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeView={activeView}
        onViewChange={onViewChange}
      />
      <main className="main-content">{children}</main>
    </div>
  );
};
