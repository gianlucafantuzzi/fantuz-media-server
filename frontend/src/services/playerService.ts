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
    album_id?: number;
    composer?: string;
    date?: number;
    disc_number?: number;
    total_discs?: number;
    track_number?: number;
    total_tracks?: number;
    keywords?: string[];
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

  private mapTrackToCurrentTrack(track: Track) {
    const mediaUrl = `${this.serverUrl}/media/${track.id}`;
    const artworkUrl = track.album_id ? `${this.serverUrl}/artwork/${track.album_id}` : undefined;
    return {
      id: track.id,
      url: mediaUrl,
      title: track.title,
      artist: track.artist,
      duration_seconds: track.duration_seconds,
      artwork_url: artworkUrl,
      album_id: track.album_id,
      composer: track.composer,
      date: track.date,
      disc_number: track.disc_number,
      total_discs: track.total_discs,
      track_number: track.track_number,
      total_tracks: track.total_tracks,
      keywords: track.keywords,
    };
  }

  private async enrichRemoteStatus(remoteStatus: any): Promise<PlayerStatus> {
    if (!remoteStatus.current_track || !remoteStatus.current_track.id || !this.serverUrl) {
      return remoteStatus;
    }
    const trackId = remoteStatus.current_track.id;
    let track = this.trackCache[trackId];
    if (!track) {
      try {
        const response = await fetch(`${this.serverUrl}/api/library/tracks/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [trackId] }),
        });
        if (response.ok) {
          const tracks = await response.json();
          if (tracks && tracks.length > 0) {
            track = tracks[0];
            this.trackCache[trackId] = track;
          }
        }
      } catch (err) {
        console.error('Error enriching remote status:', err);
      }
    }

    if (track) {
      return {
        ...remoteStatus,
        current_track: {
          ...remoteStatus.current_track,
          title: track.title,
          artist: track.artist,
          duration_seconds: track.duration_seconds || remoteStatus.duration_seconds || 0,
          album_id: track.album_id,
          composer: track.composer,
          date: track.date,
          disc_number: track.disc_number,
          total_discs: track.total_discs,
          track_number: track.track_number,
          total_tracks: track.total_tracks,
          keywords: track.keywords,
          artwork_url: track.album_id ? `${this.serverUrl}/artwork/${track.album_id}` : undefined,
        },
      };
    }
    return remoteStatus;
  }

  // Local Browser Player Queue & State
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private nextSource: AudioBufferSourceNode | null = null;
  private activeBuffer: AudioBuffer | null = null;
  private nextBuffer: AudioBuffer | null = null;
  private playbackStartTime: number = 0;
  private trackOffset: number = 0;
  private positionInterval: any = null;

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
  private activeSeekAbortController: AbortController | null = null;
  private localPlaybackAbortController: AbortController | null = null;
  private playbackSessionId: number = 0;

  constructor() {
    // Web Audio API Context is initialized on first user interaction
  }

  private initAudioContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.localStatus.volume;
      this.gainNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  private async fetchAndDecodeTrack(track: Track, signal?: AbortSignal): Promise<AudioBuffer | null> {
    if (!this.audioCtx || !this.serverUrl) return null;
    const url = `${this.serverUrl}/media/${track.id}`;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      return await this.audioCtx.decodeAudioData(arrayBuf);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`Failed to fetch/decode track ${track.id}:`, e);
      }
      return null;
    }
  }

  private stopLocalPlayback() {
    if (this.activeSource) {
      try {
        this.activeSource.stop();
      } catch (e) {}
      this.activeSource.onended = null;
      this.activeSource = null;
    }
    if (this.nextSource) {
      try {
        this.nextSource.stop();
      } catch (e) {}
      this.nextSource.onended = null;
      this.nextSource = null;
    }
    this.activeBuffer = null;
    this.nextBuffer = null;
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }

  private async startLocalPlayback(offset: number = 0) {
    this.stopLocalPlayback();
    if (this.localPlaybackAbortController) {
      this.localPlaybackAbortController.abort();
    }
    const controller = new AbortController();
    this.localPlaybackAbortController = controller;
    
    this.playbackSessionId++;
    const sessionId = this.playbackSessionId;

    this.initAudioContext();
    if (!this.audioCtx || !this.gainNode) return;

    const track = this.localQueue[this.localQueueIndex];
    if (!track) return;

    this.localStatus.current_track = this.mapTrackToCurrentTrack(track);
    this.localStatus.duration_seconds = track.duration_seconds;
    this.localStatus.queue_index = this.localQueueIndex;
    this.localStatus.queue_length = this.localQueue.length;
    this.localStatus.playing = true;
    this.localStatus.position_seconds = Math.round(offset);
    this.triggerUpdate();

    const buffer = await this.fetchAndDecodeTrack(track, controller.signal);
    if (sessionId !== this.playbackSessionId) {
      return;
    }

    if (!buffer) {
      this.localStatus.playing = false;
      this.triggerUpdate();
      return;
    }

    this.activeBuffer = buffer;
    this.playbackStartTime = this.audioCtx.currentTime;
    this.trackOffset = offset;

    this.activeSource = this.audioCtx.createBufferSource();
    this.activeSource.buffer = buffer;
    this.activeSource.connect(this.gainNode);
    this.activeSource.start(this.playbackStartTime, offset);

    this.activeSource.onended = () => {
      // Only advance if this source is still the active one and wasn't stopped manually
      if (this.audioCtx && this.activeSource && this.audioCtx.currentTime >= this.playbackStartTime + buffer.duration - offset - 0.1) {
        this.handleTrackTransition();
      }
    };

    this.positionInterval = setInterval(() => {
      if (this.audioCtx && this.localStatus.playing && this.activeBuffer) {
        const elapsed = this.audioCtx.currentTime - this.playbackStartTime + this.trackOffset;
        this.localStatus.position_seconds = Math.min(
          Math.round(elapsed),
          this.localStatus.duration_seconds
        );
        this.triggerUpdate();
      }
    }, 250);

    // Pre-fetch next track for gapless transition
    this.prefetchNextTrack();
  }

  private prefetchNextTrack() {
    const nextIndex = this.localQueueIndex + 1;
    if (nextIndex < this.localQueue.length && this.audioCtx && this.activeBuffer && this.gainNode) {
      const nextTrack = this.localQueue[nextIndex];
      this.fetchAndDecodeTrack(nextTrack).then((nextBuf) => {
        if (nextBuf && nextIndex === this.localQueueIndex + 1 && this.audioCtx && this.gainNode && this.activeBuffer) {
          this.nextBuffer = nextBuf;
          const T_next = this.playbackStartTime + this.activeBuffer.duration - this.trackOffset;
          this.nextSource = this.audioCtx.createBufferSource();
          this.nextSource.buffer = nextBuf;
          this.nextSource.connect(this.gainNode);
          this.nextSource.start(T_next);
        }
      });
    }
  }

  private handleTrackTransition() {
    const nextIndex = this.localQueueIndex + 1;
    if (nextIndex < this.localQueue.length) {
      this.localQueueIndex = nextIndex;
      const nextTrack = this.localQueue[nextIndex];
      
      this.localStatus.current_track = this.mapTrackToCurrentTrack(nextTrack);
      this.localStatus.duration_seconds = nextTrack.duration_seconds;
      this.localStatus.queue_index = nextIndex;
      this.localStatus.position_seconds = 0;
      this.triggerUpdate();

      if (this.nextBuffer && this.audioCtx) {
        // Shift scheduled next track to active track
        const prevDuration = this.activeBuffer ? this.activeBuffer.duration : 0;
        this.activeSource = this.nextSource;
        this.activeBuffer = this.nextBuffer;
        this.playbackStartTime = this.playbackStartTime + prevDuration - this.trackOffset;
        this.trackOffset = 0;
        this.nextSource = null;
        this.nextBuffer = null;

        if (this.activeSource) {
          this.activeSource.onended = () => {
            if (this.audioCtx && this.activeSource && this.activeBuffer && this.audioCtx.currentTime >= this.playbackStartTime + this.activeBuffer.duration - 0.1) {
              this.handleTrackTransition();
            }
          };
        }
        
        // Pre-fetch the *new* next track
        this.prefetchNextTrack();
      } else {
        // Fallback if not decoded in time
        this.startLocalPlayback(0);
      }
    } else {
      this.localStatus.playing = false;
      this.stopLocalPlayback();
      this.triggerUpdate();
    }
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

    if (this.playerType === 'Browser') {
      this.localQueue = [...tracks];
      this.localQueueIndex = startIndex;
      this.startLocalPlayback(0);
    } else {
      // Remote player API call
      this.stopLocalPlayback();
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
        this.startLocalPlayback(0);
      } else {
        this.prefetchNextTrack();
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
      this.initAudioContext();
      if (this.audioCtx) {
        if (currentlyPlaying) {
          await this.audioCtx.suspend();
          this.localStatus.playing = false;
          this.triggerUpdate();
        } else {
          await this.audioCtx.resume();
          this.localStatus.playing = true;
          this.triggerUpdate();
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
      this.startLocalPlayback(positionSeconds);
    } else {
      const playerUrl = this.playerType;
      if (this.activeSeekAbortController) {
        this.activeSeekAbortController.abort();
      }
      const controller = new AbortController();
      this.activeSeekAbortController = controller;

      try {
        await fetch(`${playerUrl}/seek`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position_seconds: positionSeconds }),
          signal: controller.signal,
        });
        if (this.activeSeekAbortController === controller) {
          this.activeSeekAbortController = null;
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Failed to seek on remote player:', err);
        }
        if (this.activeSeekAbortController === controller) {
          this.activeSeekAbortController = null;
        }
      }
    }
  }

  public async setVolume(volume: number) {
    if (this.playerType === 'Browser') {
      this.localStatus.volume = volume;
      if (this.gainNode && this.audioCtx) {
        this.gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      }
      this.triggerUpdate();
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
    console.log('Local Web Audio output casting is handled natively via OS output device selection.');
  }

  public async next() {
    if (this.playerType === 'Browser') {
      if (this.localQueueIndex + 1 < this.localQueue.length) {
        this.localQueueIndex++;
        this.startLocalPlayback(0);
      }
    } else {
      const playerUrl = this.playerType;
      try {
        await fetch(`${playerUrl}/next`, { method: 'POST' });
      } catch (err) {
        console.error('Failed to skip next on remote player:', err);
      }
    }
  }

  public async previous() {
    if (this.playerType === 'Browser') {
      if (this.localQueueIndex > 0) {
        this.localQueueIndex--;
        this.startLocalPlayback(0);
      }
    } else {
      const playerUrl = this.playerType;
      try {
        await fetch(`${playerUrl}/previous`, { method: 'POST' });
      } catch (err) {
        console.error('Failed to skip previous on remote player:', err);
      }
    }
  }

  public async playIndex(index: number) {
    if (this.playerType === 'Browser') {
      if (index >= 0 && index < this.localQueue.length) {
        this.localQueueIndex = index;
        this.startLocalPlayback(0);
      }
    } else {
      const playerUrl = this.playerType;
      try {
        await fetch(`${playerUrl}/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index }),
        });
      } catch (err) {
        console.error('Failed to play index on remote player:', err);
      }
    }
  }

  public async removeTrack(index: number) {
    if (this.playerType === 'Browser') {
      if (index < 0 || index >= this.localQueue.length) return;

      const activeIndex = this.localQueueIndex;
      const wasPlaying = this.localStatus.playing;

      if (index < activeIndex) {
        this.localQueue.splice(index, 1);
        this.localQueueIndex = activeIndex - 1;
        this.localStatus.queue_index = this.localQueueIndex;
        this.localStatus.queue_length = this.localQueue.length;
        this.triggerUpdate();
        return;
      }

      if (index > activeIndex) {
        this.localQueue.splice(index, 1);
        this.localStatus.queue_length = this.localQueue.length;
        this.triggerUpdate();
        return;
      }

      // If removing the active track:
      this.stopLocalPlayback();
      this.localQueue.splice(index, 1);

      if (this.localQueue.length === 0) {
        this.localQueueIndex = 0;
        this.localStatus.current_track = null;
        this.localStatus.playing = false;
        this.localStatus.position_seconds = 0;
        this.localStatus.duration_seconds = 0;
        this.localStatus.queue_index = 0;
        this.localStatus.queue_length = 0;
        this.triggerUpdate();
        return;
      }

      // Determine new active index
      let newIndex = index;
      if (index >= this.localQueue.length) {
        newIndex = this.localQueue.length - 1;
      }

      this.localQueueIndex = newIndex;
      
      if (wasPlaying) {
        this.startLocalPlayback(0);
      } else {
        const nextTrack = this.localQueue[newIndex];
        this.localStatus.current_track = this.mapTrackToCurrentTrack(nextTrack);
        this.localStatus.position_seconds = 0;
        this.localStatus.duration_seconds = nextTrack.duration_seconds;
        this.localStatus.queue_index = newIndex;
        this.localStatus.queue_length = this.localQueue.length;
        this.localStatus.playing = false;
        this.triggerUpdate();
      }
    } else {
      const playerUrl = this.playerType;
      try {
        const res = await fetch(`${playerUrl}/queue?index=${index}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          const newStatus = await res.json();
          const enriched = await this.enrichRemoteStatus(newStatus);
          this.localStatus = enriched;
          this.triggerUpdate();
        }
      } catch (err) {
        console.error('Failed to remove track on remote player:', err);
      }
    }
  }

  public destroy() {
    this.disconnectWebSocket();
    this.stopLocalPlayback();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

export const playerService = new PlayerService();
