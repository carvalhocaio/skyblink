"use client";

import { useSearchParams } from "next/navigation";

const en = {
  locale: "en-US",
  nav: { explore: "Explore", how: "How it works", spherex: "About SPHEREx", faq: "Questions", language: "Language" },
  hero: {
    kicker: "See the sky change",
    title: "Watch stars move with a space telescope.",
    text: "The SPHEREx space telescope photographs the whole sky every six months. SkyBlink plays those photos one after another, like a flipbook, so you can see with your own eyes which stars are on the move.",
    cta: "★ Watch Barnard’s Star move",
  },
  pick: {
    title: "1. Pick something to look at",
    move: "Watch it move",
    brightness: "Watch its brightness",
    stories: [
      "A small red star only 6 light-years away. It crosses our sky faster than any other star.",
      "A pair of brown dwarfs, “failed stars” too small to shine like the Sun, 12 light-years away.",
      "The coldest brown dwarf ever found, about as cold as a winter day on Earth, 7 light-years away.",
      "A young star wrapped in dust that has been dimming in surprising ways.",
      "An old giant star that swells and shrinks, changing brightness every eight months or so.",
    ],
    custom: "I want to choose my own spot in the sky",
    customHelp:
      "Astronomers locate things with two numbers, like longitude and latitude on Earth: RA (0 to 360) and Dec (−90 to 90). You can find them for any star on Wikipedia.",
    ra: "RA (degrees)",
    dec: "Dec (degrees)",
    fov: "Zoom (arcmin)",
    fovHelp: "Zoom is the width of the picture. The full Moon is about 30 arcmin wide; 6 is a good start.",
    submit: "Show me this spot",
    inputError: "Check the values: RA 0–360°, Dec −90–90°, zoom 1–30 arcmin.",
  },
  watch: {
    title: "2. Watch the sky blink",
    empty: "Pick a star on the left to start.",
    emptyHint: "Not sure? Try Barnard’s Star, the fastest star in our sky.",
    starting: "Getting started…",
    networkError: "We couldn’t reach the SkyBlink server. Check your connection and try again.",
    failed: "Something went wrong while preparing the pictures of this spot.",
    retry: "Try again",
  },
  status: {
    queued: "Getting in line…",
    discovering: "Looking for SPHEREx photos of this spot…",
    building: "Developing the pictures…",
    done: "Done",
    failed: "Failed",
    searching: "Searching the archive…",
    ready: (done: number, total: number) => `${done} of ${total} pictures ready`,
    about: "about",
    progress: "Progress",
  },
  player: {
    speeds: ["Slow", "Normal", "Fast"],
    speed: "Speed",
    prev: "Previous picture",
    next: "Next picture",
    play: "Play",
    pause: "Pause",
    timeline: "Timeline",
    missing: "missing",
    waiting: "Waiting for the next season…",
    imageAlt: "SPHEREx image",
    whatTitle: "What am I looking at?",
    whatText:
      "Each picture is one SPHEREx season, months apart, in infrared light our eyes can’t see. Brighter means more infrared light. Keep your eye on the crosshair: it marks the same spot in every picture. Faraway stars stay put; a nearby star slowly drifts away from it.",
    keys: "Keyboard: Space to play or pause, ← and → to step through the pictures.",
    whatIs: "What it is",
    whatChanges: "What the change means",
    objects: [
      {
        what: "A red dwarf: a small, cool star with about a sixth of the Sun’s mass. At 6 light-years it is one of our closest neighbors; only the Alpha Centauri stars are closer. Even so, it is too faint to see without a telescope.",
        change: "It drifts away from the crosshair because it really is moving: about 10 arcseconds a year, faster across our sky than any other star. That’s almost 2 SPHEREx pixels a year. The background stars are far more distant, so they look frozen. Its center is a flat white blob because it is too bright for the detector.",
      },
      {
        what: "Two brown dwarfs orbiting each other, and together orbiting Epsilon Indi A, a star a little smaller than the Sun, 12 light-years away. Brown dwarfs are too small to shine like real stars. The pair is so tight that SPHEREx sees it as a single dot.",
        change: "The dot shifts about 4.7 arcseconds a year, less than half the speed of Barnard’s Star, so it moves less than one pixel between pictures: look closely. If a picture has an alignment warning below, part of its jump may not be real motion.",
      },
      {
        what: "The coldest brown dwarf known, roughly as cold as a kitchen freezer, just 7.4 light-years away. It was discovered in 2014 the same way SkyBlink works: by spotting a faint dot that moved between infrared pictures taken at different times.",
        change: "It moves about 8 arcseconds a year, but it is extremely faint for SPHEREx: in the first picture it barely rises above the noise. Look for a faint smudge near the crosshair that shifts while the background stays still.",
      },
      {
        what: "A very young star, only a few million years old, still wrapped in the disk of gas and dust it was born from. It lies about 500 light-years away.",
        change: "It is too far away to visibly move, so it should stay on the crosshair. What astronomers watch is its brightness: since 2010 it has faded several times, probably as dust from its disk passes in front of it. It is so bright that its center saturates the detector, so changes show up mostly in the glow around it.",
      },
      {
        what: "An old red giant near the end of its life. It slowly swells and shrinks, a kind of pulsating star called a Mira variable.",
        change: "Each pulse takes about eight months, and the SPHEREx pictures are a few months apart, so each one catches the star at a different point of its cycle. It is too far away to move, and its center saturates the detector, so changes show up mostly in the glow around it.",
      },
    ],
  },
  alerts: {
    NO_COVERAGE: "SPHEREx has no images of this region yet.",
    SINGLE_SEASON: "Only one observing season is available, so motion cannot be shown yet.",
    FEW_EXPOSURES: "This frame combines few exposures and may look noisy.",
    SATURATED_CORE:
      "This star is too bright for the detector: its position is visible, but its brightness cannot be measured.",
    ALIGNMENT_DRIFT: "Background stars shift between frames: the change may be an alignment issue, not real motion.",
  } as Record<string, string>,
  how: {
    title: "How SkyBlink works",
    steps: [
      { title: "You pick a spot", text: "Choose one of our featured stars or type any position in the sky." },
      {
        title: "We gather SPHEREx’s photos",
        text: "SPHEREx photographs the whole sky every six months. We collect every picture of your spot and stack each season’s pictures into one clean image.",
      },
      {
        title: "You watch the sky blink",
        text: "The images play in order, like a flipbook. Faraway stars stay still; anything close to us drifts, and stars that change brightness flicker.",
      },
    ],
  },
  about: {
    title: "Meet SPHEREx",
    p1: "SPHEREx is a NASA space telescope launched in March 2025. Every six months it maps the entire sky, not in one color but in 102 colors of infrared light, a kind of light our eyes can’t see but warm things give off.",
    p2: "It flies about 650 km above Earth, circling from pole to pole. Its telescope is small, only 20 cm across, but it sees a patch of sky much bigger than the full Moon in every shot, which makes it a great sky mapper.",
    facts: [
      {
        title: "How did the universe begin?",
        text: "By mapping hundreds of millions of galaxies in 3D, SPHEREx looks for traces of the first instant after the Big Bang.",
      },
      {
        title: "How did galaxies grow?",
        text: "It measures the faint combined glow of all galaxies, including ones too dim to see one by one.",
      },
      {
        title: "Where does water come from?",
        text: "It searches icy dust clouds in our galaxy for water and other ingredients of life.",
      },
    ],
    detTitle: "A rainbow you can’t see: SPHEREx’s six detectors",
    detHelp: "Each detector sees a different slice of infrared light. Tap one to learn what it’s good at.",
    detectors: "Detectors",
    shorter: "← shorter waves",
    longer: "longer waves, cooler things →",
    detText: [
      "Just past red light. Shows ordinary stars and faraway galaxies.",
      "Starts to see through the dust that hides stars from our eyes.",
      "Peers deeper into the dusty clouds where new stars are born.",
      "Holds the “fingerprint” of water ice, frozen on tiny dust grains in space.",
      "Holds the fingerprint of frozen carbon dioxide (dry ice).",
      "Holds the fingerprint of carbon monoxide ice, and it’s where cold brown dwarfs glow brightest. That’s why SkyBlink uses it to hunt for things that move.",
    ],
    colorNote: "Colors here are just for illustration: infrared light has no color to our eyes.",
  },
  faq: {
    title: "Questions you might have",
    items: [
      {
        q: "Why do the pictures look so blocky?",
        a: "Each square is one pixel of SPHEREx’s camera, about 6 arcseconds of sky. SPHEREx was built to map the whole sky, not to zoom in, so we show its pixels honestly instead of smoothing them.",
      },
      {
        q: "Why does a star move between pictures?",
        a: "Every star is moving through space, but most are so far away that they look frozen. A star close to us, like Barnard’s Star, shifts a little against the background each year. The crosshair marks the same spot in every frame, so you can see it drift.",
      },
      {
        q: "Why does a bright star look like a flat, white blob?",
        a: "It’s too bright for the detector, like a photo of the Sun. We can still see where it is, but not measure exactly how bright it is.",
      },
      {
        q: "What is Planet X?",
        a: "Some astronomers think an undiscovered planet may orbit far beyond Neptune. Something that far away would be faint and would creep slowly across the sky, so comparing pictures taken months apart is one way to hunt for it.",
      },
      {
        q: "What is a brown dwarf?",
        a: "An object bigger than Jupiter but too small to burn like a star. They are cold and dim, but glow in infrared light, which is exactly what SPHEREx sees.",
      },
      {
        q: "Is this an official NASA website?",
        a: "No. SkyBlink was built by team Capivaláxias during the NASA Space Apps Challenge 2026, using public SPHEREx data from NASA’s IRSA archive and star positions from ESA’s Gaia mission.",
      },
    ],
  },
  footer:
    "Made by team Capivaláxias for the NASA Space Apps Challenge 2026. Not an official NASA website. Images: SPHEREx public data (NASA/IPAC IRSA). Star positions: ESA Gaia DR3.",
};

