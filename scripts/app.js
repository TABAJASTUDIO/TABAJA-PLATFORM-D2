const CARD = {
  landscape: { w: 1011, h: 638, mmW: 85.6, mmH: 53.98 },
  portrait:  { w: 638, h: 1011, mmW: 53.98, mmH: 85.6 }
};

const LOGIN_USER = "admin";
const LOGIN_PASSWORD = "Tabaja@2026";
const LOGIN_KEY = "tabaja_card_designer_login";

const $ = id => document.getElementById(id);
let orientation = "landscape";
let { w: W, h: H } = CARD[orientation];
let canvas = new fabric.Canvas("cardCanvas", {
  backgroundColor: "#ffffff",
  preserveObjectStacking: true
});
canvas.setDimensions({ width: W, height: H });

let sides = { front: null, back: null };
let currentSide = "front";
let pendingImageRole = "image";
let cropMode = false;

function status(msg) { $("status").textContent = msg; }
function showApp() { $("loginScreen").classList.add("hidden"); $("appShell").classList.remove("hidden"); setTimeout(() => canvas.calcOffset(), 0); }
function showLogin() { $("appShell").classList.add("hidden"); $("loginScreen").classList.remove("hidden"); $("loginPassword").value = ""; $("loginError").textContent = ""; }

function isLoggedIn() {
  return localStorage.getItem(LOGIN_KEY) === "1" || sessionStorage.getItem(LOGIN_KEY) === "1";
}

$("loginForm").addEventListener("submit", e => {
  e.preventDefault();
  const user = $("loginUser").value.trim();
  const pass = $("loginPassword").value;
  if (user === LOGIN_USER && pass === LOGIN_PASSWORD) {
    localStorage.removeItem(LOGIN_KEY);
    sessionStorage.removeItem(LOGIN_KEY);
    ($("rememberLogin").checked ? localStorage : sessionStorage).setItem(LOGIN_KEY, "1");
    showApp();
  } else {
    $("loginError").textContent = "Incorrect username or password.";
  }
});

$("logoutBtn").onclick = () => {
  localStorage.removeItem(LOGIN_KEY);
  sessionStorage.removeItem(LOGIN_KEY);
  showLogin();
};

function snapshot() {
  return JSON.stringify(canvas.toJSON([
    "role", "originalScaleX", "originalScaleY", "originalLeft", "originalTop",
    "originalOriginX", "originalOriginY", "cropActive", "dataValue"
  ]));
}

function emptySnapshot(bg = "#ffffff") {
  return JSON.stringify({ version: "5.3.0", objects: [], background: bg });
}

function loadSnapshot(data) {
  return new Promise(resolve => {
    canvas.loadFromJSON(data || emptySnapshot(), () => {
      canvas.setDimensions({ width: W, height: H });
      canvas.renderAll();
      syncProps();
      resolve();
    });
  });
}

function saveCurrentSide() { sides[currentSide] = snapshot(); }

function syncCurrentBackgroundToOtherSide() {
  const syncControl = $("syncBackgroundBothSides");
  if (!syncControl || !syncControl.checked) return;

  saveCurrentSide();
  const otherSide = currentSide === "front" ? "back" : "front";
  const currentData = JSON.parse(sides[currentSide] || emptySnapshot());
  const otherData = JSON.parse(sides[otherSide] || emptySnapshot());

  otherData.background = currentData.background ?? "#ffffff";
  otherData.objects = (otherData.objects || []).filter(object =>
    object.role !== "background" && object.role !== "cardBackgroundImage"
  );
  sides[otherSide] = JSON.stringify(otherData);
}

async function switchSide(side) {
  saveCurrentSide();
  currentSide = side;
  await loadSnapshot(sides[side]);
  $("frontBtn").classList.toggle("active", side === "front");
  $("backBtn").classList.toggle("active", side === "back");
  status(side.toUpperCase() + " side");
}

function activeImage() {
  const o = canvas.getActiveObject();
  return o && o.type === "image" ? o : null;
}

function rememberImage(o) {
  if (o.originalScaleX == null) {
    o.originalScaleX = o.scaleX;
    o.originalScaleY = o.scaleY;
    o.originalLeft = o.left;
    o.originalTop = o.top;
    o.originalOriginX = o.originX;
    o.originalOriginY = o.originY;
  }
}

function clearClip(o) {
  o.clipPath = null;
  o.cropActive = false;
  cropMode = false;
  $("cropBtn").classList.remove("active");
}

function cardClip() {
  return new fabric.Rect({ left: 0, top: 0, width: W, height: H, absolutePositioned: true });
}

function fillCard() {
  const o = activeImage();
  if (!o) return status("Select an image first.");
  rememberImage(o);
  clearClip(o);

  if (currentSide === "back") {
    // The back side must show the complete supplied artwork without cropping.
    // Stretch it exactly to CR80 dimensions so one click is enough.
    o.set({
      scaleX: W / o.width,
      scaleY: H / o.height,
      left: W / 2,
      top: H / 2,
      originX: "center",
      originY: "center"
    });
    status("Back fitted exactly to the card — no crop.");
  } else {
    // Keep the proven front-side cover behaviour unchanged.
    const scale = Math.max(W / o.width, H / o.height);
    o.set({
      scaleX: scale,
      scaleY: scale,
      left: W / 2,
      top: H / 2,
      originX: "center",
      originY: "center"
    });
    status("Fill Card applied.");
  }

  o.setCoords();
  canvas.requestRenderAll();
}

function fitInside() {
  const o = activeImage();
  if (!o) return status("Select an image first.");
  rememberImage(o);
  clearClip(o);
  const scale = Math.min(W / o.width, H / o.height);
  o.set({ scaleX: scale, scaleY: scale, left: W / 2, top: H / 2, originX: "center", originY: "center" });
  o.setCoords();
  canvas.requestRenderAll();
  status("Fit Inside applied.");
}

function toggleCrop() {
  const o = activeImage();
  if (!o) return status("Select an image first.");
  rememberImage(o);
  cropMode = !cropMode;
  if (cropMode) {
    o.clipPath = cardClip();
    o.cropActive = true;
    $("cropBtn").classList.add("active");
    status("Crop Mode ON: move or resize the image.");
  } else {
    clearClip(o);
    status("Crop Mode OFF.");
  }
  canvas.requestRenderAll();
}

function resetImage() {
  const o = activeImage();
  if (!o) return status("Select an image first.");
  if (o.originalScaleX != null) {
    o.set({
      scaleX: o.originalScaleX,
      scaleY: o.originalScaleY,
      left: o.originalLeft,
      top: o.originalTop,
      originX: o.originalOriginX || "left",
      originY: o.originalOriginY || "top"
    });
  }
  clearClip(o);
  o.setCoords();
  canvas.requestRenderAll();
  status("Image reset.");
}

function rotateImage90() {
  const o = activeImage();
  if (!o) return status("Select an image first.");
  o.rotate(((o.angle || 0) + 90) % 360);
  o.setCoords();
  canvas.requestRenderAll();
  $("rotation").value = o.angle || 0;
  status("Image rotated 90°.");
}

function addImageFromFile(file, role) {
  const r = new FileReader();
  r.onload = () => fabric.Image.fromURL(r.result, img => {
    img.set({ left: W / 2, top: H / 2, originX: "center", originY: "center", role });
    const maxW = role === "logo" ? W * 0.3 : W * 0.6;
    const maxH = role === "logo" ? H * 0.3 : H * 0.6;
    const s = Math.min(maxW / img.width, maxH / img.height);
    img.scale(s);
    rememberImage(img);
    canvas.add(img).setActiveObject(img);
    if (role === "background") {
      fillCard();
      canvas.sendToBack(img);
      img.selectable = true;
    }
    canvas.requestRenderAll();
    status(role + " added.");
  }, { crossOrigin: "anonymous" });
  r.readAsDataURL(file);
}

$("imageInput").onchange = e => {
  const f = e.target.files[0];
  if (f) addImageFromFile(f, pendingImageRole);
  e.target.value = "";
};
function chooseImage(role) { pendingImageRole = role; $("imageInput").click(); }

$("addTextBtn").onclick = () => {
  const t = new fabric.IText("Your Text", { left: W / 2, top: H / 2, originX: "center", originY: "center", fontSize: 34, fill: "#111111" });
  canvas.add(t).setActiveObject(t);
  syncProps();
};
$("addImageBtn").onclick = () => chooseImage("image");
$("addLogoBtn").onclick = () => chooseImage("logo");
$("backgroundBtn").onclick = () => chooseImage("background");
$("fillBtn").onclick = fillCard;
$("fitBtn").onclick = fitInside;
$("cropBtn").onclick = toggleCrop;
$("resetImageBtn").onclick = resetImage;
$("rotateImageBtn").onclick = rotateImage90;

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}

function qrCanvasToVectorGroup(sourceCanvas, value) {
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const w = sourceCanvas.width, h = sourceCanvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  const dark = (x, y) => {
    const i = (y * w + x) * 4;
    return data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128 && data[i + 3] > 0;
  };
  let minX=w, minY=h, maxX=-1, maxY=-1;
  for (let y=0; y<h; y++) for (let x=0; x<w; x++) if (dark(x,y)) {
    if (x<minX) minX=x; if (x>maxX) maxX=x; if (y<minY) minY=y; if (y>maxY) maxY=y;
  }
  if (maxX < 0) throw new Error("Empty QR code");
  let unit = 0;
  for (let y=minY; y<=maxY; y++) {
    let last = dark(minX,y), run=1;
    for (let x=minX+1; x<=maxX; x++) {
      const now=dark(x,y);
      if (now===last) run++; else { unit = unit ? gcd(unit,run) : run; run=1; last=now; }
    }
    unit = unit ? gcd(unit,run) : run;
  }
  if (!unit || unit < 1) unit = 1;
  const cols = Math.round((maxX-minX+1)/unit);
  const rows = Math.round((maxY-minY+1)/unit);
  const rects=[];
  for (let r=0; r<rows; r++) {
    let c=0;
    while (c<cols) {
      if (!dark(Math.min(maxX, minX + Math.floor((c+0.5)*unit)), Math.min(maxY, minY + Math.floor((r+0.5)*unit)))) { c++; continue; }
      const start=c;
      while (c<cols && dark(Math.min(maxX, minX + Math.floor((c+0.5)*unit)), Math.min(maxY, minY + Math.floor((r+0.5)*unit)))) c++;
      rects.push(new fabric.Rect({ left:start, top:r, width:c-start, height:1, fill:"#000000", strokeWidth:0, selectable:false, evented:false }));
    }
  }
  rects.unshift(new fabric.Rect({ left:-4, top:-4, width:cols+8, height:rows+8, fill:"#ffffff", strokeWidth:0, selectable:false, evented:false }));
  return new fabric.Group(rects, { role:"qr", dataValue:value, originX:"center", originY:"center" });
}

