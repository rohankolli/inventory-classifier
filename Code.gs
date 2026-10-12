// ═══════════════════════════════════════════════════════════════════
// INVENTORY FORM — Complete Google Apps Script Web App
// ═══════════════════════════════════════════════════════════════════
//
// SETUP INSTRUCTIONS:
//
// 1. Open your Google Sheet
// 2. Go to Extensions → Apps Script
// 3. Delete any existing code in Code.gs and paste this file
// 4. Create a new HTML file: File → New → HTML file → name it "Index"
//    Paste the contents of the Index.html file there
//
// 5. Set your Gemini API key (it is NOT stored in this file):
//    In Apps Script, go to Project Settings (gear icon on left)
//    Scroll to "Script Properties" → click "Add Script Property"
//    Property: GEMINI_API_KEY
//    Value: your-gemini-api-key-here
//
// 6. Deploy:
//    Click Deploy → New deployment
//    Type: Web app
//    Execute as: Me
//    Who has access: Anyone
//    Click Deploy → Copy the URL
//
// 7. Share that URL with your volunteers!
//
// NOTE: After ANY code changes, you must create a NEW deployment
// (Deploy → Manage deployments → Edit → Version: New version → Deploy)
// ═══════════════════════════════════════════════════════════════════

// ─── CONFIG ─────────────────────────────────────────────────────

const CONFIG = {
  // Sheet tab names
  RESPONSES_SHEET: "Form Responses 1",
  FINAL_SHEET: "Final Inventorying",

  // ── Form Responses 1 columns (1-indexed) ──
  COL_TIMESTAMP:    1,
  COL_IMAGE:        2,
  COL_QUANTITY:     3,
  COL_EXPIRATION:   4,
  COL_PALLET:       5,
  COL_BOX_NUMBER:   6,
  COL_REVIEW:       7,
  COL_SECTION:      8,
  COL_SUBCATEGORY:  9,

  // ── Final Inventorying columns (1-indexed) ──
  FI_MANUFACTURER:  1,
  FI_CATEGORY:      2,
  FI_SUBCATEGORY:   3,
  FI_GENERAL:       4,
  FI_NAME:          5,
  FI_LOT:           6,
  FI_NOTES:         7,
  FI_QUANTITY:      8,
  FI_EXPIRATION:    9,
  FI_PALLET:        10,
  FI_BOX:           11,
  FI_IMAGE:         12,
  FI_REVIEW:        13,

  // Box numbering
  SECTION_A_START: 1,
  SECTION_B_START: 2,
  BOX_INCREMENT: 2,

  // Main categories
  CATEGORIES: [
      "TC/RC",
      "ER",
      "DME",
      "ST/N",
      "PH/PPE",
      "Other",
  ],

  // Subcategories
  SUBCATEGORIES: [
    "Airway & Oxygen",
    "Catheters & Briefs",
    "Gloves",
    "IV Supplies",
    "Masks & Face Shields",
    "Needles & Syringes",
    "Sutures",
    "Wound Care & Bandages",
    "Vitals & Home Health",
    "Apparel (Gowns, Shoe Covers, etc.)",
    "Misc Surgical",
    "Misc Non-Medical",
  ],

  // Google Drive folder name for uploaded images
  IMAGE_FOLDER_NAME: "Inventory Images",

  // Gemini model used for image classification
  GEMINI_MODEL: "gemini-3.8-flash",
};


// ─── SERVE THE WEB APP ──────────────────────────────────────────

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Inventory Form")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
}


// ─── AI CLASSIFICATION (Gemini) ─────────────────────────────────

