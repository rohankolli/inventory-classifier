# AI Inventory Classifier (Google Sheets + Apps Script)

A mobile-friendly web app for logging donated or warehouse inventory. Volunteers photograph an item's label, enter a quantity and expiration date, and Google Gemini classifies the item into your categories. It also reads the manufacturer, product name and lot number from the label. Every entry is written to a Google Sheet, the photo is saved to Google Drive, and the app tells the volunteer which box to put the item in.

Originally built for **Blueprints for Pangaea (B4P)** to sort medical supplies. The categories, prompt and branding can all be swapped out for any inventory you want to sort: food bank donations, school supplies, clothing, lab equipment, and so on.

> **No API key is included in this repo.** You supply your own Gemini key through Apps Script's Script Properties (see setup step 4). Never paste a key into `Code.gs` before committing it anywhere.

---

## What's in this repo

| File | Where it goes | What it does |
|---|---|---|
| `Code.gs` | Apps Script → `Code.gs` | Server code: Gemini classification, writing to sheets, Drive photo upload, box-number tracking, shipment manager |
| `Index.html` | Apps Script → HTML file named `Index` | The phone-friendly volunteer web app |

## Features

- **Photo → AI classification.** Gemini reads the label and returns a category, subcategory, manufacturer, product name, generic type, lot number and notes.
- **Human in the loop.** Volunteers see the AI's guess with a confidence badge, can override the category, and can flag an item for review.
- **Automatic box numbering.** Each category has its own box counter per section (A/B). Tick "Box is full" and the next item in that category goes into a new box.
- **Photos saved to Drive.** Images are uploaded to an `Inventory Images` folder and linked from the sheet.
- **Shipment manager** (a spreadsheet menu). Group inventory rows into shipments, track their status and auto-generate a printable packing list with checkboxes.

---

## Setup (about 10 minutes)

### 1. Create the Google Sheet

Create a new Google Sheet and rename the first tab to **`Form Responses 1`**. Add these headers in row 1, columns A–I:

```
Timestamp | Image | Quantity | Expiration | Pallet | Box Number | Review | Section | Subcategory
```

The other tabs (`Final Inventorying`, `BoxCounters`, `Shipment Log` and the packing lists) are created automatically the first time they're needed.

### 2. Add the code

1. In the Sheet, go to **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with the contents of [`Code.gs`](Code.gs).
3. Click **+ → HTML**, name it `Index` (no `.html`), and paste in [`Index.html`](Index.html).

### 3. Get a Gemini API key

