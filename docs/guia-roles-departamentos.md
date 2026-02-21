# Guia: Departamentos e Permissoes

## Visao Geral

O sistema possui **3 niveis de acesso** que controlam o que cada usuario pode ver e fazer:

| Nivel | Quem e | O que pode fazer |
|-------|--------|-----------------|
| **SysAdmin** | Equipe tecnica (instituicao 4) | Tudo, em todas as instituicoes |
| **Admin do Escritorio** | Gestor do escritorio | Tudo dentro do seu escritorio |
| **Usuario comum** | Advogado, atendente, etc. | Ve apenas os casos do seu departamento |

---

## 1. Usuarios

**Onde:** Menu lateral > Usuarios

### Quem pode acessar

- SysAdmin e Admin do Escritorio

### O que da para fazer

- **Criar usuario:** Nome, e-mail, senha, telefone, OAB
- **Editar usuario:** Alterar dados, ativar/desativar
- **Definir como Admin do Escritorio:** Liga/desliga o switch "Admin do Escritorio" ao lado do nome

### Como funciona o "Admin do Escritorio"

Quando voce marca um usuario como Admin do Escritorio, ele ganha acesso a:

- Pagina de Departamentos (criar, editar, gerenciar membros)
- Pagina de Usuarios (criar e editar outros usuarios)
- Ver todos os casos do escritorio (sem filtro por departamento)
- Gerenciar colunas do Kanban
- Vincular numeros de telefone a departamentos

> **Dica:** Um Admin do Escritorio nao consegue remover o proprio status de admin. Outro admin precisa fazer isso.

---

## 2. Departamentos

**Onde:** Menu lateral > Departamentos (visivel apenas para Admins)

### O que sao departamentos

Departamentos representam os **setores do escritorio**: Juridico, Financeiro, Comercial, Suporte Tecnico, etc. Eles servem para:

1. **Organizar a equipe** por area de atuacao
2. **Filtrar casos** — cada usuario ve apenas os casos do seu departamento
3. **Distribuir atendimentos** — casos novos sao atribuidos automaticamente ao departamento correto

### Criando um departamento

1. Acesse **Departamentos** no menu lateral
2. Clique em **Novo Departamento**
3. Preencha o nome (obrigatorio) e descricao (opcional)
4. Clique em **Salvar**

### Adicionando membros

1. Na lista de departamentos, clique no botao **Membros** do departamento desejado
2. Marque os usuarios que pertencem a esse departamento
3. Clique em **Salvar**

> **Nota:** Um usuario pode pertencer a **mais de um departamento**. Ele vera os casos de todos os departamentos dos quais participa.

### Departamentos padrao

Ao clicar em **Criar Departamentos Padrao**, o sistema cria automaticamente:
- Juridico
- Financeiro
- Comercial
- Suporte Tecnico

---

## 3. Permissoes (Funcionalidades)

**Onde:** Menu lateral > Configuracoes > Permissoes

### Quem pode acessar

- Apenas SysAdmin

### O que da para fazer

Ativar ou desativar modulos inteiros para cada instituicao:

| Modulo | O que controla |
|--------|---------------|
| Casos | Lista e detalhes dos atendimentos |
| Chat | Conversas com clientes |
| Agenda | Calendario e eventos |
| Estatisticas | Graficos e metricas |
| Configuracoes | Pagina de ajustes |
| Conexoes | Numeros WhatsApp conectados |
| Follow-up | Acompanhamento automatico |
| Usuarios | Gerenciamento de usuarios |
| Departamentos | Gerenciamento de departamentos |
| Suporte | Central de ajuda |

### Como usar

1. Selecione a **instituicao** no dropdown
2. Para cada modulo, ligue ou desligue o **switch**
3. As alteracoes sao salvas automaticamente

> **Atenção:** Desativar um modulo faz com que ele desapareca do menu lateral para todos os usuarios daquela instituicao.

---

## 4. Como funciona a visibilidade dos casos

### Usuario comum (com departamentos)

O usuario ve apenas:

- Casos atribuidos ao **seu departamento**
- Casos atribuidos **diretamente a ele** (pelo nome ou ID)
- Casos **sem atribuicao** (sem departamento e sem responsavel)

### Admin do Escritorio

Ve **todos os casos** da instituicao, sem filtro de departamento.

### SysAdmin

Ve **todos os casos** de **todas as instituicoes**, com opção de filtrar por instituicao.

### Filtro manual por departamento

Em todas as telas (Casos, Chat, Kanban, Suporte), existe um **dropdown de departamento**:

- **Admins:** Veem todos os departamentos da instituicao
- **Usuarios comuns:** Veem apenas seus departamentos
- Selecionar um departamento filtra a lista para mostrar apenas os casos daquele setor

---

## 5. Kanban por Departamento

**Onde:** Menu lateral > Kanban (ou aba Kanban na pagina de Casos)

### Como funciona

Cada departamento pode ter suas **proprias colunas** no Kanban, independentes dos outros departamentos.

