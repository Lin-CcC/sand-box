# Material Package Explorer Toolbar (VSCode-like) — Design

Date: 2026-03-30  
Scope: Left panel “我的素材包” tree (`MaterialPackageNavPanel`) top-row toolbar at `TUAN-CHAT` header line.

## Goals

- Make the left material tree behave more like a file explorer (VSCode mental model).
- Provide fast, predictable creation/import/refresh actions without clutter.
- Keep data model aligned with PRD: package cannot be nested; inside a package only `folder` + `material`.

## Non-goals (for this iteration)

- Full right-click context menu parity with VSCode.
- True filesystem semantics (IDs, file metadata, file operations outside current PRD tree).
- Backend “partial update” APIs; we continue “whole content JSON save” as current mock/backend approach.

## Terminology (PRD-aligned)

- **素材箱 / 素材包 / package**: top-level unit (cannot contain another package).
- **folder**: exists only inside a package.
- **file**: UI term; implementation maps to PRD’s `material` node. File “extension” is part of `material.name` (e.g. `foo.psd`).

## Placement & Visual Style

- Toolbar appears **on the right side of the `TUAN-CHAT` row** (same row that currently renders “TUAN-CHAT” as a section label).
- VSCode-like visibility:
  - Default: low-emphasis / subtle.
  - On hover of the `TUAN-CHAT` row (or when tree area is focused): icons become fully visible.

## Toolbar Actions (left-to-right)

1. **New File**: create a `material` node with custom name (supports any suffix).
2. **New Folder**: create a `folder` node.
3. **New Package**: create a new top-level package (素材箱).
4. **Import Local**: pick local files and import into target directory.
5. **Refresh**: re-fetch package list and current details (best-effort).
6. **Reveal/Expand Selection**: expand ancestor folders and scroll selected row into view.

## Target Directory Resolution (key behavior)

All actions that create/import inside a package must resolve a **target folder path**:

### If package count == 0 (no packages yet)

- Only **New Package** is enabled.
- **New File / New Folder / Import Local / Reveal** are disabled with tooltip: “还没有素材箱，先创建一个”。
- Optional UX polish (non-blocking): clicking a disabled action can open the New Package prompt directly.

### If there is a selection

- Selected **folder**: target = that folder.
- Selected **file/material**: target = its parent folder.
- Selected **package**: target = that package root.

### If there is no selection

- If package count == 1: target = the only package root.
- If package count > 1: show **Choose Package** dialog.
  - Remember last chosen package as “default target package” for subsequent operations (until page reload).

### Constraints

- **New Package** never depends on target selection; it always creates at top-level.
- Creating folder/file/import requires a resolved target package (either from selection or dialog).

## New File (material) semantics

- Prompt user for name with extension, VSCode-like (e.g. default `新文件.txt`).
- Create `material` with:
  - `name`: user input
  - `note`: empty
  - `messages: []` (explicitly allowed empty; preview shows an empty-state)
- After creation, optionally auto-select it and enter rename mode (future polish; not required to ship the core toolbar).

## Name conflicts (New File / New Folder / New Package)

We need deterministic behavior when the user enters a name that already exists in the target scope.

- **Within a folder (folder children names):** treat names as **exact-match unique** (current implementation uses exact string comparisons).
- **New File / New Folder** (inside a package folder):
  - If the name already exists among siblings (same type or different type), **auto-rename** by appending ` (1)`, ` (2)`… until unique (VSCode-like).
  - Show a subtle toast/hint: `已存在，已重命名为 <newName>`.
- **New Package** (top-level list):
  - Allow duplicate package names at the data level, but for UX we also **auto-rename** to avoid confusion in the tree.

Note: case-sensitivity follows exact string match for now (e.g. `A.png` and `a.png` are considered different). If we later decide to be case-insensitive (Windows-like), we will normalize comparisons at a single helper.

## Import Local: name conflicts

When importing into a folder, if any incoming file name collides with existing `material.name`:

- Show a dialog listing conflicts and ask user:
  - **Overwrite**: replace the existing target material’s content with the imported content.
  - **Auto Rename**: create/import with renamed file names (append ` (1)`, ` (2)` etc, matching VSCode pattern).
  - **Cancel**

Notes:
- Only conflicts for files (materials) matter; folders are not created via import in this scope.
- The dialog is per import batch; apply decision to all conflicts in the batch (simple UX).

### Import mapping (local file → material.messages)

Implementation should reuse the current “import” mapping used by the preview window (`MaterialPreviewFloat`) so behavior is consistent:

- Image (`.png/.jpg/.jpeg/.webp/.gif/.bmp`):
  - create one message: `messageType: 2`, `annotations: ["图片"]`, `extra.imageMessage = { url, fileName }`
- Audio (`.mp3/.wav/.ogg/.flac/.m4a`):
  - create one message: `messageType: 3`, `annotations: ["音频"]`, `extra.soundMessage = { url, fileName }`
- Text (`.txt/.md`):
  - create one message: `messageType: 1`, `annotations: ["文本"]`, `content = file.text()`
- Other:
  - create one message: `messageType: 1`, `annotations: ["文件"]`, `content = file.name`

URL behavior:
- In **mock/local** mode: `url = URL.createObjectURL(file)` (works for preview but is not durable across reloads).
- In **backend** mode (until upload API exists): set `url = ""` and still create the node; later we can upgrade to real upload + url.

### Import collisions within the same batch

- If two selected local files share the same name, treat it as a collision and apply the user’s choice consistently:
  - **Overwrite**: the latter file overwrites earlier result (deterministic order: file input order).
  - **Auto Rename**: rename within the batch as well using ` (1)`, ` (2)`… against the union of existing target names + names already assigned in this batch.

## Refresh behavior

- Re-run the “list my packages” query (React Query invalidate/refetch).
- If a preview is open/docked, it should continue functioning; it will naturally re-read package content via existing query keys.

## Reveal/Expand Selection

Given a selected item in the tree:

- Ensure its ancestor folders are expanded in `collapsedByKey` map (set them to `false`).
- Scroll the selected row into view within the tree container (`scrollIntoView({ block: "nearest" })`).

If there is no selection:

- If there is a remembered “default target package”, reveal that package row.
- Otherwise no-op (or show subtle hint).

## State/Model additions needed in `MaterialPackageNavPanel`

To support the above, the tree must maintain a “current selection”:

- `selectedNode` (in component state), enough to resolve:
  - `kind`: `package | folder | file`
  - `packageId`
  - `path` (folder path array)
  - `name` (node name)

Selection is set on single click on a row (package/folder/file). Double click continues to open preview as today.

## Compatibility notes (PRD)

- PRD enforces: “素材包不能包含子素材包”；this design keeps “New Package” strictly top-level.
- PRD internal structure is `root: MaterialNode[]` where `MaterialNode` is only `folder|material`; “file” is a UI name for `material`.
- Adding “file extension” support is purely name input; no new node type is introduced.

## Success Criteria

- User can create file/folder/import from the top toolbar with predictable target rules.
- When multiple packages exist and nothing is selected, the “Choose Package” dialog prevents ambiguity.
- Reveal/Expand Selection works and feels VSCode-like.

## Minimal error handling expectations

- Any create/import/save failure must show user feedback (toast/snackbar preferred; fallback to `alert` is acceptable for sandbox).
- On failure, do not partially update the local tree state (either apply changes after save succeeds, or revert on error).
