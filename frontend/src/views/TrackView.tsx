import React, { useState, useEffect } from 'react';
import type { Track, Album } from '../services/playerService';
import { formatDuration } from './SearchView';

interface TrackViewProps {
  track: Track;
  serverUrl: string;
  onBack: () => void;
  onSelectAlbum: (album: Album) => void;
  onSelectTrack: (track: Track) => void;
  onPlayTracks: (tracks: Track[], startIndex?: number) => void;
  onQueueTracks: (tracks: Track[]) => void;
}

export const TrackView: React.FC<TrackViewProps> = ({
  track,
  serverUrl,
  onBack,
  onSelectAlbum,
  onSelectTrack,
  onPlayTracks,
  onQueueTracks,
}) => {
  const [album, setAlbum] = useState<Album | null>(null);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Fetch the album details and tracks
    Promise.all([
      fetch(`${serverUrl}/api/library/albums`),
      fetch(`${serverUrl}/api/library/albums/${track.album_id}/tracks`),
    ])
      .then(async ([albumsRes, tracksRes]) => {
        if (!albumsRes.ok || !tracksRes.ok) {
          throw new Error('Failed to fetch album info or tracks');
        }
        const albumsData: Album[] = await albumsRes.json();
        const tracksData: Track[] = await tracksRes.json();

        const matchingAlbum = albumsData.find((a) => a.id === track.album_id);
        if (matchingAlbum) {
          setAlbum(matchingAlbum);
        } else {
          // Fallback album info if not found in the list
          setAlbum({
            id: track.album_id,
            title: 'Unknown Album',
            album_artist: track.artist,
            artwork_path: '',
            duration_seconds: track.duration_seconds,
          });
        }
        setAlbumTracks(tracksData || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Error loading track details.');
        setLoading(false);
      });
  }, [track.id, track.album_id, serverUrl]);

  // Sort tracks by disc number and track number
  const sortedTracks = [...albumTracks].sort((a, b) => {
    if (a.disc_number !== b.disc_number) return a.disc_number - b.disc_number;
    return a.track_number - b.track_number;
  });

  const currentIndex = sortedTracks.findIndex((t) => t.id === track.id);
  const prevTrack = currentIndex > 0 ? sortedTracks[currentIndex - 1] : null;
  const nextTrack = currentIndex >= 0 && currentIndex < sortedTracks.length - 1 ? sortedTracks[currentIndex + 1] : null;

  const artworkUrl = album?.artwork_path ? `${serverUrl}/artwork/${album.id}` : '';
  const albumTitle = album?.title || '';
  const albumArtist = album?.album_artist || '';

  const keywords = track.keywords || [];

  const handleShowAlbum = () => {
    if (album) {
      onSelectAlbum(album);
    }
  };

  return (
    <div className="track-screen" style={{ width: '100%' }}>
      {/* Header section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', width: '100%', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
          {/* Previous track button */}
          <button
            className="btn-primary"
            style={{ 
              padding: '6px 12px', 
              fontSize: '13px', 
              opacity: prevTrack ? 1 : 0.4, 
              cursor: prevTrack ? 'pointer' : 'not-allowed' 
            }}
            onClick={() => prevTrack && onSelectTrack(prevTrack)}
            disabled={!prevTrack}
          >
            &larr; Prev
          </button>

          {/* Center Info */}
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '0 8px' }}>
            <h1 
              style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} 
              title={track.title}
            >
              {track.title}
            </h1>
            <h2 
              style={{ fontSize: '15px', fontWeight: 500, margin: 0, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} 
              title={track.artist}
            >
              {track.artist}
            </h2>
          </div>

          {/* Next track button */}
          <button
            className="btn-primary"
            style={{ 
              padding: '6px 12px', 
              fontSize: '13px', 
              opacity: nextTrack ? 1 : 0.4, 
              cursor: nextTrack ? 'pointer' : 'not-allowed' 
            }}
            onClick={() => nextTrack && onSelectTrack(nextTrack)}
            disabled={!nextTrack}
          >
            Next &rarr;
          </button>
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
            marginLeft: '16px'
          }}
          aria-label="Back"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
      </div>

      {loading ? (
        <p className="metadata-text">Loading details...</p>
      ) : error ? (
        <p className="metadata-text" style={{ color: 'var(--accent)' }}>{error}</p>
      ) : (
        /* Split Panels Grid */
        <div style={{ display: 'flex', gap: '48px', flexWrap: 'wrap', width: '100%' }}>
          
          {/* Left Panel */}
          <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {track.composer && (
              <div style={{ fontSize: '15px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={track.composer}>
                <span style={{ color: 'var(--text-muted)' }}>Composer:</span> {track.composer}
              </div>
            )}
            <div style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Year:</span> {track.date || 'Unknown'}
            </div>
            <div style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Duration:</span> {formatDuration(track.duration_seconds)}
            </div>
            {track.total_discs && track.total_discs > 1 && (
              <div style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Disc:</span> {track.disc_number}/{track.total_discs}
              </div>
            )}
            <div style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Track:</span> {track.track_number}/{track.total_tracks || track.track_number}
            </div>

            {/* Keyword tags */}
            {keywords.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
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
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button className="btn-primary" onClick={() => onPlayTracks([track], 0)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Play</span>
              </button>
              <button 
                className="btn-primary" 
                style={{ whiteSpace: 'nowrap' }} 
                onClick={() => onQueueTracks([track])}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add to queue</span>
              </button>
            </div>
          </div>

          {/* Right Panel */}
          <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <div 
              className="album-artwork-wrapper" 
              onClick={handleShowAlbum}
              style={{ width: '220px', height: '220px', borderRadius: '8px', cursor: 'pointer', overflow: 'hidden', flexShrink: 0 }}
            >
              {artworkUrl ? (
                <img src={artworkUrl} alt={albumTitle} className="album-artwork" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div className="album-artwork-placeholder">
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
              )}
            </div>
            
            <div style={{ textAlign: 'center', width: '100%', maxWidth: '280px' }}>
              <h3 
                style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 6px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={albumTitle}
              >
                {albumTitle}
              </h3>
              <p 
                style={{ fontSize: '14px', margin: 0, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={albumArtist}
              >
                {albumArtist}
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
