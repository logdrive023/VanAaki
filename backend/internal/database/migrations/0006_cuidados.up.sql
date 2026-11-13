-- Cuidados com a criança: alergias, remédios, o que o tio precisa saber, e um segundo contato de emergência.
-- Só o tio da van e a própria família veem (a escola e os colegas não recebem).
ALTER TABLE alunos ADD COLUMN cuidados       TEXT NOT NULL DEFAULT '';
ALTER TABLE alunos ADD COLUMN contato_extra  TEXT NOT NULL DEFAULT '';
ALTER TABLE alunos ADD COLUMN telefone_extra TEXT NOT NULL DEFAULT '';
