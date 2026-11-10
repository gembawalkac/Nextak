# Akro Daily Planner — full backup, version 25

Packaged November 10, 2026. Includes the November 9 demand update through 2027 week 26.
Published source commit: 7c0162dca4d2fd60476b3a34f2e302a9e6308d73
Site: https://americase-akro-daily-planner.corytroxell3.chatgpt.site/

## What is included

- dist/: all HTML, CSS, JavaScript source modules and seed.json required to run the app.
- tests/: all 144 automated model and behavior checks.
- package.json: test command; no third-party dependencies or build step.
- .openai/hosting.json: original Sites identity and static directory configuration.
- README.md: original accumulated development notes. Some early sections describe superseded behavior; the actual source and tests are authoritative.
- BACKUP_MANIFEST.json: file list and SHA-256 checksums.
- VALIDATION.txt: test results for this exact source snapshot.

## Run on your computer

1. Extract the entire ZIP.
2. Install Python 3 if it is not already available.
3. Open a terminal in the extracted project folder and run:

   python -m http.server 8000 --directory dist

   On macOS/Linux, use python3 instead of python. On Windows, py may also be used.
4. Open http://localhost:8000 in a modern browser.

Keep the terminal open while using the app. Stop the server with Ctrl+C.
Use a local HTTP server; opening index.html directly as a file will not reliably load its modules and demand JSON.

## Deploy elsewhere

Upload the CONTENTS of dist/ to the web root of any static web host. Keep every file and its relative path. No Node server, database, API key, ChatGPT account or compilation is required to run this standalone static app. The host must serve .js modules with a JavaScript content type and allow seed.json to be fetched from the same origin.

The .openai/hosting.json file is for the original Sites project only; it is not needed by another static host. Do not point a new Sites project at the original project ID. Access restrictions on the original Sites URL do not transfer to another host; configure the destination host's access controls as needed.

## Bring your current saved plan with you

The ZIP includes the published demand and default inputs, NOT the browser-local plan saved on your computer. Manual cart loads, edited settings, lead times and other browser-local changes cannot be recovered from source code alone.

1. In the current site and browser you use for planning, select Save backup at the bottom of the page. This downloads Akro_Simple_Plan.json.
2. Keep that JSON alongside this ZIP.
3. Open the standalone/newly hosted app and choose Open backup to import that JSON.
4. Verify demand, dates, opening stock/carts, manual plans and product lead times before using the forecast.

Saved entries are per browser and origin. They do not synchronize between computers, users, or a new hosting URL. Use Save backup/Open backup to move plans. Demand data includes 2027 weeks; extend the plan end date in Settings when you want forecasts for those dates.

## How the app works

Weekly demand is entered by product as cases or direct Total_AKRO sheets. The planner rounds each product/week's sheet requirement up once. It simulates whole 20-sheet carts subject to daily/weekly forming limits, oven occupancy, thickness limits, cure durations, holidays and manual cart plans. Waterjet shutdowns stop withdrawals while permitting eligible oven activity. Holiday loads must finish curing on an available unloading day.

Views cover weekly demand, manual weekly plans, the cart calendar and occupancy, closing inventory, order readiness, critical builds, and product lead times. Complete downstream routes use 10-hour shifts, per-product batch hours and 20-sheet waterjet pulls; OXB-787 products bypass lamination. Incomplete routes retain the fallback assumptions defined by the source. Forecast dates and quantities are plans, not recorded production actuals, and do not establish physical rack/cart fit.

## Run the checks (optional)

With a current Node.js installation, run npm test from the extracted project folder. No npm install is required. This snapshot passed all 144 tests when packaged.
