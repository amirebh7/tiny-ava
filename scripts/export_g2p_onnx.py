"""Export mehdi-hf/persian-g2p-tiny (8.26M 2+2L ByT5) to clean ONNX (encoder + decoder)
for zero-dependency in-browser inference with onnxruntime-web, and verify parity vs PyTorch.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from torch import nn
from transformers import AutoTokenizer, T5ForConditionalGeneration


class EncoderWrapper(nn.Module):
    def __init__(self, t5: T5ForConditionalGeneration):
        super().__init__()
        self.encoder = t5.encoder

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        return self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state


class DecoderWrapper(nn.Module):
    def __init__(self, t5: T5ForConditionalGeneration):
        super().__init__()
        self.decoder = t5.decoder
        self.lm_head = t5.lm_head

    def forward(
        self,
        decoder_input_ids: torch.Tensor,
        encoder_hidden_states: torch.Tensor,
        encoder_attention_mask: torch.Tensor,
    ) -> torch.Tensor:
        out = self.decoder(
            input_ids=decoder_input_ids,
            encoder_hidden_states=encoder_hidden_states,
            encoder_attention_mask=encoder_attention_mask,
            use_cache=False,
        )
        return self.lm_head(out.last_hidden_state)


def byt5_encode(text: str) -> list[int]:
    return [b + 3 for b in text.encode("utf-8")] + [1]


def byt5_decode(ids: list[int]) -> str:
    raw = bytes(i - 3 for i in ids if 3 <= i <= 258)
    return raw.decode("utf-8", errors="ignore").strip()


def run_onnx_greedy(enc_sess, dec_sess, text: str, max_len: int = 256) -> str:
    in_ids = np.array([byt5_encode(text)], dtype=np.int64)
    attn = np.ones_like(in_ids, dtype=np.int64)
    (enc_hidden,) = enc_sess.run(None, {"input_ids": in_ids, "attention_mask": attn})

    dec_ids = [0]  # decoder_start_token_id = 0
    for _ in range(max_len):
        d_in = np.array([dec_ids], dtype=np.int64)
        (logits,) = dec_sess.run(
            None,
            {
                "decoder_input_ids": d_in,
                "encoder_hidden_states": enc_hidden,
                "encoder_attention_mask": attn,
            },
        )
        nxt = int(logits[0, -1].argmax())
        if nxt == 1:  # EOS
            break
        dec_ids.append(nxt)
    return byt5_decode(dec_ids[1:])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="/Users/mehdiallahyari/projects/persian-g2p/exports/persian-g2p-tiny")
    parser.add_argument("--out-dir", type=Path, default=Path("/Users/mehdiallahyari/projects/tiny-ava/demo/assets/g2p"))
    parser.add_argument("--quantize-int8", action="store_true", help="Also apply dynamic int8 quantization to shrink size")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    tok = AutoTokenizer.from_pretrained(args.model)
    t5 = T5ForConditionalGeneration.from_pretrained(args.model, dtype=torch.float32).eval()

    enc_wrap = EncoderWrapper(t5).eval()
    dec_wrap = DecoderWrapper(t5).eval()

    sample_ids = torch.tensor([byt5_encode("سلام، حالِ شما چطور است؟")], dtype=torch.long)
    sample_mask = torch.ones_like(sample_ids)
    with torch.no_grad():
        sample_hidden = enc_wrap(sample_ids, sample_mask)
    sample_dec_ids = torch.tensor([[0, 118, 100]], dtype=torch.long)

    enc_path = args.out_dir / "g2p_encoder.onnx"
    dec_path = args.out_dir / "g2p_decoder.onnx"

    torch.onnx.export(
        enc_wrap,
        (sample_ids, sample_mask),
        str(enc_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["encoder_hidden_states"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "src_len"},
            "attention_mask": {0: "batch", 1: "src_len"},
            "encoder_hidden_states": {0: "batch", 1: "src_len"},
        },
        opset_version=17,
        dynamo=False,
    )
    torch.onnx.export(
        dec_wrap,
        (sample_dec_ids, sample_hidden, sample_mask),
        str(dec_path),
        input_names=["decoder_input_ids", "encoder_hidden_states", "encoder_attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "decoder_input_ids": {0: "batch", 1: "tgt_len"},
            "encoder_hidden_states": {0: "batch", 1: "src_len"},
            "encoder_attention_mask": {0: "batch", 1: "src_len"},
            "logits": {0: "batch", 1: "tgt_len"},
        },
        opset_version=17,
        dynamo=False,
    )

    if args.quantize_int8:
        from onnxruntime.quantization import QuantType, quantize_dynamic

        for p in (enc_path, dec_path):
            q_tmp = p.with_suffix(".int8.onnx")
            quantize_dynamic(str(p), str(q_tmp), weight_type=QuantType.QUInt8)
            q_tmp.replace(p)

    print(
        f"Exported: {enc_path.name} ({enc_path.stat().st_size / 1e6:.2f} MB), "
        f"{dec_path.name} ({dec_path.stat().st_size / 1e6:.2f} MB)"
    )

    # Verify ONNX vs PyTorch greedy parity
    enc_sess = ort.InferenceSession(str(enc_path), providers=["CPUExecutionProvider"])
    dec_sess = ort.InferenceSession(str(dec_path), providers=["CPUExecutionProvider"])

    tests = [
        "سلام، حال شما چطور است؟",
        "بارانِ ریزی روی آسفالتِ خیسِ خیابان می‌بارد.",
        "کفش‌هایم بعد از باران پر از گِل و لای شد.",
        "گل قرمز زیبایی روی میز است.",
    ]
    for txt in tests:
        enc = tok([txt], return_tensors="pt")
        with torch.no_grad():
            pt_out = tok.decode(t5.generate(**enc, num_beams=1, max_new_tokens=256)[0], skip_special_tokens=True).strip()
        ort_out = run_onnx_greedy(enc_sess, dec_sess, txt)
        match = "MATCH" if pt_out == ort_out else "DIFF"
        print(f"  [{match}] {txt}\n    PT : {pt_out}\n    ORT: {ort_out}")


if __name__ == "__main__":
    main()
