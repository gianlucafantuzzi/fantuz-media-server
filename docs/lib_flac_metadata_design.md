# FLAC Metadata Library

The FLAC Metadata library is written in Go and it is located in the libs/flac-metadata directory. The library has the purpose to read and write FLAC metadata tags.

The library exposes a set of API functions that can be invoked by other code written in Go. These APIs cover the following:
* Read all the VORBIS_COMMENT blocks from a FLAC file and return a JSON with all the comments represented as key-value pairs
* Read the PICTURE block from a FLAC file and save the extracted image - The image format should be detected and the proper file extension should be applied

All APIs should check that the file is actually a FLAC file before starting the work. If not, they should return an error.

A simple command line application located in the libs/flac-metadata/flac-editor provides access to all the APIs exposed by the library.