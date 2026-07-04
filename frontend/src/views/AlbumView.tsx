import React, { useState, useEffect } from 'react';
import type { Track, Album } from '../services/playerService';
import { formatDuration } from './SearchView';

interface AlbumViewProps {
  album: Album;
  serverUrl: string;
  onBack: () => void;
  onPlayTracks: (tracks: Track[], startIndex?: number) => void;
  onQueueTracks: (tracks: Track[]) => void;
}

export const AlbumView: React.FC<AlbumViewProps> = ({
  album,
  serverUrl,
  onBack,
  onPlayTracks,
  onQueueTracks,
}) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${serverUrl}/api/library/albums/${album.id}/tracks`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch album tracks');
        }
        return res.json();
      })
      .then((data: Track[]) => {
        setTracks(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Error loading tracks.');
        setLoading(false);
      });
  }, [album.id, serverUrl]);

  // Sort tracks by disc number and track number
  const sortedTracks = [...tracks].sort((a, b) => {
    if (a.disc_number !== b.disc_number) return a.disc_number - b.disc_number;
    return a.track_number - b.track_number;
  });

  // Group tracks by disc number
  const tracksByDisc: { [key: number]: Track[] } = {};
  sortedTracks.forEach((track) => {
    const d = track.disc_number || 1;
    if (!tracksByDisc[d]) {
      tracksByDisc[d] = [];
    }
    tracksByDisc[d].push(track);
  });
  const discNumbers = Object.keys(tracksByDisc)
    .map(Number)
    .sort((a, b) => a - b);

  const artworkUrl = album.artwork_path ? `${serverUrl}/artwork/${album.id}` : '';
  const totalTracksCount = tracks.length;
  const albumYear = tracks[0]?.date || null;

  // Extract all unique composers (removing duplicates)
  const composers = Array.from(
    new Set(tracks.map((t) => t.composer).filter(Boolean))
  );

  // Extract all unique keywords from tracks (limit to 10)
  const keywords = Array.from(
    new Set(tracks.flatMap((t) => t.keywords || []))
  ).slice(0, 10);

  return (
    <div className="album-screen" style={{ width: '100%' }}>
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', width: '100%' }}>
        <div style={{ display: 'flex', gap: '24px', flex: 1, minWidth: 0 }}>
          {/* Left: Artwork (220px) */}
          <div className="album-artwork-wrapper" style={{ width: '220px', height: '220px', borderRadius: '8px', flexShrink: 0 }}>
            {artworkUrl ? (
              <img src={artworkUrl} alt={album.title} className="album-artwork" />
            ) : (
              <div className="album-artwork-placeholder">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
            )}
          </div>

          {/* Right of Artwork: Info */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, minWidth: 0 }}>
            <h1 
              style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} 
              title={album.title}
            >
              {album.title}
            </h1>
            <h2 
              style={{ fontSize: '18px', fontWeight: 500, margin: '0 0 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} 
              title={album.album_artist}
            >
              {album.album_artist}
            </h2>
            {composers.length > 0 && (
              <div 
                style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} 
                title={composers.join(', ')}
              >
                Composer: {composers.join(', ')}
              </div>
            )}
            <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              {albumYear}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              {totalTracksCount} {totalTracksCount === 1 ? 'track' : 'tracks'} - {formatDuration(album.duration_seconds)}
            </div>
          </div>
        </div>

        {/* Anchored to the far right: Back button */}
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 150ms ease-out',
            flexShrink: 0,
          }}
          aria-label="Back to search results"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
      </div>

      {/* Under the header: Keywords Area */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px', width: '100%' }}>
        {keywords.map((kw) => (
          <span 
            key={kw} 
            style={{ 
              padding: '4px 10px', 
              borderRadius: '12px', 
              backgroundColor: 'var(--bg-panel)', 
              border: '1px solid var(--border-color)', 
              color: 'var(--text-secondary)', 
              fontSize: '12px', 
              whiteSpace: 'nowrap' 
            }}
          >
            {kw}
          </span>
        ))}
      </div>

      {/* Under the keywords: Action buttons (justified to the right) */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginBottom: '32px', width: '100%' }}>
        <button className="btn-primary" onClick={() => onPlayTracks(sortedTracks)} disabled={sortedTracks.length === 0}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Play</span>
        </button>
        <button 
          className="btn-primary" 
          style={{ whiteSpace: 'nowrap' }} 
          onClick={() => onQueueTracks(sortedTracks)} 
          disabled={sortedTracks.length === 0}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span style={{ whiteSpace: 'nowrap' }}>Add to queue</span>
        </button>
      </div>

      {/* Tracks list */}
      {loading ? (
        <p className="metadata-text">Loading tracks...</p>
      ) : error ? (
        <p className="metadata-text" style={{ color: 'var(--accent)' }}>{error}</p>
      ) : sortedTracks.length === 0 ? (
        <p className="metadata-text">No tracks found on this album.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {discNumbers.map((discNum) => {
            const discTracks = tracksByDisc[discNum];
            return (
              <div key={discNum}>
                {discNumbers.length > 1 && (
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '12px' }}>
                    Disc {discNum}
                  </h3>
                )}
                <div className="tracks-list">
                  {discTracks.map((track) => (
                    <div key={track.id} className="track-row" style={{ padding: '8px 12px' }}>
                      <div style={{ width: '28px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', flexShrink: 0 }}>
                        {track.track_number}
                      </div>
                      <div className="track-details">
                        <div className="track-title" style={{ fontWeight: 500 }}>{track.title}</div>
                        {track.artist !== album.album_artist && (
                          <div className="track-artist" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                            {track.artist}
                          </div>
                        )}
                      </div>
                      <div className="track-duration" style={{ width: '50px' }}>
                        {formatDuration(track.duration_seconds)}
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          className="track-play-button"
                          onClick={() => onPlayTracks(sortedTracks, sortedTracks.indexOf(track))}
                          aria-label={`Play ${track.title}`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </button>
                        <button
                          className="track-play-button"
                          onClick={() => onQueueTracks([track])}
                          aria-label={`Add ${track.title} to queue`}
                          style={{ padding: '8px' }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
