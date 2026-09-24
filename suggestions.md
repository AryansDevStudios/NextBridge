# Future Suggestions & Roadmap: PDF & Study Material Enhancements

This document tracks upcoming features and suggestions for the PDF viewer and study material modules to be implemented in future releases.

---

### 1. Night / Dark Reading Mode for PDFs
* **Concept:** Invert luminance and apply eye-friendly color filters to white PDF pages during late-night study sessions.
* **Implementation Plan:**
  * Toggle button in the PDF top/bottom toolbar.
  * Apply CSS filters to the PDF canvas/container: `filter: invert(0.88) hue-rotate(180deg) brightness(0.95) contrast(1.1);`.
  * Remember user's preferred reading mode in `localStorage` (`pdf_dark_mode: true`).

---

### 2. Quick Page Navigation & Page Thumbnails
* **Concept:** Jump quickly through lengthy textbooks (often 100+ pages) without endless scrolling.
* **Implementation Plan:**
  * Add a **"Jump to Page"** dialog (`[Input Page Number] / Total Pages`).
  * Add a thumbnail preview drawer at the bottom or side showing mini-renders of pages for rapid skimming.

---

### 3. In-Document Text Search
* **Concept:** Search keywords, definitions, formulas, or theorems inside NCERT & RS Aggarwal textbooks.
* **Implementation Plan:**
  * Search bar in PDF header using PDF.js text layer search API (`findController`).
  * Highlight matches with next/previous buttons and match counter (e.g. `3 of 12 matches`).

---

### 4. PDF Highlighting & Annotations
* **Concept:** Allow students to mark important formulas or definitions directly on their downloaded or cached PDFs.
* **Implementation Plan:**
  * Yellow/Green highlighter pen tool and freehand pen on an overlay SVG/canvas layer.
  * Store annotations locally linked to the document ID (`pdf_annotations_${item.id}`).
