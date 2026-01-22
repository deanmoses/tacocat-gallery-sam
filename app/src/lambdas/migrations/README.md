# Migrations

This folder contains migration scripts for data fixes and schema changes.

They're meant to be used at one point in time, and then not used again.

## Overview

These lambdas are:

- **Invoked directly** via AWS Console
- **Not exposed via API Gateway**
    - They're one-time, don't build a UI for them
    - Some of them run longer than the 29-second API Gateway timeout
- **Retained after completion** for reference

## Building New Migrations

See [docs/Migrations.md](../../../../docs/Migrations.md)