function classifyImage(base64Data) {
  // The API key lives in Project Settings → Script Properties, never in code.
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("Gemini API key not set. Go to Project Settings → Script Properties and add GEMINI_API_KEY.");
  }

  const categoriesList = CONFIG.CATEGORIES.map((c, i) => (i + 1) + ". " + c).join("\n");
  const subcategoriesList = CONFIG.SUBCATEGORIES.map((s, i) => (i + 1) + ". " + s).join("\n");

  const prompt = `You are cataloging medical supplies for warehouse inventory. Carefully examine this product image and extract all visible information.

CLASSIFY into ONE main category:
${categoriesList}

Main category descriptions:
- DME: Durable Medical Equipment (walkers, crutches, braces, mobility aids, oxygen concentrators, home health/vitals equipment)
- Emergency/FirstAid/WoundCare: Emergency supplies, first aid kits, wound care, bandages, dressings
- PPE: Personal Protective Equipment (gloves, masks, face shields, gowns, shoe covers, apparel)
- Hygiene: Hygiene and personal care items (briefs, incontinence supplies, sanitizer, soap, toiletries)
- Perinatal Care: Maternal and newborn care supplies (prenatal, postpartum, infant care items)
- Surgical Tools: Surgical instruments and supplies (sutures, surgical kits, misc surgical items)
- Tubing & Catheters: IV supplies, catheters, tubing, drainage lines
- Miscellaneous: Items that don't fit any other category, non-medical items
- Needles & Syringes: Needles, syringes, sharps
- Pediatrics: Children's or infant-specific medical supplies (remove this category if not applicable)

CLASSIFY into ONE subcategory:
${subcategoriesList}

Subcategory → main category guide:
- Airway & Oxygen → DME
- Catheters & Briefs → Tubing & Catheters
- Gloves → PPE
- IV Supplies → Tubing & Catheters
- Masks & Face Shields → PPE
- Needles & Syringes → Needles & Syringes
- Sutures → Surgical Tools
- Wound Care & Bandages → Emergency/FirstAid/WoundCare
- Vitals & Home Health → DME
- Apparel (Gowns, Shoe Covers, etc.) → PPE
- Misc Surgical → Surgical Tools
- Misc Non-Medical → Miscellaneous

EXTRACT from the label (use "" if not visible):
- manufacturer: company/brand name printed on packaging
- product: full specific product name including size/model/variant
- general: short generic product type (e.g. "airway device", "latex gloves", "IV catheter")
- lotNumber: lot/batch number if visible, else ""
- notes: 1-2 sentences describing what is visible on the label that helps identify this item

Respond with ONLY valid JSON, no markdown, no backticks, no extra text:
{"category":"CATEGORY_CODE","subcategory":"SUBCATEGORY_NAME","confidence":"high|medium|low","manufacturer":"...","product":"...","general":"...","lotNumber":"...","notes":"..."}`;

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + CONFIG.GEMINI_MODEL + ":generateContent?key=" + apiKey;

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingLevel: "low"
      }
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());

  if (json.error) {
    throw new Error("Gemini error: " + (json.error.message || JSON.stringify(json.error)));
  }

  const candidate = json.candidates && json.candidates[0];
  if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
    throw new Error("Gemini returned no content (finishReason: " + (candidate ? candidate.finishReason : "none") + ")");
  }

  // Extract text from Gemini response
  const text = candidate.content.parts[0].text.trim();
  let clean = text.replace(/```json|```/g, "").trim();
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }

  try {
    const result = JSON.parse(clean);
    if (!CONFIG.CATEGORIES.includes(result.category)) {
      result.category = CONFIG.CATEGORIES[0];
      result.confidence = "low";
    }
    if (!CONFIG.SUBCATEGORIES.includes(result.subcategory)) {
      result.subcategory = "Misc Non-Medical";
    }
    return result;
  } catch (e) {
    return {
      category: CONFIG.CATEGORIES[0],
      subcategory: "Misc Non-Medical",
      confidence: "low",
      manufacturer: "",
      product: "Unknown (AI parse error)",
      general: "",
      lotNumber: "",
      notes: "",
    };
  }
}


// ─── SUBMIT ENTRY ───────────────────────────────────────────────

