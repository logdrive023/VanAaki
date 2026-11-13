-- Configurações da van (Pix, cobrança, avisos, folga) e o "já paguei" da família.
ALTER TABLE vans ADD COLUMN config JSONB NOT NULL DEFAULT '{}';
ALTER TABLE pagamentos ADD COLUMN informado_em TIMESTAMPTZ;
