---
name: qrcode.react exports
description: Correct named exports for the qrcode.react package (v4+)
---

The `qrcode.react` package (v4+) has NO default export and NO named `QRCode` export.

**Correct imports:**
```ts
import { QRCodeSVG } from "qrcode.react";  // SVG output
import { QRCodeCanvas } from "qrcode.react"; // Canvas output
```

**Wrong (causes TS errors):**
```ts
import QRCode from "qrcode.react";          // TS1192: no default export
import { QRCode } from "qrcode.react";      // TS2305: no exported member QRCode
```

**Why:** The v4 API broke from v3's default export pattern. The TypeScript declaration file confirms only QRCodeSVG and QRCodeCanvas are exported.

**How to apply:** Use `QRCodeSVG` in deposit.tsx and anywhere QR codes are rendered.
