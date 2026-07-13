# Project Requirements

The goal is to be able to browse a collection of audio files and play them back on a device. The audio files are stored on an internal or USB hard-drive. In the future, it is possible support for Network drives might be added.

The following is needed:
* Store music files on an internal or USB drive on a Raspberry Pi or Intel Mac
* Index metadata and artwork
* Browse library from a browser
* Initiate playback from the browser
* Control playback remotely (play, pause, seek, volume, playlists)
* Support playback:
  * on the browser itself
  * on the server device (Pi or Mac connected to an AVR)
  * potentially support multiple playback endpoints in the future

# Architecture

There are 3 separate applications: Media Server, Web Frontend and Player. The source code for these is stored in directories called "server", "frontend" and "player".

There is a "deploy" directory to store all the files that are supposed to be deployed on the devices. It follows the following structure:
* deploy
    * server
        * intel_macos
        * raspberry_pi
    * frontend
    * player
        * intel_macos
        * raspberry_pi

While testing, the applications are run directly from these directories.

## Media Server

### Responsibilities

* scan drive containing the music files
* read metadata
* edit metadata
* extract artwork
* maintain database (library index and user playlists)
* serve media files
* expose API

### Main Architectural Points

* Written in Go
* Built for the following platforms:
	* macOS
    * Raspberry Pi
* SQLite metadata database
* Artwork cache stored on local disk
* HTTP REST API exposed on port 3001
* WebSocket Server used to maintain connection with the clients
* The configuration of the server is stored in a local JSON file

### ID3 Tags

For every music file, the following tags must be extracted and put in the DB for consumption by the frontend:
* Title
* Artist
* Album
* Album Artist
* Date
* Composer
* Disc Number
* Total Discs
* Genre
* Track Number
* Total Tracks
* Keywords - a comma-separated list of items (one item could be made of multiple words)
* Duration — track length in seconds (stored as `duration_seconds` on the `tracks` table)

Album title, album artist, artwork path, and `duration_seconds` are stored on the `albums` table; tracks reference their album via `album_id`. Album duration is the sum of the `duration_seconds` of all tracks in the album, calculated and stored after all tracks for that album have been indexed. Keywords are stored in a separate `keywords` table and linked to tracks through a many-to-many `track_keywords` relation.

In addition, a link to the artwork in the cache and a link to the actual playable file must be stored in the database.

### Playlists

Playlists are stored in the database and managed via the server API. Each playlist has a title, an ordered list of tracks, and a stored `duration_seconds` field. Playlist duration is the sum of the `duration_seconds` of all tracks it contains, recalculated and stored whenever the playlist's track list changes.

## Web Frontend

### Responsibilities

* browse and search content
* display artwork
* create and edit playlists stored on the server
* control playback
* optionally play media directly in browser

### Main Architectural Points

* Runs entirely in a browser
* Accessed via port 3000
* Written in React + TypeScript
* Feel free to use Vite for scaffolding if you think it is useful
* Compiled into static files
* Looks good whether it is on a tablet, mobile phone or computer
* Handles well both vertical and horizontal orientations
* When playing the content from the browser, the Web Audio API shall be used, in order to achieve gapless playback
* For casting to Bluetooth and Airplay, rely on the browser's native capabilities

### Requirements


#### Top Bar

A top bar is present at all times and it includes in order:
* On the left, a "Menu" button. Clicking on the button opens the sidebar which is initially not visible and contains the menu. The sidebar slides into view from left to right. The button simply contains an icon with three horizontal lines, as typical for menu buttons.
* A "Home" button that causes the "Home" screen to appear
* A dropdown menu with two options: "This device" and "Remote player"
    * When on "This device" all playback happens in the browser
    * When on "Remote player" all playback happens on the configured player application
    * If the screen is too small to contain the dropdown menu, an icon is present that opens the dropdown with the options - The icon should be appropriate for the choice of an output device
* At the center the image in ./frontend/images/FantuzMediaServerLogoHorizontal.png. The image is sized in such a way that its height coincides with the height of the whole top bar.
* On the right of the bar, a "cast" button
    * When not in "This device" the button is grayed out and inactive
    * When clicked, a panel comes out listing the available Airplay and Bluetooth devices. When a device is chosen, the audio is cast from the browser to that device. 

#### Sidebar

The sidebar has the following elements exactly in this order:
* A "Home" menu item that causes the "Home" screen to appear
* An "Edit metadata" menu item that causes the "Edit metadata" screen to appear
* A "Playlists" menu item that causes the "Playlists" screen to appear
* A "Settings" menu item that causes the "Settings" screen to appear

#### Settings Screen

The "Settings" screen includes:
* A dropdown to select the current server URL from the list
    * All calls to the server API are sent to this URL
