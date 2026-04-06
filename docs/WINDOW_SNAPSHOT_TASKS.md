# Window Snapshotting - Future Tasks

Here is a list of features, fixes, and improvements to tackle next for the window snapshot rendering system.

## 1. Controlled Snapshot API (Hooks)
- [ ] Create a hook (e.g., `useWindowSnapshot()`) so child components or developers can manually trigger, update, or invalidate the snapshot.
- [ ] Provide fine-grained control over when a snapshot should be taken, rather than exclusively relying on hover blur.

## 2. Resolution and Cropping Accuracy
- [x] Correct the snapshot dimensions and scaling (DPI/device pixel ratio) to ensure it results in a perfect 1:1 match with the rendered React element.
- [ ] Ensure that *only* the real inner content is captured, trimming out unnecessary padding, margins, or transparent layers that might distort the image.

## 3. Consistency & Freshness
- [ ] Guarantee that the snapshot always represents the absolute *latest* changes before the window falls into the background (avoiding off-by-one frame lag or capturing intermediate states).

## 4. Tauri Native vs JS
- [ ] **Test Webview2/Tauri Capture:** Explore bypassing `html2canvas` by investigating Tauri's native webview capture APIs to grab the exact pixel buffer. This theoretically offloads the capture process from the JS main thread to the native OS/Webview2 engine, significantly improving capture speed and fidelity.
