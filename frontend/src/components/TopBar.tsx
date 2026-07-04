import React from 'react';
import logoHorizontal from '../../images/FantuzMediaServerLogoHorizontal.png';

interface TopBarProps {
  onMenuClick: () => void;
  activeDevice: string;
  onChangeDevice: (device: string) => void;
  onCastClick: () => void;
  isCastDisabled: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  onMenuClick,
  activeDevice,
  onChangeDevice,
  onCastClick,
  isCastDisabled,
}) => {
  return (
    <header className="top-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button className="menu-button" onClick={onMenuClick} aria-label="Open Menu">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>

        <select
          id="device-selector"
          className="device-select"
          value={activeDevice}
          onChange={(e) => onChangeDevice(e.target.value)}
          aria-label="Select Playback Device"
        >
          <option value="This device">This device</option>
          <option value="Remote player">Remote player</option>
        </select>
      </div>

      <div className="logo-container">
        <img
          src={logoHorizontal}
          alt="Fantuz Media Server"
          className="logo-image"
        />
      </div>

      <button
        className="cast-btn-header"
        onClick={onCastClick}
        disabled={isCastDisabled}
        aria-label="Cast Playback"
        title={isCastDisabled ? "Casting is only available when playing on this device" : "Cast Playback"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 20h.01" />
        </svg>
      </button>
    </header>
  );
};
