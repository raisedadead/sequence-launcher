# Manual testing

Unit tests prove the logic only. Keyboard input, focus, and keys that reach the opened app need a person in Raycast. Run these checks after a change to the view, the input handling, or the launch path.

## Before you start

1. Run `npm run dev`.
1. Assign a hotkey to Sequence Launcher in Raycast Settings → Extensions.
1. Copy `examples/bindings.example.json` to a test file, and set **Bindings File** to it.

In development mode, each run appends events to `trace.jsonl` in the extension data folder (`~/Library/Application Support/com.raycast.macos/extensions/sequence-launcher/`). Count the `execute-request` events for each `invocation`: one valid sequence must give exactly one.

## Launch

| Check               | Steps                                                           | Expected result                                                |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| Open                | Press the hotkey.                                               | Only the top-level bindings show.                              |
| Slow sequence       | Type `e`, wait 1 second, type `d`.                              | Downloads opens without Return.                                |
| Fast sequence       | Type `ed` fast, 10 times.                                       | Each run opens Downloads one time; no stray letter in Finder.  |
| Application         | Type `f`.                                                       | Finder opens and has focus.                                    |
| Link                | Bind a `raycast://` deeplink of another command; type its keys. | That command opens; the row tag is Link.                       |
| Open With           | Set **Open With** on a website binding to a second browser.     | The row shows that app; the page opens in it.                  |
| Running application | With Finder open, type `f`.                                     | Finder comes to the front with focus.                          |
| Group               | Type `e`.                                                       | Only the Places bindings show; the title shows the breadcrumb. |
| Rows                | Look at each row.                                               | Each destination row has a type tag; a group shows its keys.   |
| Return              | Use the arrow keys and Return on a row.                         | Same result as typing the keys.                                |
| Paste               | Paste `ed`, then paste `zz`.                                    | `ed` opens Downloads; `zz` shows “No binding”.                 |
| Held key            | Hold `e` for 2 seconds.                                         | No launch; record what the field shows.                        |
| No message          | Type `ed`; open Downloads with Return; open it from Search.     | Each time Downloads opens; Raycast closes with no message.     |
| Fresh start         | After each launch above, press the hotkey again.                | The top-level bindings show; the search field is empty.        |

## Layouts

Grid is the default layout. Run the Launch and Recovery checks in Grid. Then set **Layout** to List and run them again. Also check these rows:

| Check      | Steps                                    | Expected result                                                       |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------- |
| Tiles      | Press the hotkey.                        | One tile per key: a large icon, the key as title, the label under it. |
| Long label | Look at a tile with a long label.        | Record whether Raycast wraps or cuts the label.                       |
| Tooltip    | Hover a tile.                            | The type and the path, host, or keys of the group.                    |
| Arrow keys | Use the arrow keys and Return on a tile. | Same result as typing the keys.                                       |
| List       | Set **Layout** to List; open again.      | Rows with the key, the label, the type tag, and the path or host.     |

## Recovery

| Check            | Steps                                                     | Expected result                                                |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| Invalid sequence | Type `q`.                                                 | “No binding for “q””; nothing opens.                           |
| Backspace        | Type `ex`, press Backspace 2 times.                       | The top-level bindings show again.                             |
| Escape           | Type `e`, press Escape, open again.                       | Nothing opens; the top-level bindings show.                    |
| Missing folder   | Point a folder binding at a folder that does not exist.   | A warning icon; on open, “Could not open”; Raycast stays open. |
| Unknown scheme   | Bind `nohandler://x`, then type its keys.                 | Record what Raycast shows; Retry stays available.              |
| Invalid file     | Add an unknown property to the file, then reload with ⌘R. | Errors with locations; sequences disabled.                     |
| Reload           | Correct the file, then press ⌘R.                          | The new bindings show.                                         |

## Editor

| Check           | Steps                                                            | Expected result                                                  |
| --------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Add             | Add an application, a folder, a website, and a group with ⌘N.    | Each binding shows; the file changes.                            |
| Duplicate key   | Add a binding with a key already used in that group.             | An error on the Key field; the file does not change.             |
| Suggested key   | At the top level, add "Fresh Mail" with an empty key.            | "Saved on key M" (F is taken); the row shows on M.               |
| Edit and delete | Edit a binding with ⌘E; delete a group with ⌃X.                  | The change shows; the group delete asks first.                   |
| Delete on fail  | Open a missing folder binding; press ⌃X and confirm.             | The group of that binding shows, not “No binding”.               |
| Changed on disk | Edit the file by hand, then save in the editor without a reload. | “The bindings file changed on disk” message; no write.           |
| Shortcuts       | Press ⌘K on a binding row, a group row, and in the form.         | Each shortcut in the README Keys table shows next to its action. |

## Search Bindings

| Check     | Steps                                     | Expected result                                 |
| --------- | ----------------------------------------- | ----------------------------------------------- |
| By label  | Open Search Bindings; type `down`.        | Downloads shows with the tag `E D`.             |
| By target | Type part of a folder path or a URL host. | The binding with that target shows.             |
| Open      | Press Return on a row.                    | The destination opens one time; Raycast closes. |

## Bind This

Give Bind This a hotkey first. Start it with that hotkey, not from the Raycast search, so that the other app stays in front.

| Check         | Steps                                                      | Expected result                                                    |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Finder folder | Select a folder in Finder; start Bind This.                | The title names the folder and "Finder selection".                 |
| Clipboard URL | Copy a URL; bring a non-Finder app to the front; start it. | The title names the URL host and "Clipboard".                      |
| Front app     | Copy plain text; bring an app to the front; start it.      | The title names that app and "Front app". Record if it is Raycast. |
| Nothing       | Start it from the Raycast search with plain text copied.   | "Nothing to bind", or record which app it takes.                   |
| Free key      | Type `e`, then a free key.                                 | `Bound E … · …`; Raycast closes; the launcher shows the binding.   |
| Suggested key | Press Return on the first row.                             | The binding saves on the suggested key.                            |
| Used key      | Type `ed`.                                                 | "E D opens Downloads"; Return replaces it; Backspace goes back.    |
| Type at once  | Press the hotkey and type a free key at once.              | The binding saves when the capture is ready.                       |
| One save      | Type a free key fast 2 times.                              | The file has one new binding.                                      |