**Exemplo:**
- Departamento Juridico: Triagem > Analise > Peticao > Protocolo > Concluido
- Departamento Comercial: Novo Lead > Qualificacao > Proposta > Fechado

### Colunas padrao vs. personalizadas

- Se o departamento **nao tem colunas proprias**, ele usa as colunas padrao da instituicao
- Ao **criar ou editar colunas** com um departamento selecionado, essas colunas ficam exclusivas daquele departamento

### Como personalizar colunas de um departamento

1. No Kanban, selecione o **departamento** no dropdown
2. Clique no botao de **engrenagem** (Editar Colunas)
3. O editor mostra: *"Colunas do departamento: [Nome]"*
4. Adicione, remova ou reordene as colunas
5. Clique em **Salvar**

> **Dica:** Para voltar a usar as colunas padrao da instituicao, basta excluir todas as colunas personalizadas do departamento.

---

## 6. Vincular Telefone a Departamento

**Onde:** Menu lateral > Conexoes

### Para que serve

Quando um cliente envia mensagem pelo WhatsApp, o sistema pode **atribuir automaticamente** o caso ao departamento correto, com base no numero de telefone que recebeu a mensagem.

### Como configurar

1. Acesse **Conexoes** no menu lateral
2. Para cada numero conectado, selecione o **departamento** no dropdown ao lado
3. A alteracao e salva automaticamente

**Exemplo pratico:**
- Numero (11) 99999-0001 > Departamento Juridico
- Numero (11) 99999-0002 > Departamento Comercial

### O que acontece na pratica

1. Cliente envia mensagem para (11) 99999-0001
2. Sistema identifica que esse numero pertence ao **Departamento Juridico**
3. Caso e criado e atribuido automaticamente a um membro ativo do Juridico
4. Apenas membros do Juridico veem esse caso na lista

---

## 7. Distribuicao Automatica de Casos

### Como funciona

Quando um novo caso chega sem responsavel, o sistema faz a atribuicao automatica:

1. **Verifica o telefone** que recebeu a mensagem
2. **Busca o departamento** vinculado a esse telefone
3. **Atribui ao membro** mais antigo ativo desse departamento
4. Se nao houver vinculo de telefone, atribui ao usuario mais antigo ativo da instituicao

### Campos preenchidos automaticamente

- `responsavel` — Nome do usuario atribuido
- `assigned_to_user_id` — ID do usuario
- `department_id` — ID do departamento
- `department_name` — Nome do departamento

---

## 8. Transferencia de Casos

### Na tela de detalhes do caso (Kanban)

1. Abra um caso clicando nele
2. Selecione o **Departamento** no dropdown
3. (Opcional) Selecione o **Usuario** dentro do departamento
4. Salve

O caso passa a ser visivel apenas para o departamento e usuario selecionados.

### Na tela de Suporte

Mesma logica: selecione departamento e usuario para transferir o ticket.

---

## 9. Fluxo Recomendado para Configuracao Inicial

### Passo 1: Criar Departamentos

1. Acesse **Departamentos**
2. Crie os setores do escritorio (ou use "Criar Departamentos Padrao")

### Passo 2: Criar Usuarios

1. Acesse **Usuarios**
2. Crie cada membro da equipe
3. Defina um ou mais como **Admin do Escritorio** se necessario

### Passo 3: Vincular Usuarios aos Departamentos

1. Em **Departamentos**, clique em **Membros** de cada setor
2. Selecione os usuarios que pertencem a cada departamento

### Passo 4: Vincular Telefones aos Departamentos

1. Em **Conexoes**, associe cada numero WhatsApp ao departamento correspondente

### Passo 5: Personalizar Kanban (Opcional)

1. No **Kanban**, selecione cada departamento
2. Personalize as colunas conforme o fluxo de trabalho de cada setor

### Passo 6: Configurar Permissoes (Opcional)

1. Em **Configuracoes > Permissoes**, ative/desative modulos conforme necessario

---

## 10. Perguntas Frequentes

**P: Um usuario pode pertencer a mais de um departamento?**
R: Sim. Ele vera os casos de todos os departamentos dos quais participa.

**P: O que acontece se um usuario nao tiver departamento?**
R: Se nao houver departamentos configurados, todos os usuarios veem todos os casos. Se houver departamentos mas o usuario nao estiver em nenhum, ele nao vera casos filtrados por departamento.

**P: O Admin do Escritorio pode ver casos de todos os departamentos?**
R: Sim. O Admin do Escritorio tem visibilidade total dentro da sua instituicao.

**P: Posso ter colunas de Kanban diferentes para cada departamento?**
R: Sim. Basta selecionar o departamento no Kanban e personalizar as colunas. Departamentos sem colunas proprias usam as colunas padrao da instituicao.

**P: Como funciona a distribuicao automatica quando nao ha vinculo de telefone?**
R: O caso e atribuido ao usuario ativo mais antigo da instituicao, independentemente do departamento.

**P: Posso remover o status de Admin de todos os usuarios de uma vez?**
R: Sim. Na pagina de Usuarios, o SysAdmin pode clicar em "Reset Admins" para remover o flag de admin de todos os usuarios da instituicao selecionada.
