# Changelog

All notable changes to PlexMate will be documented in this file.

## [1.0.0] - 2025-03-11

### Added
- Multi-channel support with dedicated admin channel
- Admin commands for managing Discord to Overseerr user mappings via Discord
- Pagination system for viewing and managing subscriptions
- Improved error handling and user feedback

### Changed
- Subscription management now uses an interactive, paginated menu
- Admin functionality now relies on Discord's permission system instead of user ID lists
- Enhanced feedback for subscription actions with better emoji reactions
- Improved episode subscription handling

### Fixed
- Fixed thumbs up/down reaction handling for episode subscriptions
- Fixed pagination in the unsubscribe command to handle users with more than 10 subscriptions
- Fixed ES modules compatibility issues
- Various code improvements and optimizations

### Security
- Admin commands are now restricted to the admin channel, using Discord's permission system
- Improved channel-based access control
