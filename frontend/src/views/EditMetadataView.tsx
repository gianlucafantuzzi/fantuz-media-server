import React, { useState, useEffect } from 'react';
import type { Album, Track } from '../services/playerService';
import { formatDuration } from './SearchView';

interface EditMetadataViewProps {
	serverUrl: string;
}

export const EditMetadataView: React.FC<EditMetadataViewProps> = ({ serverUrl }) => {
	const [activeTab, setActiveTab] = useState<'add-remove' | 'edit-track' | 'edit-album'>('add-remove');

	// Library data
	const [albums, setAlbums] = useState<Album[]>([]);
	const [tracks, setTracks] = useState<Track[]>([]);
	const [allKeywords, setAllKeywords] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Tab: Add/Remove tags state
	const [searchQuery, setSearchQuery] = useState('');
	const [filterKeywords, setFilterKeywords] = useState<string[]>([]);
	const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
	const [selectedAlbumIds, setSelectedAlbumIds] = useState<number[]>([]);
	const [albumLimit, setAlbumLimit] = useState(20);

	// Keyword Selection for Removal
	const [selectedKeywordsForRemoval, setSelectedKeywordsForRemoval] = useState<string[]>([]);

	// Modals/Dialogs state
	const [showAddModal, setShowAddModal] = useState(false);
	const [newKeywordInput, setNewKeywordInput] = useState('');
	const [showRemoveModal, setShowRemoveModal] = useState(false);
	const [submitting, setSubmitting] = useState(false);

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

	// Get tracks of selected albums
	const getSelectedTracks = () => {
		return tracks.filter(t => t.album_id && selectedAlbumIds.includes(t.album_id));
	};

	const selectedTracks = getSelectedTracks();

	// Common keywords: keywords present in all tracks of all selected albums
	const getCommonKeywords = () => {
		if (selectedAlbumIds.length === 0 || selectedTracks.length === 0) {
			return [];
		}
		const firstTrackKws = selectedTracks[0].keywords || [];
		return firstTrackKws.filter(kw =>
			selectedTracks.every(t => t.keywords && t.keywords.includes(kw))
		);
	};

	const commonKeywords = getCommonKeywords();

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

	const handleToggleAlbumSelection = (id: number) => {
		if (selectedAlbumIds.includes(id)) {
			setSelectedAlbumIds(selectedAlbumIds.filter(aid => aid !== id));
		} else {
			setSelectedAlbumIds([...selectedAlbumIds, id]);
		}
	};

	const handleToggleKeywordForRemoval = (kw: string) => {
		if (selectedKeywordsForRemoval.includes(kw)) {
			setSelectedKeywordsForRemoval(selectedKeywordsForRemoval.filter(k => k !== kw));
		} else {
			setSelectedKeywordsForRemoval([...selectedKeywordsForRemoval, kw]);
		}
	};

	// Save tag edits and trigger scan
	const triggerScan = async () => {
		try {
			await fetch(`${serverUrl}/api/scan`, { method: 'POST' });
		} catch (e) {
			console.error('Failed to trigger background scan', e);
		}
	};

	const handleAddKeywordSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const kw = newKeywordInput.trim();
		if (!kw || selectedAlbumIds.length === 0) return;

		setSubmitting(true);
		try {
			const res = await fetch(`${serverUrl}/api/library/albums/keywords`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					album_ids: selectedAlbumIds,
					keywords: [kw],
				}),
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to add keyword');
			}

			// Trigger DB scan and refetch data
			triggerScan();
			await fetchData();
			setSelectedAlbumIds([]);

			// Reset inputs
			setNewKeywordInput('');
			setShowAddModal(false);
		} catch (err: any) {
			alert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	const handleRemoveKeywordsConfirm = async () => {
		if (selectedKeywordsForRemoval.length === 0 || selectedAlbumIds.length === 0) return;

		setSubmitting(true);
		try {
			const res = await fetch(`${serverUrl}/api/library/albums/keywords`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					album_ids: selectedAlbumIds,
					keywords: selectedKeywordsForRemoval,
				}),
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to remove keywords');
			}

			// Trigger DB scan and refetch data
			triggerScan();
			await fetchData();
			setSelectedAlbumIds([]);

			setSelectedKeywordsForRemoval([]);
			setShowRemoveModal(false);
		} catch (err: any) {
			alert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="edit-metadata-container" style={{ width: '100%', paddingBottom: '80px' }}>
			{/* Header Tab Bar */}
			<div
				style={{
					display: 'flex',
					gap: '24px',
					borderBottom: '1px solid var(--border-color)',
					marginBottom: '32px',
					paddingBottom: '8px'
				}}
			>
				<button
					onClick={() => setActiveTab('add-remove')}
					style={{
						background: 'none',
						border: 'none',
						color: activeTab === 'add-remove' ? 'var(--accent)' : 'var(--text-secondary)',
						fontSize: '16px',
						fontWeight: 600,
						cursor: 'pointer',
						position: 'relative',
						padding: '4px 8px'
					}}
				>
					Add/Remove tags
					{activeTab === 'add-remove' && (
						<div style={{ position: 'absolute', bottom: '-9px', left: 0, right: 0, height: '2px', backgroundColor: 'var(--accent)' }} />
					)}
				</button>
				<button
					onClick={() => setActiveTab('edit-track')}
					style={{
						background: 'none',
						border: 'none',
						color: activeTab === 'edit-track' ? 'var(--accent)' : 'var(--text-secondary)',
						fontSize: '16px',
						fontWeight: 600,
						cursor: 'pointer',
						position: 'relative',
						padding: '4px 8px'
					}}
				>
					Edit track metadata
					{activeTab === 'edit-track' && (
						<div style={{ position: 'absolute', bottom: '-9px', left: 0, right: 0, height: '2px', backgroundColor: 'var(--accent)' }} />
					)}
				</button>
				<button
					onClick={() => setActiveTab('edit-album')}
					style={{
						background: 'none',
						border: 'none',
						color: activeTab === 'edit-album' ? 'var(--accent)' : 'var(--text-secondary)',
						fontSize: '16px',
						fontWeight: 600,
						cursor: 'pointer',
						position: 'relative',
						padding: '4px 8px'
					}}
				>
					Edit album metadata
					{activeTab === 'edit-album' && (
						<div style={{ position: 'absolute', bottom: '-9px', left: 0, right: 0, height: '2px', backgroundColor: 'var(--accent)' }} />
					)}
				</button>
			</div>

			{error && (
				<div className="metrics-panel" style={{ border: '1px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginBottom: '24px' }}>
					{error}
				</div>
			)}

			{activeTab === 'add-remove' && (
				<div>
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
							Select Albums ({selectedAlbumIds.length} selected, {filteredAlbums.length} matching)
						</h3>
						{loading ? (
							<div className="loading-container">Loading albums...</div>
						) : displayedAlbums.length === 0 ? (
							<p className="metadata-text">No albums match the search criteria.</p>
						) : (
							<div className="albums-grid">
								{displayedAlbums.map((album) => {
									const isSelected = selectedAlbumIds.includes(album.id);
									const artworkUrl = album.artwork_path
										? `${serverUrl}/artwork/${album.id}`
										: '';

									return (
										<div
											key={album.id}
											className="album-card"
											onClick={() => handleToggleAlbumSelection(album.id)}
											style={{
												border: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
												borderRadius: '8px',
												cursor: 'pointer',
												transition: 'border-color 150ms ease',
												position: 'relative'
											}}
										>
											{/* Selected indicator overlay */}
											{isSelected && (
												<div
													style={{
														position: 'absolute',
														top: '8px',
														right: '8px',
														backgroundColor: 'var(--accent)',
														borderRadius: '50%',
														width: '24px',
														height: '24px',
														display: 'flex',
														alignItems: 'center',
														justifyContent: 'center',
														zIndex: 2,
														color: 'var(--bg-app)'
													}}
												>
													<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
														<polyline points="20 6 9 17 4 12" />
													</svg>
												</div>
											)}
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

					{/* Edit Keywords Area at bottom */}
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'flex-start',
							padding: '24px',
							backgroundColor: 'var(--bg-panel)',
							borderRadius: '12px',
							border: '1px solid var(--border-color)',
							gap: '32px'
						}}
					>
						{/* Left: Common keywords */}
						<div style={{ flex: 1 }}>
							<h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
								Common Tags
							</h4>
							{selectedAlbumIds.length === 0 ? (
								<p className="metadata-text" style={{ fontSize: '14px' }}>Select one or more albums above to edit keywords.</p>
							) : commonKeywords.length === 0 ? (
								<p className="metadata-text" style={{ fontSize: '14px' }}>No common tags found across selected albums.</p>
							) : (
								<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
									{commonKeywords.map(kw => {
										const isSelected = selectedKeywordsForRemoval.includes(kw);
										return (
											<button
												key={kw}
												onClick={() => handleToggleKeywordForRemoval(kw)}
												style={{
													padding: '4px 10px',
													borderRadius: '12px',
													border: '1px solid',
													borderColor: isSelected ? 'var(--accent)' : 'var(--border-color)',
													backgroundColor: isSelected ? 'rgba(47, 200, 201, 0.1)' : 'var(--bg-app)',
													color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
													fontSize: '12px',
													cursor: 'pointer',
													display: 'flex',
													alignItems: 'center',
													gap: '6px',
													transition: 'all 150ms ease'
												}}
											>
												<span>{kw}</span>
												{isSelected && (
													<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
														<polyline points="20 6 9 17 4 12" />
													</svg>
												)}
											</button>
										);
									})}
								</div>
							)}
						</div>

						{/* Right: Buttons */}
						<div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
							<button
								className="btn-primary"
								disabled={selectedAlbumIds.length === 0}
								onClick={() => setShowAddModal(true)}
								style={{ opacity: selectedAlbumIds.length === 0 ? 0.5 : 1 }}
							>
								Add tag
							</button>
							<button
								className="btn-primary"
								style={{
									border: '1px solid var(--border-color)',
									opacity: selectedKeywordsForRemoval.length === 0 ? 0.5 : 1
								}}
								disabled={selectedKeywordsForRemoval.length === 0}
								onClick={() => setShowRemoveModal(true)}
							>
								Remove tag(s)
							</button>
						</div>
					</div>
				</div>
			)}

			{activeTab !== 'add-remove' && (
				<div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
					<p>This tab is a placeholder for future implementation.</p>
				</div>
			)}

			{/* Add Tag Modal */}
			{showAddModal && (
				<div
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.6)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 1000
					}}
				>
					<div
						style={{
							backgroundColor: 'var(--bg-panel)',
							padding: '32px',
							borderRadius: '12px',
							width: '100%',
							maxWidth: '480px',
							border: '1px solid var(--border-color)',
							boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
						}}
					>
						<h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', color: 'var(--text-primary)' }}>
							Add Keyword
						</h3>
						<form onSubmit={handleAddKeywordSubmit}>
							<div className="search-input-wrapper" style={{ marginBottom: '20px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
								<input
									type="text"
									className="search-input"
									placeholder="Type new keyword..."
									style={{ width: '100%', boxSizing: 'border-box' }}
									value={newKeywordInput}
									onChange={(e) => setNewKeywordInput(e.target.value)}
									required
									autoFocus
								/>
							</div>

							{/* Shortcut chips */}
							<div style={{ marginBottom: '24px' }}>
								<p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
									Suggestions
								</p>
								<div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
									{allKeywords.map(kw => (
										<button
											key={kw}
											type="button"
											onClick={() => setNewKeywordInput(kw)}
											style={{
												padding: '4px 8px',
												borderRadius: '10px',
												border: '1px solid var(--border-color)',
												backgroundColor: 'var(--bg-app)',
												color: 'var(--text-secondary)',
												fontSize: '11px',
												cursor: 'pointer'
											}}
										>
											{kw}
										</button>
									))}
								</div>
							</div>

							<div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
								<button
									type="button"
									className="btn-primary"
									style={{ border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
									onClick={() => setShowAddModal(false)}
									disabled={submitting}
								>
									Cancel
								</button>
								<button
									type="submit"
									className="btn-primary"
									disabled={submitting || !newKeywordInput.trim()}
								>
									{submitting ? 'Adding...' : 'OK'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Remove Confirmation Modal */}
			{showRemoveModal && (
				<div
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.6)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 1000
					}}
				>
					<div
						style={{
							backgroundColor: 'var(--bg-panel)',
							padding: '32px',
							borderRadius: '12px',
							width: '100%',
							maxWidth: '480px',
							border: '1px solid var(--border-color)',
							boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
						}}
					>
						<h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
							Confirm Tag Removal
						</h3>
						<p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>
							Are you sure you want to remove the keyword(s) <strong>{selectedKeywordsForRemoval.join(', ')}</strong> from all tracks in the <strong>{selectedAlbumIds.length}</strong> selected album(s)? This will modify the files' metadata.
						</p>
						<div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
							<button
								className="btn-primary"
								style={{ border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
								onClick={() => setShowRemoveModal(false)}
								disabled={submitting}
							>
								Cancel
							</button>
							<button
								className="btn-primary"
								style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
								onClick={handleRemoveKeywordsConfirm}
								disabled={submitting}
							>
								{submitting ? 'Removing...' : 'Remove'}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
