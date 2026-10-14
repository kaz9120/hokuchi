// 作品の段階と欄の定義 (docs/design.md の 3)。発表と記事で骨組みを揃え、言葉と欄の中身を変える。
// 画面の言葉は、本を読んでいない人にも通じるように書く (知識の呪いを避ける。docs/design.md の 6)
export type Kind = 'talk' | 'note'

export type Persona = {
  name: string
  who: string
  why: string
  trouble: string
  solve: string
  action: string
  pushback: string
  approach: string
}

export type Brief = {
  /** 紐づくトークの slug (talks/ の中の発表)。段階 5〜8 は、その絵コンテの画面で進める (ADR-0038) */
  talk?: string
  id: string
  kind: Kind
  title: string
  createdAt: string
  updatedAt: string
  seedId: string | null
  fields: Record<string, any> & { personas?: Persona[] }
  gates: Record<string, { passedAt: string; value: string }>
  candidates: Record<string, { at: string; items: { text: string; note: string }[] }>
}

export type Option = { value: string; description?: string }

export type Field = {
  key: string
  label: string
  /** 何を書くか */
  help?: string
  /** 書いた例。あなたの過去の作品から引けるものは引く */
  example?: string
  placeholder?: string
  type: 'text' | 'textarea' | 'choice'
  options?: Option[]
}

export type Stage = {
  key: string
  n: number
  /** 段階の名前。何をするかが分かる動詞で終える */
  title: Record<Kind, string>
  /** 確定が必要な段階か。人が「この内容で確定する」を押して進む */
  confirm?: boolean
  /** この段階でやること。最初に読まれるので、短く */
  lead: Record<Kind, string>
  /** なぜやるのか。本を読んでいない人にも分かる言葉で */
  why?: Record<Kind, string>
  fields?: Record<Kind, Field[]>
  /** その段階で AI に頼めること (サーバの TASKS の key) */
  tasks?: Record<Kind, string[]>
  /** まだ作っていない段階 */
  later?: boolean
  source: string
}

// 聴衆を描く 7 つの問い (slide:ology p.35)。問いの言葉は、そのまま答えを書ける形に言い換えている
export const PERSONA_FIELDS: { key: keyof Persona; label: string; help: string; example: string }[] = [
  {
    key: 'who',
    label: 'どんな人ですか',
    help: '職種や年次から書き始めてかまいません。最後は「こういう状況にいる、この人」と 1 人の人として書きます。',
    example: 'AI で開発は速くなったのに、それがチームの成果につながっている実感を持てずにいるエンジニア (Dev\'s Garden)',
  },
  {
    key: 'why',
    label: 'なぜこの場に来ていますか',
    help: '自分から聞きに来たのか、仕事で来させられたのか。何を持ち帰りたくて来ているのかを書きます。',
    example: 'AI で開発が加速する今、強いチームをどう作るかについて、他社が何を考えて何をしているかを知りたい (Dev\'s Garden)',
  },
  {
    key: 'trouble',
    label: '何に困っていますか',
    help: '聴衆が日々ぶつかっている問題です。この発表は、ここに答えるためにあります。',
    example: '速度が上がるほど、レビューや合意形成や情報のキャッチアップが追いつかない (Dev\'s Garden)',
  },
  {
    key: 'solve',
    label: 'この発表で、何が得られますか',
    help: '聞き終えたとき、聴衆の手元に何が残るか。困りごとへの答えになっているかを確かめます。',
    example: '組織が担うことと、チームが担うことを分けて、自分の組織での改善の回し方を考えられる (Dev\'s Garden)',
  },
  {
    key: 'action',
    label: '聞き終えたあと、何をしてほしいですか',
    help: '「それで、私は何をすればいいの？」への答えです。小さくても具体的な行動にします。',
    example: '例: 自分のチームのふりかえりで、AI で変わった進め方を 1 つ議題に出す',
  },
  {
    key: 'pushback',
    label: 'どんな反論や疑いが出そうですか',
    help: '「うちの会社では無理」「それは規模が違うから」のような声です。先に分かっていれば、話の中で答えておけます。',
    example: '例: 人数の多い会社だからできることでは？',
  },
  {
    key: 'approach',
    label: 'どう届けるのが合っていますか',
    help: '会場の雰囲気、話し方、資料を後で配るかまで含めて、この人に届きやすい形を考えます。',
    example: '例: 10 分の LT なので、事例は 1 つに絞り、資料はあとで URL で配る',
  },
]

export const emptyPersona = (): Persona => ({ name: '', who: '', why: '', trouble: '', solve: '', action: '', pushback: '', approach: '' })

