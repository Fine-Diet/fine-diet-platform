# UPC Lookup & Provisional Foods

This document describes the UPC barcode lookup system, including normalization, candidate generation, and provisional food creation.

## Overview

The UPC lookup system handles various barcode formats and ensures consistent storage while preventing duplicate provisional records.

### Supported Formats

| Format | Length | Example | Description |
|--------|--------|---------|-------------|
| UPC-A | 12 | `014100041993` | North American standard |
| EAN-13 | 13 | `5901234123457` | International (Europe) |
| GTIN-14 | 14 | `00014100041993` | Case/pallet level |
| Short | 11 | `72745068393` | UPC-A with leading zero stripped |
| With separators | varies | `0-14100-04199-3` | User input with dashes/spaces |

## Normalization Flow

```
User Input: "0-14100-04199-3"
     ↓
normalizeUpcToDigits() → "014100041993"
     ↓
validateUpcLength() → OK (12 digits)
     ↓
buildUpcCandidates() → ['014100041993', '0014100041993', '00014100041993', '14100041993']
     ↓
lookupByUpc() → Search DB for all candidates
```

## Lookup Priority

When searching the database:

1. **Real foods first**: Prefer USDA branded, user-created, or other non-provisional matches
2. **Existing provisional**: Return existing provisional if no real food found (prevents duplicates)
3. **Create provisional**: Only create new provisional if nothing exists for any candidate

## Canonical UPC for Storage

When creating a provisional food, we store the UPC in a canonical format:

**Priority order:**
1. 12-digit UPC-A (preferred, most common)
2. 14-digit GTIN-14 (fallback for international)
3. 13-digit EAN-13
4. First candidate (last resort)

**Example:**
```
Input: '72745068393' (11 digits)
Candidates: ['72745068393', '072745068393', '0072745068393', '00072745068393']
Stored UPC: '072745068393' (12-digit canonical)
```

This ensures that rescanning the same product (with different scanner behavior) finds the existing provisional.

## Provisional Foods

### Creation Rules

- Only created when NO candidate matches exist (real or provisional)
- Stored with `source_type = 'provisional'` and `source_provider = 'scan'`
- Named as `"Unknown Product (<scanned_digits>)"` for user visibility
- Associated with the scanning user's `person_id` for tracking

### Search Hygiene

Provisional "Unknown Product" items are **deprioritized in text search**:
- Receive a -50 score penalty
- Will appear below real USDA/branded foods
- Still appear in direct UPC lookups (their intended use case)

This prevents unknown products from polluting search results for common terms.

## API Endpoint

```
GET /api/foods/upc/[code]
```

### Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `code` | string | required | UPC to look up (in any supported format) |
| `provisional` | string | `'true'` | Set to `'false'` to disable provisional creation |

### Response

```typescript
{
  found: boolean;
  food: FoodObject | null;
  isProvisional: boolean;
  needsEnrichment: boolean;
  matchedUpc?: string; // Which candidate format matched
}
```

## QA Checklist

- [ ] Scan `72745068393` when USDA has `072745068393` → returns USDA row
- [ ] Scan `72745068393` when no match exists → creates ONE provisional
- [ ] Rescan `72745068393` → returns the same provisional (no duplicate)
- [ ] Scan `0-14100-04199-3` (with dashes) → works same as `014100041993`
- [ ] Search "apple" → "Unknown Product (12345...)" does NOT appear above real foods

## Code Locations

- `lib/food/upcNormalization.ts` - Normalization utilities
- `lib/food/foodServerService.ts` - `lookupByUpc()` function
- `pages/api/foods/upc/[code].ts` - API endpoint