$("qrBtn").onclick = () => {
  const v = prompt("Enter QR link or text:");
  if (!v) return;
  const d = document.createElement("div");
  new QRCode(d, { text: v, width: 600, height: 600, correctLevel: QRCode.CorrectLevel.H });
  setTimeout(() => {
    const qrCanvas = d.querySelector("canvas");
    if (!qrCanvas) return alert("QR code could not be created.");
    try {
      const group = qrCanvasToVectorGroup(qrCanvas, v);
      group.scaleToWidth(Math.min(W, H) * 0.35);
      group.set({ left: W / 2, top: H / 2, originX: "center", originY: "center" });
      canvas.add(group).setActiveObject(group);
      canvas.requestRenderAll();
      status("Vector QR added.");
    } catch (e) {
      alert("Vector QR could not be created: " + e.message);
    }
  }, 80);
};

$("barcodeBtn").onclick = () => {
  const v = prompt("Enter barcode value:");
  if (!v) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, v, { format: "CODE128", displayValue: true, width: 3, height: 120, margin: 10 });
    const markup = new XMLSerializer().serializeToString(svg);
    fabric.loadSVGFromString(markup, (objects, options) => {
      const group = fabric.util.groupSVGElements(objects, options);
      group.set({ role: "barcode", dataValue: v, left: W / 2, top: H / 2, originX: "center", originY: "center" });
      group.scaleToWidth(W * 0.42);
      canvas.add(group).setActiveObject(group);
      canvas.requestRenderAll();
      status("Vector barcode added.");
    });
  } catch (e) { alert("Invalid barcode value."); }
};

$("nfcBtn").onclick = async () => {
  const v = prompt("Enter NFC link:");
  if (!v) return;
  if ("NDEFReader" in window) {
    try {
      const n = new NDEFReader();
      await n.write(v);
      alert("NFC written successfully.");
    } catch (e) { alert("NFC could not be written: " + e.message); }
  } else {
    try { await navigator.clipboard.writeText(v); } catch (_) {}
    alert("Web NFC is unavailable here. The link was copied when permitted.");
  }
};

$("duplicateBtn").onclick = () => {
  const o = canvas.getActiveObject();
  if (!o) return status("Select an object first.");
  o.clone(c => {
    c.set({ left: (o.left || 0) + 25, top: (o.top || 0) + 25 });
    canvas.add(c).setActiveObject(c);
    canvas.requestRenderAll();
  }, ["role", "originalScaleX", "originalScaleY", "originalLeft", "originalTop", "originalOriginX", "originalOriginY", "cropActive", "dataValue"]);
};

$("deleteBtn").onclick = () => {
  const objects = canvas.getActiveObjects();
  if (!objects.length) return;
  objects.forEach(o => canvas.remove(o));
  canvas.discardActiveObject();
  canvas.requestRenderAll();
};

function syncProps() {
  const o = canvas.getActiveObject();
  if (!o) return;
  $("opacity").value = o.opacity ?? 1;
  $("rotation").value = o.angle ?? 0;
  if (o.type === "i-text" || o.type === "text") {
    $("textValue").value = o.text || "";
    $("fontSize").value = o.fontSize || 34;
    $("fontFamily").value = o.fontFamily || "Arial";
    $("textColor").value = toHex(o.fill || "#111111");
  }
}

function toHex(c) {
  if (typeof c === "string" && c.startsWith("#")) return c.length === 4 ? "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c;
  return "#111111";
}

canvas.on("selection:created", syncProps);
canvas.on("selection:updated", syncProps);
canvas.on("object:modified", syncProps);
$("textValue").oninput = e => { const o = canvas.getActiveObject(); if (o && (o.type === "i-text" || o.type === "text")) { o.set("text", e.target.value); canvas.requestRenderAll(); } };
$("fontSize").oninput = e => { const o = canvas.getActiveObject(); if (o && (o.type === "i-text" || o.type === "text")) { o.set("fontSize", +e.target.value); canvas.requestRenderAll(); } };
$("fontFamily").onchange = e => { const o = canvas.getActiveObject(); if (o && (o.type === "i-text" || o.type === "text")) { o.set("fontFamily", e.target.value); canvas.requestRenderAll(); } };
$("textColor").oninput = e => { const o = canvas.getActiveObject(); if (o) { o.set("fill", e.target.value); canvas.requestRenderAll(); } };
$("boldBtn").onclick = () => { const o = canvas.getActiveObject(); if (o) { o.set("fontWeight", o.fontWeight === "bold" ? "normal" : "bold"); canvas.requestRenderAll(); } };
$("italicBtn").onclick = () => { const o = canvas.getActiveObject(); if (o) { o.set("fontStyle", o.fontStyle === "italic" ? "normal" : "italic"); canvas.requestRenderAll(); } };
$("cardColor").oninput = e => {
  canvas.setBackgroundColor(e.target.value, () => {
    canvas.renderAll();
    saveCurrentSide();
    syncCurrentBackgroundToOtherSide();
  });
};
$("opacity").oninput = e => { const o = canvas.getActiveObject(); if (o) { o.set("opacity", +e.target.value); canvas.requestRenderAll(); } };
$("rotation").oninput = e => { const o = canvas.getActiveObject(); if (o) { o.rotate(+e.target.value); o.setCoords(); canvas.requestRenderAll(); } };

$("frontBtn").onclick = () => switchSide("front");
$("backBtn").onclick = () => switchSide("back");

function scaleSnapshot(json, sx, sy) {
  if (!json) return emptySnapshot();
  const data = JSON.parse(json);
  for (const o of data.objects || []) {
    if (typeof o.left === "number") o.left *= sx;
    if (typeof o.top === "number") o.top *= sy;
    if (typeof o.scaleX === "number") o.scaleX *= sx;
    if (typeof o.scaleY === "number") o.scaleY *= sy;
    if (typeof o.originalLeft === "number") o.originalLeft *= sx;
    if (typeof o.originalTop === "number") o.originalTop *= sy;
    if (typeof o.originalScaleX === "number") o.originalScaleX *= sx;
    if (typeof o.originalScaleY === "number") o.originalScaleY *= sy;
    if (o.clipPath && o.clipPath.absolutePositioned) {
      o.clipPath.width = CARD[orientation].w;
      o.clipPath.height = CARD[orientation].h;
    }
  }
  return JSON.stringify(data);
}

async function changeOrientation(next) {
  if (next === orientation) return;
  saveCurrentSide();
  const old = CARD[orientation];
  const neu = CARD[next];
  orientation = next;
  W = neu.w; H = neu.h;
  const sx = neu.w / old.w;
  const sy = neu.h / old.h;
  sides.front = scaleSnapshot(sides.front, sx, sy);
  sides.back = scaleSnapshot(sides.back, sx, sy);
  canvas.setDimensions({ width: W, height: H });
  $("canvasShell").classList.toggle("landscape", next === "landscape");
  $("canvasShell").classList.toggle("portrait", next === "portrait");
  $("orientationSelect").value = next;
  updateCardInfo();
  await loadSnapshot(sides[currentSide]);
  canvas.calcOffset();
  status(next === "portrait" ? "Portrait orientation." : "Landscape orientation.");
}

function updateCardInfo() {
  const c = CARD[orientation];
  $("cardInfo").textContent = `CR80 • ${c.mmW.toFixed(2)} × ${c.mmH.toFixed(2)} mm • ${orientation[0].toUpperCase() + orientation.slice(1)} • 300 DPI`;
}

$("orientationSelect").onchange = e => changeOrientation(e.target.value);

$("newBtn").onclick = async () => {
  if (!confirm("Start a new project?")) return;
  orientation = "landscape";
  W = CARD.landscape.w; H = CARD.landscape.h;
  sides = { front: emptySnapshot(), back: emptySnapshot() };
  currentSide = "front";
  canvas.setDimensions({ width: W, height: H });
  $("canvasShell").className = "canvas-shell landscape";
  $("orientationSelect").value = "landscape";
  updateCardInfo();
  await loadSnapshot(sides.front);
  $("frontBtn").classList.add("active");
  $("backBtn").classList.remove("active");
  status("New project.");
};

$("saveBtn").onclick = () => {
  saveCurrentSide();
  const project = { version: "4.1", orientation, front: sides.front, back: sides.back, currentSide };
  downloadBlob(new Blob([JSON.stringify(project)], { type: "application/json" }), "Tabaja-Card-Project.tabaja");
};

$("openBtn").onclick = () => $("projectInput").click();
$("projectInput").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const p = JSON.parse(r.result);
      orientation = p.orientation || "landscape";
      W = CARD[orientation].w; H = CARD[orientation].h;
      sides.front = p.front || emptySnapshot();
      sides.back = p.back || emptySnapshot();
      currentSide = p.currentSide || "front";
      canvas.setDimensions({ width: W, height: H });
      $("canvasShell").className = "canvas-shell " + orientation;
      $("orientationSelect").value = orientation;
      updateCardInfo();
      await loadSnapshot(sides[currentSide]);
      $("frontBtn").classList.toggle("active", currentSide === "front");
      $("backBtn").classList.toggle("active", currentSide === "back");
      status("Project opened.");
    } catch (err) { alert("Invalid project file."); }
  };
  r.readAsText(f);
  e.target.value = "";
};

