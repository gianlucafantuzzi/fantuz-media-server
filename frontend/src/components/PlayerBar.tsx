import React, { useState, useEffect } from 'react';
import type { PlayerStatus } from '../services/playerService';
import { formatDuration } from '../views/SearchView';

interface PlayerBarProps {
  status: PlayerStatus;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onOpenQueue: () => void;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  status,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onNext,
  onPrevious,
  onOpenQueue,
}) => {
  const { current_track, playing, position_seconds, duration_seconds, volume } = status;
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(position_seconds);

  useEffect(() => {
    if (!isDragging) {
      setDragValue(position_seconds);
    }
  }, [position_seconds, isDragging]);

  // Do not render Player Bar if no track is loaded
  if (!current_track) return null;

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setDragValue(value);
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onSeek(dragValue);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    onVolumeChange(value);
  };


  const isPreviousDisabled = status.queue_index === 0;
  const isNextDisabled = status.queue_length <= 1 || status.queue_index === status.queue_length - 1;

  return (
    <div className="player-bar">
      {/* Pull Tab Handle */}
      <button className="player-bar-pull-tab" onClick={onOpenQueue} aria-label="Open Queue Screen">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {/* Track Info (Left) */}
      <div className="player-track-info">
        <div className="player-artwork-wrapper">
          {current_track.artwork_url ? (
            <img
               src={current_track.artwork_url}
               alt={current_track.title}
               className="player-artwork"
               onError={(e) => {
                 (e.target as HTMLElement).style.display = 'none';
                 const parent = (e.target as HTMLElement).parentElement;
                 if (parent) {
                   const placeholder = parent.querySelector('.player-artwork-placeholder');
                   if (placeholder) {
                     (placeholder as HTMLElement).style.display = 'flex';
                   }
                 }
               }}
            />
          ) : null}
          <div
            className="player-artwork-placeholder"
            style={{ display: current_track.artwork_url ? 'none' : 'flex' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        </div>
        <div className="player-details">
          <div className="player-title" title={current_track.title}>
            {current_track.title}
          </div>
          <div className="player-artist" title={current_track.artist}>
            {current_track.artist}
          </div>
        </div>
      </div>

      {/* Playback Controls & Scrubber (Center) */}
      <div className="player-controls-container">
        <div className="player-buttons">
          {/* Previous Track Button */}
          <button
            className="player-btn"
            onClick={onPrevious}
            disabled={isPreviousDisabled}
            aria-label="Previous Track"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" />
            </svg>
          </button>

          {/* Play/Pause (Teal Filled Button) */}
          <button
            className="player-btn-play"
            onClick={onTogglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          {/* Next Track Button */}
          <button
            className="player-btn"
            onClick={onNext}
            disabled={isNextDisabled}
            aria-label="Next Track"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </button>
        </div>

        {/* Scrubber Progress Bar */}
        <div className="player-scrubber">
          <span className="player-time">{formatDuration(dragValue)}</span>
          <input
            type="range"
            className="player-slider"
            min="0"
            max={duration_seconds || 100}
            value={dragValue}
            onChange={handleSeekChange}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            onMouseUp={handleDragEnd}
            onTouchEnd={handleDragEnd}
          />
          <span className="player-time">{formatDuration(duration_seconds)}</span>
        </div>
      </div>

      {/* Volume & Casting (Right) */}
      <div className="player-utility">
        {/* Volume Controls */}
        <div className="player-volume-container">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <input
            type="range"
            className="player-slider volume-slider"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
          />
        </div>

      </div>
    </div>
  );
};
