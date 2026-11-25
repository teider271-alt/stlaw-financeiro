# S&T LAW — Financeiro no iPhone

App web que funciona **offline** e fica na tela de início do iPhone. Ele usa as mesmas regras do app do Mac: divisão em 3, caixa do escritório, recebimentos e renovação das taxas anuais.

**Este repositório tem só o código do app. Nenhum dado do escritório fica aqui.** Os lançamentos ficam guardados no próprio iPhone, e a troca com o Mac é feita por um arquivo que você mesmo salva na pasta **iCloud Drive › S&T LAW**.

## Instalar no iPhone
1. Abra o endereço do GitHub Pages no **Safari**.
2. Toque em **Compartilhar › Adicionar à Tela de Início**.
3. Abra o app pelo ícone. Daí em diante ele funciona sem internet.

## Primeira vez
1. No Mac, abra o S&T LAW e clique em **iPhone › Enviar para o iPhone**.
2. No iPhone, abra a aba **iCloud › Carregar do iCloud Drive** e escolha **S&T LAW › stlaw-financeiro.json**.

## No dia a dia (um aparelho por vez)
- **Atualizou no iPhone:** toque em **iCloud › Salvar no iCloud Drive › Salvar em Arquivos › iCloud Drive › S&T LAW › Salvar** e confirme a substituição. Quando o app do Mac abrir, ele puxa os dados sozinho; antes, faz um backup completo.
- **Atualizou no Mac:** clique em **iPhone › Enviar para o iPhone**. No iPhone, toque em **Carregar do iCloud Drive**.
- Se os dois aparelhos tiverem alterações, o Mac pergunta qual versão manter. O iPhone guarda a versão anterior, que pode ser desfeita.

## Arquivos
- `index.html`, `app.css`, `app.js`: o app.
- `sw.js`: guarda o app no aparelho para abrir sem internet.
- `manifest.webmanifest` e os `.png`: o nome e o ícone na tela de início.
