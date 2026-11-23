# tiny-ava

A **4.5M-parameter (~18 MB PyTorch / ~20 MB ONNX)** Persian (Farsi) text-to-speech model that runs **38×–77× faster than real time on CPU**, trained from scratch on top of the [`tiny-voca`](https://github.com/n4ze3m/tiny-voca) architecture.

- **Live in-browser demo (100% client-side, ~29 MB):** https://huggingface.co/spaces/mehdi-hf/tiny-ava-demo
- **Hugging Face model:** https://huggingface.co/mehdi-hf/tiny-ava

## Models Included

| Voice | File | Format | Size | Parameters | Sample Rate | CPU Speed (1t / 4t) |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: |
| **Parisa** | `models/parisa/inference.pt` | PyTorch | 18.2 MB | 4.53M | 24 kHz | **38.5× / 77.4× real-time** |
| **Parisa** | `models/parisa/tiny-ava-parisa.onnx` | ONNX (opset 17) | 20.4 MB | 4.53M | 24 kHz | ONNX Runtime / Web |

## Benchmarks (50 Held-Out Persian Test Clips, `faster-whisper large-v3`)

| Model | Persian CER ↓ | Persian WER ↓ |
| :--- | ---: | ---: |
| **tiny-ava (Parisa, 4.53M)** | **6.95%** | **36.96%** |
| Teacher recordings (reference floor) | 8.20% | 40.22% |

## Persian Phoneme Frontend

`tiny-ava` accepts 46 Persian IPA + punctuation token IDs (defined in `models/parisa/tiny-ava-parisa.json`) plus a 3-class stress/ezafe channel (`0 = unstressed`, `1 = primary lexical stress`, `2 = explicit ezafe`). It pairs directly with:
- [`mehdi-hf/persian-g2p-tiny`](https://huggingface.co/mehdi-hf/persian-g2p-tiny) (16 MB, MIT — fast CPU/edge)
- `mehdi-hf/persian-g2p-0.6b` (596M, Apache-2.0 — highest homograph & ezafe accuracy)

Both support plain Persian text as well as optional user-typed diacritics (`ـَ`, `ـِ`, `ـُ`) and punctuation pauses (`،`, `.`, `؟`, `!`).

## Samples

12 sample 24 kHz WAVs covering greetings, ezafe chains, explicit kasra (`ـِ`), homographs (`تست`, `گل`/`گِل`, `مرد`), Persian uvulars (`ق/غ/خ/ع`), questions, long text, and colloquial Persian are included in [`samples/`](samples/).

## Usage

*(Inference package & quickstart examples coming soon.)*

## Credits & License

- **Model Weights License:** **CC BY 4.0** — free for personal, research, and commercial use with attribution (*"Powered by tiny-ava (Mehdi Allahyari / OncillaAI)"* + link to `mehdi-hf/tiny-ava`).
- **Code License:** Apache-2.0 (see [`LICENSE`](LICENSE)).
- **Architecture:** Built on [`n4ze3m/tiny-voca`](https://github.com/n4ze3m/tiny-voca) (Apache-2.0) by Muhammed Nazeem.
