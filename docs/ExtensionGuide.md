# Extension guide

An extension implements `SilqExtension` and receives `ExtensionApi` in `activate`. The current host can register commands, languages, themes, snippets, panels, debuggers, simulators, and hardware providers in in-memory registries.

This is an extension API foundation, not a complete extension marketplace or lifecycle system. The repository does not currently provide extension discovery, manifest validation, installation, loading from disk, or marketplace publishing metadata.
