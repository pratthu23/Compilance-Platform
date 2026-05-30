import json
import math
import random
import re
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset


DATA_FILE = Path("compliance_train.jsonl")
OUTPUT_DIR = Path("regintel-compliance-llm")
CHECKPOINT_DIR = OUTPUT_DIR / "checkpoints"
LATEST_CHECKPOINT = CHECKPOINT_DIR / "latest.pt"
SEQ_LEN = 96
BATCH_SIZE = 16
EPOCHS = 5
EMBED_DIM = 224
HIDDEN_DIM = 320
LAYERS = 2
LR = 2e-3


def tokenize(text):
    return re.findall(r"[A-Za-z0-9_:/.-]+|[^\s]", text)


def detokenize(tokens):
    text = " ".join(tokens)
    text = re.sub(r"\s+([.,:;!?])", r"\1", text)
    text = text.replace(" ##", "")
    return text


def load_texts():
    texts = []
    with DATA_FILE.open("r", encoding="utf-8") as file:
        for line in file:
            row = json.loads(line)
            texts.append(row["text"])
    return texts


def build_vocab(texts):
    counts = {}
    for text in texts:
        for token in tokenize(text):
            counts[token] = counts.get(token, 0) + 1
    vocab = ["<pad>", "<unk>", "<bos>", "<eos>"]
    vocab.extend(token for token, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])) if count >= 1)
    stoi = {token: index for index, token in enumerate(vocab)}
    itos = {index: token for token, index in stoi.items()}
    return vocab, stoi, itos


class ComplianceDataset(Dataset):
    def __init__(self, texts, stoi):
        self.samples = []
        for text in texts:
            ids = [stoi["<bos>"]]
            ids.extend(stoi.get(token, stoi["<unk>"]) for token in tokenize(text))
            ids.append(stoi["<eos>"])
            for start in range(0, max(1, len(ids) - 1), SEQ_LEN):
                chunk = ids[start : start + SEQ_LEN + 1]
                if len(chunk) < 8:
                    continue
                if len(chunk) < SEQ_LEN + 1:
                    chunk += [stoi["<pad>"]] * (SEQ_LEN + 1 - len(chunk))
                self.samples.append(torch.tensor(chunk, dtype=torch.long))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        chunk = self.samples[index]
        return chunk[:-1], chunk[1:]


class TinyComplianceLM(nn.Module):
    def __init__(self, vocab_size):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, EMBED_DIM, padding_idx=0)
        self.rnn = nn.GRU(
            EMBED_DIM,
            HIDDEN_DIM,
            num_layers=LAYERS,
            batch_first=True,
            dropout=0.15,
        )
        self.head = nn.Linear(HIDDEN_DIM, vocab_size)

    def forward(self, input_ids, hidden=None):
        embedded = self.embedding(input_ids)
        output, hidden = self.rnn(embedded, hidden)
        logits = self.head(output)
        return logits, hidden


def checkpoint_payload(model, optimizer, vocab, epoch, avg_loss):
    return {
        "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict(),
        "vocab": vocab,
        "epoch": epoch,
        "avg_loss": avg_loss,
        "config": {
            "seq_len": SEQ_LEN,
            "embed_dim": EMBED_DIM,
            "hidden_dim": HIDDEN_DIM,
            "layers": LAYERS,
        },
    }


def save_checkpoint(model, optimizer, vocab, epoch, avg_loss):
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    payload = checkpoint_payload(model.cpu(), optimizer, vocab, epoch, avg_loss)
    torch.save(payload, CHECKPOINT_DIR / f"epoch_{epoch}.pt")
    torch.save(payload, LATEST_CHECKPOINT)
    model.to(torch.device("cuda" if torch.cuda.is_available() else "cpu"))
    print(f"Checkpoint saved: {LATEST_CHECKPOINT}")


def load_checkpoint_if_available(model, optimizer, vocab, device):
    if not LATEST_CHECKPOINT.exists():
        return 1
    checkpoint = torch.load(LATEST_CHECKPOINT, map_location=device)
    if checkpoint.get("vocab") != vocab:
        print("Checkpoint exists, but dataset vocabulary changed. Starting from epoch 1.")
        return 1
    model.load_state_dict(checkpoint["model_state"])
    optimizer.load_state_dict(checkpoint["optimizer_state"])
    model.to(device)
    start_epoch = int(checkpoint.get("epoch", 0)) + 1
    print(f"Resuming from checkpoint after epoch {checkpoint.get('epoch')} with loss {checkpoint.get('avg_loss'):.4f}")
    return start_epoch


def main():
    random.seed(42)
    torch.manual_seed(42)

    texts = load_texts()
    vocab, stoi, itos = build_vocab(texts)
    dataset = ComplianceDataset(texts, stoi)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = TinyComplianceLM(len(vocab)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR)
    loss_fn = nn.CrossEntropyLoss(ignore_index=stoi["<pad>"])
    start_epoch = load_checkpoint_if_available(model, optimizer, vocab, device)

    print(f"Training examples: {len(texts)}")
    print(f"Training sequences: {len(dataset)}")
    print(f"Vocabulary size: {len(vocab)}")
    print(f"Device: {device}")
    print("Training started. Checkpoints save after every epoch.")

    if start_epoch > EPOCHS:
        print("All configured epochs already completed. Increase EPOCHS to continue training.")

    for epoch in range(start_epoch, EPOCHS + 1):
        model.train()
        total_loss = 0.0
        for step, (x, y) in enumerate(loader, start=1):
            x = x.to(device)
            y = y.to(device)
            optimizer.zero_grad()
            logits, _ = model(x)
            loss = loss_fn(logits.reshape(-1, len(vocab)), y.reshape(-1))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()

            if step % 20 == 0:
                avg = total_loss / step
                print(f"epoch {epoch}/{EPOCHS} step {step}/{len(loader)} loss {avg:.4f} ppl {math.exp(min(avg, 10)):.2f}")

        avg = total_loss / max(len(loader), 1)
        print(f"epoch {epoch}/{EPOCHS} complete loss {avg:.4f} ppl {math.exp(min(avg, 10)):.2f}")
        save_checkpoint(model, optimizer, vocab, epoch, avg)

    OUTPUT_DIR.mkdir(exist_ok=True)
    torch.save(checkpoint_payload(model.cpu(), optimizer, vocab, EPOCHS, 0), OUTPUT_DIR / "model.pt")
    print(f"Training complete. Model saved to {OUTPUT_DIR / 'model.pt'}")


if __name__ == "__main__":
    main()
