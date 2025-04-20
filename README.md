# Simple Tab Manager

A Chrome extension that helps you organize and manage your browser tabs efficiently.

## Features

- **Clean Tabs**: One-click solution to remove duplicates and sort tabs
- **Consolidate Windows**: Merge all windows into the current window
- **Sort Tabs**: Alphabetically sort tabs by title
- **Remove Duplicates**: Close duplicate tabs while keeping the first occurrence
- **Close Blank Tabs**: Remove all blank/new tabs
- **Keyboard Shortcuts**: Quick access to all features
- **Preserve Pinned Tabs**: Option to maintain pinned tabs in their original positions

## Keyboard Shortcuts

- `Alt+Shift+C`: Clean Tabs (Remove Duplicates, Sort)
- `Alt+Shift+G`: Consolidate All Windows
- `Alt+Shift+S`: Sort Tabs
- `Alt+Shift+D`: Remove Duplicate Tabs

## Installation

1. Download the extension from the [Chrome Web Store](https://chrome.google.com/webstore/detail/simple-tab-manager/...)
2. Click "Add to Chrome"
3. Confirm the installation

## Usage

1. Click the Simple Tab Manager icon in your Chrome toolbar
2. Choose from the following actions:
   - **Clean Tabs**: Performs a complete cleanup (remove duplicates and sort)
   - **Consolidate Windows**: Merges all windows into the current window
   - **Sort Tabs**: Sorts tabs alphabetically
   - **Remove Duplicates**: Closes duplicate tabs
   - **Close Blank Tabs**: Closes all blank/new tabs

3. Use the "Preserve pinned tabs" toggle to maintain pinned tabs in their original positions

## Development

### Prerequisites

- Chrome browser
- Basic understanding of JavaScript and Chrome Extension development

### Setup

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

### Project Structure

```
simple-tab-manager/
├── manifest.json      # Extension configuration
├── background.js      # Background service worker
├── popup.html         # Extension popup interface
├── popup.js           # Popup functionality
├── styles.css         # Main styles
├── popup.css          # Popup-specific styles
└── icons/             # Extension icons
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Chrome Extensions Documentation
- Chrome Web Store Guidelines 