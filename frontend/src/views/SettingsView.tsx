import React, { useState } from 'react';

interface SettingsViewProps {
  servers: string[];
  players: string[];
  selectedServer: string;
  selectedPlayer: string;
  onSelectServer: (url: string) => void;
  onSelectPlayer: (url: string) => void;
}

interface ScanResult {
  state: string;
  scanned: number;
  skipped: number;
  failed: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  servers,
  players,
  selectedServer,
  selectedPlayer,
  onSelectServer,
  onSelectPlayer,
}) => {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    if (!selectedServer) {
      setError('Please select a media server first.');
      return;
    }
    setScanning(true);
    setError(null);
    setScanResult(null);

    try {
      const res = await fetch(`${selectedServer}/api/scan`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }
      const data = await res.json();
      setScanResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to scan library.');
    } finally {
      setScanning(false);
    }
  };

  const handleResetAndRescan = async () => {
    if (!selectedServer) {
      setError('Please select a media server first.');
      return;
    }
    setScanning(true);
    setError(null);
    setScanResult(null);

    try {
      const res = await fetch(`${selectedServer}/api/reset`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }
      const data = await res.json();
      setScanResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to reset and rescan library.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="settings-screen">
      <h1 style={{ marginBottom: '16px' }}>Settings</h1>

      <div className="settings-section">
        <div className="form-group">
          <label className="form-label" htmlFor="server-select">
            Media Server URL
          </label>
          <select
            id="server-select"
            className="select-dropdown"
            value={selectedServer}
            onChange={(e) => onSelectServer(e.target.value)}
          >
            {servers.map((url) => (
              <option key={url} value={url}>
                {url}
              </option>
            ))}
          </select>
          <span className="small-caption" style={{ marginTop: '4px' }}>
            All requests to the media library API are sent to this server.
          </span>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="player-select">
            Playback Target URL
          </label>
          <select
            id="player-select"
            className="select-dropdown"
            value={selectedPlayer}
            onChange={(e) => onSelectPlayer(e.target.value)}
          >
            {players.map((url) => (
              <option key={url} value={url}>
                {url}
              </option>
            ))}
          </select>
          <span className="small-caption" style={{ marginTop: '4px' }}>
            All requests to control audio playback are sent to this player.
          </span>
        </div>
      </div>

      <div className="settings-section" style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '16px' }}>
          Library Management
        </h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={handleScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Music Library'}
          </button>
          <button className="btn-primary" style={{ border: '1px solid var(--border-color)' }} onClick={handleResetAndRescan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Reset & Rescan Library'}
          </button>
        </div>
        {scanResult && (
          <div style={{ marginTop: '16px', padding: '12px', borderRadius: '6px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Scan Status: <span style={{ color: 'var(--accent)' }}>{scanResult.state}</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Scanned: {scanResult.scanned} | Skipped: {scanResult.skipped} | Failed: {scanResult.failed}
            </div>
          </div>
        )}
        {error && (
          <div style={{ marginTop: '16px', color: 'var(--accent)', fontSize: '14px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
