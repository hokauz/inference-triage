# Laya local bundle

The ONNX bundle is intentionally not stored in Git. Prepare a local bundle
from the pinned Laya/ONNX source and place it under:

```text
models/laya/multilingual/
```

Por padrão, o preparador usa o bundle publicado na raiz de
`receptron/laya-onnx`. O nome local `multilingual` é apenas o diretório de
mount do projeto; ele não implica que o repositório remoto possua uma pasta
com esse nome. Para outra variante, use `LAYA_REPO` e `LAYA_SUBFOLDER`.

The directory must contain `laya.onnx`, `laya.onnx.data`,
`laya_config.json` and the tokenizer files. Set `LAYA_MODEL_DIR` to this
directory before running `make laya-smoke` or `make benchmark-laya`.

Record the source revision, bundle revision and SHA-256 values in
`models/laya/manifest.json`. The weights may be large and are mounted
read-only into Compose; they must not be committed.
