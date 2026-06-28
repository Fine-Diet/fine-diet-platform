# Module Discovery Governance

## Purpose

The module style guide is the human discovery layer for Fine Diet page-building modules. It should help marketing, product, design, and implementation agents quickly find the right module for a page job without changing runtime behavior.

This document covers the discovery metadata layer added for `/style-guide/modules`.

## Core rule

Discovery metadata can improve findability. It must not change module runtime truth.

Discovery metadata may describe:

- human-facing nicknames
- finder descriptions
- search aliases
- tags
- preview mode
- fixture labels
- page-family guidance

Discovery metadata must not own:

- runtime schema
- component behavior
- billing truth
- entitlement truth
- checkout behavior
- user progress
- app/user-truth state
- medical or safety rules

## Category filtering stays intact

The existing category taxonomy remains the primary sort/filter system:

- hero
- content
- grid
- cta
- card
- form
- ambient
- layout
- navigation

Add a new category only when the current taxonomy cannot describe a meaningful module class. Prefer tags for page-type, pathway, and role discovery.

## Human naming

Use these layers:

- `mod.name`: canonical/system label, developer-owned.
- `humanNickname`: short human-friendly label for the card title.
- `finderDescription`: plain-language “when should I use this?” copy.
- `searchAliases`: terms a human might search for.
- `tags`: structured discovery labels.

Example:

```ts
{
  humanNickname: 'Interior landing hero',
  finderDescription:
    'Use for program category, Start, Integrative Care, and campaign pages that need an image-backed intro without taking the full viewport.',
  searchAliases: ['program intro', 'sales hero', 'campaign hero'],
  tags: ['surface:public_site', 'page-type:programs', 'family:hero']
}
```

## Preview modes

The style guide supports a preview fallback ladder:

1. `live` — iframe-backed preview using the existing module embed route.
2. `fixture` — more realistic static/fixture preview for modules that do not have a safe live embed yet.
3. `abstract` — existing property-based fallback.

Do not block a module from appearing just because it lacks a live preview. Use abstract fallback until the module can be promoted.

## Public pathway context

The discovery metadata should help identify modules for the shared public Pathway Page system:

- Programs
- Program categories
- future program details
- Integrative Care pages
- Start / Launch pages
- Offer-entry pages
- public assessment-entry pages

Signed-in app modules can appear in the style guide as approved or reference patterns, but they remain separate from the public runtime composition system and should stay native-app-ready.
