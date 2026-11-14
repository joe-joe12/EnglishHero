// 詞性變化（例如 create → creation、creativity / creative / creatively）：設定
const { esc } = EH;

// 依序：動詞、名詞、形容詞、副詞
const FORM_KEYS = [["v", "v."], ["n", "n."], ["adj", "adj."], ["adv", "adv."]];
const listOf = (it, k) => (Array.isArray(it[k]) ? it[k].filter(Boolean) : []);
const filledCount = (it) => FORM_KEYS.filter(([k]) => listOf(it, k).length > 0).length;
const firstWord = (it) => {
  for (const [k] of FORM_KEYS) { if (listOf(it, k).length) return listOf(it, k)[0]; }
  return "";
};

EH.cardsPage({
  collection: "forms",
  emoji: "🔀",
  pageTitle: "詞性變化",
  itemLabel: "詞性變化",
  emptyHint: "還沒有任何詞性變化。\n把同一個字的各種詞性記下來，例如 create → creation、creativity、creative、creatively！\n之後到「考單字 → 打字測驗 → 詞性轉換」就能考你。",

  fields: [
    { key: "v", label: "動詞 v.", type: "list", placeholder: "例：create" },
    { key: "n", label: "名詞 n.", type: "list", placeholder: "例：creation、creativity", help: "同一個詞性有好幾個字時，用逗號或頓號分開" },
    { key: "adj", label: "形容詞 adj.", type: "list", placeholder: "例：creative" },
    { key: "adv", label: "副詞 adv.", type: "list", placeholder: "例：creatively" },
    { key: "ch", label: "中文意思（選填）", type: "text", placeholder: "例：創造" }
  ],

  // 至少要有 2 種詞性，才能出「轉換」題
  validate: (d) => (filledCount(d) >= 2 ? null : "至少要填 2 種詞性（例如動詞 create 和名詞 creation），才能出轉換題"),
  isValid: (x) => filledCount(x) >= 2,

  listMain: (it) => FORM_KEYS
    .filter(([k]) => listOf(it, k).length)
    .map(([k, abbr]) => `<span class="tag tag-pos">${abbr}</span> <b>${listOf(it, k).map(esc).join("、")}</b>`)
    .join(" <span class='muted'>→</span> "),
  listSub: (it) => (it.ch ? esc(it.ch) : ""),

  // 翻牌：正面給一個字，背面是所有詞性
  q: (it) => esc(firstWord(it)),
  a: (it) => FORM_KEYS
    .filter(([k]) => listOf(it, k).length)
    .map(([k, abbr]) => `<span class="tag tag-pos">${abbr}</span> ${listOf(it, k).map(esc).join("、")}`)
    .join("<br>"),
  extra: (it) => (it.ch ? esc(it.ch) : ""),

  speak: (it) => firstWord(it),
  searchText: (it) => [FORM_KEYS.map(([k]) => listOf(it, k).join(" ")).join(" "), it.ch].join(" ")
});
