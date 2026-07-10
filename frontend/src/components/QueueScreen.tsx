import React, { useState, useEffect } from 'react';
import type { PlayerStatus, Album } from '../services/playerService';
import { playerService } from '../services/playerService';
import { formatDuration } from '../views/SearchView';

interface QueueScreenProps {
  status: PlayerStatus;
  isOpen: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onPlayIndex: (index: number) => void;
  serverUrl: string;
  playerUrl: string;
  activeDevice: string;
}

export const QueueScreen: React.FC<QueueScreenProps> = ({
  status,
  isOpen,
  onClose,
  onTogglePlay,
  onSeek,
  onNext,
  onPrevious,
  onPlayIndex,
  serverUrl,
  playerUrl,
  activeDevice,
}) => {
  const { current_track, playing, position_seconds, duration_seconds } = status;
  const [albums, setAlbums] = useState<Album[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [queueTracks, setQueueTracks] = useState<any[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);

  // Load albums on mount/change to resolve album names
  useEffect(() => {
    if (serverUrl) {
      fetch(`${serverUrl}/api/library/albums`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setAlbums(data))
        .catch((err) => console.error('Failed to load albums:', err));
    }
  }, [serverUrl]);

  // Fetch queue tracks when queue screen is open or queue status changes
  useEffect(() => {
    if (isOpen) {
      setQueueLoading(true);
      fetchQueue();
    }
  }, [isOpen, status.queue_length, status.queue_index]);

  const fetchQueue = async () => {
    if (activeDevice === 'This device') {
      const localQ = playerService.getLocalQueue();
      setQueueTracks(localQ);
      setQueueLoading(false);
    } else if (playerUrl) {
      try {
        const res = await fetch(`${playerUrl}/queue`);
        if (res.ok) {
          const data = await res.json();
          if (data.tracks && data.tracks.length > 0) {
            const batchRes = await fetch(`${serverUrl}/api/library/tracks/batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: data.tracks.map((t: any) => t.id) }),
            });
            if (batchRes.ok) {
              const enrichedTracks = await batchRes.json();
              const idToTrack = new Map(enrichedTracks.map((t: any) => [t.id, t]));
              const orderedTracks = data.tracks.map((t: any) => idToTrack.get(t.id) || t);
              setQueueTracks(orderedTracks);
            }
          } else {
            setQueueTracks([]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch remote queue:', err);
      } finally {
        setQueueLoading(false);
      }
    }
  };

  if (!current_track) return null;

  // Resolve album details for current track
  const currentAlbumId = current_track.album_id;
  const albumInfo = albums.find((a) => a.id === currentAlbumId);
  const albumTitle = albumInfo?.title || '';
  const albumArtist = albumInfo?.album_artist || '';
  const artworkUrl = current_track.artwork_url || '';

  // Retrieve keywords if available
  const composer = current_track.composer || '';
  const dateYear = current_track.date || 0;
  const discNumber = current_track.disc_number || 0;
  const totalDiscs = current_track.total_discs || 0;
  const trackNumber = current_track.track_number || 0;
  const totalTracks = current_track.total_tracks || 0;
  const keywords = current_track.keywords || [];

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    onSeek(value);
  };

  return (
    <div className={`queue-screen ${isOpen ? 'visible' : ''}`}>
      {/* Top Handle / Close Button */}
      <div className="queue-screen-header">
        <button className="queue-screen-close" onClick={onClose} aria-label="Close Queue Screen">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Main Container */}
      <div className="queue-screen-content-wrapper">
        <div className={`queue-screen-main ${panelOpen ? 'panel-expanded' : ''}`}>
          
          {/* Metadata Grid */}
          <div className="queue-screen-meta-container">
            {/* Artwork (Left) */}
            <div className="queue-screen-artwork-col">
              <div className="queue-screen-large-artwork">
                {artworkUrl ? (
                  <img src={artworkUrl} alt={current_track.title} />
                ) : (
                  <div className="queue-screen-artwork-placeholder">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Details (Right) */}
            <div className="queue-screen-details-col">
              <h1 className="queue-screen-title" title={current_track.title}>
                {current_track.title}
              </h1>
              <h2 className="queue-screen-artist" title={current_track.artist}>
                {current_track.artist}
              </h2>
              
              <div className="queue-screen-metadata-list">
                {albumTitle && (
                  <div className="metadata-row">
                    <span className="metadata-label">Album:</span> {albumTitle}
                  </div>
                )}
                {albumArtist && albumArtist !== current_track.artist && (
                  <div className="metadata-row">
                    <span className="metadata-label">Album Artist:</span> {albumArtist}
                  </div>
                )}
                {composer && (
                  <div className="metadata-row">
                    <span className="metadata-label">Composer:</span> {composer}
                  </div>
                )}
                {dateYear > 0 && (
                  <div className="metadata-row">
                    <span className="metadata-label">Year:</span> {dateYear}
                  </div>
                )}
                <div className="metadata-row">
                  <span className="metadata-label">Duration:</span> {formatDuration(duration_seconds)}
                </div>
                {discNumber > 0 && totalDiscs > 1 && (
                  <div className="metadata-row">
                    <span className="metadata-label">Disc:</span> {discNumber}/{totalDiscs}
                  </div>
                )}
                {trackNumber > 0 && (
                  <div className="metadata-row">
                    <span className="metadata-label">Track:</span> {trackNumber}{totalTracks > 0 ? `/${totalTracks}` : ''}
                  </div>
                )}
              </div>

              {keywords.length > 0 && (
                <div className="queue-screen-keywords">
                  {keywords.map((kw: string) => (
                    <span key={kw} className="keyword-badge">{kw}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Transport Controls & Scrubber */}
          <div className="queue-screen-controls-section">
            <div className="player-buttons">
              <button className="player-btn" onClick={onPrevious} aria-label="Previous Track">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="19 20 9 12 19 4 19 20" />
                  <line x1="5" y1="19" x2="5" y2="5" />
                </svg>
              </button>

              <button className="player-btn-play" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </button>

              <button className="player-btn" onClick={onNext} aria-label="Next Track">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 4 15 12 5 20 5 4" />
                  <line x1="19" y1="5" x2="19" y2="19" />
                </svg>
              </button>
            </div>

            <div className="player-scrubber">
              <span className="player-time">{formatDuration(position_seconds)}</span>
              <input
                type="range"
                className="player-slider"
                min="0"
                max={duration_seconds || 100}
                value={position_seconds}
                onChange={handleSeekChange}
              />
              <span className="player-time">{formatDuration(duration_seconds)}</span>
            </div>
          </div>

        </div>

        {/* Slide-out Queue Panel (Right Side) */}
        <div className={`queue-panel-container ${panelOpen ? 'visible' : ''}`}>
          {/* Handle tab anchored on the left edge of the panel */}
          <button 
            className="queue-panel-handle-btn"
            onClick={() => setPanelOpen(!panelOpen)}
            aria-label="Toggle Queue Panel"
          >
            {panelOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            )}
          </button>

          <div className="queue-panel-header">
            <h3>Playback Queue</h3>
          </div>
          <div className="queue-panel-list">
            {queueLoading ? (
              <p className="metadata-text" style={{ padding: '16px' }}>Loading queue...</p>
            ) : queueTracks.length === 0 ? (
              <p className="metadata-text" style={{ padding: '16px' }}>Queue is empty</p>
            ) : (
              queueTracks.map((track, i) => {
                const thumbArtwork = track.album_id ? `${serverUrl}/artwork/${track.album_id}` : '';
                const isActive = status.queue_index === i;
                return (
                  <div
                    key={`${track.id}-${i}`}
                    className={`queue-panel-item ${isActive ? 'active' : ''}`}
                    onClick={() => onPlayIndex(i)}
                  >
                    <div className="queue-item-thumb">
                      {thumbArtwork ? (
                        <img src={thumbArtwork} alt={track.title} />
                      ) : (
                        <div className="queue-item-placeholder">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 18V5l12-2v13" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="queue-item-details">
                      <div className="queue-item-title" title={track.title}>{track.title || 'Unknown Title'}</div>
                      <div className="queue-item-artist" title={track.artist}>{track.artist || 'Unknown Artist'}</div>
                    </div>
                    <div className="queue-item-duration">
                      {formatDuration(track.duration_seconds)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