function submitEntry(data) {
  try {
    const imageUrl = uploadImageToDrive_(data.imageBase64);
    const boxNumber = getCurrentBoxNumber_(data.category, data.section, data.boxFull === true);
    const reviewText = data.needsReview ? "Yes" : "No";

    appendToResponsesSheet_({
      timestamp: new Date(),
      imageUrl: imageUrl,
      quantity: data.quantity,
      expiration: data.expiration || "",
      palletNumber: data.palletNumber,
      boxNumber: boxNumber,
      review: reviewText,
      section: data.section,
      subcategory: data.subcategory || "",
    });

    appendToFinalSheet_({
      manufacturer: data.manufacturer || "",
      category: data.category || "",
      subcategory: data.subcategory || "",
      general: data.general || "",
      productName: data.product || "",
      lotNumber: data.lotNumber || "",
      notes: data.notes || "",
      quantity: data.quantity,
      expiration: data.expiration || "",
      palletNumber: data.palletNumber,
      boxNumber: boxNumber,
      imageUrl: imageUrl,
      review: reviewText,
    });

    return { success: true, boxNumber: boxNumber, imageUrl: imageUrl };

  } catch (error) {
    return { success: false, error: error.toString() };
  }
}


// ─── IMAGE UPLOAD (private) ─────────────────────────────────────

function uploadImageToDrive_(base64Data) {
  if (!base64Data) return "";

  let folder;
  const folders = DriveApp.getFoldersByName(CONFIG.IMAGE_FOLDER_NAME);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(CONFIG.IMAGE_FOLDER_NAME);
  }

  const fileName = "inv_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss") + "_" + Math.random().toString(36).substr(2, 5) + ".jpg";
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/jpeg", fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();
}


// ─── BOX NUMBER TRACKING (private) ──────────────────────────────

function getCounterSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("BoxCounters");
  if (!sheet) {
    sheet = ss.insertSheet("BoxCounters");
    sheet.getRange("A1:D1").setValues([["Category", "Section", "CurrentBox", "IsFull"]]);
    sheet.getRange("A1:D1").setFontWeight("bold");

    const rows = [];
    CONFIG.CATEGORIES.forEach(function(cat) {
      rows.push([cat, "A", CONFIG.SECTION_A_START, "false"]);
      rows.push([cat, "B", CONFIG.SECTION_B_START, "false"]);
    });
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  return sheet;
}

function getCurrentBoxNumber_(category, section, markFull) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getCounterSheet_();
    const data = sheet.getDataRange().getValues();

    let rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === category && data[i][1] === section) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      var startBox = section === "A" ? CONFIG.SECTION_A_START : CONFIG.SECTION_B_START;
      var newRow = data.length + 1;
      sheet.getRange(newRow, 1, 1, 4).setValues([[category, section, startBox, markFull ? "true" : "false"]]);
      return startBox;
    }

    var currentBox = data[rowIndex][2];
    var wasFull = data[rowIndex][3] === true || data[rowIndex][3] === "true";

    if (wasFull) {
      currentBox += CONFIG.BOX_INCREMENT;
      sheet.getRange(rowIndex + 1, 3).setValue(currentBox);
    }

    sheet.getRange(rowIndex + 1, 4).setValue(markFull ? "true" : "false");
    return currentBox;

  } finally {
    lock.releaseLock();
  }
}
function getBoxNumberPreview(category, section) {
  const sheet = getCounterSheet_();
  const data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === category && data[i][1] === section) {
      var currentBox = data[i][2];
      var wasFull = data[i][3] === true || data[i][3] === "true";

      if (wasFull) {
        return currentBox + CONFIG.BOX_INCREMENT;
      }

      return currentBox;
    }
  }

  // No counter exists yet for this category/section
  return section === "A"
    ? CONFIG.SECTION_A_START
    : CONFIG.SECTION_B_START;
}

// ─── FORM RESPONSES SHEET APPEND (private) ──────────────────────

