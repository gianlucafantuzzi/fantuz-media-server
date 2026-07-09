module fantuz-media-server/server

go 1.22

replace fantuz-media-server/libs/flac-metadata => ../libs/flac-metadata

require (
	fantuz-media-server/libs/flac-metadata v0.0.0
	github.com/bogem/id3v2/v2 v2.1.4
	github.com/mattn/go-sqlite3 v1.14.47
)

require golang.org/x/text v0.3.8 // indirect
