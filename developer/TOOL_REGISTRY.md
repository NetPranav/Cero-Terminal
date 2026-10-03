# AI Operating Knowledge Base — Tool Registry

The **Tool Registry** acts as Cero’s persistent **AI Operating Knowledge Base**. Rather than hardcoding simple string scripts or brittle LLM prompts, Cero utilizes structured, schema-driven operational capability definitions.

---

## 📂 Registry Directory Hierarchy

Tool definitions reside inside the dedicated `tools/` root directory, categorized by operational domain and action:
```
tools/
├── application/       # Desktop Launch Services, web link routing, window sizing
├── filesystem/        # Directory traversal, recursive searching, safe deletion
├── network/           # Socket scanning, bluetooth status/toggles, wifi interfaces
└── system/            # Process surveillance, deep daemon killing, battery status
```

Each specific tool directory (e.g., `tools/application/web_link.open/`) contains three coordinated artifacts:
1. **`tool.json`**: Core metadata, capability ID, description, parameters, Zod definitions, and natural language aliases.
2. **`knowledge.json`**: Deeper domain semantics, sample natural language utterances, and entity mapping rules.
3. **`workflow.json`**: Pre-compiled multi-step execution graphs linking tool parameters directly to backend SDK drivers.

---

## 📜 Tool Schema Specification (`tool.json`)

All tool definitions are rigorously validated at application runtime using **Zod** schema frameworks. Below is a foundational example for creating or extending a tool:

```json
{
  "id": "application.open_web_link",
  "name": "Open Web Link in Application",
  "desc": "Launches a native desktop application or web browser directed to a specific secure URL scheme.",
  "category": "Application",
  "risk": "LOW",
  "params": [
    {
      "name": "url",
      "type": "string",
      "desc": "Web link or Uniform Resource Locator destination (e.g., youtube.com)",
      "required": true
    },
    {
      "name": "appName",
      "type": "string",
      "desc": "Target native OS application name (e.g., Safari, Chrome, Firefox)",
      "required": true
    }
  ],
  "aliases": [
    "open website",
    "launch web link in browser",
    "view domain in application",
    "navigate url in Safari"
  ],
  "sampleInput": "open youtube.com in safari"
}
```

---

## 🔍 Semantic Indexing & Alias Matching

At runtime, `ToolLoader.ts` scans the entire `tools/` directory tree—currently indexing **97+ autonomous capabilities**:
- **Domain & Tag Indexing**: Automatically groups tools into searchable indexes so the Intent Engine can score matching candidates instantly without evaluating unrelated capabilities.
- **Abbreviation Expansion**: Recognizes developer shorthand (such as mapping `"bt"` to `"bluetooth"`, `"wifi"` to `"network.interfaces"`, and `"chrome"` to `"application.open"`).
- **Zod Schema Integrity**: Any malformed tool definition or missing parameter type triggers an immediate validation failure during unit test verification (`npx vitest run`), ensuring total functional stability across the software ecosystem.