function appendToResponsesSheet_(entry) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.RESPONSES_SHEET);

  if (!sheet) {
    throw new Error("Sheet tab '" + CONFIG.RESPONSES_SHEET + "' not found.");
  }

  const newRow = sheet.getLastRow() + 1;

  const writes = [
    [CONFIG.COL_TIMESTAMP,   Utilities.formatDate(entry.timestamp, Session.getScriptTimeZone(), "M/d/yyyy HH:mm:ss")],
    [CONFIG.COL_IMAGE,       entry.imageUrl],
    [CONFIG.COL_QUANTITY,    entry.quantity],
    [CONFIG.COL_EXPIRATION,  entry.expiration],
    [CONFIG.COL_PALLET,      entry.palletNumber],
    [CONFIG.COL_BOX_NUMBER,  entry.boxNumber],
    [CONFIG.COL_REVIEW,      entry.review],
    [CONFIG.COL_SECTION,     entry.section],
    [CONFIG.COL_SUBCATEGORY, entry.subcategory],
  ];

  writes.forEach(function(pair) {
    if (pair[0] && pair[1] !== undefined && pair[1] !== null && pair[1] !== "") {
      sheet.getRange(newRow, pair[0]).setValue(pair[1]);
    }
  });
}


// ─── FINAL INVENTORYING SHEET APPEND (private) ──────────────────

function getFinalSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.FINAL_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.FINAL_SHEET);
    const headers = [
      "Manufacturer Name",
      "Category",
      "Subcategory",
      "General",
      "Name",
      "Lot Number",
      "Notes",
      "Quantity",
      "Date of Expiration",
      "Pallet Number",
      "Box Number",
      "Image URL",
      "Review",
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }

  return sheet;
}

function appendToFinalSheet_(entry) {
  const sheet = getFinalSheet_();
  const newRow = sheet.getLastRow() + 1;

  const writes = [
    [CONFIG.FI_MANUFACTURER, entry.manufacturer],
    [CONFIG.FI_CATEGORY,     entry.category],
    [CONFIG.FI_SUBCATEGORY,  entry.subcategory],
    [CONFIG.FI_GENERAL,      entry.general],
    [CONFIG.FI_NAME,         entry.productName],
    [CONFIG.FI_LOT,          entry.lotNumber],
    [CONFIG.FI_NOTES,        entry.notes],
    [CONFIG.FI_QUANTITY,     entry.quantity],
    [CONFIG.FI_EXPIRATION,   entry.expiration],
    [CONFIG.FI_PALLET,       entry.palletNumber],
    [CONFIG.FI_BOX,          entry.boxNumber],
    [CONFIG.FI_IMAGE,        entry.imageUrl],
    [CONFIG.FI_REVIEW,       entry.review],
  ];

  writes.forEach(function(pair) {
    if (pair[0] && pair[1] !== undefined && pair[1] !== null && pair[1] !== "") {
      sheet.getRange(newRow, pair[0]).setValue(pair[1]);
    }
  });
}


// ─── UTILITIES (run manually from script editor) ────────────────

function resetAllBoxCounters() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("BoxCounters");
  if (sheet) ss.deleteSheet(sheet);
  getCounterSheet_();
  SpreadsheetApp.getUi().alert("Box counters have been reset!");
}

function viewBoxCounters() {
  const sheet = getCounterSheet_();
  const data = sheet.getDataRange().getValues();
  var msg = "Current Box Counters:\n\n";
  for (var i = 1; i < data.length; i++) {
    msg += data[i][0] + " / Section " + data[i][1] + ": Box " + data[i][2];
    if (data[i][3] === "true" || data[i][3] === true) msg += " (FULL)";
    msg += "\n";
  }
  SpreadsheetApp.getUi().alert(msg);
}

// ═══════════════════════════════════════════════════════════════════
// SHIPMENT MANAGER
// ═══════════════════════════════════════════════════════════════════

const SHIP_CONFIG = {
  FI_SHIPMENT: 14,
  SHIPMENT_LOG_SHEET: "Shipment Log",
  PACKING_PREFIX: "📦 ",
};