function renderSnapshotToData(snapshotJson, format = "png", quality = 1) {
  return new Promise((resolve, reject) => {
    const tempEl = document.createElement("canvas");
    tempEl.width = W; tempEl.height = H;
    const temp = new fabric.StaticCanvas(tempEl, { width: W, height: H, backgroundColor: "#ffffff", renderOnAddRemove: false });
    temp.loadFromJSON(snapshotJson || emptySnapshot(), () => {
      try {
        temp.setDimensions({ width: W, height: H });
        temp.renderAll();
        const data = temp.toDataURL({ format, quality, multiplier: photoQualitySettings.highQuality ? 2 : 1, enableRetinaScaling: false });
        temp.dispose();
        resolve(data);
      } catch (e) {
        temp.dispose();
        reject(e);
      }
    });
  });
}

async function exportSide(side, format = "png", quality = 1) {
  const snapshotForSide = sides[side] || emptySnapshot();
  return renderSnapshotToData(snapshotForSide, format, quality);
}

function exportVisibleCanvas(format = "png", quality = 1) {
  canvas.discardActiveObject();
  canvas.renderAll();
  return canvas.toDataURL({
    format,
    quality,
    multiplier: photoQualitySettings.highQuality ? 2 : 1,
    enableRetinaScaling: false
  });
}

$("pngBtn").onclick = async () => {
  try {
    // Freeze the selected side before any async export work begins.
    const selectedSide = currentSide;
    saveCurrentSide();

    const both = confirm("Export Front and Back?\nOK = both sides\nCancel = current side only");

    if (!both) {
      // Export exactly what is visible on the editor right now.
      const data = exportVisibleCanvas("png", 1);
      downloadData(data, `Tabaja-Card-${selectedSide}-${orientation}-${photoQualitySettings.highQuality?600:300}DPI.png`);
      status(`${selectedSide.toUpperCase()} PNG exported.`);
      return;
    }

    // Export both sides inside ONE ZIP file. This avoids browser blocking
    // one of two automatic downloads and guarantees Front + Back are included.
    if (typeof JSZip === "undefined") {
      throw new Error("ZIP library did not load. Refresh the page and try again.");
    }

    const frozenSides = { front: sides.front, back: sides.back };
    const zip = new JSZip();

    for (const side of ["front", "back"]) {
      const data = await renderSnapshotToData(frozenSides[side], "png", 1);
      const base64 = data.split(",")[1];
      zip.file(`Tabaja-Card-${side}-${orientation}-${photoQualitySettings.highQuality?600:300}DPI.png`, base64, { base64: true });
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = zipUrl;
    a.download = `Tabaja-Card-Front-and-Back-${orientation}-300DPI.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
    status("Front and Back PNG exported inside one ZIP file.");
  } catch (e) { alert("PNG export failed: " + e.message); }
};

function dataUrlToBytes(dataUrl) {
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getDataUrlDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error("Could not read exported image dimensions."));
    img.src = dataUrl;
  });
}

function asciiBytes(text) { return new TextEncoder().encode(text); }
function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function buildJpegPdf(images, pxW, pxH, mmW, mmH) {
  const pageW = mmW * 72 / 25.4;
  const pageH = mmH * 72 / 25.4;
  const objects = [];
  const addObj = bytes => { objects.push(bytes); return objects.length; };
  const pagesId = 2;
  const pageIds = [];
  const imageIds = [];
  const contentIds = [];
  addObj(asciiBytes("<< /Type /Catalog /Pages 2 0 R >>"));
  addObj(asciiBytes("PAGES_PLACEHOLDER"));

  images.forEach((imgBytes, i) => {
    const imageId = addObj(concatBytes([
      asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`),
      imgBytes,
      asciiBytes("\nendstream")
    ]));
    imageIds.push(imageId);

    const content = asciiBytes(`q\n${pageW.toFixed(3)} 0 0 ${pageH.toFixed(3)} 0 0 cm\n/Im${i + 1} Do\nQ`);
    const contentId = addObj(concatBytes([
      asciiBytes(`<< /Length ${content.length} >>\nstream\n`), content, asciiBytes("\nendstream")
    ]));
    contentIds.push(contentId);

    const pageId = addObj(asciiBytes(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] /Resources << /XObject << /Im${i + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    ));
    pageIds.push(pageId);
  });

  objects[1] = asciiBytes(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

  const header = asciiBytes("%PDF-1.4\n%âãÏÓ\n");
  const bodyParts = [header];
  const offsets = [0];
  let offset = header.length;
  objects.forEach((obj, i) => {
    offsets.push(offset);
    const prefix = asciiBytes(`${i + 1} 0 obj\n`);
    const suffix = asciiBytes("\nendobj\n");
    bodyParts.push(prefix, obj, suffix);
    offset += prefix.length + obj.length + suffix.length;
  });

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  bodyParts.push(asciiBytes(xref));
  return concatBytes(bodyParts);
}

$("pdfBtn").onclick = async () => {
  try {
    saveCurrentSide();
    const both = confirm("Export Front and Back?\nOK = both sides\nCancel = current side only");
    const list = both ? ["front", "back"] : [currentSide];
    const jpegBytes = [];
    let exportSize = null;
    for (const side of list) {
      const jpeg = await exportSide(side, "jpeg", 0.98);
      if (!exportSize) exportSize = await getDataUrlDimensions(jpeg);
      jpegBytes.push(dataUrlToBytes(jpeg));
    }
    const c = CARD[orientation];
    const pdfBytes = buildJpegPdf(jpegBytes, exportSize.width, exportSize.height, c.mmW, c.mmH);
    downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), `Tabaja-Card-${orientation}.pdf`);
    status("PDF exported.");
  } catch (e) { alert("PDF export failed: " + e.message); }
};

async function printSides(list) {
  try {
    saveCurrentSide();

    // IMPORTANT: Edge reports the Zebra card stock as a pixel-sized sheet
    // (for example 1006 × 640 px). Browser HTML printing then treats those
    // pixels as 96-DPI CSS pixels and the Zebra driver scales the card down.
    // To preserve the real CR80 physical size, build a PDF whose MediaBox is
    // expressed in PDF points (85.60 × 53.98 mm), then download that exact file.
    const jpegBytes = [];
    let exportSize = null;
    for (const side of list) {
      const jpeg = await exportSide(side, "jpeg", 1);
      if (!exportSize) exportSize = await getDataUrlDimensions(jpeg);
      jpegBytes.push(dataUrlToBytes(jpeg));
    }

    const c = CARD[orientation];
    const pdfBytes = buildPrintJpegPdf(jpegBytes, exportSize.width, exportSize.height, c.mmW, c.mmH);
    const fileName = list.length === 2
      ? `Tabaja-PRINT-Front-Back-${orientation}-CR80.pdf`
      : `Tabaja-PRINT-${list[0]}-${orientation}-CR80.pdf`;

    downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), fileName);
    status("Exact-size CR80 PDF downloaded. Open it and print at Actual size / 100%.");
    alert("Exact-size CR80 print file downloaded.\n\nOpen the PDF, choose Zebra ZC300, then select Actual size / 100% and print.");
  } catch (e) {
    alert("Print preparation failed: " + e.message);
  }
}

