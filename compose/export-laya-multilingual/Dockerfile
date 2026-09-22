FROM python:3.12-slim@sha256:2f17fc044b579bab302c2e8054d3a686e2cb9a83de48e70534b94cd8ebbe06a9

RUN python -m pip install --no-cache-dir \
    'torch>=2.6,<2.8' \
    'transformers>=4.49,<4.58' \
    'safetensors>=0.5,<1' \
    'onnx>=1.17,<2' \
    'onnxscript>=0.3,<1' \
    'onnxruntime>=1.20,<2' \
    'huggingface_hub>=0.29,<1' \
    'numpy>=1.26,<3'

WORKDIR /work