export const STAGES: Stage[] = [
  {
    key: 'seed',
    n: 1,
    title: { talk: '場と素材を集める', note: '書きたいことを書き出す' },
    lead: {
      talk: '発表する場の条件と、話の材料になりそうなものを書き出します。何を話すかは、まだ絞らなくてかまいません。',
      note: '書きたいと思った出来事と、手元の材料を書き出します。何を言うかは、まだ絞らなくてかまいません。',
    },
    why: {
      talk: '持ち時間や会場の広さで、話せる量やスライドの作りが変わります。材料は多めに集めておくと、あとで「何を残して何を削るか」を選べます。',
      note: '記事の面白さは、文章のうまさより「何に気づいたか」でほぼ決まります。引っかかった瞬間を、忘れないうちに言葉にしておきます。',
    },
    fields: {
      talk: [
        { key: 'event', label: 'イベント', type: 'text', placeholder: "例: Dev's Garden" },
        { key: 'eventUrl', label: 'イベントのページ', type: 'text', placeholder: 'https://…', help: '募集文に書かれた課題やテーマは、聴衆を描くときの手がかりになります。' },
        { key: 'date', label: '発表する日', type: 'text', placeholder: '例: 2026-11-20' },
        { key: 'duration', label: '持ち時間', type: 'text', placeholder: '例: 10 分' },
        { key: 'venue', label: '会場と聴衆の人数', type: 'text', placeholder: '例: 50 人ほどの明るい会議室', help: '会場が明るいか暗いか、広いか狭いかで、背景の色や文字の大きさが変わります。' },
        { key: 'stance', label: 'どの立場で話しますか', type: 'choice', options: [{ value: '個人' }, { value: 'MOSH' }], help: 'スライドのテーマが変わります。個人なら hokuchi、MOSH を代表するなら mosh です。' },
        {
          key: 'publish',
          label: '資料を公開しますか',
          type: 'choice',
          options: [{ value: '公開する', description: 'slides.y-kaz.com に載せます' }, { value: '社内向け', description: '公開リポジトリには置きません' }, { value: '未定' }],
        },
        { key: 'materials', label: '材料', type: 'textarea', help: '過去の資料・記事・社内の文書・データ・URL を、1 行に 1 つ書きます。', example: "例: Productivity チームの発表資料 (AI DevEX Conference 2026)、毎月のサーベイの結果" },
      ],
      note: [
        {
          key: 'happening',
          label: '何があって、何に引っかかりましたか',
          type: 'textarea',
          help: '「なんか面白い」「なんかモヤモヤする」の中身を、そのまま書きます。きれいな文でなくてかまいません。',
          example: '例: 欲しいツールがその日のうちに動くのが楽しかった。でもすぐに飽きた。作った時点で満足して、二度と開かないツールがいくつもある (「サクッと作れる楽しさに、飽きた」)',
        },
        {
          key: 'genre',
          label: 'どんな記事になりそうですか',
          type: 'choice',
          options: [
            { value: '情報', description: '読者が知りたいことを伝える (やり方・まとめ・レポート)' },
            { value: '日記', description: '自分に起きたことを書く' },
            { value: '主張', description: '自分の考えを伝える' },
          ],
          help: '面識のない人の日記や主張は、情報より読まれにくい傾向があります。日記や主張なら、読者が持ち帰れるものを意識して足します。',
        },
        { key: 'materials', label: '材料', type: 'textarea', help: 'メモ・音声入力の書き起こし・元になった登壇資料・URL を、1 行に 1 つ書きます。' },
      ],
    },
    source: 'slide:ology p.32, 39, 152 / note の本 p.118-125 / 鈴木洋平・けんすう',
  },
  {
    key: 'audience',
    n: 2,
    title: { talk: '聴衆を描く', note: '読者を決める' },
    lead: {
      talk: 'この発表を聞く人を、名前のある 1 人として描きます。下の 7 つの問いに、その人になったつもりで答えてください。',
      note: 'この記事を届けたい人を、1 人に絞ります。「エンジニア全般」ではなく、悩みを抱えた 1 人です。',
    },
    why: {
      talk: '「聴衆のみなさん」に向けて作ると、誰にも刺さらない話になりがちです。1 人を思い浮かべると、どこまで説明するか、どの例を出すかが決まります。聴衆が何層かに分かれるなら、層ごとに 1 人ずつ描きます。',
      note: '読者が決まると、説明の量が決まります。読者が知っていることは書かず、知らないことだけを書けばよくなります。過去の自分を読者にするのも、よい方法です。',
    },
    fields: {
      talk: [],
      note: [
        {
          key: 'readerWho',
          label: '誰に届けたいですか',
          type: 'textarea',
          help: '年齢や職種ではなく、いま抱えている悩みで描きます。',
          example: '例: AI でツールを作り始めたものの、作って満足して使わなくなっている人',
        },
        { key: 'readerTrouble', label: 'その人は、何に困っていますか', type: 'textarea', help: 'いつ頃の、どんな悩みか。どんな言葉があれば救われたかも書きます。' },
        { key: 'readerKnows', label: 'その人は、いま何を知っていますか', type: 'textarea', help: 'ここに書いたことは、本文で説明しなくてよくなります。' },
      ],
    },
    tasks: { talk: ['audience.gaps', 'audience.pushback'], note: ['audience.gaps'] },
    source: 'slide:ology p.35-37 / note の本 p.126-132 / 白水梨恵・佐伯要',
  },
  {
    key: 'goal',
    n: 3,
    title: { talk: '聞き終えたあとを決める', note: '読み終えたあとを決める' },
    lead: {
      talk: '聞き終えた聴衆に、何をしてほしいかを決めます。',
      note: '読み終えた読者に、何を思ってほしいか、どうなっていてほしいかを決めます。',
    },
    why: {
      talk: '発表のゴールは、聴衆が何かを知ることではなく、そのあと動くことです。してほしい行動が決まると、締めくくりの言葉が決まります。',
      note: 'ゴールが決まると、記事の締め方と、どこを厚く書くかが決まります。',
    },
    fields: {
      talk: [
        { key: 'callToAction', label: '聴衆にしてほしいこと', type: 'textarea', help: '聞き終えた次の日に、聴衆が取れる行動にします。', example: '例: 自分のチームで、組織に任せることとチームでやることを分けて話してみる' },
        {
          key: 'relation',
          label: '聴衆にとって、あなたはどんな存在ですか',
          type: 'choice',
          options: [
            { value: 'ヒーロー', description: '聴衆の困りごとを、自分が解決してみせる。答えや手本を示して引っ張る' },
            { value: '応援団長', description: '主役は聴衆。聴衆が自分で動けるよう、励まして背中を押す' },
          ],
          help: 'どちらも、自分のためではなく聴衆のために話す立場です。選んだ側によって、話し方と締めくくりが変わります。ヒーローなら「この方法で解決できます」と示し、応援団長なら「みなさんのチームでもできます」と促します。',
        },
      ],
      note: [
        { key: 'afterFeeling', label: '読み終えて、何を思ってほしいですか', type: 'textarea', help: '読後の気持ちを 1 文で書きます。', example: '例: 作れることより、使い続けられるかに目を向けてみよう' },
        {
          key: 'takeaway',
          label: '読者に持ち帰ってほしいもの',
          type: 'choice',
          options: [
            { value: '知識', description: '知らなかったことを知る' },
            { value: '視点', description: 'ものの見方が変わる' },
            { value: '行動', description: '何かを試してみたくなる' },
          ],
        },
      ],
    },
    tasks: { talk: ['goal.candidates'], note: ['goal.candidates'] },
    source: 'slide:ology p.34-36 / note の本 p.636 / 鈴木洋平',
  },
  {
    key: 'oneLiner',
    n: 4,
    title: { talk: '伝えたいことを 1 文にする', note: '伝えたいことを 1 文にする' },
    confirm: true,
    lead: {
      talk: 'この発表でいちばん伝えたいことを、1 文で書きます。決めたら、以降の段階ではいつも画面の上に出ます。',
      note: 'この記事でいちばん伝えたいことを、1 文で書きます。決めたら、以降の段階ではいつも画面の上に出ます。',
    },
    why: {
      talk: 'この 1 文が、スライドに何を残して何を削るかの基準になります。1 文で言えないなら、まだ作り始める段階ではありません。言いたいことが 2 つあるなら、発表を分けるか、どちらかを捨てます。',
      note: 'この 1 文が、記事に何を残して何を削るかの基準になります。1 文で言えないなら、まだ書き始める段階ではありません。言いたいことが 2 つあるなら、記事を分けます。',
    },
    fields: {
      talk: [
        {
          key: 'oneLiner',
          label: '伝えたいこと',
          type: 'textarea',
          help: '「〜について話す」は題目で、伝えたいことではありません。「〜は〜だ」と言い切り、反論できる形にします。',
          example: '強いチームの作り方は AI で変わっていない。変わったのは、前からある課題を後回しにできなくなったことだ (Dev\'s Garden)',
        },
      ],
      note: [
        {
          key: 'oneLiner',
          label: '伝えたいこと',
          type: 'textarea',
          help: '「〜について書く」は題目で、伝えたいことではありません。自分の体験から出ていて、読者にとって新しいことを言い切ります。',
          example: 'なんでも作れることに価値はない。価値があるのは、作ったものを使い続けられるかどうかだった (「サクッと作れる楽しさに、飽きた」)',
        },
      ],
    },
    tasks: { talk: ['oneLiner.candidates', 'oneLiner.critique'], note: ['oneLiner.candidates', 'oneLiner.critique'] },
    source: '鈴木洋平・佐伯要 / note の本 p.161 / slide:ology p.39, 47',
  },
  {
    key: 'diverge',
    n: 5,
    title: { talk: '案を出して絞る', note: '材料を選ぶ' },
    later: true,
    lead: { talk: '話の案を 5 つ以上出してから、1 つを残して捨てます。', note: '材料を並べ、使うものと捨てるものを決めます。' },
    source: 'slide:ology p.46-48, 60 / 佐伯要',
  },
  {
    key: 'structure',
    n: 6,
    title: { talk: '構成を決める', note: '構成を決める' },
    confirm: true,
    later: true,
    lead: { talk: '話の流れを決め、場面ごとの絵コンテにします。', note: 'いちばん面白いところを冒頭に置き、流れを箇条書きにします。' },
    source: 'slide:ology p.39, 48 / 村井弦',
  },
  { key: 'make', n: 7, title: { talk: 'スライドを作る', note: '本文を書く' }, later: true, lead: { talk: '場面ごとにスライドを作ります。', note: '構成に沿って本文を書きます。' }, source: '' },
  {
    key: 'review',
    n: 8,
    title: { talk: '見直す', note: '見直す' },
    confirm: true,
    later: true,
    lead: { talk: '機械で検査できることと、人が見ることの両方で見直します。', note: '機械で検査できることと、自分で「よく書けた」と思えるかの両方で見直します。' },
    source: 'slide:ology p.160, 256 / 村井弦 / note の本 p.634',
  },
  { key: 'publish', n: 9, title: { talk: '公開する', note: '公開する' }, later: true, lead: { talk: '公開するか、OGP、話すことの仕上げを決めます。', note: 'タイトル・タグ・見出し画像を決め、どれくらい読まれそうかの予想を書きます。' }, source: 'note の本 p.213-218 / 鈴木洋平' },
  { key: 'retro', n: 10, title: { talk: '振り返る', note: '振り返る' }, later: true, lead: { talk: 'リハーサルと当日の反応を振り返ります。', note: '公開前の予想と、実際の反応を並べます。' }, source: 'slide:ology p.241 / 鈴木洋平' },
]

