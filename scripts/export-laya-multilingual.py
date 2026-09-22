"""Export pinned Laya multilingual checkpoint to the @receptron/laya ONNX bundle.

Adapted from receptron/laya export/export_onnx.py at
6478649e723122ca24bbf5fb69ed1010023c9750. The bounded dynamic dimensions
avoid a torch.export constraint error for the multilingual mmBERT checkpoint.
"""

import json
import os
import shutil
import sys

import numpy as np
import torch
from safetensors.torch import load_file

model_dir, out_dir = sys.argv[1:3]
sys.path.insert(0, model_dir)
from rl_common import build_model  # noqa: E402

os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(model_dir, "rl_agent_config.json")) as config_file:
    config = json.load(config_file)
model = build_model(config, encoder_dir=os.path.join(model_dir, "encoder"))
model.load_state_dict(load_file(os.path.join(model_dir, "model.safetensors")), strict=True)
model.eval()
model.encoder.config.reference_compile = False


class Wrapper(torch.nn.Module):
    def __init__(self, wrapped):
        super().__init__()
        self.wrapped = wrapped

    def forward(self, input_ids, attention_mask, marker_pos, marker_mask, qtype):
        logits, act = self.wrapped(input_ids, attention_mask, marker_pos, marker_mask, qtype)
        return logits, torch.softmax(act.float(), -1)


wrapper = Wrapper(model)
batch_size, sequence_length, option_count = 2, 40, 4
example = (
    torch.randint(5, 1000, (batch_size, sequence_length)),
    torch.ones(batch_size, sequence_length, dtype=torch.long),
    torch.tensor([[3, 9, 15, 21], [3, 9, 0, 0]]),
    torch.tensor([[True, True, True, True], [True, True, False, False]]),
    torch.tensor([0, 2]),
)
example[1][1, 30:] = 0
batch = torch.export.Dim("batch", min=1, max=32)
sequence = torch.export.Dim("seq", min=8, max=2048)
options = torch.export.Dim("options", min=2, max=32)
program = torch.onnx.export(
    wrapper,
    example,
    opset_version=18,
    dynamo=True,
    optimize=True,
    input_names=["input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype"],
    output_names=["logits", "act_probs"],
    dynamic_shapes={
        "input_ids": {0: batch, 1: sequence},
        "attention_mask": {0: batch, 1: sequence},
        "marker_pos": {0: batch, 1: options},
        "marker_mask": {0: batch, 1: options},
        "qtype": {0: batch},
    },
)
output = os.path.join(out_dir, "laya.onnx")
program.save(output, external_data=False)
shutil.copytree(os.path.join(model_dir, "tokenizer"), os.path.join(out_dir, "tokenizer"), dirs_exist_ok=True)
with open(os.path.join(out_dir, "laya_config.json"), "w") as config_file:
    json.dump({key: config[key] for key in ("max_len", "head_max_len", "temperature", "temperature_by_options")}, config_file, indent=1)

import onnxruntime as ort  # noqa: E402

with torch.no_grad():
    reference_logits, reference_act = wrapper(*example)
session = ort.InferenceSession(output, providers=["CPUExecutionProvider"])
actual_logits, actual_act = session.run(None, {
    "input_ids": example[0].numpy(),
    "attention_mask": example[1].numpy(),
    "marker_pos": example[2].numpy(),
    "marker_mask": example[3].numpy(),
    "qtype": example[4].numpy(),
})
logit_error = float(np.abs(actual_logits - reference_logits.numpy()).max())
act_error = float(np.abs(actual_act - reference_act.numpy()).max())
print(f"max |dlogits| = {logit_error} max |dact| = {act_error}")
if logit_error > 0.001 or act_error > 0.001:
    raise RuntimeError("ONNX parity check failed")
