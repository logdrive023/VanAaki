-- VanAaki: estrutura inicial

CREATE TABLE escolas (
    id               TEXT PRIMARY KEY,
    nome             TEXT        NOT NULL,
    endereco         TEXT        NOT NULL DEFAULT '',
    lat              DOUBLE PRECISION NOT NULL,
    lng              DOUBLE PRECISION NOT NULL,
    horarios         JSONB       NOT NULL DEFAULT '{}',
    confirma_entrada BOOLEAN     NOT NULL DEFAULT FALSE,
    codigo           TEXT        NOT NULL UNIQUE,
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vans (
    id             TEXT PRIMARY KEY,
    nome           TEXT        NOT NULL,
    motorista      TEXT        NOT NULL,
    telefone       TEXT        NOT NULL DEFAULT '',
    placa          TEXT        NOT NULL DEFAULT '',
    modelo         TEXT        NOT NULL DEFAULT '',
    garagem_lat    DOUBLE PRECISION NOT NULL,
    garagem_lng    DOUBLE PRECISION NOT NULL,
    escola_ids     JSONB       NOT NULL DEFAULT '[]',
    turnos         JSONB       NOT NULL DEFAULT '[]',
    credenciamento JSONB       NOT NULL DEFAULT '{}',
    preco_padrao   INTEGER     NOT NULL DEFAULT 0,
    vagas          INTEGER     NOT NULL DEFAULT 0,
    avaliacao      NUMERIC(3,1) NOT NULL DEFAULT 5,
    rotas_fixas    JSONB       NOT NULL DEFAULT '{}',
    demo           BOOLEAN     NOT NULL DEFAULT FALSE,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alunos (
    id             TEXT PRIMARY KEY,
    van_id         TEXT        NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
    escola_id      TEXT        NOT NULL REFERENCES escolas(id),
    nome           TEXT        NOT NULL,
    apelido        TEXT        NOT NULL,
    cor            TEXT        NOT NULL,
    serie          TEXT        NOT NULL DEFAULT '',
    turno          TEXT        NOT NULL CHECK (turno IN ('manha','tarde','noite')),
    responsavel    TEXT        NOT NULL,
    telefone_resp  TEXT        NOT NULL DEFAULT '',
    endereco       TEXT        NOT NULL,
    lat            DOUBLE PRECISION NOT NULL,
    lng            DOUBLE PRECISION NOT NULL,
    mensalidade    INTEGER     NOT NULL,
    dia_vencimento INTEGER     NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28),
    ativo          BOOLEAN     NOT NULL DEFAULT TRUE,
    codigo_familia TEXT        NOT NULL UNIQUE,
    codigo_aluno   TEXT        NOT NULL UNIQUE,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX alunos_van ON alunos(van_id);
CREATE INDEX alunos_escola ON alunos(escola_id);

CREATE TABLE usuarios (
    id         TEXT PRIMARY KEY,
    perfil     TEXT        NOT NULL CHECK (perfil IN ('motorista','pais','aluno','escola')),
    nome       TEXT        NOT NULL,
    email      TEXT        UNIQUE,
    telefone   TEXT        NOT NULL DEFAULT '',
    senha_hash TEXT        NOT NULL DEFAULT '',
    van_id     TEXT        REFERENCES vans(id) ON DELETE CASCADE,
    escola_id  TEXT        REFERENCES escolas(id) ON DELETE CASCADE,
    aluno_id   TEXT        REFERENCES alunos(id) ON DELETE CASCADE,
    demo       BOOLEAN     NOT NULL DEFAULT FALSE,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- pais ↔ filhos (uma família pode ter vários filhos, um filho pode ter mais de um responsável)
CREATE TABLE familia_alunos (
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    aluno_id   TEXT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    PRIMARY KEY (usuario_id, aluno_id)
);

CREATE TABLE pagamentos (
    id         TEXT PRIMARY KEY,
    aluno_id   TEXT    NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    mes        TEXT    NOT NULL,
    valor      INTEGER NOT NULL,
    vencimento TEXT    NOT NULL,
    status     TEXT    NOT NULL CHECK (status IN ('pendente','pago')),
    pago_em    TIMESTAMPTZ,
    metodo     TEXT,
    UNIQUE (aluno_id, mes)
);

CREATE TABLE presencas (
    id         TEXT PRIMARY KEY, -- alunoId|data
    aluno_id   TEXT        NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    data       TEXT        NOT NULL,
    ida        BOOLEAN     NOT NULL,
    volta      BOOLEAN     NOT NULL,
    motivo     TEXT        NOT NULL DEFAULT '',
    avisado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX presencas_data ON presencas(data);

-- a viagem muda a cada segundo (posição); fica num JSONB com as colunas de busca ao lado
CREATE TABLE viagens (
    id            TEXT PRIMARY KEY,
    van_id        TEXT        NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
    data          TEXT        NOT NULL,
    status        TEXT        NOT NULL,
    dados         JSONB       NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX viagens_van_data ON viagens(van_id, data);
CREATE INDEX viagens_status ON viagens(status);

CREATE TABLE notificacoes (
    id        TEXT PRIMARY KEY,
    para      TEXT        NOT NULL,
    aluno_id  TEXT,
    van_id    TEXT,
    escola_id TEXT,
    icone     TEXT        NOT NULL,
    titulo    TEXT        NOT NULL,
    texto     TEXT        NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    lida      BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX notificacoes_aluno ON notificacoes(aluno_id);
CREATE INDEX notificacoes_van ON notificacoes(van_id);
CREATE INDEX notificacoes_escola ON notificacoes(escola_id);

CREATE TABLE mensagens (
    id        TEXT PRIMARY KEY,
    aluno_id  TEXT        NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    de        TEXT        NOT NULL CHECK (de IN ('pais','motorista')),
    texto     TEXT        NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    lida      BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX mensagens_aluno ON mensagens(aluno_id);

CREATE TABLE pontos (
    id         TEXT PRIMARY KEY,
    aluno_id   TEXT        NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    van_id     TEXT        NOT NULL,
    data       TEXT        NOT NULL,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    tipo       TEXT        NOT NULL,
    pontos     INTEGER     NOT NULL,
    descricao  TEXT        NOT NULL,
    observacao TEXT        NOT NULL DEFAULT '',
    autor      TEXT        NOT NULL
);
CREATE INDEX pontos_van ON pontos(van_id);
CREATE INDEX pontos_aluno ON pontos(aluno_id);

CREATE TABLE recompensas (
    id     TEXT PRIMARY KEY,
    van_id TEXT    NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
    icone  TEXT    NOT NULL,
    nome   TEXT    NOT NULL,
    custo  INTEGER NOT NULL,
    ativo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE resgates (
    id            TEXT PRIMARY KEY,
    aluno_id      TEXT        NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    recompensa_id TEXT        NOT NULL,
    nome          TEXT        NOT NULL,
    icone         TEXT        NOT NULL,
    custo         INTEGER     NOT NULL,
    status        TEXT        NOT NULL CHECK (status IN ('pendente','aprovado','recusado')),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    decidido_em   TIMESTAMPTZ
);
CREATE INDEX resgates_aluno ON resgates(aluno_id);
