import React, { useState } from 'react';

interface HomeViewProps {
  onSearch: (query: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onSearch }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <div className="home-screen">
      <form onSubmit={handleSubmit} className="search-container">
        <div className="search-input-wrapper">
          {/* Magnifying glass icon */}
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary">
          <span>Search Music Collection</span>
        </button>
      </form>
    </div>
  );
};
