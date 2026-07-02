## 2026-07-01 Architecture Update

Serve OS architecture has shifted toward an Operating System model rather than a standalone application.

Current architectural principles:

- Serve OS is the operational layer above external systems.
- External systems execute work.
- Serve OS organizes, tracks, and understands work.
- Residents are the canonical business object.
- External systems enrich resident relationships rather than own them.

Current system roles:

Serve OS
- Resident directory
- Relationship management
- Operational dashboard
- Workspace
- Community Intelligence
- Ask Serve
- Future proposal engine
- Future assessment engine

External Systems

Apploi
- Recruiting

Viventium
- HR
- Payroll
- Employee administration

Cinch CCM
- Community Care execution

AxisCare
- Traditional Home Care execution

Dialpad
- Phone
- Call transcripts
- Relationship history

Google Workspace
- Email
- Documents

Serve Intake
- Assessment
- Proposal generation
- Draft email generation

Design philosophy:

Employees work inside Serve OS.

Serve OS launches external systems as needed.

External systems will gradually be replaced by native Serve functionality while preserving employee workflow.