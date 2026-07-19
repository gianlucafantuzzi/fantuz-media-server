import React, { useState, useEffect } from 'react';
import type { Album, Track } from '../services/playerService';
import { formatDuration } from './SearchView';

interface SearchAlbumsViewProps {
  serverUrl: string;
  onSelectAlbum: (album: Album) => void;
}

export const SearchAlbumsView: React.FC<SearchAlbumsViewProps> = ({ serverUrl, onSelectAlbum }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [allKeywords, setAllKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKeywords, setFilterKeywords] = useState<string[]>([]);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [albumLimit, setAlbumLimit] = useState(20);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch keywords
      const kwRes = await fetch(`${serverUrl}/api/library/keywords`);
      const kwData = await kwRes.json();
      setAllKeywords(kwData);

      // Fetch albums
      const albRes = await fetch(`${serverUrl}/api/library/albums`);
      const albData = await albRes.json();
      setAlbums(albData);

      // Fetch tracks
      const trkRes = await fetch(`${serverUrl}/api/library/tracks`);
      const trkData = await trkRes.json();
      setTracks(trkData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch library data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [serverUrl]);

  // Filter albums based on Search query, Filter keywords & Exclude keywords
  const getFilteredAlbums = () => {
    let filtered = albums;

    // 1. Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(album => {
        const albumTitle = (album.title || '').toLowerCase();
        const albumArtist = (album.album_artist || '').toLowerCase();

        // Get album tracks
        const albumTracks = tracks.filter(t => t.album_id === album.id);
        const matchesTrack = albumTracks.some(track => {
          const title = (track.title || '').toLowerCase();
          const artist = (track.artist || '').toLowerCase();
          const composer = (track.composer || '').toLowerCase();
          const kws = track.keywords || [];
          return title.includes(query) ||
            artist.includes(query) ||
            composer.includes(query) ||
            kws.some(k => k.toLowerCase().includes(query));
        });

        return albumTitle.includes(query) || albumArtist.includes(query) || matchesTrack;
      });
    }

    // 2. Filter by tags
    // Only featuring albums for which ALL tracks contain all of the selected keywords
    if (filterKeywords.length > 0) {
      filtered = filtered.filter(album => {
        const albumTracks = tracks.filter(t => t.album_id === album.id);
        if (albumTracks.length === 0) return false;

        return albumTracks.every(track => {
          const trackKws = track.keywords || [];
          return filterKeywords.every(kw => trackKws.includes(kw));
        });
      });
    }

    // 3. Exclude keywords filter
    // Exclude all albums for which ALL tracks contain at least one of the selected keywords
    if (excludedKeywords.length > 0) {
      filtered = filtered.filter(album => {
        const albumTracks = tracks.filter(t => t.album_id === album.id);
        if (albumTracks.length === 0) return true;

        const allTracksHaveExcludeKeyword = albumTracks.every(track => {
          const trackKws = track.keywords || [];
          return trackKws.some(kw => excludedKeywords.includes(kw));
        });

        return !allTracksHaveExcludeKeyword;
      });
    }

    return filtered;
  };

  const filteredAlbums = getFilteredAlbums();
  const displayedAlbums = filteredAlbums.slice(0, albumLimit);

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
          Albums ({filteredAlbums.length} matching)
        </h3>
        {loading ? (
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

        {filteredAlbums.length > albumLimit && (
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
