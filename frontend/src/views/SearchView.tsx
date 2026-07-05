import React, { useState, useEffect } from 'react';
import type { Track, Album } from '../services/playerService';

interface SearchViewProps {
  albums: Album[];
  tracks: Track[];
  serverUrl: string;
  onSearch: (query: string) => void;
  onPlayTrack: (track: Track) => void;
  onSelectAlbum: (album: Album) => void;
  onSelectTrack: (track: Track) => void;
  initialQuery?: string;
}

export const formatDuration = (seconds: number): string => {
  if (!seconds || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const secsStr = secs < 10 ? `0${secs}` : secs;

  if (hrs > 0) {
    const minsStr = mins < 10 ? `0${mins}` : mins;
    return `${hrs}:${minsStr}:${secsStr}`;
  } else {
    return `${mins}:${secsStr}`;
  }
};

export const SearchView: React.FC<SearchViewProps> = ({
  albums,
  tracks,
  serverUrl,
  onSearch,
  onPlayTrack,
  onSelectAlbum,
  onSelectTrack,
  initialQuery = '',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [albumLimit, setAlbumLimit] = useState(10);
  const [trackLimit, setTrackLimit] = useState(10);

  // Reset limits when new search results are loaded
  useEffect(() => {
    setAlbumLimit(10);
    setTrackLimit(10);
  }, [albums, tracks]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const displayedAlbums = albums.slice(0, albumLimit);
  const displayedTracks = tracks.slice(0, trackLimit);

  return (
    <div className="search-results-screen" style={{ width: '100%' }}>
      {/* Search Header */}
      <form onSubmit={handleSubmit} className="search-container" style={{ maxWidth: '600px', margin: '0 auto 32px' }}>
        <div className="search-input-wrapper">
          <svg
            className="search-icon-inside"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search for tracks, albums, artists..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </form>

      {/* Albums Section */}
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '16px' }}>
          Albums
        </h2>
        {displayedAlbums.length === 0 ? (
          <p className="metadata-text" style={{ padding: '12px 0' }}>No albums match your search.</p>
        ) : (
          <div className="albums-grid">
            {displayedAlbums.map((album) => {
              const artworkUrl = album.artwork_path
                ? `${serverUrl}/artwork/${album.id}`
                : '';
              return (
                <div key={album.id} className="album-card" onClick={() => onSelectAlbum(album)}>
                  <div className="album-artwork-wrapper">
                    {artworkUrl ? (
                      <img src={artworkUrl} alt={album.title} className="album-artwork" />
                    ) : (
                      <div className="album-artwork-placeholder">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="album-card-details">
                    <div className="album-card-title" title={album.title}>{album.title}</div>
                    <div className="album-card-artist" title={album.album_artist}>{album.album_artist}</div>
                    <div className="album-card-duration">{formatDuration(album.duration_seconds)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {albums.length > albumLimit && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
            <button className="btn-primary" onClick={() => setAlbumLimit((prev) => prev + 10)}>
              View more
            </button>
          </div>
        )}
      </div>

      {/* Tracks Section */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '16px' }}>
          Tracks
        </h2>
        {displayedTracks.length === 0 ? (
          <p className="metadata-text" style={{ padding: '12px 0' }}>No tracks match your search.</p>
        ) : (
          <div className="tracks-list">
            {displayedTracks.map((track) => {
              const artworkUrl = `${serverUrl}/artwork/${track.album_id}`;
              return (
                <div key={track.id} className="track-row" onClick={() => onSelectTrack(track)} style={{ cursor: 'pointer' }}>
                  <div className="track-artwork-wrapper">
                    <img
                      src={artworkUrl}
                      alt={track.title}
                      className="track-artwork"
                      onError={(e) => {
                        // If image fails to load, display placeholder icon
                        (e.target as HTMLElement).style.display = 'none';
                        const parent = (e.target as HTMLElement).parentElement;
                        if (parent) {
                          const placeholder = parent.querySelector('.track-artwork-placeholder');
                          if (placeholder) {
                            (placeholder as HTMLElement).style.display = 'flex';
                          }
                        }
                      }}
                    />
                    <div className="track-artwork-placeholder" style={{ display: 'none' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    </div>
                  </div>
                  <div className="track-details">
                    <div className="track-title-container">
                      <span className="track-title">{track.title}</span>
                      {track.composer && (
                        <span className="track-composer"> - {track.composer}</span>
                      )}
                    </div>
                    <div className="track-artist">{track.artist}</div>
                  </div>
                  <div className="track-duration">{formatDuration(track.duration_seconds)}</div>
                  <button
                    className="track-play-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayTrack(track);
                    }}
                    aria-label={`Play ${track.title}`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {tracks.length > trackLimit && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
            <button className="btn-primary" onClick={() => setTrackLimit((prev) => prev + 10)}>
              View more
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
