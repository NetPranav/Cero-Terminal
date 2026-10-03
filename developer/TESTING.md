# Automated Testing & Quality Assurance Guide

Cero relies on a continuous, automated unit testing architecture to ensure high system stability, regression-free conversational translations, and deterministic capability executions across operating system deployments.

---

## 🚀 Running the Verification Suite

Our verification framework utilizes **Vitest**, providing sub-second TypeScript processing and deep system mocking capabilities.

Execute the full test battery directly from your repository workspace:
```bash
npx vitest run
# or
npm test
```

### What Our 69+ Automated Tests Validate:
1. **Tool Registry & Knowledge Base Synchronization**:
   - Asserts that all **97+ capability JSON specifications** loaded under `tools/` comply strictly with Zod schema boundaries.
   - Verifies semantic domain indexes, tag routing algorithms, and custom alias matching behaviors.
2. **AI Intent & Entity Parsing Accuracy**:
   - Confirms conversational expressions (*"kill antigravity"*, *"stop chrome"*, *"open youtube.com in safari"*) translate cleanly into accurate tool targets without entity truncation or syntax regressions.
   - Validates multi-word conversational parameter trimming across directory navigation commands.
3. **Zero-Trust Security Guardrails**:
   - Enforces risk evaluation score metrics across proposed workflows.
   - Proves that destructive filesystem mutations (`filesystem.delete`) successfully trigger mandatory authorization holds and audit logs!
4. **End-to-End Capability SDK Drivers**:
   - Ensures every single advertised operational tool schema corresponds to an executable concrete driver inheriting from `BaseCapabilityDriver`.

---

## 🧪 Writing Custom Unit Assertions

When contributing a brand new operating capability or Intent Engine enhancement, always include accompanying automated test verification!

### Example: Testing Conversational Entity Resolution
When extending `IntentEngine.test.ts`, utilize our standard testing conventions:
```typescript
import { describe, it, expect } from 'vitest';
import { IntentEngine } from '../IntentEngine';
import { ToolLoader } from '../../tools/loader/ToolLoader';

describe('AI Intent Engine — Conversational Parameter Parsing', () => {
  it('should cleanly translate website domains and target application parameters', async () => {
    const loader = new ToolLoader();
    loader.loadAll();
    const intentEngine = new IntentEngine(loader.getState());

    const result = await intentEngine.analyze('open youtube.com in safari', 'mac');
    expect(result.tasks[0].tool).toBe('application.open_web_link');
    expect(result.tasks[0].entities.url).toContain('youtube.com');
    expect(result.tasks[0].entities.appName.toLowerCase()).toBe('safari');
  });
});
```

---

## 🔍 Continuous Integration (CI) Compliance
Never merge code to protected branches without confirming clean test executions. Our continuous build pipelines automatically reject submissions containing failing assertions or unhandled schema validation errors.
