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

	// Tab: Add/remove tags state
	const [searchQuery, setSearchQuery] = useState('');
	const [filterKeywords, setFilterKeywords] = useState<string[]>([]);
	const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
	const [selectedAlbumIds, setSelectedAlbumIds] = useState<number[]>([]);
	const [albumLimit, setAlbumLimit] = useState(20);

	// Tab: Edit album metadata state
	const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
	const [editAlbumTitle, setEditAlbumTitle] = useState('');
	const [editAlbumArtist, setEditAlbumArtist] = useState('');
	const [editArtist, setEditArtist] = useState('');
	const [editComposer, setEditComposer] = useState('');
	const [editYear, setEditYear] = useState('');
	const [editingTrack, setEditingTrack] = useState<Track | null>(null);

	// Tab: Edit track metadata state
	const [editTrackTitle, setEditTrackTitle] = useState('');
	const [editTrackArtist, setEditTrackArtist] = useState('');
	const [editTrackAlbum, setEditTrackAlbum] = useState('');
	const [editTrackAlbumArtist, setEditTrackAlbumArtist] = useState('');
	const [editTrackComposer, setEditTrackComposer] = useState('');
	const [editTrackYear, setEditTrackYear] = useState('');
	const [trackSearchQuery, setTrackSearchQuery] = useState('');
	const [trackLimit, setTrackLimit] = useState(20);

	// Keyword Selection for Removal
	const [selectedKeywordsForRemoval, setSelectedKeywordsForRemoval] = useState<string[]>([]);
	const [modalKeywordsForRemoval, setModalKeywordsForRemoval] = useState<string[]>([]);

	// Modals/Dialogs state
	const [showAddModal, setShowAddModal] = useState(false);
	const [newKeywordInput, setNewKeywordInput] = useState('');
	const [showRemoveModal, setShowRemoveModal] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const handleTabChange = (tab: 'add-remove' | 'edit-track' | 'edit-album') => {
		setActiveTab(tab);
		setEditingAlbum(null);
		setEditingTrack(null);
		setSelectedAlbumIds([]);
		setSelectedKeywordsForRemoval([]);
		setModalKeywordsForRemoval([]);
		setSearchQuery('');
		setTrackSearchQuery('');
		setTrackLimit(20);
		setFilterKeywords([]);
		setExcludedKeywords([]);
		setAlbumLimit(20);
	};

	useEffect(() => {
		if (editingAlbum) {
			const albumTracks = tracks.filter(t => t.album_id === editingAlbum.id);

			if (albumTracks.length > 0) {
				// Album title
				setEditAlbumTitle(editingAlbum.title || '');

				// Album artist
				setEditAlbumArtist(editingAlbum.album_artist || '');

				// Artist consistency check
				const firstArtist = albumTracks[0].artist || '';
				const consistentArtist = albumTracks.every(t => (t.artist || '') === firstArtist) ? firstArtist : 'Varies across tracks';
				setEditArtist(consistentArtist);

				// Composer consistency check
				const firstComposer = albumTracks[0].composer || '';
				const consistentComposer = albumTracks.every(t => (t.composer || '') === firstComposer) ? firstComposer : 'Varies across tracks';
				setEditComposer(consistentComposer);

				// Year consistency check
				const firstYear = albumTracks[0].date || 0;
				const consistentYear = albumTracks.every(t => (t.date || 0) === firstYear)
					? (firstYear > 0 ? String(firstYear) : '')
					: 'Varies across tracks';
				setEditYear(consistentYear);
			} else {
				setEditAlbumTitle('');
				setEditAlbumArtist('');
				setEditArtist('');
				setEditComposer('');
				setEditYear('');
			}
		} else {
			setEditAlbumTitle('');
			setEditAlbumArtist('');
			setEditArtist('');
			setEditComposer('');
			setEditYear('');
		}
	}, [editingAlbum, tracks]);

	useEffect(() => {
		if (editingTrack) {
			setEditTrackTitle(editingTrack.title || '');
			setEditTrackArtist(editingTrack.artist || '');
			const parentAlbum = albums.find(a => a.id === editingTrack.album_id);
			setEditTrackAlbum(parentAlbum ? parentAlbum.title : '');
			setEditTrackAlbumArtist(parentAlbum ? parentAlbum.album_artist : '');
			setEditTrackComposer(editingTrack.composer || '');
			setEditTrackYear(editingTrack.date ? String(editingTrack.date) : '');
		} else {
			setEditTrackTitle('');
			setEditTrackArtist('');
			setEditTrackAlbum('');
			setEditTrackAlbumArtist('');
			setEditTrackComposer('');
			setEditTrackYear('');
		}
	}, [editingTrack, albums]);

	useEffect(() => {
		const mainContent = document.querySelector('.main-content');
		if (mainContent) {
			mainContent.scrollTop = 0;
		}
	}, [activeTab, editingAlbum, editingTrack]);

	const [commonKeywords, setCommonKeywords] = useState<string[]>([]);
	const [albumCommonKeywords, setAlbumCommonKeywords] = useState<string[]>([]);

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
		setLoading(true);
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
			setAlbums([]);
		} finally {
			setLoading(false);
		}
	};

	const fetchTracks = async () => {
		try {
			const trkUrl = trackSearchQuery.trim()
				? `${serverUrl}/api/library/tracks?q=${encodeURIComponent(trackSearchQuery.trim())}`
				: `${serverUrl}/api/library/tracks`;
			const trkRes = await fetch(trkUrl);
			const trkData = await trkRes.json();
			setTracks(Array.isArray(trkData) ? trkData : []);
		} catch (err: any) {
			setError(err.message || 'Failed to fetch tracks');
			setTracks([]);
		}
	};

	useEffect(() => {
		fetchKeywords();
	}, [serverUrl]);

	useEffect(() => {
		fetchAlbums();
	}, [serverUrl, searchQuery, filterKeywords, excludedKeywords]);

	useEffect(() => {
		fetchTracks();
	}, [serverUrl, trackSearchQuery]);

	useEffect(() => {
		if (selectedAlbumIds.length === 0) {
			setCommonKeywords([]);
			return;
		}
		const fetchSelectedCommon = async () => {
			try {
				const res = await fetch(`${serverUrl}/api/library/albums/common-keywords?album_ids=${selectedAlbumIds.join(',')}`);
				const data = await res.json();
				setCommonKeywords(data);
			} catch (err) {
				console.error('Failed to fetch common keywords', err);
			}
		};
		fetchSelectedCommon();
	}, [serverUrl, selectedAlbumIds]);

	useEffect(() => {
		if (!editingAlbum) {
			setAlbumCommonKeywords([]);
			return;
		}
		const fetchAlbumCommon = async () => {
			try {
				const res = await fetch(`${serverUrl}/api/library/albums/common-keywords?album_ids=${editingAlbum.id}`);
				const data = await res.json();
				setAlbumCommonKeywords(data);
			} catch (err) {
				console.error('Failed to fetch album common keywords', err);
			}
		};
		fetchAlbumCommon();
	}, [serverUrl, editingAlbum]);

	const displayedAlbums = albums.slice(0, albumLimit);

	const refreshData = async () => {
		await fetchKeywords();
		await fetchAlbums();
		await fetchTracks();
	};

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

	const handleResetFields = () => {
		if (!editingAlbum) return;
		const albumTracks = tracks.filter(t => t.album_id === editingAlbum.id);
		setEditAlbumTitle(editingAlbum.title || '');
		setEditAlbumArtist(editingAlbum.album_artist || '');
		if (albumTracks.length > 0) {
			const firstArtist = albumTracks[0].artist || '';
			const consistentArtist = albumTracks.every(t => (t.artist || '') === firstArtist) ? firstArtist : 'Varies across tracks';
			setEditArtist(consistentArtist);

			const firstComposer = albumTracks[0].composer || '';
			const consistentComposer = albumTracks.every(t => (t.composer || '') === firstComposer) ? firstComposer : 'Varies across tracks';
			setEditComposer(consistentComposer);

			const firstYear = albumTracks[0].date || 0;
			const consistentYear = albumTracks.every(t => (t.date || 0) === firstYear)
				? (firstYear > 0 ? String(firstYear) : '')
				: 'Varies across tracks';
			setEditYear(consistentYear);
		}
	};

	const handleSaveFields = async () => {
		if (!editingAlbum) return;
		setSubmitting(true);
		try {
			const res = await fetch(`${serverUrl}/api/library/albums/metadata`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					album_id: editingAlbum.id,
					album: editAlbumTitle,
					album_artist: editAlbumArtist,
					artist: editArtist,
					composer: editComposer,
					date: editYear,
				}),
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to save metadata');
			}

			await triggerScan();
			await refreshData();
		} catch (err: any) {
			alert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	const handleResetTrackFields = () => {
		if (editingTrack) {
			setEditTrackTitle(editingTrack.title || '');
			setEditTrackArtist(editingTrack.artist || '');
			const parentAlbum = albums.find(a => a.id === editingTrack.album_id);
			setEditTrackAlbum(parentAlbum ? parentAlbum.title : '');
			setEditTrackAlbumArtist(parentAlbum ? parentAlbum.album_artist : '');
			setEditTrackComposer(editingTrack.composer || '');
			setEditTrackYear(editingTrack.date ? String(editingTrack.date) : '');
		}
	};

	const handleSaveTrackFields = async () => {
		if (!editingTrack) return;
		setSubmitting(true);
		try {
			const res = await fetch(`${serverUrl}/api/library/tracks/metadata`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					track_id: editingTrack.id,
					title: editTrackTitle,
					artist: editTrackArtist,
					album: editTrackAlbum,
					album_artist: editTrackAlbumArtist,
					composer: editTrackComposer,
					date: editTrackYear,
				}),
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to save track metadata');
			}

			await triggerScan();
			await refreshData();

			// Fetch updated track details
			const updatedTrackRes = await fetch(`${serverUrl}/api/library/tracks`);
			const tracksData = await updatedTrackRes.json();
			setTracks(tracksData);
			const updatedTrack = tracksData.find((t: any) => t.id === editingTrack.id);
			if (updatedTrack) {
				setEditingTrack(updatedTrack);
			}
		} catch (err: any) {
			alert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	const handleBackFromEditTrack = async () => {
		setEditingTrack(null);
		await refreshData();
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
		if (!kw) return;

		setSubmitting(true);
		try {
			if (editingTrack) {
				const res = await fetch(`${serverUrl}/api/library/tracks/keywords`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						track_id: editingTrack.id,
						keywords: [kw],
					}),
				});
				if (!res.ok) {
					const data = await res.json();
					throw new Error(data.error || 'Failed to add tag');
				}

				// Trigger DB scan and refetch data
				triggerScan();
				await refreshData();

				// Fetch updated track details
				const updatedTrackRes = await fetch(`${serverUrl}/api/library/tracks`);
				const tracksData = await updatedTrackRes.json();
				setTracks(tracksData);
				const updatedTrack = tracksData.find((t: any) => t.id === editingTrack.id);
				if (updatedTrack) {
					setEditingTrack(updatedTrack);
				}
			} else {
				if (selectedAlbumIds.length === 0) return;
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
					throw new Error(data.error || 'Failed to add tag');
				}

				// Trigger DB scan and refetch data
				triggerScan();
				await refreshData();
				setSelectedAlbumIds([]);
			}

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
		if (modalKeywordsForRemoval.length === 0) return;

		setSubmitting(true);
		try {
			if (editingTrack) {
				const res = await fetch(`${serverUrl}/api/library/tracks/keywords`, {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						track_id: editingTrack.id,
						keywords: modalKeywordsForRemoval,
					}),
				});
				if (!res.ok) {
					const data = await res.json();
					throw new Error(data.error || 'Failed to remove tags');
				}

				// Trigger DB scan and refetch data
				triggerScan();
				await refreshData();

				// Fetch updated track details
				const updatedTrackRes = await fetch(`${serverUrl}/api/library/tracks`);
				const tracksData = await updatedTrackRes.json();
				setTracks(tracksData);
				const updatedTrack = tracksData.find((t: any) => t.id === editingTrack.id);
				if (updatedTrack) {
					setEditingTrack(updatedTrack);
				}

				setModalKeywordsForRemoval([]);
				setShowRemoveModal(false);
			} else {
				if (selectedAlbumIds.length === 0) return;
				const res = await fetch(`${serverUrl}/api/library/albums/keywords`, {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						album_ids: selectedAlbumIds,
						keywords: modalKeywordsForRemoval,
					}),
				});
				if (!res.ok) {
					const data = await res.json();
					throw new Error(data.error || 'Failed to remove tags');
				}

				// Trigger DB scan and refetch data
				triggerScan();
				await refreshData();
				setSelectedAlbumIds([]);

				setSelectedKeywordsForRemoval([]);
				setModalKeywordsForRemoval([]);
				setShowRemoveModal(false);
			}
		} catch (err: any) {
			alert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	const renderEditTrackScreen = () => {
		if (!editingTrack) return null;

		return (
			<div style={{ position: 'relative', minHeight: '300px' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
					<h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>Edit Track: {editingTrack.title}</h2>
					<button
						onClick={handleBackFromEditTrack}
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
						}}
						aria-label="Back"
					>
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							<line x1="19" y1="12" x2="5" y2="12" />
							<polyline points="12 19 5 12 12 5" />
						</svg>
					</button>
				</div>

				<div className="metadata-grid" style={{
					display: 'flex',
					flexDirection: 'column',
					gap: '16px',
					marginBottom: '32px',
					maxWidth: '600px'
				}}>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
						<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Track title</label>
						<input
							type="text"
							className="search-input"
							value={editTrackTitle}
							onChange={(e) => setEditTrackTitle(e.target.value)}
							style={{ width: '100%', boxSizing: 'border-box' }}
						/>
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
						<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Artist</label>
						<input
							type="text"
							className="search-input"
							value={editTrackArtist}
							onChange={(e) => setEditTrackArtist(e.target.value)}
							style={{ width: '100%', boxSizing: 'border-box' }}
						/>
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
						<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Album title</label>
						<input
							type="text"
							className="search-input"
							value={editTrackAlbum}
							onChange={(e) => setEditTrackAlbum(e.target.value)}
							style={{ width: '100%', boxSizing: 'border-box' }}
						/>
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
						<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Album artist</label>
						<input
							type="text"
							className="search-input"
							value={editTrackAlbumArtist}
							onChange={(e) => setEditTrackAlbumArtist(e.target.value)}
							style={{ width: '100%', boxSizing: 'border-box' }}
						/>
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
						<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Composer</label>
						<input
							type="text"
							className="search-input"
							value={editTrackComposer}
							onChange={(e) => setEditTrackComposer(e.target.value)}
							style={{ width: '100%', boxSizing: 'border-box' }}
						/>
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
						<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Year</label>
						<input
							type="text"
							className="search-input"
							value={editTrackYear}
							onChange={(e) => setEditTrackYear(e.target.value)}
							style={{ width: '100%', boxSizing: 'border-box' }}
						/>
					</div>
				</div>

				<div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginBottom: '40px', maxWidth: '600px' }}>
					<button
						className="btn-primary"
						onClick={handleResetTrackFields}
						disabled={submitting}
					>
						Reset
					</button>
					<button
						className="btn-primary"
						onClick={handleSaveTrackFields}
						disabled={submitting}
					>
						{submitting ? 'Saving...' : 'Save'}
					</button>
				</div>

				{/* Keywords Section */}
				<div style={{ marginTop: '32px', borderTop: '1px solid var(--border-color)', paddingTop: '24px', maxWidth: '600px' }}>
					{(!editingTrack.keywords || editingTrack.keywords.length === 0) ? (
						<p className="metadata-text" style={{ fontSize: '14px', marginBottom: '20px' }}>No tags for this track.</p>
					) : (
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
							{editingTrack.keywords.map(kw => (
								<span
									key={kw}
									style={{
										padding: '6px 12px',
										borderRadius: '16px',
										backgroundColor: 'rgba(255,255,255,0.05)',
										border: '1px solid var(--border-color)',
										color: 'var(--text-secondary)',
										fontSize: '12px'
									}}
								>
									{kw}
								</span>
							))}
						</div>
					)}

					<div style={{ display: 'flex', gap: '12px' }}>
						<button
							className="btn-primary"
							onClick={() => {
								setNewKeywordInput('');
								setShowAddModal(true);
							}}
						>
							Add tag(s)
						</button>
						<button
							className="btn-primary"
							disabled={!editingTrack.keywords || editingTrack.keywords.length === 0}
							onClick={() => {
								setModalKeywordsForRemoval([]);
								setShowRemoveModal(true);
							}}
						>
							Remove tag(s)
						</button>
					</div>
				</div>
			</div>
		);
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
					onClick={() => handleTabChange('add-remove')}
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
					Add/remove tags
					{activeTab === 'add-remove' && (
						<div style={{ position: 'absolute', bottom: '-9px', left: 0, right: 0, height: '2px', backgroundColor: 'var(--accent)' }} />
					)}
				</button>
				<button
					onClick={() => handleTabChange('edit-album')}
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
				<button
					onClick={() => handleTabChange('edit-track')}
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
							Select Albums ({selectedAlbumIds.length} selected, {albums.length} matching)
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

						{albums.length > albumLimit && (
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
								onClick={() => {
									setModalKeywordsForRemoval(selectedKeywordsForRemoval);
									setShowRemoveModal(true);
								}}
							>
								Remove tag(s)
							</button>
						</div>
					</div>
				</div>
			)}

			{activeTab === 'edit-album' && (
				editingTrack ? renderEditTrackScreen() : editingAlbum ? (
					<div style={{ position: 'relative', minHeight: '300px' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
							<h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>Edit Album: {editingAlbum.title}</h2>
							<button
								onClick={() => setEditingAlbum(null)}
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
								}}
								aria-label="Back"
							>
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
									<line x1="19" y1="12" x2="5" y2="12" />
									<polyline points="12 19 5 12 12 5" />
								</svg>
							</button>
						</div>

						{/* Edit Album Details Layout */}
						<div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginTop: '24px' }}>
							{/* Left Column: Album Artwork & Keywords */}
							<div style={{ width: '220px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
								<div
									className="album-artwork-wrapper"
									style={{ width: '220px', height: '220px', borderRadius: '8px', overflow: 'hidden' }}
								>
									{editingAlbum.artwork_path ? (
										<>
											<img
												src={`${serverUrl}/artwork/${editingAlbum.id}`}
												alt={editingAlbum.title}
												className="album-artwork"
												style={{ width: '100%', height: '100%', objectFit: 'cover' }}
												onError={(e) => {
													(e.target as HTMLElement).style.display = 'none';
													const parent = (e.target as HTMLElement).parentElement;
													if (parent) {
														const placeholder = parent.querySelector('.album-artwork-placeholder');
														if (placeholder) {
															(placeholder as HTMLElement).style.display = 'flex';
														}
													}
												}}
											/>
											<div className="album-artwork-placeholder" style={{ display: 'none', width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
												<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
													<circle cx="12" cy="12" r="10" />
													<circle cx="12" cy="12" r="3" />
												</svg>
											</div>
										</>
									) : (
										<div className="album-artwork-placeholder" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
											<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
												<circle cx="12" cy="12" r="10" />
												<circle cx="12" cy="12" r="3" />
											</svg>
										</div>
									)}
								</div>

								{/* Keywords Present in all tracks of the album */}
								<div style={{ width: '220px', marginTop: '24px' }}>
									{albumCommonKeywords.length === 0 ? (
										<p className="metadata-text" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No common tags.</p>
									) : (
										<div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
											{albumCommonKeywords.map(kw => {
												const isSelected = selectedKeywordsForRemoval.includes(kw);
												return (
													<button
														key={kw}
														onClick={() => handleToggleKeywordForRemoval(kw)}
														style={{
															padding: '4px 8px',
															borderRadius: '10px',
															border: '1px solid',
															borderColor: isSelected ? 'var(--accent)' : 'var(--border-color)',
															backgroundColor: isSelected ? 'rgba(47, 200, 201, 0.1)' : 'var(--bg-panel)',
															color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
															fontSize: '11px',
															cursor: 'pointer',
															display: 'flex',
															alignItems: 'center',
															gap: '4px'
														}}
													>
														<span>{kw}</span>
														{isSelected && (
															<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
																<polyline points="20 6 9 17 4 12" />
															</svg>
														)}
													</button>
												);
											})}
										</div>
									)}

									<div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
										<button
											className="btn-primary"
											style={{ padding: '6px 12px', fontSize: '12px', flex: 1 }}
											onClick={() => {
												setSelectedAlbumIds([editingAlbum.id]);
												setShowAddModal(true);
											}}
										>
											Add tag(s)
										</button>
										<button
											className="btn-primary"
											style={{ padding: '6px 12px', fontSize: '12px', flex: 1, opacity: albumCommonKeywords.length === 0 ? 0.5 : 1 }}
											disabled={albumCommonKeywords.length === 0}
											onClick={() => {
												setSelectedAlbumIds([editingAlbum.id]);
												setModalKeywordsForRemoval(selectedKeywordsForRemoval);
												setShowRemoveModal(true);
											}}
										>
											Remove tag(s)
										</button>
									</div>
								</div>
							</div>

							{/* Right Column: Edit Fields */}
							<div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
									<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Album title</label>
									<input
										type="text"
										className="search-input"
										value={editAlbumTitle}
										onChange={(e) => setEditAlbumTitle(e.target.value)}
										onFocus={(e) => {
											if (e.target.value === 'Varies across tracks') {
												setEditAlbumTitle('');
											}
										}}
										style={{
											width: '100%',
											boxSizing: 'border-box',
											fontStyle: editAlbumTitle === 'Varies across tracks' ? 'italic' : 'normal'
										}}
									/>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
									<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Album artist</label>
									<input
										type="text"
										className="search-input"
										value={editAlbumArtist}
										onChange={(e) => setEditAlbumArtist(e.target.value)}
										onFocus={(e) => {
											if (e.target.value === 'Varies across tracks') {
												setEditAlbumArtist('');
											}
										}}
										style={{
											width: '100%',
											boxSizing: 'border-box',
											fontStyle: editAlbumArtist === 'Varies across tracks' ? 'italic' : 'normal'
										}}
									/>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
									<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Artist</label>
									<input
										type="text"
										className="search-input"
										value={editArtist}
										onChange={(e) => setEditArtist(e.target.value)}
										onFocus={(e) => {
											if (e.target.value === 'Varies across tracks') {
												setEditArtist('');
											}
										}}
										style={{
											width: '100%',
											boxSizing: 'border-box',
											fontStyle: editArtist === 'Varies across tracks' ? 'italic' : 'normal'
										}}
									/>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
									<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Composer</label>
									<input
										type="text"
										className="search-input"
										value={editComposer}
										onChange={(e) => setEditComposer(e.target.value)}
										onFocus={(e) => {
											if (e.target.value === 'Varies across tracks') {
												setEditComposer('');
											}
										}}
										style={{
											width: '100%',
											boxSizing: 'border-box',
											fontStyle: editComposer === 'Varies across tracks' ? 'italic' : 'normal'
										}}
									/>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
									<label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Year</label>
									<input
										type="text"
										className="search-input"
										value={editYear}
										onChange={(e) => setEditYear(e.target.value)}
										onFocus={(e) => {
											if (e.target.value === 'Varies across tracks') {
												setEditYear('');
											}
										}}
										style={{
											width: '100%',
											boxSizing: 'border-box',
											fontStyle: editYear === 'Varies across tracks' ? 'italic' : 'normal'
										}}
									/>
								</div>

								{/* Action Buttons for Album Metadata */}
								<div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
									<button
										className="btn-primary"
										onClick={handleResetFields}
									>
										Reset
									</button>
									<button
										className="btn-primary"
										onClick={handleSaveFields}
										disabled={submitting}
									>
										{submitting ? 'Saving...' : 'Save'}
									</button>
								</div>
							</div>
						</div>

						{/* Divider */}
						<div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '40px 0 24px' }} />

						{/* Tracks List */}
						<div>
							<h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
								Tracks
							</h3>
							<div className="tracks-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
								{[...tracks.filter(t => t.album_id === editingAlbum.id)]
									.sort((a, b) => {
										if (a.disc_number !== b.disc_number) {
											return (a.disc_number || 0) - (b.disc_number || 0);
										}
										return (a.track_number || 0) - (b.track_number || 0);
									})
									.map((track) => (
										<div
											key={track.id}
											className="track-row"
											style={{
												display: 'flex',
												justifyContent: 'space-between',
												alignItems: 'center',
												padding: '8px 12px',
												borderBottom: '1px solid var(--border-color)',
												borderRadius: '4px'
											}}
										>
											<div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
												<span style={{ color: 'var(--text-muted)', fontSize: '14px', width: '24px', textAlign: 'right' }}>
													{track.track_number || ''}
												</span>
												<span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
													{track.title}
												</span>
											</div>
											<div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
												<button
													className="btn-primary"
													style={{ height: '32px', borderRadius: '16px', padding: '0 20px', fontSize: '12px' }}
													onClick={() => setEditingTrack(track)}
												>
													Edit
												</button>
											</div>
										</div>
									))}
							</div>
						</div>
					</div>
				) : (
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
								Albums ({albums.length} matching)
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
												onClick={() => setEditingAlbum(album)}
												style={{
													borderRadius: '8px',
													cursor: 'pointer',
													transition: 'transform 150ms ease, box-shadow 150ms ease',
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

							{albums.length > albumLimit && (
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
				)
			)}

			{activeTab === 'edit-track' && (
				editingTrack ? renderEditTrackScreen() : (
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
									placeholder="Search tracks by title, artist, or composer..."
									value={trackSearchQuery}
									onChange={(e) => {
										setTrackSearchQuery(e.target.value);
										setTrackLimit(20);
									}}
								/>
							</div>
						</div>

						{/* Tracks list */}
						<div>
							<h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
								Tracks
							</h3>
							{loading ? (
								<div className="loading-container">Loading tracks...</div>
							) : (() => {
								const filtered = tracks.filter(t => {
									const query = trackSearchQuery.toLowerCase();
									return (
										(t.title || '').toLowerCase().includes(query) ||
										(t.artist || '').toLowerCase().includes(query) ||
										(t.composer || '').toLowerCase().includes(query)
									);
								});
								const displayed = filtered.slice(0, trackLimit);

								if (displayed.length === 0) {
									return <p className="metadata-text">No tracks match the search criteria.</p>;
								}

								return (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
										{displayed.map((track) => (
											<div
												key={track.id}
												className="track-row"
												style={{
													display: 'flex',
													justifyContent: 'space-between',
													alignItems: 'center',
													padding: '12px',
													borderBottom: '1px solid var(--border-color)',
													borderRadius: '4px'
												}}
											>
												<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
													<span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
														{track.title}
													</span>
													<span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
														{track.artist} {track.composer ? `• ${track.composer}` : ''}
													</span>
												</div>
												<div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
													<button
														className="btn-primary"
														style={{ height: '32px', borderRadius: '16px', padding: '0 20px', fontSize: '12px' }}
														onClick={() => setEditingTrack(track)}
													>
														Edit
													</button>
												</div>
											</div>
										))}

										{filtered.length > trackLimit && (
											<div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
												<button
													className="btn-primary"
													style={{ height: '36px', borderRadius: '18px', padding: '0 24px', fontSize: '13px' }}
													onClick={() => setTrackLimit(prev => prev + 20)}
												>
													View more
												</button>
											</div>
										)}
									</div>
								);
							})()}
						</div>
					</div>
				)
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
							Add tag
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
						{editingTrack ? (
							<>
								<p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '12px' }}>
									Select the keywords you wish to remove from this track:
								</p>
								<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
									{(editingTrack.keywords || []).map(kw => {
										const isSelected = modalKeywordsForRemoval.includes(kw);
										return (
											<button
												key={kw}
												type="button"
												onClick={() => {
													if (isSelected) {
														setModalKeywordsForRemoval(modalKeywordsForRemoval.filter(k => k !== kw));
													} else {
														setModalKeywordsForRemoval([...modalKeywordsForRemoval, kw]);
													}
												}}
												style={{
													padding: '6px 12px',
													borderRadius: '12px',
													border: '1px solid',
													borderColor: isSelected ? '#ef4444' : 'var(--border-color)',
													backgroundColor: isSelected ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-panel)',
													color: isSelected ? '#ef4444' : 'var(--text-secondary)',
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
														<line x1="18" y1="6" x2="6" y2="18" />
														<line x1="6" y1="6" x2="18" y2="18" />
													</svg>
												)}
											</button>
										);
									})}
								</div>
							</>
						) : activeTab === 'edit-album' ? (
							<>
								<p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '12px' }}>
									Select the keywords you wish to remove from all tracks in this album:
								</p>
								<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
									{albumCommonKeywords.map(kw => {
										const isSelected = modalKeywordsForRemoval.includes(kw);
										return (
											<button
												key={kw}
												type="button"
												onClick={() => {
													if (isSelected) {
														setModalKeywordsForRemoval(modalKeywordsForRemoval.filter(k => k !== kw));
													} else {
														setModalKeywordsForRemoval([...modalKeywordsForRemoval, kw]);
													}
												}}
												style={{
													padding: '6px 12px',
													borderRadius: '12px',
													border: '1px solid',
													borderColor: isSelected ? '#ef4444' : 'var(--border-color)',
													backgroundColor: isSelected ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-panel)',
													color: isSelected ? '#ef4444' : 'var(--text-secondary)',
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
														<line x1="18" y1="6" x2="6" y2="18" />
														<line x1="6" y1="6" x2="18" y2="18" />
													</svg>
												)}
											</button>
										);
									})}
								</div>
							</>
						) : (
							<p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>
								Are you sure you want to remove the keyword(s) <strong>{modalKeywordsForRemoval.join(', ')}</strong> from all tracks in the <strong>{selectedAlbumIds.length}</strong> selected album(s)? This will modify the files' metadata.
							</p>
						)}
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
								onClick={handleRemoveKeywordsConfirm}
								disabled={submitting || modalKeywordsForRemoval.length === 0}
								style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', opacity: modalKeywordsForRemoval.length === 0 ? 0.5 : 1 }}
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