function buildPrintJpegPdf(images, pxW, pxH, mmW, mmH) {
  const pageW = mmW * 72 / 25.4;
  const pageH = mmH * 72 / 25.4;
  // Exact CR80 layout: no software overscan or asymmetric shifting.
  // Printer edge alignment is handled separately in the Zebra driver.
  const drawW = pageW;
  const drawH = pageH;
  const objects = [];
  const addObj = bytes => { objects.push(bytes); return objects.length; };
  const pagesId = 2;
  const pageIds = [];

  addObj(asciiBytes("<< /Type /Catalog /Pages 2 0 R >>"));
  addObj(asciiBytes("PAGES_PLACEHOLDER"));

  images.forEach((imgBytes, i) => {
    const imageId = addObj(concatBytes([
      asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`),
      imgBytes,
      asciiBytes("\nendstream")
    ]));

    const content = asciiBytes(
      `q\n${drawW.toFixed(3)} 0 0 ${drawH.toFixed(3)} 0 0 cm\n/Im${i + 1} Do\nQ`
    );
    const contentId = addObj(concatBytes([
      asciiBytes(`<< /Length ${content.length} >>\nstream\n`),
      content,
      asciiBytes("\nendstream")
    ]));

    const pageId = addObj(asciiBytes(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] /CropBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] /Resources << /XObject << /Im${i + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    ));
    pageIds.push(pageId);
  });

  objects[1] = asciiBytes(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

  const header = asciiBytes("%PDF-1.4\n%âãÏÓ\n");
  const bodyParts = [header];
  const offsets = [0];
  let offset = header.length;

  objects.forEach((obj, i) => {
    offsets.push(offset);
    const prefix = asciiBytes(`${i + 1} 0 obj\n`);
    const suffix = asciiBytes("\nendobj\n");
    bodyParts.push(prefix, obj, suffix);
    offset += prefix.length + obj.length + suffix.length;
  });

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  bodyParts.push(asciiBytes(xref));
  return concatBytes(bodyParts);
}

async function snapshotToSvgElement(snapshotJson) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("canvas");
    const temp = new fabric.StaticCanvas(el, { width: W, height: H, backgroundColor: "#ffffff", renderOnAddRemove: false });
    temp.loadFromJSON(snapshotJson || emptySnapshot(), () => {
      try {
        temp.setDimensions({ width: W, height: H });
        temp.renderAll();
        const svgText = temp.toSVG({ width: W, height: H, viewBox: { x: 0, y: 0, width: W, height: H } });
        temp.dispose();
        const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
        const svg = doc.documentElement;
        if (svg.querySelector("parsererror")) throw new Error("SVG parser error");
        resolve(svg);
      } catch (e) { temp.dispose(); reject(e); }
    });
  });
}

async function buildVectorPdf(list, useBleed = false) {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF did not load. Check internet connection.");
  saveCurrentSide();
  const c = CARD[orientation];
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: c.mmW >= c.mmH ? "landscape" : "portrait", unit: "mm", format: [c.mmW, c.mmH], compress: true, hotfixes: ["px_scaling"] });
  for (let i=0; i<list.length; i++) {
    if (i) pdf.addPage([c.mmW, c.mmH], c.mmW >= c.mmH ? "landscape" : "portrait");
    const svg = await snapshotToSvgElement(sides[list[i]]);
    const bleed = useBleed ? 0.35 : 0;
    await pdf.svg(svg, { x: -bleed, y: -bleed, width: c.mmW + bleed*2, height: c.mmH + bleed*2 });
  }
  return pdf;
}

$("vectorPdfBtn").onclick = async () => {
  try {
    const both = confirm("Export Front and Back as VECTOR PDF?\nOK = both sides\nCancel = current side only");
    const list = both ? ["front", "back"] : [currentSide];
    status("Building vector PDF...");
    const pdf = await buildVectorPdf(list, false);
    pdf.save(`Tabaja-Card-V5-Vector-${orientation}.pdf`);
    status("V5 vector PDF exported.");
  } catch (e) { alert("Vector PDF failed: " + e.message); status("Vector PDF failed."); }
};

$("vectorPrintBtn").onclick = async () => {
  try {
    status("Building vector print PDF...");
    const pdf = await buildVectorPdf([currentSide], true);
    pdf.save(`Tabaja-PRINT-V5-Vector-${currentSide}-${orientation}-CR80.pdf`);
    status("Vector CR80 PDF downloaded. Print at Actual size / 100%.");
    alert("V5 VECTOR print file downloaded.\n\nOpen it and print at Actual size / 100%. Compare the small text with the stable PDF.");
  } catch (e) { alert("Vector print failed: " + e.message); status("Vector print failed."); }
};

$("printBtn").onclick = () => printSides([currentSide]);
$("printBothBtn").onclick = () => printSides(["front", "back"]);

function downloadData(data, name) {
  const a = document.createElement("a");
  a.href = data;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

canvas.setBackgroundColor("#ffffff", canvas.renderAll.bind(canvas));
sides.front = snapshot();
sides.back = snapshot();
updateCardInfo();
status("V5.0 VECTOR TEST — stable engine kept, vector PDF added.");
if (isLoggedIn()) showApp(); else showLogin();


// ===== V6.1 BETA: Employee Card Builder — working canvas generator =====
const V61_TEMPLATE_KEY = "tabaja_card_designer_v61_template";
const photoQualitySettings = {
  auto: true,
  brightness: 0.03,
  contrast: 0.06,
  saturation: 0.02,
  sharpness: 2,
  highQuality: true
};

function qualityEl(id){ return document.getElementById(id); }
function loadQualitySettings(){
  try{
    const saved=JSON.parse(localStorage.getItem('tabaja_v74_quality')||'null');
    if(saved && typeof saved==='object') Object.assign(photoQualitySettings,saved);
  }catch(_e){}
}
function saveQualitySettings(){ localStorage.setItem('tabaja_v74_quality',JSON.stringify(photoQualitySettings)); }
function syncQualityControls(){
  if(!qualityEl('autoEnhancePhotos')) return;
  qualityEl('autoEnhancePhotos').checked=!!photoQualitySettings.auto;
  qualityEl('photoBrightness').value=Math.round(photoQualitySettings.brightness*100);
  qualityEl('photoContrast').value=Math.round(photoQualitySettings.contrast*100);
  qualityEl('photoSaturation').value=Math.round(photoQualitySettings.saturation*100);
  qualityEl('photoSharpness').value=photoQualitySettings.sharpness;
  qualityEl('highQualityOutput').checked=!!photoQualitySettings.highQuality;
  qualityEl('brightnessValue').textContent=Math.round(photoQualitySettings.brightness*100)+'%';
  qualityEl('contrastValue').textContent=Math.round(photoQualitySettings.contrast*100)+'%';
  qualityEl('saturationValue').textContent=Math.round(photoQualitySettings.saturation*100)+'%';
  qualityEl('sharpnessValue').textContent=['Off','Light','Medium','Strong'][photoQualitySettings.sharpness]||'Medium';
}
function applyEmployeePhotoFilters(image){
  if(!image || image.role!=='employeePhoto') return;
  image.filters=[];
  if(photoQualitySettings.auto){
    if(Math.abs(photoQualitySettings.brightness)>0.001) image.filters.push(new fabric.Image.filters.Brightness({brightness:photoQualitySettings.brightness}));
    if(Math.abs(photoQualitySettings.contrast)>0.001) image.filters.push(new fabric.Image.filters.Contrast({contrast:photoQualitySettings.contrast}));
    if(Math.abs(photoQualitySettings.saturation)>0.001) image.filters.push(new fabric.Image.filters.Saturation({saturation:photoQualitySettings.saturation}));
    const sharp=photoQualitySettings.sharpness;
    if(sharp>0){
      const center=[1.10,1.22,1.36][sharp-1]||1.22;
      const edge=(1-center)/4;
      image.filters.push(new fabric.Image.filters.Convolute({matrix:[0,edge,0,edge,center,edge,0,edge,0]}));
    }
  }
  image.applyFilters();
  image.dirty=true;
}
function currentEmployeePhoto(){ return builderObject('employeePhoto'); }
function wireQualityTools(){
  loadQualitySettings(); syncQualityControls();
  const update=()=>{
    photoQualitySettings.auto=qualityEl('autoEnhancePhotos').checked;
    photoQualitySettings.brightness=Number(qualityEl('photoBrightness').value)/100;
    photoQualitySettings.contrast=Number(qualityEl('photoContrast').value)/100;
    photoQualitySettings.saturation=Number(qualityEl('photoSaturation').value)/100;
    photoQualitySettings.sharpness=Number(qualityEl('photoSharpness').value);
    photoQualitySettings.highQuality=qualityEl('highQualityOutput').checked;
    saveQualitySettings(); syncQualityControls();
  };
  ['autoEnhancePhotos','photoBrightness','photoContrast','photoSaturation','photoSharpness','highQualityOutput'].forEach(id=>qualityEl(id)?.addEventListener('input',update));
  qualityEl('applyEnhanceBtn')?.addEventListener('click',()=>{
    update(); const image=currentEmployeePhoto();
    if(!image) return alert('Select or preview an employee photo first.');
    applyEmployeePhotoFilters(image); canvas.requestRenderAll(); saveCurrentSide(); status('Photo enhancement applied.');
  });
  qualityEl('resetEnhanceBtn')?.addEventListener('click',()=>{
    Object.assign(photoQualitySettings,{auto:true,brightness:0.03,contrast:0.06,saturation:0.02,sharpness:2,highQuality:true});
    saveQualitySettings(); syncQualityControls();
    const image=currentEmployeePhoto(); if(image){applyEmployeePhotoFilters(image);canvas.requestRenderAll();saveCurrentSide();}
    status('Professional quality defaults restored.');
  });
}

let builderPhotoData = "";
let builderLogoData = "";
let builderBatchBackgroundData = "";

function builderStatus(message) { status(message); }

function readBuilderFile(input, onDone) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => builderStatus("Could not read the selected image.");
  reader.onload = () => onDone(String(reader.result || ""));
  reader.readAsDataURL(file);
}

$("builderPhoto").addEventListener("change", e => readBuilderFile(e.target, value => {
  builderPhotoData = value;
  builderStatus("Employee photo ready — press Generate / Update Card.");
}));
$("builderLogo").addEventListener("change", e => readBuilderFile(e.target, value => {
  builderLogoData = value;
  builderStatus("Company logo ready — press Generate / Update Card.");
}));

function builderObject(role) {
  return canvas.getObjects().find(object => object.role === role) || null;
}

function builderAddOrUpdateRect(role, props) {
  let object = builderObject(role);
  if (!object) {
    object = new fabric.Rect(Object.assign({ role, selectable: false, evented: false }, props));
    canvas.add(object);
  } else object.set(props);
  object.setCoords();
  return object;
}

function builderAddOrUpdateText(role, text, props) {
  let object = builderObject(role);
  const value = text || "";
  if (!object) {
    object = new fabric.Textbox(value, Object.assign({
      role,
      fontFamily: "Arial, Helvetica, sans-serif",
      editable: true,
      splitByGrapheme: false,
      lineHeight: 1.05
    }, props));
    canvas.add(object);
  } else {
    object.set(Object.assign({ text: value }, props));
  }
  object.setCoords();
  return object;
}

function fitBuilderText(object, maxFontSize, minFontSize = 12) {
  object.set({ fontSize: maxFontSize, scaleX: 1, scaleY: 1 });
  object.initDimensions();
  while ((object.height > object.heightLimit || object.width > object.widthLimit) && object.fontSize > minFontSize) {
    object.set({ fontSize: object.fontSize - 1 });
    object.initDimensions();
  }
  object.setCoords();
}

function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) return resolve(null);
    fabric.Image.fromURL(dataUrl, image => image ? resolve(image) : reject(new Error("Image could not be loaded.")), { crossOrigin: "anonymous" });
  });
}

async function builderAddOrUpdateImage(role, dataUrl, box) {
  const old = builderObject(role);
  if (!dataUrl) return old;
  const image = await imageFromDataUrl(dataUrl);
  const saved = old ? {
    left: old.left, top: old.top, angle: old.angle || 0,
    originX: old.originX || "center", originY: old.originY || "center"
  } : null;
  if (old) canvas.remove(old);
  const scale = Math.min(box.width / image.width, box.height / image.height);
  image.set({
    role,
    left: saved ? saved.left : box.left + box.width / 2,
    top: saved ? saved.top : box.top + box.height / 2,
    originX: "center", originY: "center",
    angle: saved ? saved.angle : 0,
    scaleX: scale, scaleY: scale
  });
  if (role === "employeePhoto") applyEmployeePhotoFilters(image);
  rememberImage(image);
  canvas.add(image);
  image.setCoords();
  return image;
}

function ensureBuilderPlaceholder(role, box, label) {
  let object = builderObject(role);
  if (!object) {
    object = new fabric.Rect({
      role, left: box.left, top: box.top, width: box.width, height: box.height,
      rx: 22, ry: 22, fill: "#e9eef5", stroke: "#9eb1c5", strokeWidth: 3,
      strokeDashArray: [12, 8], selectable: false, evented: false
    });
    canvas.add(object);
  } else object.set({ left: box.left, top: box.top, width: box.width, height: box.height });
  let text = builderObject(role + "Label");
  if (!text) {
    text = new fabric.Text(label, {
      role: role + "Label", left: box.left + box.width / 2, top: box.top + box.height / 2,
      originX: "center", originY: "center", fontFamily: "Arial", fontSize: 22,
      fill: "#607286", selectable: false, evented: false
    });
    canvas.add(text);
  } else text.set({ left: box.left + box.width / 2, top: box.top + box.height / 2, text: label });
}

function removeBuilderPlaceholder(role) {
  [role, role + "Label"].forEach(r => {
    const object = builderObject(r);
    if (object) canvas.remove(object);
  });
}

function ensurePoweredBy() {
  let footer = builderObject("poweredBy");
  const footerProps = {
    text: "Powered by Tabaja Solution",
    left: W / 2, top: H - 22, width: W - 80,
    originX: "center", originY: "center", textAlign: "center",
    fontFamily: "Arial", fontSize: orientation === "landscape" ? 14 : 13,
    fontWeight: "bold", fill: "#526273", selectable: false, evented: false
  };
  if (!footer) {
    footer = new fabric.Textbox(footerProps.text, Object.assign({ role: "poweredBy" }, footerProps));
    canvas.add(footer);
  } else footer.set(footerProps);
  canvas.bringToFront(footer);
  footer.setCoords();
  return footer;
}

async function generateEmployeeCard() {
  try {
    builderStatus("Generating employee card...");
    const landscape = orientation === "landscape";
    const company = $("builderCompany").value.trim() || "COMPANY NAME";
    const name = $("builderName").value.trim() || "EMPLOYEE NAME";
    const job = $("builderJob").value.trim() || "Job Title";
    const phone = $("builderPhone").value.trim();
    const whatsapp = $("builderWhatsApp").value.trim();
    const email = $("builderEmail").value.trim();
    const website = $("builderWebsite").value.trim();
    const facebook = $("builderFacebook").value.trim();
    const instagram = $("builderInstagram").value.trim();
    const twitter = $("builderTwitter").value.trim();
    const linkedin = $("builderLinkedIn").value.trim();

    // V6.3: keep the selected canvas background visible.
    // This transparent structural layer replaces the old forced white rectangle.
    builderAddOrUpdateRect("builderBackground", {
      left: 0, top: 0, width: W, height: H, fill: "rgba(0,0,0,0)",
      selectable: false, evented: false
    });
    builderAddOrUpdateRect("builderAccent", landscape
      ? { left: 0, top: 0, width: W * 0.31, height: H, fill: "#123e66" }
      : { left: 0, top: 0, width: W, height: H * 0.25, fill: "#123e66" });
    builderAddOrUpdateRect("builderLine", landscape
      ? { left: W * 0.31, top: 0, width: 10, height: H, fill: "#2f9bdd" }
      : { left: 0, top: H * 0.25, width: W, height: 10, fill: "#2f9bdd" });

    const photoBox = landscape
      ? { left: W * 0.055, top: H * 0.20, width: W * 0.20, height: H * 0.55 }
      : { left: W * 0.27, top: H * 0.09, width: W * 0.46, height: H * 0.28 };
    const logoBox = landscape
      ? { left: W * 0.77, top: H * 0.07, width: W * 0.17, height: H * 0.15 }
      : { left: W * 0.30, top: H * 0.30, width: W * 0.40, height: H * 0.12 };

    // Always reset the previous employee photo before loading the current record.
    // This prevents a missing photo from inheriting the previous employee's image.
    if (builderPhotoData) {
      removeBuilderPlaceholder("employeePhotoPlaceholder");
      await builderAddOrUpdateImage("employeePhoto", builderPhotoData, photoBox);
    } else {
      const oldPhoto = builderObject("employeePhoto");
      if (oldPhoto) canvas.remove(oldPhoto);
      ensureBuilderPlaceholder("employeePhotoPlaceholder", photoBox, "MISSING PHOTO");
    }

    // V6.4: the company logo is fully optional.
    // Show the real logo only when the user selects one; otherwise remove every logo guide/object
    // so nothing appears in PNG, PDF, or printing.
    removeBuilderPlaceholder("companyLogoPlaceholder");
    if (builderLogoData) {
      await builderAddOrUpdateImage("companyLogo", builderLogoData, logoBox);
    } else {
      const oldLogo = builderObject("companyLogo");
      if (oldLogo) canvas.remove(oldLogo);
    }

    const textLeft = landscape ? W * 0.36 : W * 0.10;
    const textWidth = landscape ? W * 0.57 : W * 0.80;
    const companyTop = landscape ? H * 0.12 : H * 0.45;

    // Logo and company text are mutually exclusive: when a logo exists, show the logo only.
    const oldCompanyText = builderObject("employeeCompany");
    if (builderLogoData) {
      if (oldCompanyText) canvas.remove(oldCompanyText);
    } else {
      const companyObj = builderAddOrUpdateText("employeeCompany", company, {
        left: textLeft, top: companyTop, width: textWidth, heightLimit: H * 0.10, widthLimit: textWidth,
        fontSize: landscape ? 29 : 28, fontWeight: "bold", fill: "#17547f", textAlign: "left"
      });
      fitBuilderText(companyObj, landscape ? 29 : 28, 16);
    }

    const nameObj = builderAddOrUpdateText("employeeName", name, {
      left: textLeft, top: companyTop + H * 0.17, width: textWidth, heightLimit: H * 0.18, widthLimit: textWidth,
      fontSize: landscape ? 48 : 42, fontWeight: "bold", fill: "#111820", textAlign: "left"
    });
    fitBuilderText(nameObj, landscape ? 48 : 42, 20);

    const jobObj = builderAddOrUpdateText("employeeJob", job, {
      left: textLeft, top: companyTop + H * 0.34, width: textWidth, heightLimit: H * 0.10, widthLimit: textWidth,
      fontSize: landscape ? 28 : 25, fontWeight: "normal", fill: "#2c6e9d", textAlign: "left"
    });
    fitBuilderText(jobObj, landscape ? 28 : 25, 15);

    // V7.2: contact and social-media icons. Empty fields create no icon and no text.
    const oldContacts = builderObject("employeeContacts");
    if (oldContacts) canvas.remove(oldContacts);
    for (let i = 0; i < 10; i++) {
      ["contactIcon" + i, "contactValue" + i].forEach(role => {
        const old = builderObject(role);
        if (old) canvas.remove(old);
      });
    }
    const contactRows = [
      phone && { icon: "✆", value: phone, color: "#263746" },
      whatsapp && { icon: "☎", value: whatsapp, color: "#25A244" },
      email && { icon: "✉", value: email, color: "#2c6e9d" },
      website && { icon: "🌐", value: website, color: "#17547f" },
      facebook && { icon: "f", value: facebook, color: "#1877F2" },
      instagram && { icon: "◎", value: instagram, color: "#C13584" },
      twitter && { icon: "𝕏", value: twitter, color: "#111820" },
      linkedin && { icon: "in", value: linkedin, color: "#0A66C2" }
    ].filter(Boolean);
    const contactTop = companyTop + H * 0.48;
    // Use larger type whenever the number of rows allows it. Export is rendered at 2× for crisp small text.
    const contactFont = contactRows.length <= 4 ? (landscape ? 23 : 21) : (landscape ? 18 : 17);
    const rowGap = contactRows.length <= 4 ? (landscape ? 31 : 29) : (landscape ? 25 : 23);
    contactRows.forEach((row, i) => {
      const y = contactTop + i * rowGap;
      builderAddOrUpdateText("contactIcon" + i, row.icon, {
        left: textLeft, top: y, width: 28, heightLimit: rowGap, widthLimit: 28,
        fontSize: contactFont, fontWeight: "bold", fill: row.color, textAlign: "center"
      });
      const valueObj = builderAddOrUpdateText("contactValue" + i, row.value, {
        left: textLeft + 34, top: y, width: textWidth - 34, heightLimit: rowGap, widthLimit: textWidth - 34,
        fontSize: contactFont, fill: "#263746", textAlign: "left"
      });
      fitBuilderText(valueObj, contactFont, 11);
    });

    ensurePoweredBy();

    // Keep the structural background behind editable content.
    ["builderBackground", "builderAccent", "builderLine"].forEach(role => {
      const object = builderObject(role);
      if (object) canvas.sendToBack(object);
    });
    ensurePoweredBy();
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    saveCurrentSide();
    builderStatus("Employee card generated successfully — you can move and resize every employee element.");
  } catch (error) {
    console.error("V6.1 Employee Builder error:", error);
    builderStatus("Generate failed: " + (error.message || error));
    alert("Generate Card failed:\n" + (error.message || error));
  }
}

$("generateEmployeeBtn").addEventListener("click", generateEmployeeCard);
$("replacePhotoBtn").addEventListener("click", () => $("builderPhoto").click());

$("saveTemplateBtn").addEventListener("click", () => {
  ensurePoweredBy();
  saveCurrentSide();
  localStorage.setItem(V61_TEMPLATE_KEY, snapshot());
  builderStatus("Template saved on this device.");
});

$("loadTemplateBtn").addEventListener("click", async () => {
  const saved = localStorage.getItem(V61_TEMPLATE_KEY);
  if (!saved) return alert("No saved V6.1 template on this device.");
  await loadSnapshot(saved);
  ensurePoweredBy();
  saveCurrentSide();
  builderStatus("Template loaded — enter the next employee details and press Generate / Update Card.");
});

// Protect the mandatory footer from deletion.
const v61OriginalDeleteHandler = $("deleteBtn").onclick;
$("deleteBtn").onclick = () => {
  const selected = canvas.getActiveObjects();
  if (selected.some(object => object.role === "poweredBy")) {
    builderStatus("Powered by Tabaja Solution is protected.");
    return;
  }
  if (typeof v61OriginalDeleteHandler === "function") v61OriginalDeleteHandler();
};

builderStatus("V6.6.3 ready — Zebra left/bottom white-margin calibration applied.");

// ===== V6.3 BETA: Locked Card Background =====
function removeBackgroundImageObjects() {
  const objects = canvas.getObjects().filter(object => object.role === "background" || object.role === "cardBackgroundImage");
  objects.forEach(object => canvas.remove(object));
}

function finishCardBackground(message) {
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  saveCurrentSide();
  syncCurrentBackgroundToOtherSide();
  const synced = $("syncBackgroundBothSides")?.checked ? " Front + Back." : "";
  status(message + synced);
}

function applySolidCardBackground(color) {
  removeBackgroundImageObjects();
  canvas.setBackgroundColor(color, () => finishCardBackground("Solid card background applied."));
}

function gradientCoordinates(direction) {
  if (direction === "vertical") return { x1: 0, y1: 0, x2: 0, y2: H };
  if (direction === "diagonal") return { x1: 0, y1: 0, x2: W, y2: H };
  if (direction === "diagonalReverse") return { x1: W, y1: 0, x2: 0, y2: H };
  return { x1: 0, y1: 0, x2: W, y2: 0 };
}

function applyGradientCardBackground() {
  removeBackgroundImageObjects();
  const color1 = $("cardBgGradient1").value;
  const color2 = $("cardBgGradient2").value;
  const direction = $("cardBgGradientDirection").value;
  const gradient = new fabric.Gradient({
    type: "linear",
    gradientUnits: "pixels",
    coords: gradientCoordinates(direction),
    colorStops: [
      { offset: 0, color: color1 },
      { offset: 1, color: color2 }
    ]
  });
  canvas.setBackgroundColor(gradient, () => finishCardBackground("Gradient card background applied."));
}

function applyTransparentCardBackground() {
  removeBackgroundImageObjects();
  canvas.setBackgroundColor("rgba(0,0,0,0)", () => finishCardBackground("Transparent card background applied. White PVC will remain visible when printed."));
}

$("applySolidBackgroundBtn").addEventListener("click", () => applySolidCardBackground($("cardBgSolidColor").value));
$("applyGradientBackgroundBtn").addEventListener("click", applyGradientCardBackground);
$("transparentBackgroundBtn").addEventListener("click", applyTransparentCardBackground);
$("resetWhiteBackgroundBtn").addEventListener("click", () => {
  $("cardBgSolidColor").value = "#ffffff";
  applySolidCardBackground("#ffffff");
});
$("cardBackgroundImageBtn").addEventListener("click", () => chooseImage("background"));
$("syncBackgroundBothSides").addEventListener("change", event => {
  if (event.target.checked) {
    syncCurrentBackgroundToOtherSide();
    status("Background linking enabled — Front and Back now use the same background.");
  } else {
    status("Background linking disabled — each side can now use a different background.");
  }
});

// Keep the original quick color control synchronized with the new background panel.
$("cardBgSolidColor").addEventListener("input", event => {
  $("cardColor").value = event.target.value;
});
$("cardColor").addEventListener("input", event => {
  $("cardBgSolidColor").value = event.target.value;
});

status("V7.4 Professional Quality ready — media reset, logo-only mode, crisp export, pre-flight and bleed overscan.");

// ===== V7.0: Excel Batch Print — 50 cards per print job =====
let batchRows = [];
let batchHeaders = [];
let batchPhotoMap = new Map();
let batchPhotoIdMap = new Map();
let batchPhotoDuplicates = new Map();
let batchLogoMap = new Map();
let batchBackgroundMap = new Map();
let batchCurrentIndex = 0;
const BATCH_SIZE = 50;

function batchEl(id){ return document.getElementById(id); }
function batchMsg(message){ const el=batchEl('batchProgress'); if(el) el.textContent=message; status(message); }
function normalizeKey(value){ return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,''); }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function guessHeader(words){
  const normalized=batchHeaders.map(h=>[h,normalizeKey(h)]);
  for(const word of words){
    const found=normalized.find(([,n])=>n===word || n.includes(word));
    if(found) return found[0];
  }
  return '';
}
function fillMappingSelect(id, preferred=[]){
  const select=batchEl(id); if(!select) return;
  const chosen=guessHeader(preferred);
  select.innerHTML='<option value="">— Not used —</option>'+batchHeaders.map(h=>`<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
  if(chosen) select.value=chosen;
}
function setupBatchMappings(){
  fillMappingSelect('mapName',['fullname','employeename','name']);
  fillMappingSelect('mapId',['employeeid','staffid','id','serial']);
  fillMappingSelect('mapJob',['jobtitle','position','job','designation']);
  fillMappingSelect('mapCompany',['companyname','company','organization']);
  fillMappingSelect('mapPhone',['phone','telephone','mobile','call']);
  fillMappingSelect('mapWhatsApp',['whatsapp','whatsappnumber','wa']);
  fillMappingSelect('mapEmail',['email','emailaddress']);
  fillMappingSelect('mapWebsite',['website','web']);
  fillMappingSelect('mapFacebook',['facebook','facebookusername','fb']);
  fillMappingSelect('mapInstagram',['instagram','instagramusername','ig']);
  fillMappingSelect('mapTwitter',['twitter','x','xusername','twitterusername']);
  fillMappingSelect('mapLinkedIn',['linkedin','linkedinusername']);
  fillMappingSelect('mapPhoto',['photo','photofilename','image','picture']); // optional legacy override
  fillMappingSelect('mapLogo',['logo','logofilename','companylogo','brandlogo']);
  fillMappingSelect('mapBackground',['background','backgroundfilename','cardbackground','templatebackground']);
}
function updateBatchSummary(){
  const summary=batchEl('batchSummary'); if(!summary) return;
  if(!batchRows.length){ summary.textContent='No batch loaded.'; return; }
  summary.textContent=`${batchRows.length} records loaded • ${batchHeaders.length} columns • ${countUniqueFiles(batchPhotoMap)} employee photos • ${countUniqueFiles(batchLogoMap)} company logos • ${countUniqueFiles(batchBackgroundMap)} backgrounds`;
  batchEl('batchFrom').max=batchRows.length; batchEl('batchTo').max=batchRows.length;
  batchEl('batchTo').value=Math.min(BATCH_SIZE,batchRows.length);
}

batchEl('batchExcelInput')?.addEventListener('change', async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  try{
    batchMsg('Reading Excel file...');
    const data=await file.arrayBuffer();
    const wb=XLSX.read(data,{type:'array'});
    const ws=wb.Sheets[wb.SheetNames[0]];
    batchRows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
    batchHeaders=batchRows.length?Object.keys(batchRows[0]):[];
    batchCurrentIndex=0; setupBatchMappings(); updateBatchSummary();
    batchMsg(`Excel ready: ${batchRows.length} records. Check column mapping, then Preview.`);
  }catch(err){ console.error(err); batchMsg('Excel error: '+(err.message||err)); }
});


function countUniqueFiles(map){ return new Set([...map.values()]).size; }
function indexImageFiles(targetMap, files){
  targetMap.clear();
  for(const file of files){
    const full=(file.webkitRelativePath||file.name).toLowerCase();
    const base=file.name.toLowerCase();
    const stem=normalizeKey(file.name.replace(/\.[^.]+$/,''));
    targetMap.set(full,file);
    targetMap.set(base,file);
    targetMap.set(stem,file);
  }
}

function normalizeEmployeeId(value){
  const raw=String(value ?? '').trim();
  if(!raw) return '';
  const digits=raw.match(/\d+/)?.[0] || raw;
  return /^\d+$/.test(digits) ? digits.padStart(6,'0') : normalizeKey(digits);
}
function leadingPhotoId(filename){
  const stem=String(filename||'').replace(/\.[^.]+$/,'').trim();
  const match=stem.match(/^(\d{1,})/);
  return match ? normalizeEmployeeId(match[1]) : '';
}
function indexEmployeePhotos(files){
  batchPhotoMap.clear(); batchPhotoIdMap.clear(); batchPhotoDuplicates.clear();
  indexImageFiles(batchPhotoMap,files);
  for(const file of files){
    const id=leadingPhotoId(file.name);
    if(!id) continue;
    if(batchPhotoIdMap.has(id)){
      const list=batchPhotoDuplicates.get(id) || [batchPhotoIdMap.get(id)];
      list.push(file); batchPhotoDuplicates.set(id,list);
    }else batchPhotoIdMap.set(id,file);
  }
}

batchEl('batchPhotosInput')?.addEventListener('change', async e=>{
  const files=[...(e.target.files||[])];
  indexEmployeePhotos(files);
  updateBatchSummary();
  const duplicateCount=batchPhotoDuplicates.size;
  batchMsg(`${files.length} employee photos loaded • ${batchPhotoIdMap.size} IDs matched${duplicateCount?` • ${duplicateCount} duplicate ID warning(s)`:''}.`);
});

batchEl('batchLogosInput')?.addEventListener('change', async e=>{
  const files=[...(e.target.files||[])];
  indexImageFiles(batchLogoMap,files);
  updateBatchSummary(); batchMsg(`${files.length} company logos loaded. Logo will match by company name or Logo Filename column.`);
});

batchEl('batchBackgroundsInput')?.addEventListener('change', async e=>{
  const files=[...(e.target.files||[])];
  indexImageFiles(batchBackgroundMap,files);
  updateBatchSummary(); batchMsg(`${files.length} card backgrounds loaded. Background will match by filename or company name.`);
});

function mappedValue(row,id){ const col=batchEl(id)?.value; return col ? String(row[col] ?? '').trim() : ''; }
function findPhotoFile(row){
  // Primary production rule: Excel Employee ID matches the LEADING digits of the photo filename.
  // Example: ID 000006 automatically matches 000006-SAJEDABED.jpg.
  const empId=normalizeEmployeeId(mappedValue(row,'mapId'));
  if(empId && batchPhotoIdMap.has(empId)) return batchPhotoIdMap.get(empId);

  // Optional legacy override only when a Photo Filename column is deliberately mapped.
  const named=mappedValue(row,'mapPhoto');
  if(named){
    const candidates=[named,named.toLowerCase(),normalizeKey(named.replace(/\.[^.]+$/,''))].filter(Boolean);
    for(const c of candidates){
      const low=String(c).toLowerCase();
      if(batchPhotoMap.has(low)) return batchPhotoMap.get(low);
      if(batchPhotoMap.has(normalizeKey(low))) return batchPhotoMap.get(normalizeKey(low));
      for(const [key,file] of batchPhotoMap){ if(key.endsWith('/'+low)||normalizeKey(key.replace(/\.[^.]+$/,''))===normalizeKey(low)) return file; }
    }
  }
  return null;
}
function findFileInMap(map,candidates){
  for(const c of candidates.filter(Boolean)){
    const low=String(c).trim().toLowerCase();
    const stem=normalizeKey(low.replace(/\.[^.]+$/,''));
    if(map.has(low)) return map.get(low);
    if(map.has(stem)) return map.get(stem);
    for(const [key,file] of map){
      if(key.endsWith('/'+low) || normalizeKey(key.replace(/\.[^.]+$/,''))===stem) return file;
    }
  }
  return null;
}
function findLogoFile(row){
  const named=mappedValue(row,'mapLogo');
  const company=mappedValue(row,'mapCompany');
  return findFileInMap(batchLogoMap,[named,company]);
}
function findBackgroundFile(row){
  const named=mappedValue(row,'mapBackground');
  const company=mappedValue(row,'mapCompany');
  return findFileInMap(batchBackgroundMap,[named,company]);
}
function setBatchCanvasBackground(dataUrl){
  return new Promise((resolve,reject)=>{
    // Reset first so a blank record can never inherit the previous record's background.
    canvas.setBackgroundImage(null, ()=>{
      canvas.setBackgroundColor('#ffffff', ()=>{
        if(!dataUrl){ canvas.requestRenderAll(); return resolve(); }
        fabric.Image.fromURL(dataUrl, img=>{
          if(!img) return reject(new Error('Background image could not be loaded.'));
          const scale=Math.max(W/img.width,H/img.height);
          img.set({originX:'center',originY:'center',left:W/2,top:H/2,scaleX:scale,scaleY:scale,selectable:false,evented:false});
          canvas.setBackgroundImage(img,()=>{canvas.requestRenderAll();resolve();});
        },{crossOrigin:'anonymous'});
      });
    });
  });
}

function fileToDataUrl(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result||'')); r.onerror=reject; r.readAsDataURL(file); }); }

