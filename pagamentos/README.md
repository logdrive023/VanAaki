# VanAaki · Pagamentos

Serviço separado que transforma a **mensalidade da van em uma cobrança Pix** e dá **baixa automática** quando a família paga, sem o tio conferir extrato.
Fica numa pasta própria para virar um projeto independente depois. É um módulo Go à parte, só com a biblioteca padrão.

```
VanAaki ──POST /cobrancas──▶ pagamentos ──▶ Asaas (cobrança Pix + QR Code)
família paga o Pix ─────────────────────────▶ Asaas
VanAaki ◀──POST aviso──── pagamentos ◀──webhook (PAYMENT_RECEIVED)── Asaas
```

## Por que o Asaas

A mensalidade de van fica, em média, entre R$ 300 e R$ 600. Nessa faixa, **tarifa fixa por Pix sai mais barata que percentual**:

| Gateway | Pix recebido | Em uma mensalidade de R$ 400 |
|---|---|---|
| **Asaas** | R$ 0,99 fixo (R$ 1,99 depois da promoção) | **R$ 0,99 – R$ 1,99** |
| Mercado Pago | 0,99% | R$ 3,96 |
| Pagar.me | 0,99% | R$ 3,96 |
| Efí | 1,19% | R$ 4,76 |

Além do preço, o Asaas tem subcontas e split pela API (o dinheiro cai na conta de cada motorista), boleto e cartão no mesmo lugar, e um sandbox para testar.
Preços conferidos em 13/11/2026 e mudam com frequência: **confirme antes de assinar**.

Fontes: [tarifas do Asaas](https://www.asaas.com/precos-e-taxas) · [tarifas da Efí](https://sejaefi.com.br/blog/qual-custo-do-pix) · [comparativo 2026](https://nacao.digital/blog/como-escolher-gateway-de-pagamento/) · [comparativo de Pix](https://www.abacatepay.com/blog/melhores-plataformas-para-receber-pix) · [docs da API do Asaas](https://docs.asaas.com)

## Rodar

```bash
cd pagamentos
cp .env.example .env      # deixe ASAAS_API_KEY vazio para o modo simulado
go test ./...
docker build -t vanaaki-pagamentos . && docker run -p 8096:8095 --env-file .env vanaaki-pagamentos
```

**Sem `ASAAS_API_KEY`, roda em modo simulado**: nenhum dinheiro de verdade, e o "Pix" começa com `SIMULADO`. Serve para desenvolver o resto do app.

### Ligar no Asaas de verdade

1. Crie a conta em [sandbox.asaas.com](https://sandbox.asaas.com) e gere a chave da API (Integrações → Chave de API).
2. No `.env`: `ASAAS_API_KEY=...`, `ASAAS_AMBIENTE=sandbox`, `ASAAS_WEBHOOK_TOKEN=` (um segredo seu, longo).
3. No painel: Integrações → Webhooks → URL `https://SEU-SERVIDOR/webhooks/asaas`, eventos de cobrança, e **o mesmo token** do passo 2.
4. Para produção, troque para `ASAAS_AMBIENTE=producao` e a chave de produção. **Nunca suba o `.env` para o git.**

## Endpoints

| Método | Caminho | O que faz |
|---|---|---|
| `POST` | `/cobrancas` | Cria (ou devolve a já criada) a cobrança Pix de uma mensalidade |
| `GET` | `/cobrancas/{id}` | Situação da cobrança (para quando o webhook atrasar) |
| `POST` | `/webhooks/asaas` | Recebe os avisos do Asaas (confere o header `asaas-access-token`) |
| `POST` | `/simulado/pagar/{id}` | Só no modo simulado: "a família pagou" |
| `GET` | `/saude` | Está no ar? Está simulando? |

Pedido de cobrança:

```json
{
  "mensalidadeId": "pag-lucas-2026-12",
  "valor": 420.00,
  "vencimento": "2026-12-10",
  "descricao": "Transporte escolar · dezembro",
  "pagador": { "id": "usuario-rafael", "nome": "Rafael Andrade", "cpfCnpj": "123.456.789-09", "email": "", "celular": "" }
}
```

Resposta: `cobrancaId`, `status`, `pago`, `pixCopiaECola`, `qrCodeBase64`, `expiraEm`.

### Aviso para o VanAaki

Com `VANAAKI_AVISO_URL` configurado, cada pagamento vira um `POST` com o header `X-Pagamentos-Segredo` e o corpo `{ mensalidadeId, cobrancaId, valor, valorLiquido, pagoEm, evento }`.

- Se o VanAaki não responder 2xx, o serviço devolve erro ao Asaas, e **o Asaas reenvia**.
- O mesmo evento repetido é ignorado: o Asaas entrega "pelo menos uma vez".

## O que este primeiro passo **não** faz (próximo projeto)

- **Subconta por motorista** (`POST /v3/accounts`): hoje tudo cai em uma conta só. Para o dinheiro ir direto ao tio, cada motorista precisa da sua subconta, com a verificação de identidade feita pelo Asaas.
- **Split**: o campo já existe no cliente (`asaas.Split`), mas não está em uso.
- **Pix Automático** (a família autoriza uma vez e paga todo mês sozinha): conferir a disponibilidade na API do Asaas.
- **Boleto e cartão**: trocar `billingType`.
- **Guardar estado em banco**: hoje a memória do serviço (cobrança por mensalidade e eventos já vistos) se perde ao reiniciar. O Asaas continua sendo a fonte da verdade (`GET /cobrancas/{id}`).
- **Rota de baixa no VanAaki**: o servidor do app ainda precisa da rota que recebe o aviso e marca a mensalidade como paga.