// ─── MENU ───────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Shipments")
    .addItem("Open Shipment Manager", "openShipmentSidebar")
    .addSeparator()
    .addItem("View Box Counters", "viewBoxCounters")
    .addItem("Reset Box Counters", "resetAllBoxCounters")
    .addToUi();
}


// ─── ROW COLOR HELPERS (A-K only, cols 1-11) ────────────────────

function setRowRed_(sheet, row) {
  sheet.getRange(row, 1, 1, 11).setBackground("#fca5a5");
}

function restoreRowColors_(sheet, row) {
  // A-G (1-7): light green 3
  sheet.getRange(row, 1, 1, 7).setBackground("#d9ead3");
  // H-K (8-11): light blue 3
  sheet.getRange(row, 8, 1, 4).setBackground("#c9daf8");
}


function openShipmentSidebar() {
  const html = HtmlService.createHtmlOutputFromFile("Sidebar")
    .setTitle("Shipment Manager")
    .setWidth(360);
  SpreadsheetApp.getUi().showSidebar(html);
}


// ─── SHIPMENT LOG SHEET ─────────────────────────────────────────

function getShipmentLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHIP_CONFIG.SHIPMENT_LOG_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(SHIP_CONFIG.SHIPMENT_LOG_SHEET);
    const headers = ["Shipment ID", "Recipient", "Destination", "Date Created", "Date Shipped", "Status", "Notes", "Item Count"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(6, 100);
    sheet.setColumnWidth(7, 200);
  }

  return sheet;
}


// ─── ENSURE SHIPMENT COLUMN EXISTS ──────────────────────────────

function ensureShipmentColumn_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.FINAL_SHEET);
  if (!sheet) return;

  const lastCol = sheet.getLastColumn();
  const col = SHIP_CONFIG.FI_SHIPMENT;

  if (lastCol < col) {
    sheet.getRange(1, col).setValue("Shipment");
    sheet.getRange(1, col).setFontWeight("bold");
  } else {
    const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    if (headerRow[col - 1] !== "Shipment") {
      sheet.getRange(1, col).setValue("Shipment");
      sheet.getRange(1, col).setFontWeight("bold");
    }
  }
}


// ─── SIDEBAR API FUNCTIONS ──────────────────────────────────────

function getShipments() {
  const sheet = getShipmentLogSheet_();
  const data = sheet.getDataRange().getValues();
  const shipments = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    shipments.push({
      id: data[i][0],
      recipient: data[i][1],
      destination: data[i][2],
      dateCreated: data[i][3] ? Utilities.formatDate(new Date(data[i][3]), Session.getScriptTimeZone(), "M/d/yyyy") : "",
      dateShipped: data[i][4] ? Utilities.formatDate(new Date(data[i][4]), Session.getScriptTimeZone(), "M/d/yyyy") : "",
      status: data[i][5] || "Preparing",
      notes: data[i][6] || "",
      itemCount: data[i][7] || 0,
      rowIndex: i + 1,
    });
  }

  return shipments;
}

function createShipment(name, recipient, destination, notes) {
  const sheet = getShipmentLogSheet_();
  const newRow = sheet.getLastRow() + 1;

  sheet.getRange(newRow, 1, 1, 8).setValues([[
    name, recipient || "", destination || "", new Date(), "", "Preparing", notes || "", 0,
  ]]);

  ensureShipmentColumn_();
  return { success: true, id: name };
}

function assignSelectedToShipment(shipmentId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  if (sheet.getName() !== CONFIG.FINAL_SHEET) {
    return { success: false, error: "Please select rows in the '" + CONFIG.FINAL_SHEET + "' sheet first." };
  }

  ensureShipmentColumn_();

  const ranges = ss.getSelection().getActiveRangeList();
  if (!ranges) return { success: false, error: "No rows selected. Select rows first, then click assign." };

  var count = 0;
  var rangeList = ranges.getRanges();

  for (var r = 0; r < rangeList.length; r++) {
    var range = rangeList[r];
    var startRow = range.getRow();
    var numRows = range.getNumRows();

    for (var i = 0; i < numRows; i++) {
      var row = startRow + i;
      if (row <= 1) continue;

      sheet.getRange(row, SHIP_CONFIG.FI_SHIPMENT).setValue(shipmentId);
      setRowRed_(sheet, row);
      count++;
    }
  }

  updateShipmentItemCount_(shipmentId);
  rebuildPackingList_(shipmentId);

  return { success: true, count: count };
}

