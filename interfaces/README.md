# Interfaces

Report consumers live here. They read the stable views defined under
`platform/database` and must not duplicate pipeline or domain logic.

- `api/`: programmatic report access.
- `web/`: visual report and dashboard consumers.
- `cli/`: terminal inspection and querying.
- `exporters/`: file-based report formats.
