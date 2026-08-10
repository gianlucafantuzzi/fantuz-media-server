import React, { useState, useEffect } from 'react';
import type { Album } from '../services/playerService';
import { formatDuration } from './SearchView';

interface SearchAlbumsViewProps {
  serverUrl: string;
  onSelectAlbum: (album: Album) => void;
}

export const SearchAlbumsView: React.FC<SearchAlbumsViewProps> = ({ serverUrl, onSelectAlbum }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [allKeywords, setAllKeywords] = useState<string[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state restored from sessionStorage if available
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      const saved = sessionStorage.getItem('searchAlbumsState');
      if (saved) return JSON.parse(saved).searchQuery || '';
    } catch (e) {}
    return '';
  });

  const [filterKeywords, setFilterKeywords] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('searchAlbumsState');
      if (saved) return JSON.parse(saved).filterKeywords || [];
    } catch (e) {}
    return [];
  });

  const [excludedKeywords, setExcludedKeywords] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('searchAlbumsState');
      if (saved) return JSON.parse(saved).excludedKeywords || [];
    } catch (e) {}
    return [];
  });

  const [albumLimit, setAlbumLimit] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem('searchAlbumsState');
      if (saved) return JSON.parse(saved).albumLimit || 20;
    } catch (e) {}
    return 20;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(
        'searchAlbumsState',
        JSON.stringify({ searchQuery, filterKeywords, excludedKeywords, albumLimit })
      );
    } catch (e) {}
  }, [searchQuery, filterKeywords, excludedKeywords, albumLimit]);

  const fetchKeywords = async () => {
    try {
      const kwRes = await fetch(`${serverUrl}/api/library/keywords`);
      const kwData = await kwRes.json();
      setAllKeywords(kwData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch keywords');
    }
  };

  const fetchAlbums = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('scope', 'search_albums');
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim());
      }
      filterKeywords.forEach(kw => params.append('filter_keywords', kw));
      excludedKeywords.forEach(kw => params.append('exclude_keywords', kw));

      const albRes = await fetch(`${serverUrl}/api/library/albums?${params.toString()}`);
      const albData = await albRes.json();
      setAlbums(Array.isArray(albData) ? albData : []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch albums');
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchKeywords();
  }, [serverUrl]);

  useEffect(() => {
    fetchAlbums();
  }, [serverUrl, searchQuery, filterKeywords, excludedKeywords]);

  const currentAlbums = Array.isArray(albums) ? albums : [];
  const displayedAlbums = currentAlbums.slice(0, albumLimit);

  const handleToggleFilterKeyword = (kw: string) => {
    if (filterKeywords.includes(kw)) {
      setFilterKeywords(filterKeywords.filter(k => k !== kw));
    } else {
      setFilterKeywords([...filterKeywords, kw]);
    }
  };

  const handleToggleExcludeKeyword = (kw: string) => {
    if (excludedKeywords.includes(kw)) {
      setExcludedKeywords(excludedKeywords.filter(k => k !== kw));
    } else {
      setExcludedKeywords([...excludedKeywords, kw]);
    }
  };

  return (
    <div className="search-albums-container" style={{ width: '100%', paddingBottom: '80px' }}>
      <h2 className="album-title" style={{ marginBottom: '24px' }}>Search Albums</h2>

      {error && (
        <div className="metrics-panel" style={{ border: '1px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {/* Search input */}
      <div className="search-container" style={{ maxWidth: '600px', margin: '0 auto 32px' }}>
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
            placeholder="Search for tracks, albums, artists, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Filter by tags Section */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Filter by tags
        </h3>
        {allKeywords.length === 0 ? (
          <p className="metadata-text" style={{ fontSize: '14px' }}>No keywords exist in the library yet.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {allKeywords.map(kw => {
              const isSelected = filterKeywords.includes(kw);
              return (
                <button
                  key={kw}
                  type="button"
                  onClick={() => handleToggleFilterKeyword(kw)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '16px',
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--accent)' : 'var(--border-color)',
                    backgroundColor: isSelected ? 'rgba(47, 200, 201, 0.1)' : 'var(--bg-panel)',
                    color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 150ms ease'
                  }}
                >
                  {kw}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Exclude tags Section */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Exclude tags
        </h3>
        {allKeywords.length === 0 ? (
          <p className="metadata-text" style={{ fontSize: '14px' }}>No keywords exist in the library yet.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {allKeywords.map(kw => {
              const isSelected = excludedKeywords.includes(kw);
              return (
                <button
                  key={kw}
                  type="button"
                  onClick={() => handleToggleExcludeKeyword(kw)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '16px',
                    border: '1px solid',
                    borderColor: isSelected ? '#ef4444' : 'var(--border-color)',
                    backgroundColor: isSelected ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-panel)',
                    color: isSelected ? '#ef4444' : 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 150ms ease'
                  }}
                >
                  {kw}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Album Cards Grid */}
      <div style={{ marginBottom: '40px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Albums ({currentAlbums.length} matching)
        </h3>
        {initialLoading ? (
          <div className="loading-container">Loading albums...</div>
        ) : displayedAlbums.length === 0 ? (
          <p className="metadata-text">No albums match the search criteria.</p>
        ) : (
          <div className="albums-grid">
            {displayedAlbums.map((album) => {
              const artworkUrl = album.artwork_path
                ? `${serverUrl}/artwork/${album.id}`
                : '';

              return (
                <div
                  key={album.id}
                  className="album-card"
                  onClick={() => onSelectAlbum(album)}
                  style={{
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'transform 150ms ease',
                    position: 'relative'
                  }}
                >
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

        {currentAlbums.length > albumLimit && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
            <button
              className="btn-primary"
              onClick={() => setAlbumLimit(prev => prev + 20)}
            >
              View more
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
