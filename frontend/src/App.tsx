import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { HomeView } from './views/HomeView';
import { SettingsView } from './views/SettingsView';
import { SearchView } from './views/SearchView';
import { AlbumView } from './views/AlbumView';
import { EditMetadataView } from './views/EditMetadataView';
import { PlayerBar } from './components/PlayerBar';
import { playerService } from './services/playerService';
import type { Track, Album, PlayerStatus } from './services/playerService';

function App() {
  const [activeView, setActiveView] = useState(() => {
    return localStorage.getItem('activeView') || 'home';
  });

  const [activeDevice, setActiveDevice] = useState(() => {
    return localStorage.getItem('activeDevice') || 'This device';
  });

  const [servers, setServers] = useState<string[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [selectedServer, setSelectedServer] = useState(() => {
    return localStorage.getItem('selectedServer') || '';
  });
  const [selectedPlayer, setSelectedPlayer] = useState(() => {
    return localStorage.getItem('selectedPlayer') || '';
  });

  // Search results state
  const [searchResults, setSearchResults] = useState<{ albums: Album[]; tracks: Track[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Album state for Album view
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(() => {
    const saved = localStorage.getItem('selectedAlbum');
    return saved ? JSON.parse(saved) : null;
  });

  // Player status state
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>({
    playing: false,
    position_seconds: 0,
    duration_seconds: 0,
    volume: 1.0,
    current_track: null,
    queue_index: 0,
    queue_length: 0,
  });

  // Fetch configuration on initialization
  useEffect(() => {
    fetch('/config.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load config.json');
        }
        return response.json();
      })
      .then((data) => {
        const serverList = data.servers || [];
        const playerList = data.players || [];
        setServers(serverList);
        setPlayers(playerList);

        // Set default server if none selected or not in list
        setSelectedServer((current) => {
          if (current && serverList.includes(current)) {
            return current;
          }
          const defaultServer = serverList[0] || '';
          if (defaultServer) {
            localStorage.setItem('selectedServer', defaultServer);
          }
          return defaultServer;
        });

        // Set default player if none selected or not in list
        setSelectedPlayer((current) => {
          if (current && playerList.includes(current)) {
            return current;
          }
          const defaultPlayer = playerList[0] || '';
          if (defaultPlayer) {
            localStorage.setItem('selectedPlayer', defaultPlayer);
          }
          return defaultPlayer;
        });
      })
      .catch((error) => {
        console.error('Error fetching config:', error);
      });
  }, []);

  // Subscribe to playerService updates
  useEffect(() => {
    playerService.subscribe((status) => {
      setPlayerStatus(status);
    });
  }, []);

  // Sync selected player device type to playerService
  useEffect(() => {
    if (activeDevice === 'This device') {
      playerService.setPlayerType('Browser');
    } else {
      playerService.setPlayerType(selectedPlayer || 'http://localhost:3002');
    }
  }, [activeDevice, selectedPlayer]);

  // Sync active view change to local storage
  const handleViewChange = (view: string) => {
    setActiveView(view);
    localStorage.setItem('activeView', view);
  };

  const handleDeviceChange = (device: string) => {
    setActiveDevice(device);
    localStorage.setItem('activeDevice', device);
  };

  const handleSelectServer = (url: string) => {
    setSelectedServer(url);
    localStorage.setItem('selectedServer', url);
  };

  const handleSelectPlayer = (url: string) => {
    setSelectedPlayer(url);
    localStorage.setItem('selectedPlayer', url);
  };

  const handleSearch = (query: string) => {
    if (!selectedServer) return;
    setSearchQuery(query);

    fetch(`${selectedServer}/api/library/search?q=${encodeURIComponent(query)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch search results');
        }
        return res.json();
      })
      .then((data) => {
        setSearchResults({
          albums: data.albums || [],
          tracks: data.tracks || [],
        });
        handleViewChange('search');
      })
      .catch((err) => {
        console.error('Search failed:', err);
      });
  };

  const handlePlayTrack = (track: Track) => {
    if (!selectedServer) return;
    playerService.playTrack(track, selectedServer);
  };

  const handlePlayTracks = (tracks: Track[], startIndex?: number) => {
    if (!selectedServer) return;
    playerService.playTracks(tracks, selectedServer, startIndex);
  };

  const handleQueueTracks = (tracks: Track[]) => {
    if (!selectedServer) return;
    playerService.addTracksToQueue(tracks, selectedServer);
  };

  const handleSelectAlbum = (album: Album) => {
    setSelectedAlbum(album);
    localStorage.setItem('selectedAlbum', JSON.stringify(album));
    handleViewChange('album');
  };

  const handleTogglePlay = () => {
    playerService.togglePlay(playerStatus.playing);
  };

  const handleSeek = (seconds: number) => {
    playerService.seek(seconds);
  };

  const handleVolumeChange = (volume: number) => {
    playerService.setVolume(volume);
  };

  const handleCastClick = () => {
    playerService.triggerCast();
  };

  const renderContent = () => {
    switch (activeView) {
      case 'home':
        return <HomeView onSearch={handleSearch} />;
      case 'search':
        return (
          <SearchView
            albums={searchResults?.albums || []}
            tracks={searchResults?.tracks || []}
            serverUrl={selectedServer}
            onSearch={handleSearch}
            onPlayTrack={handlePlayTrack}
            onSelectAlbum={handleSelectAlbum}
            initialQuery={searchQuery}
          />
        );
      case 'album':
        return selectedAlbum ? (
          <AlbumView
            album={selectedAlbum}
            serverUrl={selectedServer}
            onBack={() => handleViewChange('search')}
            onPlayTracks={handlePlayTracks}
            onQueueTracks={handleQueueTracks}
          />
        ) : (
          <HomeView onSearch={handleSearch} />
        );
      case 'edit-metadata':
        return <EditMetadataView serverUrl={selectedServer} />;
      case 'playlists':
        return (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <h2 className="album-title" style={{ marginBottom: '16px' }}>Playlists</h2>
            <p className="metadata-text">Playlists view placeholder. You will be able to manage your user-curated playlists here.</p>
          </div>
        );
      case 'settings':
        return (
          <SettingsView
            servers={servers}
            players={players}
            selectedServer={selectedServer}
            selectedPlayer={selectedPlayer}
            onSelectServer={handleSelectServer}
            onSelectPlayer={handleSelectPlayer}
          />
        );
      default:
        return <HomeView onSearch={handleSearch} />;
    }
  };

  return (
    <Layout
      activeView={activeView}
      onViewChange={handleViewChange}
      activeDevice={activeDevice}
      onChangeDevice={handleDeviceChange}
      onCastClick={handleCastClick}
      isCastDisabled={activeDevice !== 'This device'}
    >
      <div style={{ paddingBottom: playerStatus.current_track ? '96px' : '0', width: '100%' }}>
        {renderContent()}
      </div>
      <PlayerBar
        status={playerStatus}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onVolumeChange={handleVolumeChange}
      />
    </Layout>
  );
}

export default App;