function unassignSelected() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  if (sheet.getName() !== CONFIG.FINAL_SHEET) {
    return { success: false, error: "Please select rows in the '" + CONFIG.FINAL_SHEET + "' sheet." };
  }

  const ranges = ss.getSelection().getActiveRangeList();
  if (!ranges) return { success: false, error: "No rows selected." };

  var affectedShipments = {};
  var count = 0;
  var rangeList = ranges.getRanges();

  for (var r = 0; r < rangeList.length; r++) {
    var range = rangeList[r];
    var startRow = range.getRow();
    var numRows = range.getNumRows();

    for (var i = 0; i < numRows; i++) {
      var row = startRow + i;
      if (row <= 1) continue;

      var currentShipment = sheet.getRange(row, SHIP_CONFIG.FI_SHIPMENT).getValue();
      if (currentShipment) affectedShipments[currentShipment] = true;

      sheet.getRange(row, SHIP_CONFIG.FI_SHIPMENT).setValue("");
      restoreRowColors_(sheet, row);
      count++;
    }
  }

  for (var sid in affectedShipments) {
    updateShipmentItemCount_(sid);
    rebuildPackingList_(sid);
  }

  return { success: true, count: count };
}

function getShipmentItems(shipmentId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.FINAL_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, SHIP_CONFIG.FI_SHIPMENT).getValues();
  const items = [];

  for (var i = 0; i < data.length; i++) {
    if (data[i][SHIP_CONFIG.FI_SHIPMENT - 1] === shipmentId) {
      items.push({
        row: i + 2,
        manufacturer: data[i][CONFIG.FI_MANUFACTURER - 1] || "",
        category: data[i][CONFIG.FI_CATEGORY - 1] || "",
        subcategory: data[i][CONFIG.FI_SUBCATEGORY - 1] || "",
        name: data[i][CONFIG.FI_NAME - 1] || "",
        quantity: data[i][CONFIG.FI_QUANTITY - 1] || "",
        expiration: data[i][CONFIG.FI_EXPIRATION - 1] || "",
        pallet: data[i][CONFIG.FI_PALLET - 1] || "",
        box: data[i][CONFIG.FI_BOX - 1] || "",
      });
    }
  }

  return items;
}

function updateShipmentStatus(shipmentId, status) {
  const sheet = getShipmentLogSheet_();
  const data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === shipmentId) {
      sheet.getRange(i + 1, 6).setValue(status);
      if (status === "Shipped") {
        sheet.getRange(i + 1, 5).setValue(new Date());
      } else {
        sheet.getRange(i + 1, 5).setValue("");
      }
      return { success: true };
    }
  }

  return { success: false, error: "Shipment not found." };
}

function deleteShipment(shipmentId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fiSheet = ss.getSheetByName(CONFIG.FINAL_SHEET);

  if (fiSheet && fiSheet.getLastRow() > 1) {
    const col = SHIP_CONFIG.FI_SHIPMENT;
    const data = fiSheet.getRange(2, col, fiSheet.getLastRow() - 1, 1).getValues();

    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === shipmentId) {
        fiSheet.getRange(i + 2, col).setValue("");
        restoreRowColors_(fiSheet, i + 2);
      }
    }
  }

  // Delete packing list sheet
  var packSheet = ss.getSheetByName(SHIP_CONFIG.PACKING_PREFIX + shipmentId);
  if (packSheet) {
    ss.deleteSheet(packSheet);
  }

  // Delete log row
  const logSheet = getShipmentLogSheet_();
  const logData = logSheet.getDataRange().getValues();

  for (var j = 1; j < logData.length; j++) {
    if (logData[j][0] === shipmentId) {
      logSheet.deleteRow(j + 1);
      return { success: true };
    }
  }

  return { success: false, error: "Shipment not found." };
}