async function applyBatchRecord(index){
  if(!batchRows.length) throw new Error('Upload an Excel file first.');
  index=Math.max(0,Math.min(index,batchRows.length-1));
  const row=batchRows[index]; batchCurrentIndex=index;
  batchEl('builderName').value=mappedValue(row,'mapName');
  batchEl('builderCompany').value=mappedValue(row,'mapCompany');
  batchEl('builderJob').value=mappedValue(row,'mapJob');
  batchEl('builderPhone').value=mappedValue(row,'mapPhone');
  batchEl('builderWhatsApp').value=mappedValue(row,'mapWhatsApp');
  batchEl('builderEmail').value=mappedValue(row,'mapEmail');
  batchEl('builderWebsite').value=mappedValue(row,'mapWebsite');
  batchEl('builderFacebook').value=mappedValue(row,'mapFacebook');
  batchEl('builderInstagram').value=mappedValue(row,'mapInstagram');
  batchEl('builderTwitter').value=mappedValue(row,'mapTwitter');
  batchEl('builderLinkedIn').value=mappedValue(row,'mapLinkedIn');
  // Reset all record-specific media before resolving the current row.
  builderPhotoData='';
  builderLogoData='';
  builderBatchBackgroundData='';
  const photo=findPhotoFile(row);
  const logo=findLogoFile(row);
  const background=findBackgroundFile(row);
  builderPhotoData=photo?await v82TrimWhiteBorders(await fileToDataUrl(photo)):'';
  builderLogoData=logo?await fileToDataUrl(logo):'';
  builderBatchBackgroundData=background?await fileToDataUrl(background):'';
  await setBatchCanvasBackground(builderBatchBackgroundData);
  await generateEmployeeCard();
  batchMsg(`Previewing record ${index+1}/${batchRows.length}: ${mappedValue(row,'mapName')||'Unnamed'}`);
  return row;
}