* A dropdown to select the current player URLfrom the list
    * All calls to the player API are sent to this URL
* A button to request the scan of the music library on the current server
* A button to request the deletion of all data from the DB and the re-scan of the music library on the current server

#### Home Screen

When the application is first open, the "Home" screen is displayed. It includes:
* At the top, in the middle, a search bar followed by a button saying "Search Music Collection". When enter is pressed on the search bar or the button is clicked/tapped, the "Search Results" screen is opened and searches are launched looking for matches in the albums and tracks contained in the database.

#### Search Results Screen

The "Search Results" screen features at the top the same search bar present in the "Home" screen. Therefore, initiating new searches is possible from within the screen. Under the search bar, there is a section called "Albums" followed by a section called "Tracks".

* In the "Albums" section, the results are displayed as a maximum of 10 square album cards disposed in two rows of 5. Each card contains the artwork (as big as possible), the album title, the album artist and the stored album duration. If the screen size is small, the 10 results can be disposed on shorter rows (for example, 5 rows of 2 cards each). It should be determined from the screen size how many columns are viable.

* When more than 10 albums are found, a "View more" button is displayed and by pressing it 10 more cards are added to the section. When all the results have been displayed, the button is no longer shown.

* The list of results displayed in the "Albums" section is built by finding entries in the "albums" table of the database that match the search string in the following rows (strictly in this order):
    * title
    * album_artist

* When a card is clicked, the "Album" screen is opened on the selected album

* In the "Tracks" section, the results are displayed in horizonal lines (up to 10 of them). For each result, a miniature artwork is displayed along with the track title, the artist, the composer (if present) and the duration. In the rightmost position of the card, there is a play icon. When the play icon is pressed, the player queue is emptied, the track is added to the player queue, the playback starts, and the player bar is brought up to control the playback.

* When more than 10 tracks are found, a "View more" button is displayed and by pressing it 10 more tracks are added to the section. When all the results have been displayed, the button is no longer shown.

* The list of results displayed in the "Tracks" section is built by finding entries in the "tracks" table of the databse that match the search string in the following rows (strictly in this order):
    * title
    * artist
    * composer
    * keywords (taken from the "track_keywords" table)

* Clicking on the area of a track, opens the "Track" screen on the selected track

#### Album Screen

The "Album" screen is used to provide all information about an album and playback its tracks. The following is included.

* A header area containing the following:

    * On the left, the artwork of the album. The size is similar to the one of the album cards.

    * On the right of the artwork, the album information which consists of the following from top to bottom (if a field becomes too long, it is truncated and an ellipsis is added):
        * The album title
        * The album artist
        * If present, the composers, extracted from all the tracks of the album (removing duplicates)
        * The year, extrapolated from the first track of the album
        * The number of tracks and the stored album duration separated by a hyphen

    * Anchored to the far right of the header, a left arrow that sends you back to the previous screen
            
* Under the header, a keyword area that contains the keyword boxes. They can be on multiple lines but also more than one in each line.
        * Keywords extracted from the DB are represented as filled rounded rectangular boxes with the keyword written in them. The box is just as long as the keyword, so different keywords might be inserted into differently sized boxes.
        * The keyword boxes are layed horizontally in the keyword area and there can be multiple lines of them, if necessary

* Under the keyword area, two buttons laid horizontally and justified to the right of the screen:
    * A "Play" button - when pressed, it empties the player queue, adds all the tracks of the album (by disc number and by track number) to the player queue, and triggers the playback
    * An "Add to queue" button - when pressed, it adds all the tracks of the album (by disc number and by track number) to the player queue

* Under all of the above, the songs are listed in order of disc number and track number. If there is more than one disc, the different discs are clearly separated in section called "Disc 1", "Disc 2", etc. For each track, the following is displayed:
    * track number
    * title
    * artist - reported under the title in a smaller font and only when the artist and the album artist are different
    * duration
    * A play icon that empties the player queue, adds the track to it and triggers the playback
    * An "add to queue" icon that adds the track to the player queue

* Clicking on the area of a track, opens the "Track" screen on the selected track
    
#### Track Screen

The "Track" screen is used to provide all information about a track and play it back. The following is included.

* A header area containing the following:

    * On the left, a "Previous track" button that opens the "Track" screen on the track that precedes the current track in the album. If this is the first track of the first disc of the album, the button is disabled.
    * At the center, the following from top to bottom (if a field becomes too long, it is truncated and an ellipsis is added):
        * The title
        * The artist
    * On the right, a "Next track" button that opens the "Track" screen on the track that follows the current track in the album. If this is the last track of the last disc of the album, the button is disabled.
    
    * Anchored to the far right of the header, a left arrow that sends you back to the previous screen
    