// ─── SELECT ITEMS IN SHEET ──────────────────────────────────────

function selectShipmentItems(shipmentId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.FINAL_SHEET);
  if (!sheet) return { success: false, error: "Final Inventorying sheet not found." };

  ss.setActiveSheet(sheet);

  if (sheet.getLastRow() <= 1) return { success: false, error: "No data in sheet." };

  const data = sheet.getRange(2, SHIP_CONFIG.FI_SHIPMENT, sheet.getLastRow() - 1, 1).getValues();
  var a1List = [];

  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === shipmentId) {
      var row = i + 2;
      a1List.push("A" + row + ":N" + row);
    }
  }

  if (a1List.length === 0) return { success: false, error: "No items found for this shipment." };

  // Try setActiveRangeList
  try {
    var rangeList = sheet.getRangeList(a1List);
    ss.setActiveRangeList(rangeList);
  } catch (e) {
    // Fallback: select first row
    sheet.setActiveRange(sheet.getRange(a1List[0]));
  }

  return { success: true, count: a1List.length };
}


// ─── ITEM COUNT ─────────────────────────────────────────────────

function updateShipmentItemCount_(shipmentId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fiSheet = ss.getSheetByName(CONFIG.FINAL_SHEET);
  const logSheet = getShipmentLogSheet_();

  if (!fiSheet || fiSheet.getLastRow() <= 1) return;

  var count = 0;
  var data = fiSheet.getRange(2, SHIP_CONFIG.FI_SHIPMENT, fiSheet.getLastRow() - 1, 1).getValues();

  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === shipmentId) count++;
  }

  var logData = logSheet.getDataRange().getValues();
  for (var j = 1; j < logData.length; j++) {
    if (logData[j][0] === shipmentId) {
      logSheet.getRange(j + 1, 8).setValue(count);
      break;
    }
  }
}


// ─── SHIPMENT SUMMARY ──────────────────────────────────────────

function getShipmentSummary(shipmentId) {
  var items = getShipmentItems(shipmentId);
  var byCategory = {};
  var bySubcategory = {};
  var totalQty = 0;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var q = parseInt(item.quantity) || 0;
    totalQty += q;

    var cat = item.category || "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = { count: 0, qty: 0 };
    byCategory[cat].count++;
    byCategory[cat].qty += q;

    var sub = item.subcategory || "Other";
    if (!bySubcategory[sub]) bySubcategory[sub] = { count: 0, qty: 0 };
    bySubcategory[sub].count++;
    bySubcategory[sub].qty += q;
  }

  return {
    totalItems: items.length,
    totalQuantity: totalQty,
    byCategory: byCategory,
    bySubcategory: bySubcategory,
    items: items,
  };
}


// ═════════════════════════════════════════════════════════════════
// PACKING LIST — Auto-generated sheet per shipment
// ═════════════════════════════════════════════════════════════════

