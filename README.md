# PokeIdle Online - Publicação GRATUITA de teste (Render)

Este pacote contém o servidor Node.js e a interface do jogo. O arquivo `render.yaml` já está configurado para o plano Free.

## Como publicar
1. Extraia o ZIP no computador.
2. No GitHub crie um repositório novo e use `Add file` > `Upload files` para enviar **os arquivos e pastas EXTRAÍDOS**. `render.yaml`, `server.js`, `package.json` e `public/` devem ficar na raiz do repositório. Não envie apenas o ZIP.
3. No painel Render, abra `Blueprints` > `New Blueprint Instance` (ou `New` > `Blueprint`).
4. Conecte o GitHub à Render, selecione seu repositório e faça `Deploy Blueprint`.
5. Aguarde o status `Live`. Abra o endereço `.onrender.com` mostrado no serviço.

## Muito importante
O plano gratuito **não tem disco persistente**. Contas, logins, moedas e progresso podem desaparecer após um reinício, implantação ou mudança de instância. Não use esta configuração em produção com jogadores reais esperando saves permanentes.

Para guardar o progresso de modo confiável, use a versão com disco persistente (arquivo original `PokeIdle_Online_Jogavel.zip`, com `render.yaml` usando serviço Starter e disco pago) ou migre o armazenamento para um banco externo.

## Executar localmente
Instale Node.js 20 ou superior, extraia o ZIP, abra terminal na pasta e execute `npm start`. Acesse http://localhost:3000. Testes: `npm test`.

Esta edição é uma implementação simplificada independente, não restaura o servidor ou todos os sistemas do jogo de origem. Confira direitos de uso de imagens e personagens antes de distribuição comercial.
