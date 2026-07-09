export interface Track {
  id: number;
  album_id: number;
  title: string;
  artist: string;
  duration_seconds: number;
  composer?: string;
  genre?: string;
  date?: number;
  disc_number: number;
  track_number: number;
  total_discs?: number;
  total_tracks?: number;
  keywords?: string[];
}

export interface Album {
  id: number;
  title: string;
  album_artist: string;
  artwork_path: string;
  duration_seconds: number;
}

export interface PlayerStatus {
  playing: boolean;
  position_seconds: number;
  duration_seconds: number;
  volume: number;
  current_track: {
    id?: number;
    url: string;
    title: string;
    artist: string;
    duration_seconds: number;
    artwork_url?: string;
  } | null;
  queue_index: number;
  queue_length: number;
}

export type StatusCallback = (status: PlayerStatus) => void;

class PlayerService {
  private playerType: 'Browser' | string = 'Browser';
  private onStatusUpdate: StatusCallback | null = null;
  private serverUrl: string = '';
  private trackCache: Record<number, any> = {};

  public setServerUrl(url: string) {
    this.serverUrl = url;
  }

  private async enrichRemoteStatus(remoteStatus: any): Promise<PlayerStatus> {
    if (!remoteStatus.current_track || !remoteStatus.current_track.id || !this.serverUrl) {
      return remoteStatus;
    }
    const trackId = remoteStatus.current_track.id;
    if (this.trackCache[trackId]) {
      const track = this.trackCache[trackId];
      return {
        ...remoteStatus,
        current_track: {
          ...remoteStatus.current_track,
          title: track.title,
          artist: track.artist,
          artwork_url: track.album_id ? `${this.serverUrl}/artwork/${track.album_id}` : undefined,
        },
      };
    }
    try {
      const response = await fetch(`${this.serverUrl}/api/library/tracks/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [trackId] }),
      });
      if (response.ok) {
        const tracks = await response.json();
        if (tracks && tracks.length > 0) {
          const track = tracks[0];
          this.trackCache[trackId] = track;
          return {
            ...remoteStatus,
            current_track: {
              ...remoteStatus.current_track,
              title: track.title,
              artist: track.artist,
              artwork_url: track.album_id ? `${this.serverUrl}/artwork/${track.album_id}` : undefined,
            },
          };
        }
      }
    } catch (err) {
      console.error('Error enriching remote status:', err);
    }
    return remoteStatus;
  }

  // Local Browser Player Queue & State
  private localAudio: HTMLAudioElement | null = null;
  private localQueue: Track[] = [];
  private localQueueIndex: number = 0;
  private localStatus: PlayerStatus = {
    playing: false,
    position_seconds: 0,
    duration_seconds: 0,
    volume: 1.0,
    current_track: null,
    queue_index: 0,
    queue_length: 0,
  };

  // Remote Player WebSocket
  private ws: WebSocket | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initLocalAudio();
    }
  }

  private initLocalAudio() {
    this.localAudio = new Audio();
    this.localAudio.volume = this.localStatus.volume;

    this.localAudio.addEventListener('play', () => {
      this.localStatus.playing = true;
      this.triggerUpdate();
    });

    this.localAudio.addEventListener('pause', () => {
      this.localStatus.playing = false;
      this.triggerUpdate();
    });

    this.localAudio.addEventListener('timeupdate', () => {
      if (this.localAudio) {
        this.localStatus.position_seconds = Math.round(this.localAudio.currentTime);
        this.triggerUpdate();
      }
    });

    this.localAudio.addEventListener('durationchange', () => {
      if (this.localAudio) {
        this.localStatus.duration_seconds = Math.round(this.localAudio.duration) || 0;
        this.triggerUpdate();
      }
    });

    this.localAudio.addEventListener('volumechange', () => {
      if (this.localAudio) {
        this.localStatus.volume = this.localAudio.volume;
        this.triggerUpdate();
      }
    });

    this.localAudio.addEventListener('ended', async () => {
      this.localStatus.position_seconds = 0;
      if (this.localQueueIndex + 1 < this.localQueue.length) {
        this.localQueueIndex++;
        const nextTrack = this.localQueue[this.localQueueIndex];
        const mediaUrl = `${this.serverUrl}/media/${nextTrack.id}`;
        const artworkUrl = `${this.serverUrl}/artwork/${nextTrack.album_id}`;

        this.localStatus.current_track = {
          url: mediaUrl,
          title: nextTrack.title,
          artist: nextTrack.artist,
          duration_seconds: nextTrack.duration_seconds,
          artwork_url: artworkUrl,
        };
        this.localStatus.queue_index = this.localQueueIndex;
        if (this.localAudio) {
          this.localAudio.src = mediaUrl;
          this.localAudio.load();
          try {
            await this.localAudio.play();
          } catch (err) {
            console.error('Local autoplay failed:', err);
          }
        }
      } else {
        this.localStatus.playing = false;
        this.triggerUpdate();
      }
    });
  }

  public getLocalQueue() {
    return this.localQueue;
  }

  public getLocalQueueIndex() {
    return this.localQueueIndex;
  }

  public subscribe(callback: StatusCallback) {
    this.onStatusUpdate = callback;
    this.triggerUpdate();
  }

  public setPlayerType(type: 'Browser' | string) {
    if (this.playerType === type) return;

    this.playerType = type;
    this.disconnectWebSocket();

    if (type === 'Browser') {
      this.triggerUpdate();
    } else {
      // Connect to remote Player WebSocket and poll status immediately
      this.connectWebSocket(type);
      this.fetchRemoteStatus(type);
    }
  }

  private triggerUpdate() {
    if (!this.onStatusUpdate) return;

    if (this.playerType === 'Browser') {
      this.onStatusUpdate({ ...this.localStatus });
    }
  }

  // Fetch remote status via REST HTTP fallback/initial load
  private async fetchRemoteStatus(playerUrl: string) {
    try {
      const response = await fetch(`${playerUrl}/status`);
      if (response.ok) {
        const remoteStatus = await response.json();
        if (this.playerType === playerUrl && this.onStatusUpdate) {
          const enriched = await this.enrichRemoteStatus(remoteStatus);
          this.onStatusUpdate(enriched);
        }
      }
    } catch (err) {
      console.error('Error fetching initial remote status:', err);
    }
  }

  // WebSocket Management for Remote Player
  private connectWebSocket(playerUrl: string) {
    try {
      const wsUrl = playerUrl.replace(/^http/, 'ws') + '/ws';
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = async (event) => {
        try {
          const remoteStatus = JSON.parse(event.data);
          if (this.playerType === playerUrl && this.onStatusUpdate) {
            const enriched = await this.enrichRemoteStatus(remoteStatus);
            this.onStatusUpdate(enriched);
          }
        } catch (e) {
          console.error('Error parsing remote player status:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.error('Remote player WebSocket error:', err);
      };

      this.ws.onclose = () => {
        // Retry logic or clean up if needed
      };
    } catch (err) {
      console.error('Error connecting to remote player WS:', err);
    }
  }

  private disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Playback Control APIs
  public async playTrack(track: Track, serverUrl: string) {
    await this.playTracks([track], serverUrl, 0);
  }

  public async playTracks(tracks: Track[], serverUrl: string, startIndex: number = 0) {
    if (tracks.length === 0) return;
    this.serverUrl = serverUrl;
    const startTrack = tracks[startIndex];
    const mediaUrl = `${serverUrl}/media/${startTrack.id}`;
    const artworkUrl = `${serverUrl}/artwork/${startTrack.album_id}`;

    if (this.playerType === 'Browser') {
      if (this.localAudio) {
        // Pause current audio
        this.localAudio.pause();

        // Maintain simulated local queue
        this.localQueue = [...tracks];
        this.localQueueIndex = startIndex;

        this.localStatus.current_track = {
          url: mediaUrl,
          title: startTrack.title,
          artist: startTrack.artist,
          duration_seconds: startTrack.duration_seconds,
          artwork_url: artworkUrl,
        };
        this.localStatus.position_seconds = 0;
        this.localStatus.duration_seconds = startTrack.duration_seconds;
        this.localStatus.queue_index = startIndex;
        this.localStatus.queue_length = tracks.length;

        this.localAudio.src = mediaUrl;
        this.localAudio.load();
        try {
          await this.localAudio.play();
        } catch (err) {
          console.error('Playback failed:', err);
        }
      }
    } else {
      // Remote player API call
      // Pause local browser if active
      if (this.localAudio && !this.localAudio.paused) {
        this.localAudio.pause();
      }

      const playerUrl = this.playerType;
      try {
        await fetch(`${playerUrl}/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace: true,
            tracks: tracks.map((t) => ({
              id: t.id,
              url: `${serverUrl}/media/${t.id}`,
              duration_seconds: t.duration_seconds,
            })),
          }),
        });

        await fetch(`${playerUrl}/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index: startIndex }),
        });
      } catch (err) {
        console.error('Failed to command remote player:', err);
      }
    }
  }

  public async addTrackToQueue(track: Track, serverUrl: string) {
    await this.addTracksToQueue([track], serverUrl);
  }

  public async addTracksToQueue(tracks: Track[], serverUrl: string) {
    if (tracks.length === 0) return;
    this.serverUrl = serverUrl;

    if (this.playerType === 'Browser') {
      this.localQueue = [...this.localQueue, ...tracks];
      this.localStatus.queue_length = this.localQueue.length;

      // If nothing is currently playing, load and play the first added track
      if (!this.localStatus.current_track && this.localQueue.length > 0) {
        this.localQueueIndex = 0;
        const firstTrack = this.localQueue[0];
        const mediaUrl = `${serverUrl}/media/${firstTrack.id}`;
        const artworkUrl = `${serverUrl}/artwork/${firstTrack.album_id}`;

        this.localStatus.current_track = {
          url: mediaUrl,
          title: firstTrack.title,
          artist: firstTrack.artist,
          duration_seconds: firstTrack.duration_seconds,
          artwork_url: artworkUrl,
        };
        this.localStatus.position_seconds = 0;
        this.localStatus.duration_seconds = firstTrack.duration_seconds;
        this.localStatus.queue_index = 0;

        if (this.localAudio) {
          this.localAudio.src = mediaUrl;
          this.localAudio.load();
          try {
            await this.localAudio.play();
          } catch (err) {
            console.error('Playback failed:', err);
          }
        }
      } else {
        this.triggerUpdate();
      }
    } else {
      const playerUrl = this.playerType;
      try {
        await fetch(`${playerUrl}/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace: false,
            tracks: tracks.map((t) => ({
              id: t.id,
              url: `${serverUrl}/media/${t.id}`,
              duration_seconds: t.duration_seconds,
            })),
          }),
        });
      } catch (err) {
        console.error('Failed to add tracks to queue on remote player:', err);
      }
    }
  }

  public async togglePlay(currentlyPlaying: boolean) {
    if (this.playerType === 'Browser') {
      if (this.localAudio) {
        if (currentlyPlaying) {
          this.localAudio.pause();
        } else {
          try {
            await this.localAudio.play();
          } catch (err) {
            console.error('Failed to resume playback:', err);
          }
        }
      }
    } else {
      const playerUrl = this.playerType;
      const endpoint = currentlyPlaying ? '/pause' : '/play';
      try {
        await fetch(`${playerUrl}${endpoint}`, { method: 'POST' });
      } catch (err) {
        console.error('Failed to toggle play on remote player:', err);
      }
    }
  }

  public async seek(positionSeconds: number) {
    if (this.playerType === 'Browser') {
      if (this.localAudio) {
        this.localAudio.currentTime = positionSeconds;
        this.localStatus.position_seconds = positionSeconds;
        this.triggerUpdate();
      }
    } else {
      const playerUrl = this.playerType;
      try {
        await fetch(`${playerUrl}/seek`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position_seconds: positionSeconds }),
        });
      } catch (err) {
        console.error('Failed to seek on remote player:', err);
      }
    }
  }

  public async setVolume(volume: number) {
    if (this.playerType === 'Browser') {
      if (this.localAudio) {
        this.localAudio.volume = volume;
        this.localStatus.volume = volume;
        this.triggerUpdate();
      }
    } else {
      const playerUrl = this.playerType;
      try {
        await fetch(`${playerUrl}/volume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ volume }),
        });
      } catch (err) {
        console.error('Failed to set remote volume:', err);
      }
    }
  }

  public triggerCast() {
    if (this.localAudio) {
      const audio = this.localAudio as any;
      if (typeof audio.webkitShowPlaybackTargetPicker === 'function') {
        audio.webkitShowPlaybackTargetPicker();
      } else if (audio.remote && typeof audio.remote.prompt === 'function') {
        audio.remote.prompt().catch((err: any) => {
          console.error('Remote playback prompt failed:', err);
        });
      } else {
        console.warn('Casting is not supported in this browser.');
      }
    }
  }

  public destroy() {
    this.disconnectWebSocket();
    if (this.localAudio) {
      this.localAudio.pause();
      this.localAudio.src = '';
    }
  }
}

export const playerService = new PlayerService();
