-- Documentos do condutor e do veículo (CTB arts. 136 a 138), com validade e controle de aviso.
CREATE TABLE documentos (
    id            TEXT        PRIMARY KEY,
    van_id        TEXT        NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
    tipo          TEXT        NOT NULL,
    numero        TEXT        NOT NULL DEFAULT '',
    validade      TEXT        NOT NULL,            -- AAAA-MM-DD
    avisado       TEXT        NOT NULL DEFAULT '', -- último marco avisado: 30 | 7 | 0 | vencido
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (van_id, tipo)
);

-- LGPD: registro de quem aceitou qual versão da política (art. 8º e 14: consentimento do responsável).
CREATE TABLE consentimentos (
    usuario_id TEXT        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    versao     TEXT        NOT NULL,
    aceito_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, versao)
);
