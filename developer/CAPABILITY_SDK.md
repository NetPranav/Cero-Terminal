# Capability SDK — Concrete OS Execution Drivers

The **Capability SDK** bridges structured AI workflows with concrete operating system APIs. Every operational ability advertised in the Tool Registry corresponds directly to an object-oriented execution driver residing under `src/sdk/capabilities/drivers/`.

---

## 🏛️ Driver Design Architecture

Rather than executing ad-hoc terminal string injections, Cero extends an enterprise-grade driver abstraction:
```
BaseCapabilityDriver (src/sdk/capabilities/drivers/BaseCapabilityDriver.ts)
  ├── FilesystemSDKCapability.ts  # Directory navigation (cd), recursive listing, trash API
  ├── SystemSDKCapability.ts      # Process sweeping (pkill -f), listening socket audits
  ├── ApplicationCapability.ts    # Launch Services (open -a), window focusing & management
  ├── NetworkSDKCapability.ts     # Wi-Fi toggle switches, bluetooth hardware states
  └── ShellSDKCapability.ts       # Direct pseudo-terminal command injection & variables
```

---

## 💻 Building an E2E Capability Driver

When implementing a custom driver to fulfill a newly defined tool schema, follow our standardized capability lifecycle pattern:

```typescript
import { BaseCapabilityDriver, CapabilityExecutionResult } from './BaseCapabilityDriver';

export class CustomApplicationDriver extends BaseCapabilityDriver {
  constructor() {
    super('application.custom_action', 'Low');
  }

  public async execute(params: Record<string, any>): Promise<CapabilityExecutionResult> {
    // 1. Parameter Validation & Sanitization
    const targetApp = String(params.appName || '').replace(/["']/g, '').trim();
    const targetUrl = String(params.url || '').trim();

    if (!targetApp) {
      return { success: false, error: 'Target application name is required.' };
    }

    try {
      // 2. Execute Native OS Command via Tauri Child Process / PTY Bridge
      const cmd = `open -a "${targetApp}" "${targetUrl}"`;
      
      // 3. Construct Deterministic Result with Optional Rollback Payload
      return {
        success: true,
        data: {
          appName: targetApp,
          url: targetUrl,
          stdout: `Successfully launched ${targetApp} directed to ${targetUrl}`
        },
        commandExecuted: cmd,
        rollback: async () => {
          // Define cleanup routines if sequential pipeline failures occur downstream
          await this.executeSystemCleanup(targetApp);
        }
      };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }
}
```

---

## ⚙️ Specialized Driver Behaviors in Cero

### 1. Full Process Elimination (`pkill -9 -i -f`)
When an end-user executes process termination instructions (such as `"kill antigravity"` or `"stop chrome"`), simple Process ID table lookups often overlook orphan background workers, hidden daemon processes, or multi-threaded browser renderer tasks. Our drivers (`SystemSDKCapability` and `ApplicationCapability`) execute full command-line string matching (`pkill -9 -i -f "<name>"`) to guarantee complete application elimination across all active OS user threads.

### 2. Launch Services & Web Link Scheme Normalization
Our application launcher drivers automatically evaluate user parameters for web destinations. If a natural language utterance like `"open youtube.com in safari"` omits protocol designations, our SDK driver injects strict secure HTTPS schemas (`https://youtube.com`) prior to invoking native macOS Launch Services (`open -a`).

### 3. Developer Scaffolding Operations
The `DeveloperCapability` has been augmented with a native `scaffold` tool to instantly configure full-stack architectures. Given `frontend` (e.g., `nextjs`, `react`) and `backend` (e.g., `django`, `express`) frameworks, the driver constructs complex execution chains integrating package managers (e.g., `npx create-next-app`, `python3 -m venv`) completely bypassing LLM syntax hallucination.

### 4. Native Application Upgrading (`application.update`)
The `ApplicationCapability` natively interfaces with host package managers (like `brew`) to upgrade specific GUI and terminal software upon request. It contains hardcoded safety thresholds to identify and decline updates for core macOS utilities (like `Finder` or `System Settings`).