function rebuildPackingList_(shipmentId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fiSheet = ss.getSheetByName(CONFIG.FINAL_SHEET);
  if (!fiSheet || fiSheet.getLastRow() <= 1) return;

  const sheetName = SHIP_CONFIG.PACKING_PREFIX + shipmentId;
  var packSheet = ss.getSheetByName(sheetName);

  // Read current items from Final Inventorying
  var fiData = fiSheet.getRange(2, 1, fiSheet.getLastRow() - 1, SHIP_CONFIG.FI_SHIPMENT).getValues();
  var newItems = [];

  for (var i = 0; i < fiData.length; i++) {
    if (fiData[i][SHIP_CONFIG.FI_SHIPMENT - 1] === shipmentId) {
      newItems.push({
        sourceRow: i + 2,  // row in Final Inventorying (used as unique key)
        name: fiData[i][CONFIG.FI_NAME - 1] || "",
        category: fiData[i][CONFIG.FI_CATEGORY - 1] || "",
        subcategory: fiData[i][CONFIG.FI_SUBCATEGORY - 1] || "",
        box: fiData[i][CONFIG.FI_BOX - 1] || "",
        pallet: fiData[i][CONFIG.FI_PALLET - 1] || "",
        quantity: fiData[i][CONFIG.FI_QUANTITY - 1] || "",
      });
    }
  }

  // If no items, delete sheet if it exists
  if (newItems.length === 0) {
    if (packSheet) {
      try { ss.deleteSheet(packSheet); } catch (e) {}
    }
    return;
  }

  // Read existing checkbox states (keyed by source row number)
  var existingChecks = {};
  if (packSheet && packSheet.getLastRow() > 1) {
    var existingData = packSheet.getRange(2, 1, packSheet.getLastRow() - 1, 8).getValues();
    for (var j = 0; j < existingData.length; j++) {
      var srcRow = existingData[j][7]; // column H = source row key
      if (srcRow) {
        existingChecks[srcRow] = existingData[j][0] === true; // column A = checkbox
      }
    }
  }

  // Create or clear the sheet
  if (!packSheet) {
    packSheet = ss.insertSheet(sheetName);
  } else {
    packSheet.clear();
  }

  // Headers
  var headers = ["Gathered", "Item Name", "Category", "Subcategory", "Box #", "Pallet #", "Qty", "Source Row"];
  packSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  packSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  packSheet.getRange(1, 1, 1, headers.length).setBackground("#000e3f");
  packSheet.getRange(1, 1, 1, headers.length).setFontColor("#ffffff");

  // Write items
  var rows = [];
  for (var k = 0; k < newItems.length; k++) {
    var it = newItems[k];
    var wasChecked = existingChecks[it.sourceRow] === true;
    rows.push([
      wasChecked,     // Checkbox
      it.name,
      it.category,
      it.subcategory,
      it.box,
      it.pallet,
      it.quantity,
      it.sourceRow,   // Hidden key
    ]);
  }

  if (rows.length > 0) {
    packSheet.getRange(2, 1, rows.length, 8).setValues(rows);

    // Insert checkboxes in column A
    packSheet.getRange(2, 1, rows.length, 1).insertCheckboxes();

    // Restore checked states
    for (var m = 0; m < rows.length; m++) {
      if (rows[m][0] === true) {
        packSheet.getRange(m + 2, 1).setValue(true);
      }
    }

    // Alternating row colors
    for (var n = 0; n < rows.length; n++) {
      var bg = (n % 2 === 0) ? "#f3f6ff" : "#ffffff";
      packSheet.getRange(n + 2, 1, 1, 8).setBackground(bg);
    }
  }

  // Column widths
  packSheet.setColumnWidth(1, 70);   // Gathered
  packSheet.setColumnWidth(2, 220);  // Item Name
  packSheet.setColumnWidth(3, 80);   // Category
  packSheet.setColumnWidth(4, 150);  // Subcategory
  packSheet.setColumnWidth(5, 60);   // Box
  packSheet.setColumnWidth(6, 70);   // Pallet
  packSheet.setColumnWidth(7, 50);   // Qty
  packSheet.setColumnWidth(8, 80);   // Source Row

  // Optionally hide the Source Row column (keeps the key but out of sight)
  packSheet.hideColumns(8);

  // Freeze header
  packSheet.setFrozenRows(1);
}

// Helper
function columnToLetter_(col) {
  var letter = "";
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

// Public wrapper — _ functions can't be called from google.script.run
function openPackingList(shipmentId) {
  rebuildPackingList_(shipmentId);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var packSheet = ss.getSheetByName(SHIP_CONFIG.PACKING_PREFIX + shipmentId);
  if (packSheet) {
    ss.setActiveSheet(packSheet);
  }
}
