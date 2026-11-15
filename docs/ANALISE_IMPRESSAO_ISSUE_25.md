# Análise da impressão — issue #25

O commit `9fe02e7` passou a duplicar o conteúdo dos relatórios de mostruário e acerto, incluindo identificação de vias e uma quebra de página entre elas. Isso não configura a quantidade de cópias da impressora: selecionar duas cópias no diálogo repetiria o documento inteiro, incluindo ambas as vias.

Foi restaurado o relatório com uma única via, mantendo o layout anterior com duas colunas de produtos, resumo e assinaturas. A quantidade de cópias fica a cargo do diálogo de impressão do navegador.

Configurações revisadas:

- Papel A4 em paisagem, margem de 8 mm e corpo sem margem adicional.
- Remoção da duplicação e da quebra de página forçada entre vias.
- Paginação livre do conjunto de produtos para relatórios longos, com proteção contra quebra dentro de linhas, resumo e assinaturas.
- Substituição da espera fixa de 300 ms pelo evento de carregamento da janela. O listener é registrado depois de escrever o documento e antes de fechá-lo, pois a abertura implícita do documento pode remover listeners anteriores.

## Validação

`node --test`: quatro cenários (0, 1, 5 e 120 produtos), verificando conteúdo único e completo e impressão somente após carregamento. `npm.cmd run build`: concluído com sucesso.

Também foram gerados PDFs no Microsoft Edge em modo headless, usando o gerador real de relatórios, sete colunas e descrições longas. Cada página foi inspecionada por extração de texto:

| Produtos | Páginas | Páginas vazias |
| --- | --- | --- |
| 0 | 1 | 0 |
| 1 | 1 | 0 |
| 5 | 1 | 0 |
| 120 | 5 | 0 |
| 300 | 12 | 0 |

Todos os produtos apareceram exatamente uma vez, com um único total e uma única chamada de impressão por relatório.

Não foi possível reproduzir a segunda cópia física em branco: a geração de PDF não exercita a quantidade de cópias nem o driver da impressora. Portanto, a causa desse sintoma não está confirmada. A validação final deve imprimir um relatório curto com **Cópias: 2** no equipamento usado, conferindo o conteúdo de ambas as cópias. Para relatórios longos, cada cópia deve conter todas as páginas.
