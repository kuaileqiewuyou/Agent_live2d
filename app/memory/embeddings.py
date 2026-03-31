from __future__ import annotations

import hashlib


class SimpleEmbeddingProvider:
    def __init__(self, dimensions: int = 64) -> None:
        self.dimensions = dimensions

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def _embed(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        values = [byte / 255 for byte in digest]
        vector = (values * ((self.dimensions // len(values)) + 1))[: self.dimensions]
        return vector