const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0

/** 段階の状態。確定が必要な段階は、人が確定したか、確定したあとに中身が変わっていないかで決める */
export function stageStatus(stage: Stage, brief: Brief): 'todo' | 'doing' | 'done' {
  const f = brief.fields
  if (stage.later) return 'todo'
  if (stage.confirm) {
    const g = brief.gates[stage.key]
    if (g && g.value === (f[stage.key] ?? '')) return 'done'
    return filled(f[stage.key]) ? 'doing' : 'todo'
  }
  if (stage.key === 'audience' && brief.kind === 'talk') {
    const p = f.personas ?? []
    if (p.some((x) => filled(x.who) && filled(x.action))) return 'done'
    return p.some((x) => Object.values(x).some(filled)) ? 'doing' : 'todo'
  }
  const keys = (stage.fields?.[brief.kind] ?? []).map((x) => x.key)
  const n = keys.filter((k) => filled(f[k])).length
  return n === 0 ? 'todo' : n === keys.length ? 'done' : 'doing'
}

export const KIND_LABEL: Record<Kind, string> = { talk: '発表', note: '記事' }
export const AUDIENCE_LABEL: Record<Kind, string> = { talk: '聴衆', note: '読者' }

/** 聴衆・読者の要約。画面の上に出す */
export function audienceSummary(brief: Brief) {
  if (brief.kind === 'talk') {
    const p = (brief.fields.personas ?? []).filter((x) => x.name || x.who)
    return p.map((x) => (x.name ? `${x.name}${x.who ? `（${x.who.split('\n')[0]}）` : ''}` : x.who.split('\n')[0])).join(' / ')
  }
  return (brief.fields.readerWho ?? '').split('\n')[0]
}
