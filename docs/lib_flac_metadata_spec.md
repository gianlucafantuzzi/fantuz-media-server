# FLAC Metadata Library Specification

This document specifies the Go API provided by the `flacmetadata` library located in `libs/flac-metadata`.

## API Functions

### `ReadCommentsJSON`
Reads all Vorbis Comment metadata blocks from a FLAC file and returns them as a JSON-formatted string of key-value pairs.
```go
func ReadCommentsJSON(filePath string) (string, error)
```
- **Inputs**: `filePath` (string) - Path to the FLAC file.
- **Returns**: A JSON string containing the key-value tag comments, or an error.
- **Errors**:
  - If the file is not a valid FLAC file (magic number `fLaC` check).
  - If the file cannot be opened or parsed.

### `ReadPicture`
Reads the embedded metadata picture block from a FLAC file and returns it as a struct in memory.
```go
func ReadPicture(filePath string) (*Picture, error)
```
- **Inputs**: `filePath` (string) - Path to the FLAC file.
- **Returns**: A pointer to a `Picture` struct containing the MIME type, extension, and raw binary bytes of the image, or an error.
- **Errors**:
  - If the file is not a valid FLAC file.
  - If the file contains no picture blocks.

---

### `ExtractPicture`
Reads the embedded metadata picture block (front cover/other) from a FLAC file, detects its image format (PNG, JPEG, GIF, etc.), and saves the image to a file in the specified output directory.
```go
func ExtractPicture(filePath string, outputDir string) (string, error)
```
- **Inputs**:
  - `filePath` (string) - Path to the FLAC file.
  - `outputDir` (string) - Target directory to save the extracted image.
- **Returns**: The absolute path to the saved image file, or an error.
- **Image Type Detection**: Automatically parses MIME types (e.g. `image/jpeg` -> `.jpg`, `image/png` -> `.png`, `image/gif` -> `.gif`) to determine the file extension.
- **Errors**:
  - If the file is not a valid FLAC file.
  - If the file contains no picture blocks.
  - If file writing fails.

---

### `WriteCommentsJSON`
Applies comment updates to the Vorbis Comment blocks of a FLAC file using a JSON-formatted string containing key-value pairs.
```go
func WriteCommentsJSON(filePath string, commentsJSON string) error
```
- **Inputs**:
  - `filePath` (string) - Path to the FLAC file.
  - `commentsJSON` (string) - JSON string containing key-value comment tags to write/replace.
- **Behavior**:
  - If a key specified in the JSON already exists in the file tags, it is overwritten with the new value.
  - If a key specified in the JSON does not exist, it is added.
  - Existing comment tags in the file that are *not* present in the JSON are preserved.
- **Errors**:
  - If the file is not a valid FLAC file.
  - If the JSON is invalid.
  - If saving the modified FLAC fails.

---

### `WritePicture`
Replaces any existing picture blocks in the FLAC file with a new picture block containing the specified image file.
```go
func WritePicture(filePath string, picturePath string) error
```
- **Inputs**:
  - `filePath` (string) - Path to the FLAC file.
  - `picturePath` (string) - Path to the image file to embed.
- **Behavior**:
  - Deletes all existing `PICTURE` metadata blocks from the FLAC file.
  - Reads the new image, detects its MIME type (e.g. from file contents or extension), and adds a new `PICTURE` block.
- **Errors**:
  - If the file is not a valid FLAC file.
  - If the image file cannot be read or processed.

---

### `VerifyDirectory`
Recursively scans a directory hierarchy, parsing metadata for all files ending in `.flac`. It identifies and lists any files for which the read operations fail with an error.
```go
func VerifyDirectory(dirPath string) ([]string, error)
```
- **Inputs**: `dirPath` (string) - Root directory of the hierarchy to scan.
- **Returns**: A slice of file paths that failed verification, or an error if scanning the directory fails.
- **Errors**: If the starting directory path is invalid or inaccessible.
