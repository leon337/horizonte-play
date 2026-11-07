# Horizonte Play 4.1

**Um jogo sandbox 3D original, explorável no navegador**, construído com [Three.js](https://threejs.org/) e [Vite](https://vite.dev/).

![Captura do Horizonte Play](docs/preview.png)

## Recursos

- 🌳 Mundo natural com colinas, árvores, flores, grama animada pelo vento e céu procedural.
- 🧍 Personagem cúbico com câmera em terceira pessoa, caminhada, corrida e salto.
- 🌊 Lago de quase 9 metros de profundidade, com ondas, reflexos simulados e ambiente subaquático.
- 🏊 Natação com postura horizontal, braçadas, pernadas, flutuação e mergulho.
- 🧱 Sistema simples de construção com três cores de blocos e salvamento local.
- 🎮 Perfis gráficos **Equilibrado**, **Alto** e **Ultra**, com contador de FPS.
- 🐟 Peixes, bolhas, plantas subaquáticas, casas e construções decorativas.

## Executar localmente

Pré-requisitos: Node.js compatível com Vite 7 e um navegador com WebGL.

```bash
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite (por padrão, [http://127.0.0.1:5173/](http://127.0.0.1:5173/)). No Windows, também é possível usar o arquivo `INICIAR-3D.bat` após instalar as dependências.

## Controles

| Ação | Controle |
| --- | --- |
| Movimentar-se | W, A, S, D ou setas |
| Girar câmera | Arrastar com o mouse |
| Zoom | Roda do mouse |
| Correr / nadar rápido | Shift |
| Pular / subir na água | Espaço |
| Mergulhar / descer | C ou Ctrl |
| Escolher cor do bloco | 1, 2, 3 |
| Construir bloco | E |
| Desfazer último bloco | Q |
| Pausar | Esc |
| Visão aérea | V |
| Reiniciar posição | R |

No lago, o personagem anda pela margem rasa e muda para a animação de natação ao entrar em água suficientemente profunda.

## Desenvolvimento

```bash
npm run test   # testes de terreno, água, construção, gráficos e animação
npm run build  # gera o site estático em dist/
npm run preview
```

### Organização

| Caminho | Responsabilidade |
| --- | --- |
| `src/main.js` | Loop de jogo, câmera, movimentação e interface |
| `src/avatar.js` | Personagem e animações de caminhada e natação |
| `src/world.js` | Cenário, terreno, iluminação e composição |
| `src/visuals.js` | Shaders de céu, água e cáusticas |
| `src/underwater.js` | Animais e vegetação subaquática |
| `src/vegetation.js` | Grama instanciada, vento e árvores |
| `src/terrain.js` | Relevo e profundidade do lago |
| `src/building.js` | Construção e salvamento local |
| `src/graphics.js` | Qualidade gráfica, FPS e pós-processamento |
| `tests/` | Testes automatizados |

## Estado do projeto

Versão experimental **4.1**, um jogo local para um jogador. Não há contas, multiplayer, marketplace ou servidor de jogo. A física da água e as colisões são simplificadas. É um projeto original inspirado no gênero sandbox, **sem relação oficial com Roblox**.

**Observação:** o repositório contém apenas o código-fonte, os testes e uma imagem de apresentação. Backups, dependências, builds locais e capturas de teste ficam fora do Git.