Create a key at [Google AI Studio](https://aistudio.google.com/apikey). It works on the free tier right away. For a real inventory drive, see [API & cost breakdown](#api--cost-breakdown) for deciding whether to enable billing.

### 4. Store the key securely

In Apps Script, click **Project Settings** (gear icon) → **Script Properties** → **Add script property**:

| Property | Value |
|---|---|
| `GEMINI_API_KEY` | *your key* |

The code reads the key from Script Properties at runtime, so it never appears in the source.

### 5. Deploy as a web app

1. **Deploy → New deployment** → type **Web app**
2. **Execute as:** Me  ·  **Who has access:** Anyone (or "Anyone in your organization")
3. Click **Deploy**, authorize the requested permissions and copy the URL.
4. Send that URL to your volunteers. On a phone, "Add to Home Screen" makes it feel like an app.

> ⚠️ **After any code change you must publish a new version:** Deploy → Manage deployments → ✏️ Edit → Version: **New version** → Deploy. Saving the code alone does not update the live URL.

### 6. (Optional) Shipment Manager sidebar

`Code.gs` adds a **Shipments** menu to the spreadsheet. Its "Open Shipment Manager" item expects an HTML file named `Sidebar`, which is **not included in this repo**. The "View Box Counters" and "Reset Box Counters" menu items work without it. If you want the sidebar, create a `Sidebar` HTML file that calls the public functions in the Shipment Manager section of `Code.gs` (`getShipments`, `createShipment`, `assignSelectedToShipment`, `unassignSelected`, `updateShipmentStatus`, `deleteShipment`, `selectShipmentItems`, `getShipmentSummary`, `openPackingList`) through `google.script.run`.

---

## API & cost breakdown

### Which APIs are used

| Service | Used for | Cost |
|---|---|---|
| **Google Gemini API** | Reading the label photo and classifying the item (`classifyImage()`) | **The only paid part** (see below) |
| Google Apps Script | Hosting the web app and running the code | Free |
| Google Sheets | Storing inventory rows | Free |
| Google Drive | Storing item photos | Free, within your Drive storage (15 GB on a free Google account) |

### How the Gemini call works

Each time a volunteer taps **Analyze & Continue**, the app makes exactly **one** API call:

1. The phone shrinks the photo to at most 1024 px and compresses it as a JPEG (in `handleImage()` in `Index.html`), then sends it to Apps Script.
2. `classifyImage()` in `Code.gs` reads `GEMINI_API_KEY` from Script Properties and sends the image plus the prompt to:
   ```
   POST https://generativelanguage.googleapis.com/v1beta/models/{CONFIG.GEMINI_MODEL}:generateContent
   ```
   with `responseMimeType: "application/json"`, `maxOutputTokens: 1024` and `thinkingLevel: "low"`.
3. Gemini returns JSON like:
   ```json
   {"category":"DME","subcategory":"Airway & Oxygen","confidence":"high",
    "manufacturer":"Medline","product":"Nasal Cannula, Adult, 7ft","general":"nasal cannula",
    "lotNumber":"23A114","notes":"Adult cannula with 7 ft tubing; lot printed on the side."}
   ```
4. The code checks that the category and subcategory are in your lists and replaces invalid values with a fallback before the volunteer sees the result.

Submitting an entry does **not** call Gemini. It only writes to Sheets and Drive. Retaking a photo and analyzing it again counts as a second call.

The key stays server-side in Apps Script. Volunteers' phones never see it.

### Cost per item

Prices below are Google's published rates for **`gemini-3.8-flash`** (the default in `CONFIG.GEMINI_MODEL`), checked October 2026:

| | Through Dec 31, 2026 | From Jan 1, 2027 |
|---|---|---|
| Input (text + image), per 1M tokens | $0.75 | $1.50 |
| Output (including thinking), per 1M tokens | $3.75 | $7.50 |

Estimated tokens for **one** scan:

| Part | Tokens (approx.) |
|---|---|
| Photo (Gemini 3.x default image resolution) | ~1,120 |
| Prompt text | ~900 |
| **Total input** | **~2,000** |
| Output JSON + "low" thinking | ~300–700 (hard cap 1,024) |

| | 2026 price | 2027 price |
|---|---|---|
| **Per item (typical)** | ~$0.003 | ~$0.007 |
| **Per item (worst case, output hits the 1,024 cap)** | ~$0.005 | ~$0.011 |
| **1,000 items** | **~$3–5** | **~$7–11** |
| **10,000 items** | ~$34–53 | ~$68–107 |

So a full inventory drive of a few thousand items costs **roughly the price of a pizza**. These are estimates: check the actual usage in [AI Studio](https://aistudio.google.com/usage) after your first few hundred scans.

### Free tier vs. paid tier

- **Free tier:** no billing needed. You can use it to try the app out and run small sessions. Rate limits apply (requests per minute and per day, which vary by model; view yours in AI Studio). When you hit a limit, the volunteer sees "AI failed" and can pick a category by hand. **On the free tier, Google may use your prompts and images to improve its products**, so don't use it for anything sensitive. See the [Gemini API terms](https://ai.google.dev/gemini-api/terms).
- **Paid tier:** enable billing on the key's Google Cloud project in AI Studio. You get much higher rate limits, which matter when several volunteers scan at once, and your data isn't used for product improvement. Set a **budget alert** in Google Cloud Billing so you're never surprised.

### Lowering the cost

| Option | How | Trade-off |
|---|---|---|
| Use a cheaper model | Set `CONFIG.GEMINI_MODEL` to `gemini-3.1-flash-lite` ($0.25 input / $1.50 output per 1M tokens, about **$1.25 per 1,000 items**) | Somewhat less accurate on blurry or small-print labels |
| Lower the image resolution | Add `mediaResolution: "MEDIA_RESOLUTION_LOW"` to `generationConfig` (~280 image tokens instead of ~1,120) | Lot numbers and fine print may be missed |
| Shorten the output | Lower `maxOutputTokens`, or drop fields you don't need (e.g. `notes`) from the prompt | Less detail in the sheet |
| Fewer retries | Train volunteers to take one clear, well-lit photo | n/a |

Prices change: check the [Gemini pricing page](https://ai.google.dev/gemini-api/docs/pricing) before a big drive.

### Apps Script & Drive limits (free)

- **Photos:** each compressed photo is about 100–250 KB, so 1,000 photos take roughly 150–250 MB of the deploying account's Drive.
- **Apps Script quotas:** external API calls (`UrlFetchApp`) are capped per day, at about 20,000 for consumer Gmail accounts and higher for Google Workspace. That's far more than a typical drive needs. See [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).
- All usage counts against the account that **deployed** the web app ("Execute as: Me"), not the volunteers' accounts.

---

## Adapting it for your organization

You can do everything below without understanding the whole codebase. Change the pieces in order and redeploy.

### Step 1: Define your categories (two places, kept in sync)

**Main categories** decide which box an item goes into. They're defined in **two files** and must match exactly, with the same spelling and order:

**`Code.gs` → `CONFIG.CATEGORIES`**
```js
CATEGORIES: [
  "Canned Goods",
  "Dry Goods",
  "Hygiene",
  "Baby",
  "Other",
],
```

**`Index.html` → `var CATEGORIES`** (adds a display color for each)
```js
var CATEGORIES = [
  { code: "Canned Goods", color: "#0069f3" },
  { code: "Dry Goods",    color: "#dc2626" },
  { code: "Hygiene",      color: "#373c82" },
  { code: "Baby",         color: "#0035a2" },
  { code: "Other",        color: "#6b7280" },
];
```

> The **first** category in the list is the fallback when the AI returns something invalid, so put your most generic or most common category first, or make it something like "Needs Sorting".

**Subcategories** add finer detail but don't affect box numbers. Edit `CONFIG.SUBCATEGORIES` in `Code.gs`. Keep a catch-all entry: the code falls back to `"Misc Non-Medical"` when the AI's subcategory isn't in the list, so either keep that exact name or change the two places in `classifyImage()` that say `"Misc Non-Medical"` to your own catch-all.

### Step 2: Rewrite the AI prompt (the step that most affects accuracy)

The prompt is the template string inside `classifyImage()` in `Code.gs`. The category and subcategory lists are inserted automatically from `CONFIG`. **The descriptions are hand-written, so you must update them to match your categories.**

Rewrite these parts:

1. **The opening line:** `"You are cataloging medical supplies..."` → describe your domain, e.g. `"You are cataloging food bank donations..."`.
2. **"Main category descriptions"**: write one line per category, using the **exact category code** from `CONFIG.CATEGORIES`, with examples of what belongs in it. This is how the AI tells your categories apart.
   ```
   - Canned Goods: Any food in a can or jar (soup, vegetables, beans, tuna)
   - Dry Goods: Boxed or bagged shelf-stable food (pasta, rice, cereal)
   ```
3. **"Subcategory → main category guide"**: map each subcategory to its parent category using the exact codes.
4. **"EXTRACT from the label"**: keep, drop or rename fields to suit your items. If you change the field names, see Step 3.

> 📝 **Note on the original code:** the shipped prompt still describes an older category set (e.g. "PPE", "Surgical Tools", "Hygiene") that doesn't match the current `CONFIG.CATEGORIES` codes (`TC/RC`, `ER`, `DME`, ...). Fixing that mismatch is the first thing to do when you adapt the prompt, because descriptions that match the codes classify more accurately.

**Tips for better results:**
- Give 3–6 concrete examples per category. Describe what the label looks like, not just the concept.
- Spell out tie-break rules for items that could go in two categories ("If an item is both X and Y, choose X").
- Keep the final `Respond with ONLY valid JSON...` line, because the code parses that JSON.
- Test with 10–20 real photos and refine the descriptions where the AI gets confused.

### Step 3: Change the data you collect (optional)

To add, remove or rename fields (e.g. drop "lot number" and add "weight"):

1. **Prompt:** add the field to the "EXTRACT" list and to the example JSON at the end.
2. **`Index.html` → `submitEntry()`**: pass the new field through, e.g. `weight: ai.weight || ""`.
3. **`Code.gs` → `submitEntry()`**: add it to the object passed to `appendToFinalSheet_`.
4. **`Code.gs` → `CONFIG`**: add a column number (e.g. `FI_WEIGHT: 14`), then add it to the `headers` array in `getFinalSheet_()` and the `writes` array in `appendToFinalSheet_()`.

> ⚠️ The Shipment Manager uses **column 14** of `Final Inventorying` (`SHIP_CONFIG.FI_SHIPMENT`). If you add columns, move it to the next free column and update the `"A" + row + ":N" + row` range in `selectShipmentItems()` to match.

To collect a field the **volunteer types in** (rather than the AI reading it), copy the Quantity input in `Index.html`, read its value in `analyzeImage()`, and pass it through `submitEntry()` in the same way.

### Step 4: Rename sheets and columns (optional)

All tab names and column positions live at the top of `Code.gs`:

```js
RESPONSES_SHEET: "Form Responses 1",
FINAL_SHEET: "Final Inventorying",
COL_TIMESTAMP: 1,  // column A
...
FI_MANUFACTURER: 1,
...
IMAGE_FOLDER_NAME: "Inventory Images",
```

Change them to match your existing spreadsheet layout instead of reorganizing the sheet. Column numbers are 1-indexed (A = 1, B = 2, ...).

### Step 5: Box numbering

```js
SECTION_A_START: 1,   // Section A uses boxes 1, 3, 5, ...
SECTION_B_START: 2,   // Section B uses boxes 2, 4, 6, ...
BOX_INCREMENT: 2,
```

Two sections (e.g. two volunteer tables) share a single number sequence without colliding. Each category keeps its own counter.

- **One section only:** set `SECTION_A_START: 1`, `BOX_INCREMENT: 1`, and remove the Section B button from the setup screen in `Index.html`.
- **Box numbers per category look the same** (category "A" box 1 vs. category "B" box 1)? That's intentional: label boxes with the category plus the number, or add a prefix in `getCurrentBoxNumber_()`.
- After changing categories, run **Shipments → Reset Box Counters** in the spreadsheet so the counter table is rebuilt with the new categories.

"Pallet" is just a free-text location tag entered on the setup screen. Rename the label in `Index.html` to "Shelf", "Room", "Bin" or whatever fits your workflow.

### Step 6: Branding

In `Index.html`:
- **Colors:** edit the CSS variables in `:root` (`--b4p-blue`, `--b4p-navy`, etc.).
- **Name:** replace "B4P Inventory" (appears in several headers), "Blueprints for Pangaea" (setup screen) and the `<title>`.
- **Logo:** replace the two `<symbol>` elements (`b4p-logo` and `b4p-logo-white`) with your own SVG.
- **Packing list header color:** `#000e3f` in `rebuildPackingList_()` in `Code.gs`.
- **Row highlight colors** for shipped items: `setRowRed_()` and `restoreRowColors_()` in `Code.gs`.

### Step 7: Model choice

The Gemini model is set in one place, `CONFIG.GEMINI_MODEL` in `Code.gs`. If Google retires that model or you want a cheaper or more accurate one, change the name there. See the [Gemini models list](https://ai.google.dev/gemini-api/docs/models). If you switch to a model that doesn't support `thinkingConfig`, remove that block from `generationConfig`.

---

## Customization checklist

- [ ] `CONFIG.CATEGORIES` in `Code.gs` matches `CATEGORIES` in `Index.html` exactly
- [ ] `CONFIG.SUBCATEGORIES` updated and the catch-all fallback name is valid
- [ ] Prompt opening line, category descriptions and subcategory guide rewritten with the exact codes
- [ ] Sheet tab names and column numbers in `CONFIG` match your spreadsheet
- [ ] `GEMINI_API_KEY` set in Script Properties (not in code)
- [ ] Box counters reset after changing categories
- [ ] Deployed as a **new version**

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Gemini API key not set" | Add `GEMINI_API_KEY` under Project Settings → Script Properties |
| "Sheet tab 'Form Responses 1' not found" | Create that tab or change `CONFIG.RESPONSES_SHEET` |
| Code changes don't show up | Redeploy with **Version: New version** |
| Everything goes to the first category | The AI is returning a code that isn't in `CONFIG.CATEGORIES`. Make sure the prompt's descriptions use the exact codes |
| "Gemini error: model not found" | Update `CONFIG.GEMINI_MODEL` to a current model name |
| "Open Shipment Manager" errors | The `Sidebar` HTML file isn't included; see setup step 6 |

## Privacy notes

- Photos are uploaded to the deploying account's Drive and shared as **"anyone with the link can view"** so they open from the sheet. Change `setSharing(...)` in `uploadImageToDrive_()` if that's not acceptable.
- Images are sent to Google's Gemini API for classification. Don't photograph anything containing personal or patient information.
