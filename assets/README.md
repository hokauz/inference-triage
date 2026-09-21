# Domain assets

Assets are explicit, versioned inputs to a pipeline and contain no runtime
code. A domain pack will reference the ingestion definition, taxonomy, policy
set, and prompt set that belong to one domain.

- `ingestion/`: source schemas, mappings, and declarative normalizers.
- `policies/`: independent policy sets.
- `prompts/`: LLM prompt templates grouped in prompt sets.
- `taxonomies/`: categories and other controlled vocabularies.
- `packs/`: domain-level references to the selected assets.