* Under the header, the area on the screen is split into two panels.

* The left panel, contains the following from top to bottom (if a field becomes too long, it is truncated and an ellipsis is added):
    * If present, the composer
    * The year
    * The duration of the track
    * If there is a "total discs" value greater than 1, then the "disc number" followed by a slash and the "total discs"
    * The "track number" followed by a slash and the "total tracks"
    * The keyword boxes associated with the track. They are displayed horizontally and, if necessary, on multiple lines.
    * Two buttons laid horizontally one after the other:
        * A "Play" button - when pressed, it empties the player queue, adds the track to the player queue, and triggers the playback
        * An "Add to queue" button - when pressed, it the track to the player queue

* The right panel contains the following from top to bottom (if a field becomes too long, it is truncated and an ellipsis is added):
    * The artwork - clicking on the artwork results in opening the "Album" screen on the album the track belongs to.
    * The album title
    * The album artist

* The left arrow back button in the "Album" and "Track" screens goes through all the history of previous screens until it lands on a main screen (for example the "Search Results" or the "Home screen).

#### Player Bar

* The "Player Bar" is located at the bottom of the screen and displays:
    * Artwork
    * Track title
    * Artist
    * Progress
    * Transport controls
    * Volume

* The "Player Bar" represents a view of the current state of the player. When the frontend is started, it does not remember its previous state, but it matches the state of the player currently selected.
    * When "Remote player" is configured in the top bar, the "Player bar" is kept in sync with the current status of the configured player. The "Player bar" is only made visible when the configured player has items in its queue.
    * When "This device" is configured, the player's functionality is replicated in the browser and the playback queue is maintained inside the browser similarly to what would happen with a remote player application.

* When the "Player Bar" has a slide element (similar to a paper being extracted from a file) that causes the "Queue Screen" to slide open.

#### Queue Screen

* The "Queue Screen" is brought up with an animation from the "Player Bar". Once the "Queue Screen" is fully displayed, the "Player Bar" disappears.

* The "Queue Screen" covers the whole screen. While it is up, it is not possible to access any of the standard buttons like "Home" or "Settings".

* The "Queue Screen" has an element at the top that causes it to slide down and disappear. Once it is disappeared, the "Player Bar" is displayed again.

* The "Queue Screen" displays:
    * To the left a big image of the artwork
    * On the right of the artwork, all the metadata of the track (only when available):
        * Title
        * Artist
        * Album
        * Album artist - Only when different from Artist
        * Composer
        * Year
        * Duration
        * Disc number / Total discs (only if all the information is available and there is not just one disk)
        * Track number / Total tracks (only if all the information is available and there is not just one disk)
        * Keyword boxes
    * Below the artwork and metadata, the same transport controls available in the "Player Bar"
    * Below the transport controls, the same progress bar that is displayed in the "Player Bar"

* On the right of the "Queue Screen", there is an item indicating a hidden panel. By clicking on it, the "Queue Panel" is slide open from the right. The panel contains a vertical (potentially scrollable) list of all the tracks currently in the queue (obtained from the player). Each lines contains a small workart, the title of the track, the artist and the duration. The track that is currently playing (or paused on) is highlighted.

* Next to each track in the "Queue Panel" there is an icon to remove the track from the queue. The removal is reflected in the actual queue within the Player application. If the track is the currently playing track (or paused on), the playback is stopped and the following track becomes active. The following rules apply:
    * If the current track was paused, the track that replaces it as the active track shall start as paused
    * If there is no following track, the previous track becomes active
    * If there are no following and no previous tracks in the queue, then the "Queue Screen" slides down and at the end no "Player Bar" shall be visible


#### Edit Metadata Screen

The "Edit metadata" screen has the purpose to browse the library on the server and change some of the ID3 tags. This causes changes to both the audio files and the DB. After changes have been made to the files, the library scan server API is invoked to update the DB.

The screen is divided into three tabs: "Add/remove tags", "Edit album metadata" and "Edit track metadata".

* The "Add/remove tags" tab consists of:

    * At the top a search bar, identical to the one on the Home screen.

    * A "Filter by tags" section, in which all keywords appear in alphabetical order in their boxes, displayed horizontally on multiple lines. Multiple keywords can be selected and the grid of album cards is updated only featuring the albums for which ALL tracks contain all of the selected keywords.

    * An "Exclude tags" section, in which all keywords appear in alphabetical order in their boxes, displayed horizontally on multiple lines. Multiple keywords can be selected and the grid of album cards is updated excluding all albums for which ALL tracks contain at least one of the selected keywords.
    
    * A grid of square album cards, initially set to contain all the albums in the library. Initially, only 20 albums are displayed, but 20 at a time can be added by clicking a "View more" button. The size and disposition of the album cards is the same as in the "Search Results" screen.
        * The contents of the grid of album cards change by using the search bar. The search words are matched against: the album title, the album artist, as well as the title, artist, composer and keywords of the tracks belonging to the album.
        
    * An "Edit keywords" area that has:
        * on the left, the keywords that are common to all the tracks of all the albums currently selected. The keywords are displayed in their typical boxes horizontally and, if needed, there can be multiple lines of them. 
        * on the right, two buttons:
            * "Add tag" - only active when at least one album card is selected. When pressed, a panel is opened containing a text box to input the desired keyword. The panel also displays a list of existing keywords (in their typical boxes)that can be used as a shortcut to populate the text box. On pressing OK, the keyword is added to all the tracks of all the selected albums. This is done by calling the server API.
            * "Remove tag(s)" - only active when at least one keyword is selected. When pressed it opens a message asking for confirmation and then proceeds to remove one by one the selected keywords from all the tracks of all the selected albums. This is done by calling the server API.

* The "Edit album metadata" tab looks exactly the same as the "Add/remove tags" screen, but instead of selecting the albums, clicking on a card results in the contents of the tab switching to the "Edit album" screen.

* The "Edit album" screen displays the following:
    * On the top right of the screen, there is an arrow left button that sends you back to the previous screen.
    * On the left, the album card of the selected album. The size is the same as in the "Album" screen.
    * To the right of the card, edit boxes for the following fields:
        * Album title
        * Album artist
        * Artist
        * Composer
        * Year
    The fields are pre-populated with the current values of the metadata of all the tracks in the album. If the values for a field are not consistent across all tracks, the field will display in italic the string "Varies across tracks" (when edited, string is removed and the input text is not in italic anymore). After the fields, there are two buttons:
        * "Reset" - restores the values of the fields from the metadata of the files
        * "Save" - saves into the metadata of all tracks in the album the values of all fields that are not displaying "Varies across tracks". Text boxes left blank cause any data in those fields to be replaced by an empty string. The metadata is actually saved in the files in the server. Then the library scan is invoked to update the DB.
    * Under the card, for a space just as long as the card, the keyword boxes are displayed for all the keywords that are present in all the tracks of the album.
    * Under the keywords, there are two buttons: "Add tag(s)" and "Remove tag(s)". They behave exactly as the similar buttons in the "Add/remove tags" tab, but they only work on the current album instead of a collection of selected albums.
    * Under all the aforementioned, all the tracks are listed, similarly to the "Album" screen, but without the duration. On the right side of each track is an "Edit" Button that results in the tab contents to switch to the "Edit track" screen.

* The "Edit track metadata" screen displays the following:
    * A search bar used to search tracks by title, artist or composer
    * Under the search bar, 20 tracks are listed (with a "View more" button to add 20 more at a time until exhaustion)
    * On the right of each track is an "Edit" Button that results in the tab contents to switch to the "Edit track" screen.

* The "Edit album" screen displays the following:
    * On the top right of the screen, there is an arrow left button that sends you back to the previous screen.
    * Edit boxes for the following fields:
        * Track title
        * Artist
        * Album title
        * Album artist
        * Artist
        * Composer
        * Year
    The fields are pre-populated with the current values of the metadata of the track. After the fields, there are two buttons:
        * "Reset" - restores the values of the fields from the metadata of the file
        * "Save" - saves into the metadata of the track the values of all fields. Text boxes left blank cause any data in those fields to be replaced by an empty string. The metadata is actually saved in the files in the server. Then the library scan is invoked to update the DB.
    * Under the fields, the keyword boxes are displayed for the keywords that are present in the track.
    * Under the keywords, there are two buttons: "Add tag(s)" and "Remove tag(s)". They behave exactly as the similar buttons in the "Edit album" tab, but they only work on the current track.

#### Playlists Screen

#### General Requirements

* All durations are fetched from the DB in seconds, but they are always displayed as 'h:mm:ss' with no leading zeroes for the hours while minutes and seconds always have two digits
    * If a duration is less than 1 hour, then it should represented as 'm:ss' with no leading zeroes for the minutes while the seconds always have two digits

## Player

### Responsibilities

* managing the playback sessions
* add a track to the playback queue
* play a track from the queue
* pause the current track
* seek to a position within the current track
* move to the next/previous track in the queue
* maintain the queue
* expose the playback status to the frontend
* set the volume

### Main Architectural Points

* Written in Go
* Built for the following platforms:
	* macOS
    * Raspberry Pi
* HTTP REST API exposed on port 3002
* Using WebSockets to maintain the session and export playback status
* Using Media Player Daemon (mdp) for playback
* he Player doesn't need to talk to the Server directly; it just streams whatever URL the Frontend gives it
