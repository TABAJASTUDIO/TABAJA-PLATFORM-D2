# Tabaja Card Designer V8.1 Production Edition

## V8.1 Auto Face Crop Beta
- Auto Face Center + Auto Crop for employee photos.
- Consistent head sizing and safe photo-frame clipping.
- Multiple-face warning.
- Smart Center Crop fallback when face detection is unavailable.
- Employee photo filenames may start with the ID and continue with the employee name.

# Tabaja Card Designer V4.3

Production update built on the original GitHub project.

## Login
- Username: `admin`
- Password: `Tabaja@2026`

## Included
- Login, Keep me signed in, Logout
- Landscape and Portrait CR80 card design
- Front and Back sides
- Export PNG at 1011×638 or 638×1011
- Built-in PDF export without jsPDF
- High-quality Print Current and Print Front + Back
- Fill Card, Fit Inside, Crop Mode, Reset Image
- Rotate selected image 90 degrees
- Save/Open project with orientation
- QR, barcode and NFC link tools

Upload `index.html`, `app.js`, and `style.css` to the repository root.
The old `scripts` and `styles` folders are not used by this version.

## V4.3 print repair
- Print Current and Print Front + Back now create a print-ready CR80 PDF.
- Both sides are flattened to full-colour JPEG with a solid white base.
- A small bleed is applied only to printing to prevent a white strip at the card edge.
- Cache-busting version tags ensure GitHub Pages loads the new CSS and JavaScript.


## V4.3 fixes
- Direct print dialog without opening a blob/PDF tab
- Exact CR80 print page with bleed to remove the lower white strip
- Back Fill Card stretches artwork exactly to the card without cropping
- Front Fill Card behaviour remains unchanged


## V4.3 Print Size Fix
- Print page now uses the exact canvas pixel size instead of millimetres.
- Fixes cards appearing small inside the Zebra custom pixel page.
- Front and Back Fill Card behaviour remains unchanged.


## V4.4 exact-size print repair
- Browser direct printing was removed because Edge exposes Zebra CR80 stock as a pixel-sized page and scales the artwork down.
- Print buttons now generate an exact CR80 PDF using a physical PDF MediaBox of 85.60 × 53.98 mm.
- Open the downloaded PDF and print with Actual size / 100%.


## V4.5 final print bleed
- Added 0.80 mm bleed on all four sides for print output only.
- Design canvas, Fill Card, rotate, front/back, and exact CR80 PDF sizing are unchanged.


## V4.6 bottom-edge correction
- Kept 0.80 mm bleed on left, right and top.
- Increased only the bottom print bleed to 1.60 mm to remove the remaining thin white strip.
- No other design, fill, rotate, front/back or PDF-size behaviour was changed.


## V4.7 layered final print engine
- Print bleed is applied only to the background layer.
- Text, logos, QR codes, barcodes, photos and other foreground objects remain at exact CR80 size and position.
- Prevents the bottom edge correction from cutting or enlarging important card content.
