# SESSION MANAGER MV3
A Chrome extension for managing tabs and browser sessions efficiently, built to save, restore, and manage window sessions with tabs and tab groups.

Built for Manifest V3 (MV3). This is a modern MV3 version of the original Session Manager, keeping all the original functionality while adding dark theme and proper tab group support.

# Features

Save Session: Save all tabs and tab groups from the current window.

Open: Open a saved session once (works in normal or incognito window).

Add: Add the active tab to a saved session.

Replace: Replace all tabs in a saved session with the tabs from the current window, including tab groups.

Delete: Remove a saved session.

Rename: Click the pencil icon to rename a session inline.

Tab Info: Displays tab count, date/time of last save.

Import/Export: Save sessions as JSON and merge with existing sessions.

Reset: Restore extension to initial empty state.


# Installation (Developer Mode)

Clone or download this repository.

Open Chrome and go to: chrome://extensions.

Enable Developer mode (top-right).

Click Load unpacked and select the folder containing the extension files.

The extension icon should appear in your toolbar.

# Usage

Click the extension icon to open the popup.

Use Save to save your current window session and rename it how you want.

Click Open to open a saved session in the current window.

Use Reset to clear all sessions and restore the extension to mint functionality.

# Notes

Tab groups are fully preserved when saving and opening sessions.

The extension works in both normal and incognito windows automatically (go in extension details and click ' Allow in Incognito ')

Sessions are saved locally using Chrome storage.

# Credits

Originally based on [Session Manager MV2](https://github.com/tddyco/session-manager) by tddyco, fully upgraded to Manifest V3.
