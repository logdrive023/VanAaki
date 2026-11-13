-- PL 1240/2026: registro dos trajetos (posição com horário) e acesso de fiscalização.

-- Cada posição da van durante uma viagem (GPS do celular ou simulação), guardada por pelo menos 90 dias.
CREATE TABLE posicoes (
    id        BIGSERIAL        PRIMARY KEY,
    viagem_id TEXT             NOT NULL,
    van_id    TEXT             NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
    em        TIMESTAMPTZ      NOT NULL,
    lat       DOUBLE PRECISION NOT NULL,
    lng       DOUBLE PRECISION NOT NULL,
    origem    TEXT             NOT NULL DEFAULT 'gps' -- gps | simulacao
);
CREATE INDEX posicoes_viagem_em ON posicoes (viagem_id, em);
CREATE INDEX posicoes_van_em ON posicoes (van_id, em);

-- Link somente leitura que o motorista entrega ao poder público (prefeitura, DETRAN, escola contratante).
CREATE TABLE acessos_fiscais (
    token            TEXT        PRIMARY KEY,
    van_id           TEXT        NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
    nome             TEXT        NOT NULL,
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em        TIMESTAMPTZ NOT NULL,
    revogado_em      TIMESTAMPTZ,
    ultimo_acesso_em TIMESTAMPTZ,
    acessos          INT         NOT NULL DEFAULT 0
);
CREATE INDEX acessos_fiscais_van ON acessos_fiscais (van_id);
