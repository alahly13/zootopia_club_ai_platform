# Feature-First Notes

New tool work should live inside the closest matching feature folder first.

- Route entry pages belong to `features/<tool>/pages`.
- Tool-specific UI belongs to `features/<tool>/components`.
- Tool-specific hooks/services/types/utils stay inside the feature unless two or more tools genuinely share the logic.
- Global auth, AI provider orchestration, notifications, billing, upload, and theme/language systems remain centralized until they can be decoupled safely without breaking platform-wide behavior.
- Legacy file paths may temporarily re-export feature modules so the app can migrate incrementally without risky import churn.
