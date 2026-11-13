-- Idempotência: cada ação do app chega com uma chave única (Idempotency-Key).
-- Se a internet cair depois que o servidor fez a ação mas antes da resposta chegar,
-- o app manda de novo e o servidor devolve a mesma resposta, sem fazer duas vezes.
CREATE TABLE operacoes (
    usuario_id TEXT        NOT NULL,
    chave      TEXT        NOT NULL,
    status     INT         NOT NULL,
    corpo      BYTEA       NOT NULL,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, chave)
);
CREATE INDEX operacoes_criado ON operacoes (criado_em);