batchEl('batchPreflightBtn')?.addEventListener('click',()=>{
  if(!batchRows.length) return alert('Upload an Excel file first.');
  const from=Math.max(1,Number(batchEl('batchFrom').value)||1);
  const to=Math.min(batchRows.length,Math.max(from,Number(batchEl('batchTo').value)||from));
  const warnings=preflightBatchRange(from-1,to-1);
  alert(warnings.length ? `Pre-flight: ${warnings.length} warning(s)\n\n${warnings.slice(0,20).join('\n')}` : `Pre-flight passed for records ${from}-${to}.`);
});

batchEl('batchPreviewBtn')?.addEventListener('click',async()=>{
  try{ const start=Math.max(1,Number(batchEl('batchFrom').value)||1); await applyBatchRecord(start-1); }
  catch(err){ alert(err.message||err); batchMsg('Preview failed.'); }
});

function setBatchRange(start){
  if(!batchRows.length) return;
  start=Math.max(1,Math.min(start,batchRows.length));
  batchEl('batchFrom').value=start;
  batchEl('batchTo').value=Math.min(start+BATCH_SIZE-1,batchRows.length);
}
batchEl('batchNext50Btn')?.addEventListener('click',()=>setBatchRange((Number(batchEl('batchTo').value)||0)+1));
batchEl('batchPrev50Btn')?.addEventListener('click',()=>setBatchRange((Number(batchEl('batchFrom').value)||1)-BATCH_SIZE));
batchEl('batchReprintBtn')?.addEventListener('click',async()=>{ try{ await applyBatchRecord(batchCurrentIndex); await printBatchRange(batchCurrentIndex,batchCurrentIndex); }catch(e){alert(e.message||e);} });
batchEl('batchResetBtn')?.addEventListener('click',()=>{ batchRows=[];batchHeaders=[];batchPhotoMap.clear();batchLogoMap.clear();batchBackgroundMap.clear();batchCurrentIndex=0;builderPhotoData='';builderLogoData='';builderBatchBackgroundData='';setupBatchMappings();updateBatchSummary();batchMsg('Batch reset.'); });

