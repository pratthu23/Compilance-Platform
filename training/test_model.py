import re

import torch
from torch import nn


MODEL_PATH = "regintel-compliance-llm/model.pt"
MAX_NEW_TOKENS = 120


def tokenize(text):
    return re.findall(r"[A-Za-z0-9_:/.-]+|[^\s]", text)


def detokenize(tokens):
    text = " ".join(tokens)
    text = re.sub(r"\s+([.,:;!?])", r"\1", text)
    return text


class TinyComplianceLM(nn.Module):
    def __init__(self, vocab_size, embed_dim, hidden_dim, layers):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.rnn = nn.GRU(
            embed_dim,
            hidden_dim,
            num_layers=layers,
            batch_first=True,
            dropout=0.15,
        )
        self.head = nn.Linear(hidden_dim, vocab_size)

    def forward(self, input_ids, hidden=None):
        embedded = self.embedding(input_ids)
        output, hidden = self.rnn(embedded, hidden)
        logits = self.head(output)
        return logits, hidden


def generate(prompt, temperature=0.75):
    checkpoint = torch.load(MODEL_PATH, map_location="cpu")
    vocab = checkpoint["vocab"]
    stoi = {token: index for index, token in enumerate(vocab)}
    itos = {index: token for token, index in stoi.items()}
    config = checkpoint["config"]
    model = TinyComplianceLM(
        len(vocab),
        config["embed_dim"],
        config["hidden_dim"],
        config["layers"],
    )
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    ids = [stoi["<bos>"]]
    ids.extend(stoi.get(token, stoi["<unk>"]) for token in tokenize(prompt))
    hidden = None
    generated = ids[:]

    with torch.no_grad():
        for _ in range(MAX_NEW_TOKENS):
            input_ids = torch.tensor([generated[-96:]], dtype=torch.long)
            logits, hidden = model(input_ids, hidden=None)
            next_logits = logits[0, -1] / temperature
            next_logits[stoi["<unk>"]] = -1e9
            next_logits[stoi["<pad>"]] = -1e9
            probs = torch.softmax(next_logits, dim=-1)
            next_id = torch.multinomial(probs, num_samples=1).item()
            if next_id == stoi["<eos>"]:
                break
            generated.append(next_id)

    tokens = [itos[index] for index in generated if itos[index] not in {"<bos>", "<eos>", "<pad>"}]
    return detokenize(tokens)


if __name__ == "__main__":
    prompt = """### Instruction:
Convert this regulation into MAPs.

### Regulation:
Banks must notify customers when digital service disruption exceeds 6 hours.

### Response:
"""
    print(generate(prompt))
