-- Contatos de cliente cadastrados no sistema (tela Clientes). Os do ERP ficam na
-- system.pccontato e só são lidos; aqui ficam os que o admin acrescenta, ligados
-- ao cliente pelo codcli. Nome e celular servem para saber de que cliente é quem
-- chama o vendedor no WhatsApp.
-- Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>
--
-- Sem FK para a system.pcclient: ela é recarregada do ERP e a FK travaria a carga.
-- celular = DDD + número, só dígitos, sem o 55 (numeroNacional em src/lib/catalogo.ts).

CREATE TABLE IF NOT EXISTS crm.cliente_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codcli integer NOT NULL,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  celular text NOT NULL CHECK (celular ~ '^[0-9]{10,11}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- O índice desta chave também serve a busca pelos contatos de um cliente.
  UNIQUE (codcli, celular)
);
