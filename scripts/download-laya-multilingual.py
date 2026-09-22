from huggingface_hub import snapshot_download

snapshot_download(
    repo_id="convaiinnovations/laya-multilingual",
    revision="052592a15d198d9ad47da779604259b10b47b7aa",
    local_dir="/work/model",
    allow_patterns=[
        "model.safetensors",
        "encoder/*",
        "tokenizer/*",
        "rl_agent_config.json",
    ],
)

snapshot_download(
    repo_id="convaiinnovations/laya",
    revision="1c5edc17a7acd8701df6fc341c0d179f1c62c982",
    local_dir="/work/base",
    allow_patterns=["rl_common.py"],
)
