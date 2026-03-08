# Pediatric CCC v3 — ICD-10-CM Classification Tool

A privacy-first web application that classifies ICD-10-CM diagnosis and procedure codes into **Pediatric Complex Chronic Condition (CCC) Version 3** body-system categories, based on the algorithm published by Feinstein et al. (2024).

> **Reference:** Feinstein JA, Hall M, Davidson A, Feudtner C. Pediatric Complex Chronic Condition Classification System Version 3. *JAMA Netw Open.* 2024;7(7):e2420579. [doi:10.1001/jamanetworkopen.2024.20579](https://doi.org/10.1001/jamanetworkopen.2024.20579)

## Features

- 🔍 **Manual Classification** — Enter individual ICD-10-CM Dx/Px codes with searchable dropdowns and get instant CCC body-system results
- 📊 **Batch Processing** — Upload CSV or Excel files with patient encounter data for bulk classification
- 🌐 **Bilingual Interface** — Full Turkish and English UI support
- 🔒 **Privacy-First** — Zero PHI persistence; all patient data is processed in-memory and never stored on the server
- 📋 **Two-Pass Algorithm** — Faithful implementation of the published CCC v3 algorithm (Dx → body system flags, Px → tech-dependency flags)

## CCC v3 Body-System Categories

| # | Category |
|---|----------|
| 1 | Cardiovascular |
| 2 | Respiratory |
| 3 | Neuromuscular |
| 4 | Renal / Urologic |
| 5 | Gastrointestinal |
| 6 | Hematologic / Immunologic |
| 7 | Metabolic |
| 8 | Congenital / Genetic |
| 9 | Malignancy |
| 10 | Neonatal |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 6 |
| Backend | Express.js (Node.js) |
| Styling | Vanilla CSS (custom design system) |
| i18n | react-i18next |
| Data | Static JSON mappings extracted from supplemental Excel files |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later

### Installation

```bash
# Clone the repository
git clone https://github.com/onurdersan/pediatric-ccc-v3.git
cd pediatric-ccc-v3

# Install dependencies
npm install
```

### Running Locally

```bash
# Start both the frontend dev server and the API server
npm run dev
```

This starts:
- **Frontend** at `http://localhost:5173`
- **API Server** at `http://localhost:3001`

### Building for Production

```bash
npm run build
```

Production files are generated in the `dist/` directory.

### Running Tests

```bash
npm test
```

## Project Structure

```
├── index.html              # Vite entry point
├── src/
│   ├── App.jsx             # Main application shell
│   ├── main.jsx            # React entry point
│   ├── index.css           # Design system & styles
│   ├── i18n.js             # Internationalization config (TR/EN)
│   ├── components/
│   │   ├── ManualClassifier.jsx      # Single-code classification UI
│   │   ├── BatchUploader.jsx         # CSV/Excel batch upload UI
│   │   ├── ResultsTable.jsx          # Classification results display
│   │   ├── SearchableCodeSelect.jsx  # ICD-10 code search dropdown
│   │   └── LanguageSwitcher.jsx      # TR/EN toggle
│   ├── data/
│   │   ├── dx_map.json     # Diagnosis code → CCC category mapping
│   │   └── px_map.json     # Procedure code → tech-dependency mapping
│   └── engine/
│       ├── classifier.js   # Core CCC v3 classification engine
│       └── normalizer.js   # ICD-10 code normalization utilities
├── server/
│   ├── index.js            # Express API server
│   └── routes/
│       ├── classify.js     # POST /api/classify — single classification
│       └── batch.js        # POST /api/batch — batch CSV/Excel processing
├── tests/                  # Unit tests (Vitest)
├── scripts/
│   └── extract-mappings.js # Script to extract mappings from supplement Excel
├── vite.config.js          # Vite configuration
└── package.json
```

## Privacy & Security

This application is designed for use with patient data and follows strict privacy principles:

- ❌ No server-side data storage or logging of patient information
- ❌ No external API calls with patient data
- ❌ No analytics or tracking on classification pages
- ✅ All classification runs in-memory on the server
- ✅ Uploaded files are processed and immediately discarded
- ✅ Stateless API — no sessions, no cookies, no databases

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Citation

If you use this tool in academic research, please cite the original CCC v3 publication:

```bibtex
@article{feinstein2024cccv3,
  title={Pediatric Complex Chronic Condition Classification System Version 3},
  author={Feinstein, James A and Hall, Matt and Davidson, Andrew and Feudtner, Chris},
  journal={JAMA Network Open},
  volume={7},
  number={7},
  pages={e2420579},
  year={2024},
  doi={10.1001/jamanetworkopen.2024.20579}
}
```