async function snapshotDataUrl(snapshotJson){
  return new Promise((resolve,reject)=>{
    const el=document.createElement('canvas');
    const temp=new fabric.StaticCanvas(el,{width:W,height:H,backgroundColor:'#fff',renderOnAddRemove:false});
    temp.loadFromJSON(snapshotJson||emptySnapshot(),()=>{
      try{temp.setDimensions({width:W,height:H});temp.renderAll();const url=temp.toDataURL({format:'png',multiplier:2,enableRetinaScaling:true});temp.dispose();resolve(url);}catch(e){temp.dispose();reject(e);}
    });
  });
}
function openBatchPrintWindow(pages,title){
  const win=window.open('','_blank'); if(!win) throw new Error('Pop-up blocked. Allow pop-ups and try again.');
  const c=CARD[orientation];
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
    @page{size:${c.mmW}mm ${c.mmH}mm;margin:0}html,body{margin:0;padding:0;background:#fff}.page{width:${c.mmW}mm;height:${c.mmH}mm;page-break-after:always;break-after:page;overflow:hidden}.page:last-child{page-break-after:auto}.page img{display:block;width:102.6%;height:102.6%;max-width:none;object-fit:fill;transform:translate(-1.3%,-1.3%)}@media screen{body{background:#ddd}.page{margin:8px auto;box-shadow:0 2px 10px #777}}
  </style></head><body>${pages.map((p,i)=>`<div class="page"><img src="${p}" alt="Card ${i+1}"></div>`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`);
  win.document.close();
}

function preflightBatchRange(startIndex,endIndex){
  const warnings=[];
  for(let i=startIndex;i<=endIndex;i++){
    const row=batchRows[i];
    const label=`Record ${i+1} (${mappedValue(row,'mapName')||'Unnamed'})`;
    const empId=normalizeEmployeeId(mappedValue(row,'mapId'));
    if(empId && batchPhotoDuplicates.has(empId)) warnings.push(`${label}: duplicate photo ID ${empId}`);
    if(!findPhotoFile(row)) warnings.push(`${label}: missing employee photo`);
    if(batchLogoMap.size && !findLogoFile(row)) warnings.push(`${label}: company logo not matched`);
    if(batchBackgroundMap.size && !findBackgroundFile(row)) warnings.push(`${label}: background not matched`);
  }
  return warnings;
}
function confirmPreflight(startIndex,endIndex){
  const warnings=preflightBatchRange(startIndex,endIndex);
  if(!warnings.length){
    batchMsg(`Pre-flight passed: records ${startIndex+1}-${endIndex+1} are ready.`);
    return true;
  }
  const shown=warnings.slice(0,12).join('\n');
  const more=warnings.length>12?`\n…and ${warnings.length-12} more warning(s).`:'';
  return confirm(`PRE-FLIGHT CHECK\n\n${warnings.length} warning(s):\n\n${shown}${more}\n\nContinue printing anyway?`);
}

async function printBatchRange(startIndex,endIndex){
  if(!batchRows.length) throw new Error('Upload an Excel file first.');
  startIndex=Math.max(0,startIndex); endIndex=Math.min(batchRows.length-1,endIndex);
  if(endIndex<startIndex) throw new Error('Invalid print range.');
  if(endIndex-startIndex+1>BATCH_SIZE) endIndex=startIndex+BATCH_SIZE-1;
  if(!confirmPreflight(startIndex,endIndex)) { batchMsg('Printing cancelled after pre-flight check.'); return; }
  saveCurrentSide();
  const originalFront=sides.front, originalBack=sides.back, originalSide=currentSide;
  const pages=[]; const both=batchEl('batchBothSides')?.checked;
  try{
    for(let i=startIndex;i<=endIndex;i++){
      batchMsg(`Preparing ${i-startIndex+1}/${endIndex-startIndex+1} — record ${i+1}`);
      if(currentSide!=='front') await switchSide('front');
      await applyBatchRecord(i); saveCurrentSide();
      pages.push(await snapshotDataUrl(sides.front));
      if(both) pages.push(await snapshotDataUrl(sides.back));
    }
    openBatchPrintWindow(pages,`Tabaja Batch ${startIndex+1}-${endIndex+1}`);
    localStorage.setItem('tabaja_v7_last_batch_end',String(endIndex+1));
    batchMsg(`Print dialog opened for records ${startIndex+1}-${endIndex+1}. After printing, press Next 50.`);
  } finally {
    sides.front=originalFront; sides.back=originalBack;
    if(currentSide!==originalSide) currentSide=originalSide;
    await loadSnapshot(sides[currentSide]);
    batchEl('frontBtn').classList.toggle('active',currentSide==='front'); batchEl('backBtn').classList.toggle('active',currentSide==='back');
  }
}

batchEl('batchPrint50Btn')?.addEventListener('click',async()=>{
  try{
    let from=Math.max(1,Number(batchEl('batchFrom').value)||1);
    let to=Math.max(from,Number(batchEl('batchTo').value)||Math.min(from+BATCH_SIZE-1,batchRows.length));
    to=Math.min(to,from+BATCH_SIZE-1,batchRows.length);
    batchEl('batchTo').value=to;
    await printBatchRange(from-1,to-1);
  }catch(err){console.error(err);alert('Batch print failed:\n'+(err.message||err));batchMsg('Batch print failed.');}
});

setupBatchMappings();
const lastBatchEnd=Number(localStorage.getItem('tabaja_v7_last_batch_end')||0);
if(lastBatchEnd>0) batchMsg(`V7.0 ready. Last completed batch ended at record ${lastBatchEnd}.`); else batchMsg('V7.4 Professional Quality ready — media reset, pre-flight check, crisp 2× rendering and edge overscan.');


// V7.4 Professional Quality controls
wireQualityTools();

// ===== V8.1: Auto Face Center + Auto Crop =====
const v81FaceCrop = {
  enabled: true,
  lastResult: null,
  cache: new Map()
};

function v81FaceStatus(message){
  const el=document.getElementById('faceCropStatus');
  if(el) el.textContent=message;
}

document.getElementById('autoFaceCrop')?.addEventListener('change', e=>{
  v81FaceCrop.enabled=!!e.target.checked;
  v81FaceStatus(v81FaceCrop.enabled ? 'Face crop enabled. Preview a record to apply it.' : 'Face crop disabled. Photos will use normal fit.');
});

function v81LoadHtmlImage(dataUrl){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Photo could not be loaded for face detection.'));
    img.src=dataUrl;
  });
}

async function v82TrimWhiteBorders(dataUrl){
  const img=await v81LoadHtmlImage(dataUrl);
  const canvasEl=document.createElement('canvas');
  canvasEl.width=img.naturalWidth||img.width; canvasEl.height=img.naturalHeight||img.height;
  const ctx=canvasEl.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0);
  const w=canvasEl.width,h=canvasEl.height,data=ctx.getImageData(0,0,w,h).data;
  const isWhite=(x,y)=>{ const i=(y*w+x)*4; return data[i]>242&&data[i+1]>242&&data[i+2]>242&&data[i+3]>20; };
  const rowWhite=y=>{ let n=0, step=Math.max(1,Math.floor(w/300)); for(let x=0;x<w;x+=step) if(isWhite(x,y)) n++; return n/Math.ceil(w/step)>0.88; };
  const colWhite=x=>{ let n=0, step=Math.max(1,Math.floor(h/300)); for(let y=0;y<h;y+=step) if(isWhite(x,y)) n++; return n/Math.ceil(h/step)>0.88; };
  let top=0,bottom=h-1,left=0,right=w-1;
  while(top<h-2&&rowWhite(top)) top++;
  while(bottom>top+1&&rowWhite(bottom)) bottom--;
  while(left<w-2&&colWhite(left)) left++;
  while(right>left+1&&colWhite(right)) right--;
  // Keep conservative margins and avoid trimming ordinary white studio backgrounds too aggressively.
  const removed=(top)+(h-1-bottom)+(left)+(w-1-right);
  if(!removed || (right-left+1)<w*0.35 || (bottom-top+1)<h*0.35) return dataUrl;
  const pad=Math.max(1,Math.round(Math.min(w,h)*0.004));
  left=Math.max(0,left-pad); top=Math.max(0,top-pad); right=Math.min(w-1,right+pad); bottom=Math.min(h-1,bottom+pad);
  const out=document.createElement('canvas'); out.width=right-left+1; out.height=bottom-top+1;
  out.getContext('2d').drawImage(canvasEl,left,top,out.width,out.height,0,0,out.width,out.height);
  return out.toDataURL('image/jpeg',0.96);
}

async function v82HeuristicFace(dataUrl){
  const img=await v81LoadHtmlImage(dataUrl);
  const maxW=180, scale=Math.min(1,maxW/(img.naturalWidth||img.width));
  const w=Math.max(40,Math.round((img.naturalWidth||img.width)*scale));
  const h=Math.max(40,Math.round((img.naturalHeight||img.height)*scale));
  const c=document.createElement('canvas'); c.width=w;c.height=h;
  const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0,w,h);
  const d=ctx.getImageData(0,0,w,h).data, mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    // Broad skin-colour rule designed to cover light through dark complexions.
    const skin=(r>35&&g>20&&b>15&&(mx-mn)>10&&r>g*0.88&&r>b*1.05) || (r>80&&g>45&&b>30&&r>g&&g>b);
    if(skin && y<h*0.82) mask[y*w+x]=1;
  }
  const seen=new Uint8Array(w*h), comps=[];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const idx=y*w+x;if(!mask[idx]||seen[idx])continue;
    const q=[idx];seen[idx]=1;let qi=0,minx=x,maxx=x,miny=y,maxy=y,count=0;
    while(qi<q.length){const k=q[qi++],cy=Math.floor(k/w),cx=k-cy*w;count++;minx=Math.min(minx,cx);maxx=Math.max(maxx,cx);miny=Math.min(miny,cy);maxy=Math.max(maxy,cy);
      for(const [nx,ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) if(nx>=0&&ny>=0&&nx<w&&ny<h){const ni=ny*w+nx;if(mask[ni]&&!seen[ni]){seen[ni]=1;q.push(ni);}}
    }
    const cw=maxx-minx+1,ch=maxy-miny+1,area=cw*ch,ratio=cw/ch,cy=(miny+maxy)/2;
    if(count>45&&cw>w*0.08&&ch>h*0.08&&ratio>0.35&&ratio<1.8){
      const score=count*(1.35-Math.min(1,cy/h))*Math.min(1.3,ch/(cw||1)); comps.push({minx,maxx,miny,maxy,count,score});
    }
  }
  if(!comps.length) return [];
  comps.sort((a,b)=>b.score-a.score); const f=comps[0];
  const inv=1/scale, fw=(f.maxx-f.minx+1)*inv, fh=(f.maxy-f.miny+1)*inv;
  // Expand skin cluster to approximate the whole head including hair and beard.
  return [{x:Math.max(0,(f.minx*inv)-fw*0.22),y:Math.max(0,(f.miny*inv)-fh*0.30),width:fw*1.44,height:fh*1.55,heuristic:true}];
}

async function v81DetectFaces(dataUrl){
  if(!v81FaceCrop.enabled || !dataUrl) return [];
  if(v81FaceCrop.cache.has(dataUrl)) return v81FaceCrop.cache.get(dataUrl);
  let faces=[];
  try{
    if('FaceDetector' in window){
      const source=await v81LoadHtmlImage(dataUrl);
      const detector=new FaceDetector({fastMode:true,maxDetectedFaces:5});
      const found=await detector.detect(source);
      faces=(found||[]).map(f=>({
        x:f.boundingBox.x, y:f.boundingBox.y,
        width:f.boundingBox.width, height:f.boundingBox.height
      }));
    }
  }catch(err){ console.warn('V8.2 native face detection fallback:',err); }
  if(!faces.length){
    try{ faces=await v82HeuristicFace(dataUrl); }catch(err){ console.warn('V8.2 heuristic face detection failed:',err); }
  }
  v81FaceCrop.cache.set(dataUrl,faces);
  return faces;
}

function v81ApplyPhotoCrop(image, box, faces){
  const cover=Math.max(box.width/image.width, box.height/image.height);
  let scale=cover;
  let focusX=image.width/2;
  let focusY=image.height/2;
  let targetY=box.top+box.height*0.47;

  if(faces.length===1){
    const face=faces[0];
    focusX=face.x+face.width/2;
    focusY=face.y+face.height*0.48;
    // ID portrait: consistent head width, eyes/head placed in upper third.
    scale=Math.max(cover,(box.width*0.58)/Math.max(face.width,1));
    targetY=box.top+box.height*0.37;
    v81FaceCrop.lastResult='one';
    v81FaceStatus('Face detected: centred and cropped automatically.');
  }else if(faces.length>1){
    // Safest fallback: do not choose a person automatically.
    v81FaceCrop.lastResult='multiple';
    v81FaceStatus(`Warning: ${faces.length} faces detected. Smart Center Crop used — review this card.`);
  }else{
    v81FaceCrop.lastResult='none';
    v81FaceStatus('No face detected. Smart Center Crop applied — review this card.');
  }

  image.set({
    left: box.left+box.width/2-(focusX-image.width/2)*scale,
    top: targetY-(focusY-image.height/2)*scale,
    originX:'center', originY:'center', scaleX:scale, scaleY:scale
  });
  image.clipPath=new fabric.Rect({
    left:box.left, top:box.top, width:box.width, height:box.height,
    absolutePositioned:true, rx:22, ry:22
  });
  image.v81AutoCrop=true;
  image.v81FaceCount=faces.length;
  image.setCoords();
}

// Wrap the existing image builder without changing logos or other objects.
const v81OriginalBuilderAddOrUpdateImage=builderAddOrUpdateImage;
builderAddOrUpdateImage=async function(role,dataUrl,box){
  const image=await v81OriginalBuilderAddOrUpdateImage(role,dataUrl,box);
  if(role==='employeePhoto' && image && dataUrl && v81FaceCrop.enabled){
    const faces=await v81DetectFaces(dataUrl);
    v81ApplyPhotoCrop(image,box,faces);
    canvas.requestRenderAll();
  }
  return image;
};

status('V8.2.1 Size Fix ready — exact CR80 PDF dimensions with ID photo matching and crop test.');
