// 背句型：設定
const { esc } = EH;

EH.cardsPage({
  collection: "patterns",
  emoji: "🧩",
  pageTitle: "背句型",
  itemLabel: "句型",
  emptyHint: "還沒有任何句型。\n按右上角「➕ 新增句型」，把課本或老師教的句型打進來吧！",

  fields: [
    { key: "pattern", label: "句型（英文）", type: "textarea", required: true, placeholder: "例：It is + adj. + for sb. + to V" },
    { key: "ch", label: "中文意思 / 用法", type: "text", required: true, placeholder: "例：對某人來說做某事是…的" },
    { key: "example", label: "英文例句（選填）", type: "textarea", placeholder: "例：It is important for us to study hard." },
    { key: "exampleCh", label: "例句中文（選填）", type: "text", placeholder: "例：對我們來說，努力讀書很重要。" }
  ],

  // 列表顯示
  listMain: (it) => `<span class="word-en" style="word-break:break-word;">${esc(it.pattern)}</span>`,
  listSub: (it) => `${esc(it.ch)}${it.example ? `<br><i>${esc(it.example)}</i>` : ""}`,

  // 翻牌：題目 / 答案 / 補充
  q: (it) => esc(it.pattern),
  a: (it) => esc(it.ch),
  extra: (it) => [it.example && esc(it.example), it.exampleCh && esc(it.exampleCh)].filter(Boolean).join("<br>"),

  speak: (it) => it.example || it.pattern,
  searchText: (it) => [it.pattern, it.ch, it.example, it.exampleCh].join(" ")
});
