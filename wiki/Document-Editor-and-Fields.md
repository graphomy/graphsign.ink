# Visual Document Editor & Field Placement (FR-008 & FR-009)

The **Visual Document Editor** provides an interactive multi-page canvas where document authors place signature elements, text inputs, dates, and selection fields with recipient assignment, validation rules, and simulation preview.

---

## 🎨 Canvas Architecture & Controls

- **Multi-Page Layout**: Renders contract pages sequentially with visual separation.
- **Navigation Controls**:
  - Zoom In / Zoom Out (from 50% to 200%).
  - Fit to Width / Reset Zoom.
  - Left-hand thumbnail sidebar for navigating pages.
- **Coordinate System**: Normalized coordinates (`x`, `y`, `width`, `height`, `pageNumber`) ensure consistent rendering across desktop and mobile screens.

---

## 🛠️ Field Palette & Supported Field Types

| Icon | Field Type | Purpose | Validation Options |
| :---: | :--- | :--- | :--- |
| ✍️ | **SIGNATURE** | Primary legal electronic signature | Required toggle |
| 🔤 | **INITIALS** | Signer initials for margins and terms | Required toggle |
| 📝 | **TEXT** | Single-line or multi-line text input | Required, min/max length, regex |
| 📅 | **DATE** | Date signed or specified date | Date formats (`DD-MON-YYYY`, etc.) |
| ✉️ | **EMAIL** | Email address input | RFC 5322 regex validation |
| 🏢 | **COMPANY** | Organization or designation | Required toggle |
| ☑️ | **CHECKBOX** | Acknowledgment checkbox | Required toggle |
| 🔘 | **RADIO** | Single selection among options | Choice list options |
| 🔽 | **DROPDOWN** | Select from option menu | Choice list options |

---

## 👥 Recipient Assignment & Visual Color Coding

- Authors configure recipients (*Signer 1*, *Signer 2*, *Approver*, *Viewer*).
- Every placed field is assigned to a specific recipient.
- **Color Coding**: Each recipient has a dedicated color badge and canvas border highlighting, making multi-party contracts intuitive to inspect at a glance.

---

## ⚙️ Field Validation & Property Inspector

Clicking any field on the canvas opens the right-hand Property Inspector:
- **Label & Placeholder**: User-friendly prompt and instructional text.
- **Required Constraint**: Toggles mandatory completion before the signer can submit.
- **Validation Rules**:
  - `email`: Enforces valid email syntax.
  - `number`: Enforces numeric digits and range bounds.
  - `regex`: Custom regular expression pattern with friendly error message.

---

## 👁️ Signer Simulation (Preview Mode)

- Authors can toggle between **Edit Mode** and **Preview Mode** at any time.
- The **Recipient Switcher** allows authors to test the perspective of each signer.
- Interactive simulation verifies field tab ordering, dropdown menus, and validation rules before the envelope is sent.

---

## 🔌 API Endpoints for Fields & Recipients

### 1. Fetch Fields & Recipients
```http
GET /api/v1/agreements/:id/fields
Authorization: Bearer <jwt-token>
```

### 2. Save Fields & Recipients
```http
PUT /api/v1/agreements/:id/fields
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "fields": [
    {
      "id": "f-sig-1",
      "type": "SIGNATURE",
      "pageNumber": 1,
      "x": 100,
      "y": 650,
      "width": 200,
      "height": 60,
      "label": "Client Signature",
      "recipientId": "recip-1",
      "isRequired": true
    }
  ],
  "recipients": [
    {
      "id": "recip-1",
      "name": "Jane Doe",
      "email": "jane@client.com",
      "role": "signer",
      "routingOrder": 1,
      "color": "#2563EB"
    }
  ]
}
```
