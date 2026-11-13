-- Recados entre o tio da van e a escola (uma conversa por van + escola).
CREATE TABLE recados (
    id        TEXT        PRIMARY KEY,
    van_id    TEXT        NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
    escola_id TEXT        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
    de        TEXT        NOT NULL CHECK (de IN ('motorista', 'escola')),
    texto     TEXT        NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    lida      BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX recados_conversa ON recados (van_id, escola_id, criado_em);
CREATE INDEX recados_escola ON recados (escola_id, criado_em);
