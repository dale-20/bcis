# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

React runs inside a Windows Electron desktop shell, not a public website.

## Stack

User-specified Electron/electron-vite, React/strict TypeScript, Tailwind/shadcn, TanStack Query/Table, Fastify, PostgreSQL/Drizzle, Zod, Vitest, ExcelJS/pdfmake.

## Users

BCIS owner, administrator, cashier, collection supervisor, auditor, technician, and read-only viewer. Three simultaneous LAN-connected office PCs (laboratory PDF sections 1–3).

## Product Purpose

Manage Internet, Cable, and Combo subscriptions with trustworthy billing, collection, subscriber ledgers, and reports.

## Capabilities and Constraints

This increment implements only foundation and live connection status. Authentication and all financial workflows remain future work. No fabricated totals, subscribers, payments, or operational claims appear in the shell.

## Brand Commitments

PDF section 4.1 specifies a clean, trustworthy, dense commercial ISP interface: navy, blue accents, light canvas, white surfaces, professional sans-serif typography, and text plus color statuses. No generic KPI dashboard or decorative effects for this connection screen.

## Evidence on Hand

`docs/requirements.pdf` is the supplied laboratory brief. There are no customer assets or real customer data.

## Product Principles

- Financial correctness and history preservation outrank cosmetic completeness.
- Explain connection failures with an actionable recovery step.
- Keep authoritative behavior in the API.
- Implement and test a feature before presenting it as available.
