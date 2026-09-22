# V0 Laya benchmark profile

Executa o adapter Laya Node/ONNX sobre o CSV completo do FinGuard, sem rede,
com 1 CPU, 3 GiB e concorrência 1. O bundle local em `models/laya/` é
montado somente para leitura e os resultados vão para
`artifacts/v0-laya/full/`.

Prepare os pesos e defina `LAYA_MODEL_REVISION` e `LAYA_MODEL_HASH` antes de
executar `make benchmark-laya`.