const pt: typeof en = {
  locale: "pt-BR",
  nav: { explore: "Explorar", how: "Como funciona", spherex: "Sobre o SPHEREx", faq: "Dúvidas", language: "Idioma" },
  hero: {
    kicker: "Veja o céu mudar",
    title: "Veja estrelas se movendo com um telescópio espacial.",
    text: "O telescópio espacial SPHEREx fotografa o céu inteiro a cada seis meses. O SkyBlink mostra essas fotos uma depois da outra, como um flipbook, para você ver com seus próprios olhos quais estrelas estão em movimento.",
    cta: "★ Ver a Estrela de Barnard se mover",
  },
  pick: {
    title: "1. Escolha o que observar",
    move: "Veja ela se mover",
    brightness: "Veja o brilho mudar",
    stories: [
      "Uma pequena estrela vermelha a apenas 6 anos-luz. Ela cruza o nosso céu mais rápido que qualquer outra estrela.",
      "Um par de anãs marrons, “estrelas que não deram certo”, pequenas demais para brilhar como o Sol, a 12 anos-luz.",
      "A anã marrom mais fria já encontrada, tão fria quanto um dia de inverno na Terra, a 7 anos-luz.",
      "Uma estrela jovem envolta em poeira que vem perdendo brilho de jeitos surpreendentes.",
      "Uma estrela gigante e velha que incha e encolhe, mudando de brilho a cada uns oito meses.",
    ],
    custom: "Quero escolher meu próprio ponto no céu",
    customHelp:
      "Astrônomos localizam objetos com dois números, como longitude e latitude na Terra: RA (0 a 360) e Dec (−90 a 90). Você encontra esses números para qualquer estrela na Wikipédia.",
    ra: "RA (graus)",
    dec: "Dec (graus)",
    fov: "Zoom (arcmin)",
    fovHelp: "Zoom é a largura da imagem. A Lua cheia mede cerca de 30 arcmin; 6 é um bom começo.",
    submit: "Mostrar este ponto",
    inputError: "Confira os valores: RA 0–360°, Dec −90–90°, zoom 1–30 arcmin.",
  },
  watch: {
    title: "2. Veja o céu piscar",
    empty: "Escolha uma estrela ao lado para começar.",
    emptyHint: "Na dúvida? Experimente a Estrela de Barnard, a estrela mais rápida do nosso céu.",
    starting: "Começando…",
    networkError: "Não conseguimos falar com o servidor do SkyBlink. Verifique sua conexão e tente de novo.",
    failed: "Algo deu errado ao preparar as imagens deste ponto.",
    retry: "Tentar de novo",
  },
  status: {
    queued: "Entrando na fila…",
    discovering: "Procurando fotos do SPHEREx deste ponto…",
    building: "Revelando as imagens…",
    done: "Pronto",
    failed: "Falhou",
    searching: "Buscando no arquivo…",
    ready: (done, total) => `${done} de ${total} imagens prontas`,
    about: "cerca de",
    progress: "Progresso",
  },
  player: {
    speeds: ["Devagar", "Normal", "Rápido"],
    speed: "Velocidade",
    prev: "Imagem anterior",
    next: "Próxima imagem",
    play: "Tocar",
    pause: "Pausar",
    timeline: "Linha do tempo",
    missing: "faltando",
    waiting: "Aguardando a próxima temporada…",
    imageAlt: "Imagem do SPHEREx",
    whatTitle: "O que estou vendo?",
    whatText:
      "Cada imagem é uma temporada do SPHEREx, com meses de diferença, em luz infravermelha que nossos olhos não enxergam. Mais claro significa mais luz infravermelha. Fique de olho na mira: ela marca o mesmo ponto em todas as imagens. Estrelas distantes ficam paradas; uma estrela próxima vai se afastando dela devagar.",
    keys: "Teclado: Espaço para tocar ou pausar, ← e → para passar as imagens.",
    whatIs: "O que é",
    whatChanges: "O que a mudança significa",
    objects: [
      {
        what: "Uma anã vermelha: uma estrela pequena e fria, com cerca de um sexto da massa do Sol. A 6 anos-luz, é uma das nossas vizinhas mais próximas; só as estrelas de Alfa Centauro estão mais perto. Mesmo assim, é fraca demais para ser vista sem telescópio.",
        change: "Ela se afasta da mira porque está mesmo se movendo: cerca de 10 segundos de arco por ano, mais rápido no nosso céu do que qualquer outra estrela. Isso dá quase 2 pixels do SPHEREx por ano. As estrelas do fundo estão muito mais longe, então parecem paradas. O centro dela é uma mancha branca achatada porque ela é brilhante demais para o detector.",
      },
      {
        what: "Duas anãs marrons orbitando uma à outra e, juntas, orbitando Epsilon Indi A, uma estrela um pouco menor que o Sol, a 12 anos-luz. Anãs marrons são pequenas demais para brilhar como estrelas de verdade. O par é tão próximo que o SPHEREx o vê como um único ponto.",
        change: "O ponto se desloca cerca de 4,7 segundos de arco por ano, menos da metade da velocidade da Estrela de Barnard, então anda menos de um pixel entre as imagens: olhe com atenção. Se uma imagem tiver um aviso de alinhamento abaixo, parte do salto dela pode não ser movimento real.",
      },
      {
        what: "A anã marrom mais fria que conhecemos, mais ou menos tão fria quanto um freezer, a apenas 7,4 anos-luz. Ela foi descoberta em 2014 do mesmo jeito que o SkyBlink funciona: notando um ponto fraco que se movia entre imagens infravermelhas tiradas em datas diferentes.",
        change: "Ela se move cerca de 8 segundos de arco por ano, mas é fraquíssima para o SPHEREx: na primeira imagem mal aparece acima do ruído. Procure uma manchinha fraca perto da mira que se desloca enquanto o fundo fica parado.",
      },
      {
        what: "Uma estrela muito jovem, com só alguns milhões de anos, ainda envolta no disco de gás e poeira do qual nasceu. Fica a cerca de 500 anos-luz.",
        change: "Ela está longe demais para se mover visivelmente, então deve ficar na mira. O que os astrônomos acompanham é o brilho: desde 2010 ela escureceu várias vezes, provavelmente porque poeira do disco passa na frente dela. Ela é tão brilhante que o centro satura o detector, então as mudanças aparecem mais no brilho ao redor.",
      },
      {
        what: "Uma gigante vermelha velha, perto do fim da vida. Ela incha e encolhe devagar, um tipo de estrela pulsante chamada variável Mira.",
        change: "Cada pulsação leva cerca de oito meses, e as imagens do SPHEREx têm alguns meses de diferença, então cada uma pega a estrela num ponto diferente do ciclo. Ela está longe demais para se mover, e o centro satura o detector, então as mudanças aparecem mais no brilho ao redor.",
      },
    ],
  },
  alerts: {
    NO_COVERAGE: "O SPHEREx ainda não tem imagens desta região.",
    SINGLE_SEASON: "Só há uma temporada de observação, então ainda não dá para mostrar movimento.",
    FEW_EXPOSURES: "Esta imagem junta poucas exposições e pode parecer granulada.",
    SATURATED_CORE:
      "Esta estrela é brilhante demais para o detector: dá para ver a posição dela, mas não medir o brilho.",
    ALIGNMENT_DRIFT:
      "As estrelas de fundo se deslocam entre as imagens: a mudança pode ser um problema de alinhamento, não movimento real.",
  },
  how: {
    title: "Como o SkyBlink funciona",
    steps: [
      { title: "Você escolhe um ponto", text: "Escolha uma das estrelas em destaque ou digite qualquer posição do céu." },
      {
        title: "Nós juntamos as fotos do SPHEREx",
        text: "O SPHEREx fotografa o céu inteiro a cada seis meses. Reunimos todas as fotos do seu ponto e combinamos as de cada temporada em uma imagem limpa.",
      },
      {
        title: "Você vê o céu piscar",
        text: "As imagens tocam em ordem, como um flipbook. Estrelas distantes ficam paradas; o que está perto de nós se desloca, e estrelas que mudam de brilho piscam.",
      },
    ],
  },
  about: {
    title: "Conheça o SPHEREx",
    p1: "O SPHEREx é um telescópio espacial da NASA lançado em março de 2025. A cada seis meses ele mapeia o céu inteiro, não em uma cor, mas em 102 cores de luz infravermelha, um tipo de luz que nossos olhos não veem, mas que objetos quentes emitem.",
    p2: "Ele voa a cerca de 650 km da Terra, dando voltas de polo a polo. O telescópio é pequeno, só 20 cm de diâmetro, mas cada foto cobre um pedaço do céu muito maior que a Lua cheia, o que faz dele um ótimo mapeador do céu.",
    facts: [
      {
        title: "Como o universo começou?",
        text: "Mapeando centenas de milhões de galáxias em 3D, o SPHEREx procura pistas do primeiro instante depois do Big Bang.",
      },
      {
        title: "Como as galáxias cresceram?",
        text: "Ele mede o brilho fraco somado de todas as galáxias, inclusive as fracas demais para serem vistas uma a uma.",
      },
      {
        title: "De onde vem a água?",
        text: "Ele procura água e outros ingredientes da vida em nuvens de poeira gelada da nossa galáxia.",
      },
    ],
    detTitle: "Um arco-íris invisível: os seis detectores do SPHEREx",
    detHelp: "Cada detector enxerga uma faixa diferente da luz infravermelha. Toque em um para saber no que ele é bom.",
    detectors: "Detectores",
    shorter: "← ondas mais curtas",
    longer: "ondas mais longas, objetos mais frios →",
    detText: [
      "Logo depois do vermelho. Mostra estrelas comuns e galáxias distantes.",
      "Começa a enxergar através da poeira que esconde estrelas dos nossos olhos.",
      "Enxerga mais fundo nas nuvens de poeira onde nascem novas estrelas.",
      "Contém a “impressão digital” do gelo de água, congelado em minúsculos grãos de poeira no espaço.",
      "Contém a impressão digital do gás carbônico congelado (gelo seco).",
      "Contém a impressão digital do gelo de monóxido de carbono, e é onde anãs marrons frias brilham mais. Por isso o SkyBlink usa este detector para caçar objetos que se movem.",
    ],
    colorNote: "As cores aqui são só ilustrativas: a luz infravermelha não tem cor para os nossos olhos.",
  },
  faq: {
    title: "Dúvidas que você pode ter",
    items: [
      {
        q: "Por que as imagens parecem quadriculadas?",
        a: "Cada quadradinho é um pixel da câmera do SPHEREx, cerca de 6 segundos de arco do céu. O SPHEREx foi feito para mapear o céu inteiro, não para dar zoom, então mostramos os pixels como são em vez de suavizá-los.",
      },
      {
        q: "Por que uma estrela se move entre as imagens?",
        a: "Toda estrela se move pelo espaço, mas a maioria está tão longe que parece parada. Uma estrela perto de nós, como a de Barnard, se desloca um pouco em relação ao fundo a cada ano. A mira marca o mesmo ponto em todas as imagens, então dá para ver o deslocamento.",
      },
      {
        q: "Por que uma estrela brilhante parece uma mancha branca achatada?",
        a: "Ela é brilhante demais para o detector, como uma foto do Sol. Ainda dá para ver onde ela está, mas não medir exatamente o brilho.",
      },
      {
        q: "O que é o Planeta X?",
        a: "Alguns astrônomos acham que um planeta ainda desconhecido pode orbitar muito além de Netuno. Algo tão distante seria fraco e se moveria devagar pelo céu, então comparar fotos tiradas com meses de diferença é uma forma de procurá-lo.",
      },
      {
        q: "O que é uma anã marrom?",
        a: "Um objeto maior que Júpiter, mas pequeno demais para queimar como uma estrela. São frias e fracas, mas brilham em luz infravermelha, exatamente o que o SPHEREx enxerga.",
      },
      {
        q: "Este é um site oficial da NASA?",
        a: "Não. O SkyBlink foi feito pelo time Capivaláxias durante o NASA Space Apps Challenge 2026, usando dados públicos do SPHEREx do arquivo IRSA da NASA e posições de estrelas da missão Gaia da ESA.",
      },
    ],
  },
  footer:
    "Feito pelo time Capivaláxias para o NASA Space Apps Challenge 2026. Não é um site oficial da NASA. Imagens: dados públicos do SPHEREx (NASA/IPAC IRSA). Posições de estrelas: ESA Gaia DR3.",
};

export const LANGS = { en: "English", pt: "Português" } as const;
export type Lang = keyof typeof LANGS;

export function useT() {
  const lang: Lang = useSearchParams().get("lang") === "pt" ? "pt" : "en";
  return { lang, t: lang === "pt" ? pt : en };
}
