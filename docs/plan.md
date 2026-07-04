# Fantuz Media Server - Implementation Plan

## Phase 1: Edit Metadata Screen
- [ ] Implement Server APIs for physical file tag editing:
  - [ ] Add dependency or write custom tag modification helpers for supported file formats (MP3 ID3v2, FLAC/Ogg Vorbis Comments).
  - [ ] Implement `GET /api/library/keywords` handler to list all unique library keywords in alphabetical order.
  - [ ] Implement `POST /api/library/albums/keywords` to add keywords to all tracks of specified albums physically on disk and update the database.
  - [ ] Implement `DELETE /api/library/albums/keywords` to remove keywords from tracks of specified albums physically on disk and update the database.
  - [ ] Add unit tests for tag-writing logic and endpoints.
- [ ] Implement Edit Metadata Frontend UI:
  - [ ] Add "Edit metadata" sidebar navigation item and route casing.
  - [ ] Implement "Edit metadata" layout with tabs: "Add/Remove tags", "Edit track metadata", "Edit album metadata".
  - [ ] Implement "Add/Remove tags" tab features:
    - [ ] Search bar matching keywords, album metadata, and track metadata.
    - [ ] Alphabetical "Exclude" keywords list rendering, with multi-select logic to filter out matching albums.
    - [ ] Album grid display (20 items initially, paginated by "View more" button increments).
    - [ ] "Edit keywords" bottom area listing keywords common to all selected albums.
    - [ ] "Add keyword" dialog/panel displaying a text input and suggestion shortcut chips of existing library keywords.
    - [ ] "Remove keyword(s)" action with confirmation modal.
  - [ ] Implement automated integration test coverage for keyword additions, exclusions, and removals.


## Phase 2: Integration & Testing
- [ ] Set up Playwright in the `frontend` project.
- [ ] Write E2E tests simulating a user configuring the server, browsing the library, and initiating playback.
- [ ] Ensure applications run correctly directly from the `deploy` directories during testing as specified in `architecture.md`.