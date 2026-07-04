package library

type TrackMetadata struct {
	FilePath        string
	Title           string
	Artist          string
	Album           string
	AlbumArtist     string
	DurationSeconds int
	Composer        string
	Genre           string
	Date            int
	DiscNumber      int
	TotalDiscs      int
	TrackNumber     int
	TotalTracks     int
	Keywords        []string
	Artwork         *Artwork
	LastModified    int64
}

type Artwork struct {
	Ext      string
	MIMEType string
	Data     []byte
}

type Album struct {
	ID              int64  `json:"id"`
	Title           string `json:"title"`
	AlbumArtist     string `json:"album_artist"`
	ArtworkPath     string `json:"artwork_path"`
	DurationSeconds int    `json:"duration_seconds"`
}

type Track struct {
	ID              int64    `json:"id"`
	AlbumID         *int64   `json:"album_id,omitempty"`
	FilePath        string   `json:"file_path"`
	Title           string   `json:"title"`
	Artist          string   `json:"artist"`
	DurationSeconds int      `json:"duration_seconds"`
	Composer        string   `json:"composer"`
	Genre           string   `json:"genre"`
	Date            int      `json:"date"`
	DiscNumber      int      `json:"disc_number"`
	TotalDiscs      int      `json:"total_discs"`
	TrackNumber     int      `json:"track_number"`
	TotalTracks     int      `json:"total_tracks"`
	Keywords        []string `json:"keywords"`
}

type LibraryFilters struct {
	Query       string
	Genre       string
	Artist      string
	AlbumArtist string
	Composer    string
	Keyword     string
}

type Playlist struct {
	ID              int64   `json:"id"`
	Title           string  `json:"title"`
	DurationSeconds int     `json:"duration_seconds"`
	Tracks          []Track `json:"tracks,omitempty"`
}
