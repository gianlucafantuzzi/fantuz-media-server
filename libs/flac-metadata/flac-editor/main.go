package main

import (
	"fmt"
	"os"

	"fantuz-media-server/libs/flac-metadata"
)

func main() {
	if len(os.Args) < 3 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]
	target := os.Args[2]

	switch command {
	case "read-tags":
		jsonStr, err := flacmetadata.ReadCommentsJSON(target)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println(jsonStr)

	case "write-tags":
		if len(os.Args) < 4 {
			fmt.Fprintln(os.Stderr, "Error: missing tags JSON string or file path")
			printUsage()
			os.Exit(1)
		}
		jsonInput := os.Args[3]

		// Check if input is a file path, otherwise treat as raw JSON
		if _, err := os.Stat(jsonInput); err == nil {
			bytes, err := os.ReadFile(jsonInput)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error reading JSON file: %v\n", err)
				os.Exit(1)
			}
			jsonInput = string(bytes)
		}

		err := flacmetadata.WriteCommentsJSON(target, jsonInput)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Tags written successfully.")

	case "extract-image":
		if len(os.Args) < 4 {
			fmt.Fprintln(os.Stderr, "Error: missing output directory")
			printUsage()
			os.Exit(1)
		}
		outDir := os.Args[3]
		savedPath, err := flacmetadata.ExtractPicture(target, outDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Image extracted to: %s\n", savedPath)

	case "write-image":
		if len(os.Args) < 4 {
			fmt.Fprintln(os.Stderr, "Error: missing image path")
			printUsage()
			os.Exit(1)
		}
		imagePath := os.Args[3]
		err := flacmetadata.WritePicture(target, imagePath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Image written successfully.")

	case "verify":
		failing, err := flacmetadata.VerifyDirectory(target)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if len(failing) == 0 {
			fmt.Println("All FLAC files are valid.")
		} else {
			fmt.Println("Failing FLAC files:")
			for _, file := range failing {
				fmt.Println(file)
			}
			os.Exit(1)
		}

	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", command)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("Usage: flac-editor <command> <target> [arguments]")
	fmt.Println("Commands:")
	fmt.Println("  read-tags <flac_file>                      Reads and prints Vorbis Comments as JSON")
	fmt.Println("  write-tags <flac_file> <json_string|file>  Updates/inserts Vorbis Comments from JSON")
	fmt.Println("  extract-image <flac_file> <output_dir>     Extracts embedded picture block to output dir")
	fmt.Println("  write-image <flac_file> <image_file>       Replaces embedded picture block with image file")
	fmt.Println("  verify <directory>                         Lists all invalid/failing FLAC files recursively")
}
